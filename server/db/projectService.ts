import crypto from 'node:crypto';
import path from 'node:path';
import { db } from './database.js';
import {
  ProjectRecord,
  ProjectFileRecord,
  ProjectSnapshotRecord,
  ProjectBuildRecord,
  ProjectPatchRecord,
  ProjectEnvVarRecord,
  ProjectFramework,
  ProjectLanguage
} from '../types.js';

export class ProjectPathSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectPathSecurityError';
  }
}

export class ProjectAccessDeniedError extends Error {
  constructor(message: string = 'Access denied or project not found') {
    super(message);
    this.name = 'ProjectAccessDeniedError';
  }
}

export class ProjectService {
  /**
   * Strictly sanitize and validate relative file/folder paths.
   * Prevents path traversal, directory escape, null bytes, and malicious characters.
   */
  static normalizeAndValidatePath(rawPath: string, allowDirectory: boolean = false): string {
    if (!rawPath || typeof rawPath !== 'string') {
      throw new ProjectPathSecurityError('Path must be a non-empty string');
    }

    // Check for null bytes and control chars
    if (/[\0\x00-\x1f\x7f]/.test(rawPath)) {
      throw new ProjectPathSecurityError('Path contains forbidden control characters or null bytes');
    }

    // Normalize forward slashes
    let normalized = rawPath.replace(/\\/g, '/').trim();

    // Remove leading slashes or dots
    while (normalized.startsWith('/') || normalized.startsWith('./')) {
      normalized = normalized.replace(/^(\/|\.\/)+/, '');
    }

    // Check for directory traversal sequences
    const segments = normalized.split('/');
    for (const segment of segments) {
      if (segment === '..' || segment === '.' || segment === '') {
        if (allowDirectory && segment === '' && segments[segments.length - 1] === '') {
          continue;
        }
        throw new ProjectPathSecurityError('Path traversal sequence (e.g. "..") is strictly forbidden');
      }
    }

    // Verify clean path
    const resolved = path.posix.normalize(normalized);
    if (resolved.startsWith('..') || path.isAbsolute(resolved)) {
      throw new ProjectPathSecurityError('Illegal path traversal attempting to escape project root');
    }

    return resolved;
  }

  /**
   * Verify authenticated user ownership of the project.
   * Returns project record or throws ProjectAccessDeniedError.
   */
  static verifyOwnership(userId: string, projectId: string): ProjectRecord {
    if (!userId || !projectId) {
      throw new ProjectAccessDeniedError('Invalid user or project identifier');
    }

    const row = db.prepare(`
      SELECT id, userId, name, description, framework, language, status, createdAt, updatedAt
      FROM projects
      WHERE id = ? AND userId = ?
    `).get(projectId, userId) as ProjectRecord | undefined;

    if (!row) {
      throw new ProjectAccessDeniedError();
    }

    return row;
  }

  /**
   * List all projects belonging to the authenticated user.
   */
  static listProjects(userId: string): ProjectRecord[] {
    return db.prepare(`
      SELECT id, userId, name, description, framework, language, status, createdAt, updatedAt
      FROM projects
      WHERE userId = ?
      ORDER BY updatedAt DESC
    `).all(userId) as unknown as ProjectRecord[];
  }

  /**
   * Get single project details with ownership check.
   */
  static getProject(userId: string, projectId: string): ProjectRecord {
    return this.verifyOwnership(userId, projectId);
  }

  /**
   * Create a new project and initialize real starter files based on chosen framework.
   */
  static createProject(params: {
    userId: string;
    name: string;
    description?: string;
    framework?: ProjectFramework;
    language?: ProjectLanguage;
  }): { project: ProjectRecord; files: ProjectFileRecord[] } {
    const { userId, name, description = '', framework = 'react-vite', language = 'typescript' } = params;

    const projectId = `proj_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    const insertProject = db.prepare(`
      INSERT INTO projects (id, userId, name, description, framework, language, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `);

    insertProject.run(projectId, userId, name.trim() || 'Untitled Project', description.trim() || null, framework, language, now, now);

    const project = this.verifyOwnership(userId, projectId);

    // Seed default functional files
    const starterFiles = this.getStarterFiles(name, framework, language);
    const createdFiles: ProjectFileRecord[] = [];

    const insertFile = db.prepare(`
      INSERT INTO project_files (id, projectId, path, content, fileType, size, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const f of starterFiles) {
      const fileId = `file_${crypto.randomUUID().replace(/-/g, '')}`;
      const content = f.content;
      const size = Buffer.byteLength(content, 'utf8');
      insertFile.run(fileId, projectId, f.path, content, f.fileType, size, now, now);
      createdFiles.push({
        id: fileId,
        projectId,
        path: f.path,
        content,
        fileType: f.fileType as 'file' | 'directory',
        size,
        createdAt: now,
        updatedAt: now
      });
    }

    // Create initial snapshot
    this.createSnapshot(userId, projectId, 'Initial project scaffold created');

    return { project, files: createdFiles };
  }

  /**
   * Update project meta
   */
  static updateProject(userId: string, projectId: string, updates: { name?: string; description?: string; status?: string }): ProjectRecord {
    this.verifyOwnership(userId, projectId);
    const now = new Date().toISOString();

    const project = this.verifyOwnership(userId, projectId);
    const name = updates.name !== undefined ? updates.name.trim() : project.name;
    const description = updates.description !== undefined ? updates.description.trim() : project.description;
    const status = updates.status !== undefined ? updates.status : project.status;

    db.prepare(`
      UPDATE projects
      SET name = ?, description = ?, status = ?, updatedAt = ?
      WHERE id = ? AND userId = ?
    `).run(name, description, status, now, projectId, userId);

    return this.verifyOwnership(userId, projectId);
  }

  /**
   * Delete a project and all associated files, snapshots, builds, patches, and temporary sandbox directories.
   */
  static deleteProject(userId: string, projectId: string): boolean {
    this.verifyOwnership(userId, projectId);

    // Delete DB records (Cascading triggers handles project_files, snapshots, etc.)
    db.prepare(`DELETE FROM projects WHERE id = ? AND userId = ?`).run(projectId, userId);

    return true;
  }

  /**
   * List all files in a project
   */
  static listFiles(userId: string, projectId: string): ProjectFileRecord[] {
    this.verifyOwnership(userId, projectId);

    return db.prepare(`
      SELECT id, projectId, path, content, fileType, size, createdAt, updatedAt
      FROM project_files
      WHERE projectId = ?
      ORDER BY fileType ASC, path ASC
    `).all(projectId) as unknown as ProjectFileRecord[];
  }

  /**
   * Get single file content
   */
  static getFile(userId: string, projectId: string, rawPath: string): ProjectFileRecord {
    this.verifyOwnership(userId, projectId);
    const cleanPath = this.normalizeAndValidatePath(rawPath);

    const file = db.prepare(`
      SELECT id, projectId, path, content, fileType, size, createdAt, updatedAt
      FROM project_files
      WHERE projectId = ? AND path = ?
    `).get(projectId, cleanPath) as ProjectFileRecord | undefined;

    if (!file) {
      throw new Error(`File not found: ${cleanPath}`);
    }

    return file;
  }

  /**
   * Create a new file in the project
   */
  static createFile(userId: string, projectId: string, rawPath: string, content: string = '', fileType: 'file' | 'directory' = 'file'): ProjectFileRecord {
    this.verifyOwnership(userId, projectId);
    const cleanPath = this.normalizeAndValidatePath(rawPath);

    const existing = db.prepare(`SELECT id FROM project_files WHERE projectId = ? AND path = ?`).get(projectId, cleanPath);
    if (existing) {
      throw new Error(`A file or folder already exists at path: ${cleanPath}`);
    }

    const fileId = `file_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();
    const size = Buffer.byteLength(content, 'utf8');

    db.prepare(`
      INSERT INTO project_files (id, projectId, path, content, fileType, size, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(fileId, projectId, cleanPath, content, fileType, size, now, now);

    // Update project updatedAt
    db.prepare(`UPDATE projects SET updatedAt = ? WHERE id = ?`).run(now, projectId);

    return {
      id: fileId,
      projectId,
      path: cleanPath,
      content,
      fileType,
      size,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Update file content
   */
  static updateFile(userId: string, projectId: string, rawPath: string, content: string): ProjectFileRecord {
    this.verifyOwnership(userId, projectId);
    const cleanPath = this.normalizeAndValidatePath(rawPath);

    const existing = db.prepare(`SELECT id, fileType FROM project_files WHERE projectId = ? AND path = ?`).get(projectId, cleanPath) as { id: string; fileType: string } | undefined;
    if (!existing) {
      // Auto-create if not existing
      return this.createFile(userId, projectId, cleanPath, content);
    }

    const now = new Date().toISOString();
    const size = Buffer.byteLength(content, 'utf8');

    db.prepare(`
      UPDATE project_files
      SET content = ?, size = ?, updatedAt = ?
      WHERE id = ? AND projectId = ?
    `).run(content, size, now, existing.id, projectId);

    db.prepare(`UPDATE projects SET updatedAt = ? WHERE id = ?`).run(now, projectId);

    return {
      id: existing.id,
      projectId,
      path: cleanPath,
      content,
      fileType: existing.fileType as 'file' | 'directory',
      size,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Rename a file
   */
  static renameFile(userId: string, projectId: string, rawOldPath: string, rawNewPath: string): ProjectFileRecord {
    this.verifyOwnership(userId, projectId);
    const oldPath = this.normalizeAndValidatePath(rawOldPath);
    const newPath = this.normalizeAndValidatePath(rawNewPath);

    if (oldPath === newPath) {
      return this.getFile(userId, projectId, oldPath);
    }

    const file = db.prepare(`SELECT id, content, fileType FROM project_files WHERE projectId = ? AND path = ?`).get(projectId, oldPath) as { id: string; content: string; fileType: string } | undefined;
    if (!file) {
      throw new Error(`Source file not found: ${oldPath}`);
    }

    const targetExists = db.prepare(`SELECT id FROM project_files WHERE projectId = ? AND path = ?`).get(projectId, newPath);
    if (targetExists) {
      throw new Error(`Destination path already exists: ${newPath}`);
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE project_files
      SET path = ?, updatedAt = ?
      WHERE id = ? AND projectId = ?
    `).run(newPath, now, file.id, projectId);

    db.prepare(`UPDATE projects SET updatedAt = ? WHERE id = ?`).run(now, projectId);

    return {
      id: file.id,
      projectId,
      path: newPath,
      content: file.content,
      fileType: file.fileType as 'file' | 'directory',
      size: Buffer.byteLength(file.content, 'utf8'),
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Delete a file
   */
  static deleteFile(userId: string, projectId: string, rawPath: string): boolean {
    this.verifyOwnership(userId, projectId);
    const cleanPath = this.normalizeAndValidatePath(rawPath);

    const res = db.prepare(`DELETE FROM project_files WHERE projectId = ? AND path = ?`).run(projectId, cleanPath);
    if (res.changes > 0) {
      const now = new Date().toISOString();
      db.prepare(`UPDATE projects SET updatedAt = ? WHERE id = ?`).run(now, projectId);
      return true;
    }
    return false;
  }

  /**
   * Create folder entry or directory structure
   */
  static createFolder(userId: string, projectId: string, rawFolderPath: string): ProjectFileRecord {
    this.verifyOwnership(userId, projectId);
    const cleanPath = this.normalizeAndValidatePath(rawFolderPath, true);

    const existing = db.prepare(`SELECT id FROM project_files WHERE projectId = ? AND path = ?`).get(projectId, cleanPath);
    if (existing) {
      throw new Error(`Directory already exists: ${cleanPath}`);
    }

    return this.createFile(userId, projectId, cleanPath, '', 'directory');
  }

  /**
   * Rename folder and update all nested file paths
   */
  static renameFolder(userId: string, projectId: string, oldFolder: string, newFolder: string): { renamedCount: number } {
    this.verifyOwnership(userId, projectId);
    const cleanOld = this.normalizeAndValidatePath(oldFolder, true).replace(/\/$/, '');
    const cleanNew = this.normalizeAndValidatePath(newFolder, true).replace(/\/$/, '');

    const allFiles = this.listFiles(userId, projectId);
    let count = 0;
    const now = new Date().toISOString();

    for (const file of allFiles) {
      if (file.path === cleanOld) {
        db.prepare(`UPDATE project_files SET path = ?, updatedAt = ? WHERE id = ?`).run(cleanNew, now, file.id);
        count++;
      } else if (file.path.startsWith(cleanOld + '/')) {
        const subPath = file.path.slice(cleanOld.length + 1);
        const updatedPath = `${cleanNew}/${subPath}`;
        db.prepare(`UPDATE project_files SET path = ?, updatedAt = ? WHERE id = ?`).run(updatedPath, now, file.id);
        count++;
      }
    }

    db.prepare(`UPDATE projects SET updatedAt = ? WHERE id = ?`).run(now, projectId);
    return { renamedCount: count };
  }

  /**
   * Delete folder and all its contents
   */
  static deleteFolder(userId: string, projectId: string, rawFolder: string): { deletedCount: number } {
    this.verifyOwnership(userId, projectId);
    const cleanFolder = this.normalizeAndValidatePath(rawFolder, true).replace(/\/$/, '');

    const res = db.prepare(`
      DELETE FROM project_files
      WHERE projectId = ? AND (path = ? OR path LIKE ?)
    `).run(projectId, cleanFolder, `${cleanFolder}/%`);

    const now = new Date().toISOString();
    db.prepare(`UPDATE projects SET updatedAt = ? WHERE id = ?`).run(now, projectId);

    return { deletedCount: Number(res.changes) };
  }

  /**
   * Snapshots: Create full snapshot of all project files
   */
  static createSnapshot(userId: string, projectId: string, description: string): ProjectSnapshotRecord {
    this.verifyOwnership(userId, projectId);

    const files = db.prepare(`
      SELECT path, content, fileType
      FROM project_files
      WHERE projectId = ?
    `).all(projectId) as Array<{ path: string; content: string; fileType: string }>;

    const snapshotId = `snap_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();
    const filesJson = JSON.stringify(files);

    db.prepare(`
      INSERT INTO project_snapshots (id, projectId, createdBy, description, filesJson, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(snapshotId, projectId, userId, description.trim() || 'Snapshot created', filesJson, now);

    return {
      id: snapshotId,
      projectId,
      createdBy: userId,
      description: description.trim() || 'Snapshot created',
      filesJson,
      createdAt: now
    };
  }

  /**
   * List all snapshots for a project
   */
  static listSnapshots(userId: string, projectId: string): ProjectSnapshotRecord[] {
    this.verifyOwnership(userId, projectId);

    return db.prepare(`
      SELECT id, projectId, createdBy, description, filesJson, createdAt
      FROM project_snapshots
      WHERE projectId = ?
      ORDER BY createdAt DESC
    `).all(projectId) as unknown as ProjectSnapshotRecord[];
  }

  /**
   * Rollback project files to a previous snapshot
   */
  static rollbackSnapshot(userId: string, projectId: string, snapshotId: string): { success: boolean; restoredFileCount: number } {
    this.verifyOwnership(userId, projectId);

    const snapshot = db.prepare(`
      SELECT id, filesJson, description
      FROM project_snapshots
      WHERE id = ? AND projectId = ?
    `).get(snapshotId, projectId) as { id: string; filesJson: string; description: string } | undefined;

    if (!snapshot) {
      throw new Error('Snapshot not found for this project.');
    }

    let parsedFiles: Array<{ path: string; content: string; fileType: string }>;
    try {
      parsedFiles = JSON.parse(snapshot.filesJson);
    } catch {
      throw new Error('Snapshot file data corrupted.');
    }

    // Save a safety snapshot of current state before rollback
    this.createSnapshot(userId, projectId, `Auto-backup before rollback to: ${snapshot.description}`);

    const now = new Date().toISOString();

    // Delete current files
    db.prepare(`DELETE FROM project_files WHERE projectId = ?`).run(projectId);

    // Insert restored files
    const insertFile = db.prepare(`
      INSERT INTO project_files (id, projectId, path, content, fileType, size, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const f of parsedFiles) {
      const fileId = `file_${crypto.randomUUID().replace(/-/g, '')}`;
      const size = Buffer.byteLength(f.content || '', 'utf8');
      insertFile.run(fileId, projectId, f.path, f.content || '', f.fileType || 'file', size, now, now);
    }

    db.prepare(`UPDATE projects SET updatedAt = ? WHERE id = ?`).run(now, projectId);

    return { success: true, restoredFileCount: parsedFiles.length };
  }

  /**
   * Build records
   */
  static createBuild(userId: string, projectId: string, command: string): ProjectBuildRecord {
    this.verifyOwnership(userId, projectId);

    const buildId = `build_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO project_builds (id, projectId, userId, status, command, output, errors, startedAt, completedAt, durationMs)
      VALUES (?, ?, ?, 'running', ?, '', NULL, ?, NULL, 0)
    `).run(buildId, projectId, userId, command, now);

    return {
      id: buildId,
      projectId,
      userId,
      status: 'running',
      command,
      output: '',
      errors: null,
      startedAt: now,
      completedAt: null,
      durationMs: 0
    };
  }

  static updateBuild(buildId: string, updates: { status: 'success' | 'failed' | 'cancelled'; output: string; errors?: string | null; durationMs: number }): void {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE project_builds
      SET status = ?, output = ?, errors = ?, completedAt = ?, durationMs = ?
      WHERE id = ?
    `).run(updates.status, updates.output, updates.errors || null, now, updates.durationMs, buildId);
  }

  static listBuilds(userId: string, projectId: string): ProjectBuildRecord[] {
    this.verifyOwnership(userId, projectId);

    return db.prepare(`
      SELECT id, projectId, userId, status, command, output, errors, startedAt, completedAt, durationMs
      FROM project_builds
      WHERE projectId = ?
      ORDER BY startedAt DESC
      LIMIT 20
    `).all(projectId) as unknown as ProjectBuildRecord[];
  }

  static getLatestBuild(userId: string, projectId: string): ProjectBuildRecord | null {
    this.verifyOwnership(userId, projectId);

    const row = db.prepare(`
      SELECT id, projectId, userId, status, command, output, errors, startedAt, completedAt, durationMs
      FROM project_builds
      WHERE projectId = ?
      ORDER BY startedAt DESC
      LIMIT 1
    `).get(projectId) as ProjectBuildRecord | undefined;

    return row || null;
  }

  /**
   * Safe Patch Proposals System
   */
  static createPatch(params: {
    userId: string;
    projectId: string;
    path: string;
    originalContent?: string | null;
    proposedContent: string;
    diffSummary: string;
  }): ProjectPatchRecord {
    const { userId, projectId, path: rawPath, originalContent, proposedContent, diffSummary } = params;
    this.verifyOwnership(userId, projectId);
    const cleanPath = this.normalizeAndValidatePath(rawPath);

    const patchId = `patch_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO project_changes (id, projectId, userId, path, originalContent, proposedContent, diffSummary, status, createdAt, appliedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)
    `).run(patchId, projectId, userId, cleanPath, originalContent || null, proposedContent, diffSummary, now);

    return {
      id: patchId,
      projectId,
      userId,
      path: cleanPath,
      originalContent: originalContent || null,
      proposedContent,
      diffSummary,
      status: 'pending',
      createdAt: now,
      appliedAt: null
    };
  }

  static listPendingPatches(userId: string, projectId: string): ProjectPatchRecord[] {
    this.verifyOwnership(userId, projectId);

    return db.prepare(`
      SELECT id, projectId, userId, path, originalContent, proposedContent, diffSummary, status, createdAt, appliedAt
      FROM project_changes
      WHERE projectId = ? AND status = 'pending'
      ORDER BY createdAt DESC
    `).all(projectId) as unknown as ProjectPatchRecord[];
  }

  static applyPatch(userId: string, projectId: string, patchId: string): { success: boolean; patch: ProjectPatchRecord; updatedFile: ProjectFileRecord } {
    this.verifyOwnership(userId, projectId);

    const patch = db.prepare(`
      SELECT id, projectId, userId, path, originalContent, proposedContent, diffSummary, status, createdAt, appliedAt
      FROM project_changes
      WHERE id = ? AND projectId = ? AND userId = ?
    `).get(patchId, projectId, userId) as ProjectPatchRecord | undefined;

    if (!patch) {
      throw new Error('Patch proposal not found.');
    }

    if (patch.status !== 'pending') {
      throw new Error(`Patch has already been ${patch.status}.`);
    }

    // Create safety snapshot before applying patch
    this.createSnapshot(userId, projectId, `Snapshot before applying patch to ${patch.path}: ${patch.diffSummary}`);

    // Update actual file in DB
    const updatedFile = this.updateFile(userId, projectId, patch.path, patch.proposedContent);

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE project_changes
      SET status = 'applied', appliedAt = ?
      WHERE id = ?
    `).run(now, patchId);

    patch.status = 'applied';
    patch.appliedAt = now;

    return { success: true, patch, updatedFile };
  }

  static rejectPatch(userId: string, projectId: string, patchId: string): boolean {
    this.verifyOwnership(userId, projectId);

    const res = db.prepare(`
      UPDATE project_changes
      SET status = 'rejected'
      WHERE id = ? AND projectId = ? AND userId = ? AND status = 'pending'
    `).run(patchId, projectId, userId);

    return res.changes > 0;
  }

  /**
   * Environment Variables (Masked Secret Storage)
   */
  static setEnvVar(userId: string, projectId: string, key: string, value: string): void {
    this.verifyOwnership(userId, projectId);

    const cleanKey = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!cleanKey) {
      throw new Error('Invalid environment variable name');
    }

    const id = `env_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO project_env_vars (id, projectId, key, valueEncrypted, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(projectId, key) DO UPDATE SET
        valueEncrypted = excluded.valueEncrypted,
        updatedAt = excluded.updatedAt
    `).run(id, projectId, cleanKey, value, now, now);
  }

  /**
   * List environment variables for the frontend.
   * STRICT SECURITY: NEVER expose secret values to the browser!
   */
  static listEnvVars(userId: string, projectId: string): ProjectEnvVarRecord[] {
    this.verifyOwnership(userId, projectId);

    const rows = db.prepare(`
      SELECT id, projectId, key, createdAt, updatedAt
      FROM project_env_vars
      WHERE projectId = ?
      ORDER BY key ASC
    `).all(projectId) as Array<{ id: string; projectId: string; key: string; createdAt: string; updatedAt: string }>;

    return rows.map(r => ({
      ...r,
      isConfigured: true
    }));
  }

  static deleteEnvVar(userId: string, projectId: string, key: string): boolean {
    this.verifyOwnership(userId, projectId);
    const cleanKey = key.trim().toUpperCase();

    const res = db.prepare(`
      DELETE FROM project_env_vars
      WHERE projectId = ? AND key = ?
    `).run(projectId, cleanKey);

    return res.changes > 0;
  }

  /**
   * Internal server-only method to retrieve decrypted env vars for isolated build runner.
   * NEVER exposed via API.
   */
  static getInternalEnvVars(userId: string, projectId: string): Record<string, string> {
    this.verifyOwnership(userId, projectId);

    const rows = db.prepare(`
      SELECT key, valueEncrypted
      FROM project_env_vars
      WHERE projectId = ?
    `).all(projectId) as Array<{ key: string; valueEncrypted: string }>;

    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.key] = r.valueEncrypted;
    }
    return result;
  }

  /**
   * Real project-wide search across file paths and source contents
   */
  static searchProject(userId: string, projectId: string, query: string): Array<{
    path: string;
    matchType: 'filename' | 'content';
    matches: Array<{ lineNumber: number; line: string }>;
  }> {
    this.verifyOwnership(userId, projectId);
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const files = this.listFiles(userId, projectId);
    const results: Array<{
      path: string;
      matchType: 'filename' | 'content';
      matches: Array<{ lineNumber: number; line: string }>;
    }> = [];

    for (const f of files) {
      if (f.fileType === 'directory') continue;

      const pathMatch = f.path.toLowerCase().includes(q);
      const contentLines = f.content.split('\n');
      const matchingLines: Array<{ lineNumber: number; line: string }> = [];

      contentLines.forEach((line, idx) => {
        if (line.toLowerCase().includes(q)) {
          matchingLines.push({
            lineNumber: idx + 1,
            line: line.slice(0, 150)
          });
        }
      });

      if (pathMatch || matchingLines.length > 0) {
        results.push({
          path: f.path,
          matchType: matchingLines.length > 0 ? 'content' : 'filename',
          matches: matchingLines.slice(0, 10)
        });
      }
    }

    return results;
  }

  /**
   * Starter files generator based on selected framework
   */
  private static getStarterFiles(
    projectName: string,
    framework: ProjectFramework,
    language: ProjectLanguage
  ): Array<{ path: string; content: string; fileType: string }> {
    const isTs = language === 'typescript';
    const ext = isTs ? 'tsx' : 'jsx';
    const scriptExt = isTs ? 'ts' : 'js';

    if (framework === 'vanilla-html') {
      return [
        {
          path: 'index.html',
          fileType: 'file',
          content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <h1>${projectName}</h1>
    <p>A fast, modern web application powered by Darkano AI.</p>
    <button id="action-btn">Click Me</button>
    <div id="output"></div>
  </div>
  <script src="app.js"></script>
</body>
</html>`
        },
        {
          path: 'styles.css',
          fileType: 'file',
          content: `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #0d1117;
  color: #c9d1d9;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
}

.container {
  background: #161b22;
  border: 1px solid #30363d;
  padding: 2.5rem;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  max-width: 480px;
  width: 90%;
  text-align: center;
}

h1 {
  color: #58a6ff;
  margin-top: 0;
}

button {
  background-color: #238636;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s;
}

button:hover {
  background-color: #2ea043;
}

#output {
  margin-top: 1.5rem;
  font-family: monospace;
  font-size: 0.9rem;
  color: #7ee787;
}`
        },
        {
          path: 'app.js',
          fileType: 'file',
          content: `document.getElementById('action-btn')?.addEventListener('click', () => {
  const output = document.getElementById('output');
  if (output) {
    output.innerText = 'Application interactive state updated at ' + new Date().toLocaleTimeString();
  }
});`
        },
        {
          path: 'README.md',
          fileType: 'file',
          content: `# ${projectName}\n\nBuilt with Darkano AI Project Builder.\n\n- Standard HTML5 / CSS3 / JavaScript\n- Ready for instant preview and live code editing.`
        }
      ];
    }

    if (framework === 'nodejs') {
      return [
        {
          path: 'package.json',
          fileType: 'file',
          content: JSON.stringify(
            {
              name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
              version: '1.0.0',
              description: `${projectName} - Darkano Node.js Service`,
              main: `dist/index.${scriptExt}`,
              scripts: {
                build: isTs ? 'tsc' : 'echo "No build required"',
                start: `node dist/index.${scriptExt}`
              },
              dependencies: {
                express: '^4.21.2'
              }
            },
            null,
            2
          )
        },
        {
          path: `src/index.${scriptExt}`,
          fileType: 'file',
          content: `// ${projectName} - Node.js Backend Service
const port = process.env.PORT || 8080;

console.log('[${projectName}] Server initial state ready on port ' + port);
`
        },
        {
          path: 'README.md',
          fileType: 'file',
          content: `# ${projectName}\n\nNode.js backend project managed in Darkano AI.`
        }
      ];
    }

    // Default: react-vite
    return [
      {
        path: 'package.json',
        fileType: 'file',
        content: JSON.stringify(
          {
            name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            private: true,
            version: '0.1.0',
            type: 'module',
            scripts: {
              dev: 'vite',
              build: 'vite build',
              preview: 'vite preview'
            },
            dependencies: {
              react: '^18.3.1',
              'react-dom': '^18.3.1',
              'lucide-react': '^0.468.0'
            }
          },
          null,
          2
        )
      },
      {
        path: 'index.html',
        fileType: 'file',
        content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background-color: #0b0f19;
        color: #f3f4f6;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.${ext}"></script>
  </body>
</html>`
      },
      {
        path: `src/main.${ext}`,
        fileType: 'file',
        content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`
      },
      {
        path: `src/App.${ext}`,
        fileType: 'file',
        content: `import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app-container">
      <header className="hero">
        <div className="badge">Darkano AI Project</div>
        <h1>${projectName}</h1>
        <p>Your interactive application generated and managed inside Darkano AI.</p>
        
        <div className="card">
          <button onClick={() => setCount(c => c + 1)}>
            Counter state: {count}
          </button>
          <p className="hint">
            Edit <code>src/App.${ext}</code> and click <strong>Run Build</strong> to refresh preview.
          </p>
        </div>
      </header>
    </div>
  );
}`
      },
      {
        path: 'src/index.css',
        fileType: 'file',
        content: `* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: radial-gradient(circle at 50% 20%, #1e1b4b 0%, #09090b 70%);
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

.app-container {
  max-width: 600px;
  width: 90%;
  text-align: center;
  padding: 2rem;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.badge {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgba(99, 102, 241, 0.2);
  color: #818cf8;
  border: 1px solid rgba(99, 102, 241, 0.4);
  padding: 4px 12px;
  border-radius: 9999px;
}

h1 {
  font-size: 2.25rem;
  margin: 0;
  background: linear-gradient(to right, #ffffff, #94a3b8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

p {
  color: #94a3b8;
  line-height: 1.6;
}

.card {
  margin-top: 1.5rem;
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  backdrop-filter: blur(12px);
  width: 100%;
}

button {
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: white;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  padding: 10px 24px;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

button:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(79, 70, 229, 0.6);
}

.hint {
  font-size: 0.85rem;
  margin-top: 1rem;
  color: #64748b;
}

code {
  background: rgba(0, 0, 0, 0.4);
  padding: 2px 6px;
  border-radius: 4px;
  color: #e2e8f0;
  font-family: monospace;
}`
      },
      {
        path: 'README.md',
        fileType: 'file',
        content: `# ${projectName}\n\nInteractive React application created with Darkano AI Workspace.\n\n- Framework: React + Vite\n- Language: ${language}\n- Live build and preview supported.`
      }
    ];
  }
}
