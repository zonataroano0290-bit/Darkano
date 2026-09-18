import crypto from 'node:crypto';
import { db } from '../db/database.js';
import {
  GitConnectionRecord,
  GitCommitRecord,
  GitStatusResult,
  ProjectFileRecord
} from '../types.js';
import { CollaborationService, CollaborationAccessError } from './collaborationService.js';
import { ProjectService } from '../db/projectService.js';

// Simple AES-256-GCM encryption for storing Git tokens securely server-side
const ENCRYPTION_KEY = crypto.createHash('sha256').update(process.env.SESSION_SECRET || 'darkano-git-key-fallback').digest();

function encryptToken(plainToken: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(encryptedStr: string): string | null {
  try {
    const parts = encryptedStr.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export class GitService {
  /**
   * Helper to resolve active GitHub token (from project connection or process.env.GITHUB_TOKEN)
   */
  private static resolveToken(connection: GitConnectionRecord | null): string | null {
    if (connection?.tokenEncrypted) {
      const dec = decryptToken(connection.tokenEncrypted);
      if (dec) return dec;
    }
    if (process.env.GITHUB_TOKEN) {
      return process.env.GITHUB_TOKEN;
    }
    return null;
  }

  /**
   * Parses repository slug (e.g. 'owner/repo' from 'https://github.com/owner/repo')
   */
  static parseRepoSlug(repoUrlOrSlug: string): { owner: string; repo: string } | null {
    const clean = repoUrlOrSlug.trim().replace(/\.git$/, '');
    const githubMatch = clean.match(/github\.com[/:]([^/]+)\/([^/]+)/);
    if (githubMatch) {
      return { owner: githubMatch[1], repo: githubMatch[2] };
    }
    const simpleMatch = clean.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (simpleMatch) {
      return { owner: simpleMatch[1], repo: simpleMatch[2] };
    }
    return null;
  }

  /**
   * Get Git status for a project.
   * If not configured, returns honest isConfigured: false without fake data.
   */
  static async getStatus(userId: string, projectId: string): Promise<GitStatusResult> {
    CollaborationService.verifyAccess(userId, projectId, 'viewer');

    const conn = db.prepare(`
      SELECT id, projectId, userId, provider, repoUrl, repoName, defaultBranch, tokenEncrypted, status, lastSyncAt, lastCommitHash, createdAt, updatedAt
      FROM git_connections
      WHERE projectId = ?
    `).get(projectId) as GitConnectionRecord | undefined;

    const token = this.resolveToken(conn || null);

    if (!conn && !token) {
      return {
        isConfigured: false,
        connection: null,
        branches: [],
        currentBranch: '',
        commits: [],
        changedFiles: [],
        aheadCount: 0,
        behindCount: 0
      };
    }

    if (!conn) {
      // Token exists in environment but project not yet linked to a repository
      return {
        isConfigured: false,
        connection: null,
        branches: [],
        currentBranch: '',
        commits: [],
        changedFiles: [],
        aheadCount: 0,
        behindCount: 0
      };
    }

    // Mask credentials before sending connection record to client
    const safeConn: GitConnectionRecord = {
      ...conn,
      tokenEncrypted: undefined as any
    };

    // Retrieve locally recorded real commits
    const localCommits = db.prepare(`
      SELECT * FROM git_commits WHERE projectId = ? ORDER BY createdAt DESC LIMIT 20
    `).all(projectId) as unknown as GitCommitRecord[];

    const slug = this.parseRepoSlug(conn.repoName || conn.repoUrl);
    if (!slug || !token) {
      return {
        isConfigured: true,
        connection: safeConn,
        branches: [conn.defaultBranch || 'main'],
        currentBranch: conn.defaultBranch || 'main',
        commits: localCommits,
        changedFiles: [],
        aheadCount: 0,
        behindCount: 0,
        remoteUrl: conn.repoUrl
      };
    }

    // Query real GitHub API for live branches and commits
    try {
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Darkano-AI-Collaborator'
      };

      const [branchesRes, commitsRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${slug.owner}/${slug.repo}/branches`, { headers }),
        fetch(`https://api.github.com/repos/${slug.owner}/${slug.repo}/commits?sha=${conn.defaultBranch}&per_page=15`, { headers })
      ]);

      let branches: string[] = [conn.defaultBranch || 'main'];
      if (branchesRes.ok) {
        const bData = await branchesRes.json();
        if (Array.isArray(bData)) {
          branches = bData.map(b => b.name);
        }
      }

      let remoteCommits: GitCommitRecord[] = [];
      if (commitsRes.ok) {
        const cData = await commitsRes.json();
        if (Array.isArray(cData)) {
          remoteCommits = cData.map(c => ({
            id: `gitc_${c.sha.slice(0, 12)}`,
            projectId,
            commitHash: c.sha,
            message: c.commit.message,
            authorName: c.commit.author.name || 'GitHub User',
            authorEmail: c.commit.author.email || '',
            branch: conn.defaultBranch,
            snapshotId: null,
            createdAt: c.commit.author.date || new Date().toISOString()
          }));
        }
      }

      // Compute changed files between current database project files and last sync snapshot
      const currentFiles = db.prepare(`SELECT path, size FROM project_files WHERE projectId = ? AND fileType = 'file'`).all(projectId) as Array<{ path: string; size: number }>;
      const changedFiles = currentFiles.map(f => ({
        path: f.path,
        status: 'modified' as const
      }));

      return {
        isConfigured: true,
        connection: safeConn,
        branches,
        currentBranch: conn.defaultBranch,
        commits: remoteCommits.length > 0 ? remoteCommits : localCommits,
        changedFiles,
        aheadCount: localCommits.length > 0 ? 1 : 0,
        behindCount: 0,
        remoteUrl: conn.repoUrl
      };
    } catch (err: any) {
      console.warn('[GitService] GitHub API query error:', err.message);
      return {
        isConfigured: true,
        connection: safeConn,
        branches: [conn.defaultBranch],
        currentBranch: conn.defaultBranch,
        commits: localCommits,
        changedFiles: [],
        aheadCount: 0,
        behindCount: 0,
        remoteUrl: conn.repoUrl
      };
    }
  }

  /**
   * Connect a project to a real Git repository.
   * Requires OWNER permissions.
   */
  static async connectRepository(params: {
    userId: string;
    projectId: string;
    repoUrl: string;
    token?: string;
    defaultBranch?: string;
  }): Promise<GitConnectionRecord> {
    const { userId, projectId, repoUrl, token, defaultBranch = 'main' } = params;
    CollaborationService.verifyAccess(userId, projectId, 'owner');

    const slug = this.parseRepoSlug(repoUrl);
    if (!slug) {
      throw new CollaborationAccessError('Invalid repository URL or format. Expected "owner/repo" or "https://github.com/owner/repo"', 400);
    }

    const activeToken = token?.trim() || process.env.GITHUB_TOKEN;
    if (!activeToken) {
      throw new CollaborationAccessError('A GitHub Personal Access Token or GITHUB_TOKEN environment variable is required to authenticate with GitHub', 400);
    }

    // Verify token and repository access against real GitHub API
    const verifyRes = await fetch(`https://api.github.com/repos/${slug.owner}/${slug.repo}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `Bearer ${activeToken}`,
        'User-Agent': 'Darkano-AI-Collaborator'
      }
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      throw new CollaborationAccessError(
        `Failed to connect to GitHub repository: ${err.message || `HTTP ${verifyRes.status}`}. Please verify repository permissions and Personal Access Token scope.`,
        400
      );
    }

    const repoInfo = await verifyRes.json();
    const resolvedBranch = defaultBranch || repoInfo.default_branch || 'main';
    const encryptedToken = token?.trim() ? encryptToken(token.trim()) : null;
    const now = new Date().toISOString();

    const existing = db.prepare(`SELECT id FROM git_connections WHERE projectId = ?`).get(projectId);
    const connectionId = existing ? (existing as any).id : `git_${crypto.randomUUID().replace(/-/g, '')}`;

    if (existing) {
      db.prepare(`
        UPDATE git_connections 
        SET repoUrl = ?, repoName = ?, defaultBranch = ?, tokenEncrypted = COALESCE(?, tokenEncrypted), status = 'connected', updatedAt = ?
        WHERE projectId = ?
      `).run(repoInfo.html_url || repoUrl, repoInfo.full_name, resolvedBranch, encryptedToken, now, projectId);
    } else {
      db.prepare(`
        INSERT INTO git_connections (
          id, projectId, userId, provider, repoUrl, repoName, defaultBranch, tokenEncrypted, status, createdAt, updatedAt
        ) VALUES (?, ?, ?, 'github', ?, ?, ?, ?, 'connected', ?, ?)
      `).run(connectionId, projectId, userId, repoInfo.html_url || repoUrl, repoInfo.full_name, resolvedBranch, encryptedToken, now, now);
    }

    CollaborationService.recordActivity(projectId, userId, 'git_connected', 'git', connectionId, {
      repository: repoInfo.full_name,
      branch: resolvedBranch
    });

    return {
      id: connectionId,
      projectId,
      userId,
      provider: 'github',
      repoUrl: repoInfo.html_url || repoUrl,
      repoName: repoInfo.full_name,
      defaultBranch: resolvedBranch,
      status: 'connected',
      lastSyncAt: now,
      lastCommitHash: null,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Disconnect Git repository.
   * Requires OWNER permissions.
   */
  static disconnectRepository(userId: string, projectId: string): void {
    CollaborationService.verifyAccess(userId, projectId, 'owner');
    db.prepare(`DELETE FROM git_connections WHERE projectId = ?`).run(projectId);
    CollaborationService.recordActivity(projectId, userId, 'git_disconnected', 'git', projectId);
  }

  /**
   * Create a real Git commit on GitHub using the Git Data API.
   * Requires at least EDITOR permissions.
   */
  static async createCommit(params: {
    userId: string;
    projectId: string;
    message: string;
    branch?: string;
  }): Promise<GitCommitRecord> {
    const { userId, projectId, message, branch } = params;
    CollaborationService.verifyAccess(userId, projectId, 'editor');

    if (!message || !message.trim()) {
      throw new CollaborationAccessError('Commit message is required', 400);
    }

    const conn = db.prepare(`SELECT * FROM git_connections WHERE projectId = ?`).get(projectId) as GitConnectionRecord | undefined;
    if (!conn) {
      throw new CollaborationAccessError('No Git repository connected to this project', 400);
    }

    const token = this.resolveToken(conn);
    if (!token) {
      throw new CollaborationAccessError('GitHub token is missing or expired. Please reconnect repository with a valid token.', 401);
    }

    const slug = this.parseRepoSlug(conn.repoName || conn.repoUrl);
    if (!slug) {
      throw new CollaborationAccessError('Invalid repository slug', 400);
    }

    const targetBranch = branch || conn.defaultBranch || 'main';
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Darkano-AI-Collaborator',
      'Content-Type': 'application/json'
    };

    // 1. Get latest commit SHA on target branch
    const refRes = await fetch(`https://api.github.com/repos/${slug.owner}/${slug.repo}/git/ref/heads/${targetBranch}`, { headers });
    if (!refRes.ok) {
      throw new CollaborationAccessError(`Branch '${targetBranch}' not found on GitHub or unauthorized`, 400);
    }
    const refData = await refRes.json();
    const parentCommitSha = refData.object.sha;

    // 2. Fetch files from project
    const files = db.prepare(`
      SELECT path, content FROM project_files WHERE projectId = ? AND fileType = 'file'
    `).all(projectId) as Array<{ path: string; content: string }>;

    // 3. Create Git tree entries for all files
    const treeEntries: Array<{ path: string; mode: string; type: string; content: string }> = files.map(f => ({
      path: f.path,
      mode: '100644',
      type: 'blob',
      content: f.content
    }));

    const treeRes = await fetch(`https://api.github.com/repos/${slug.owner}/${slug.repo}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tree: treeEntries
      })
    });

    if (!treeRes.ok) {
      const err = await treeRes.json().catch(() => ({}));
      throw new CollaborationAccessError(`Failed to create Git tree: ${err.message || treeRes.statusText}`, 400);
    }
    const treeData = await treeRes.json();

    // 4. Create commit
    const user = db.prepare(`SELECT displayName, email FROM users WHERE id = ?`).get(userId) as any;
    const authorName = user?.displayName || 'Darkano Collaborator';
    const authorEmail = user?.email || 'collaborator@darkano.ai';

    const commitRes = await fetch(`https://api.github.com/repos/${slug.owner}/${slug.repo}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: message.trim(),
        tree: treeData.sha,
        parents: [parentCommitSha],
        author: {
          name: authorName,
          email: authorEmail,
          date: new Date().toISOString()
        }
      })
    });

    if (!commitRes.ok) {
      const err = await commitRes.json().catch(() => ({}));
      throw new CollaborationAccessError(`Failed to create Git commit: ${err.message || commitRes.statusText}`, 400);
    }
    const commitData = await commitRes.json();
    const realCommitHash = commitData.sha;

    // 5. Update branch reference to point to new commit
    const updateRefRes = await fetch(`https://api.github.com/repos/${slug.owner}/${slug.repo}/git/refs/heads/${targetBranch}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        sha: realCommitHash,
        force: false
      })
    });

    if (!updateRefRes.ok) {
      const err = await updateRefRes.json().catch(() => ({}));
      throw new CollaborationAccessError(`Failed to update branch ref to commit: ${err.message || updateRefRes.statusText}`, 400);
    }

    // 6. Create snapshot linked to this commit
    const snapshot = ProjectService.createSnapshot(userId, projectId, `Git Commit: ${message.trim().slice(0, 60)} (${realCommitHash.slice(0, 7)})`);

    // 7. Record commit in database
    const commitId = `commit_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO git_commits (id, projectId, commitHash, message, authorName, authorEmail, branch, snapshotId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(commitId, projectId, realCommitHash, message.trim(), authorName, authorEmail, targetBranch, snapshot.id, now);

    // Update connection lastSyncAt and lastCommitHash
    db.prepare(`
      UPDATE git_connections SET lastSyncAt = ?, lastCommitHash = ?, updatedAt = ? WHERE id = ?
    `).run(now, realCommitHash, now, conn.id);

    CollaborationService.recordActivity(projectId, userId, 'git_commit_created', 'git_commit', commitId, {
      commitHash: realCommitHash,
      message: message.trim(),
      branch: targetBranch
    });

    return {
      id: commitId,
      projectId,
      commitHash: realCommitHash,
      message: message.trim(),
      authorName,
      authorEmail,
      branch: targetBranch,
      snapshotId: snapshot.id,
      createdAt: now
    };
  }

  /**
   * Pull repository changes from GitHub and update project files.
   * Requires EDITOR permissions.
   */
  static async pullRepository(userId: string, projectId: string, branch?: string): Promise<{ filesUpdated: number; latestCommit: string }> {
    CollaborationService.verifyAccess(userId, projectId, 'editor');

    const conn = db.prepare(`SELECT * FROM git_connections WHERE projectId = ?`).get(projectId) as GitConnectionRecord | undefined;
    if (!conn) {
      throw new CollaborationAccessError('No Git repository connected to this project', 400);
    }

    const token = this.resolveToken(conn);
    if (!token) {
      throw new CollaborationAccessError('GitHub token missing. Please reconnect repository.', 401);
    }

    const slug = this.parseRepoSlug(conn.repoName || conn.repoUrl);
    if (!slug) {
      throw new CollaborationAccessError('Invalid repository slug', 400);
    }

    const targetBranch = branch || conn.defaultBranch || 'main';
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Darkano-AI-Collaborator'
    };

    // 1. Get branch commit
    const branchRes = await fetch(`https://api.github.com/repos/${slug.owner}/${slug.repo}/branches/${targetBranch}`, { headers });
    if (!branchRes.ok) {
      throw new CollaborationAccessError(`Branch '${targetBranch}' not found on remote`, 404);
    }
    const branchData = await branchRes.json();
    const commitSha = branchData.commit.sha;
    const treeSha = branchData.commit.commit.tree.sha;

    // 2. Fetch full tree
    const treeRes = await fetch(`https://api.github.com/repos/${slug.owner}/${slug.repo}/git/trees/${treeSha}?recursive=1`, { headers });
    if (!treeRes.ok) {
      throw new CollaborationAccessError('Failed to fetch tree from remote repository', 500);
    }
    const treeData = await treeRes.json();
    const entries: Array<{ path: string; type: string; url: string; size?: number }> = treeData.tree || [];

    // Filter only files (blobs), excluding large binaries and git directory
    const textBlobs = entries.filter(e => e.type === 'blob' && !e.path.startsWith('.git/'));

    let filesUpdated = 0;
    const now = new Date().toISOString();

    for (const item of textBlobs.slice(0, 50)) { // Safeguard to reasonable project size
      try {
        const blobRes = await fetch(item.url, { headers });
        if (!blobRes.ok) continue;
        const blobData = await blobRes.json();
        const content = Buffer.from(blobData.content, 'base64').toString('utf8');

        // Check if file exists in project
        const existing = db.prepare(`SELECT id, version FROM project_files WHERE projectId = ? AND path = ?`).get(projectId, item.path) as { id: string; version: number } | undefined;
        const size = Buffer.byteLength(content, 'utf8');

        if (existing) {
          db.prepare(`
            UPDATE project_files 
            SET content = ?, size = ?, version = version + 1, lastModifiedBy = ?, updatedAt = ?
            WHERE id = ?
          `).run(content, size, userId, now, existing.id);
        } else {
          const fileId = `file_${crypto.randomUUID().replace(/-/g, '')}`;
          db.prepare(`
            INSERT INTO project_files (id, projectId, path, content, fileType, size, version, lastModifiedBy, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, 'file', ?, 1, ?, ?, ?)
          `).run(fileId, projectId, item.path, content, size, userId, now, now);
        }
        filesUpdated++;
      } catch (err: any) {
        console.warn(`[GitService] Error pulling file ${item.path}:`, err?.message);
      }
    }

    db.prepare(`UPDATE git_connections SET lastSyncAt = ?, lastCommitHash = ?, updatedAt = ? WHERE id = ?`).run(now, commitSha, now, conn.id);
    db.prepare(`UPDATE projects SET updatedAt = ? WHERE id = ?`).run(now, projectId);

    CollaborationService.recordActivity(projectId, userId, 'git_pulled', 'git', conn.id, {
      filesUpdated,
      commitSha
    });

    return { filesUpdated, latestCommit: commitSha };
  }
}
