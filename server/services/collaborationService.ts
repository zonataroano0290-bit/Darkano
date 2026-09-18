import crypto from 'node:crypto';
import { db } from '../db/database.js';
import {
  ProjectRecord,
  ProjectFileRecord,
  ProjectMemberRecord,
  ProjectMemberRole,
  ProjectInvitationRecord,
  ProjectShareLinkRecord,
  ProjectCommentRecord,
  ProjectActivityRecord
} from '../types.js';

export class CollaborationAccessError extends Error {
  statusCode: number;
  constructor(message: string = 'Access denied or insufficient permissions', statusCode: number = 403) {
    super(message);
    this.name = 'CollaborationAccessError';
    this.statusCode = statusCode;
  }
}

export class VersionConflictError extends Error {
  currentFile: ProjectFileRecord;
  constructor(message: string, currentFile: ProjectFileRecord) {
    super(message);
    this.name = 'VersionConflictError';
    this.currentFile = currentFile;
  }
}

const ROLE_RANKS: Record<ProjectMemberRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3
};

export class CollaborationService {
  /**
   * Determine user role for a project: 'owner' | 'editor' | 'viewer'.
   * Throws CollaborationAccessError(404 or 403) if no access.
   */
  static getProjectAccess(userId: string, projectId: string): { project: ProjectRecord; role: ProjectMemberRole } {
    if (!userId || !projectId) {
      throw new CollaborationAccessError('User ID and Project ID are required', 400);
    }

    const project = db.prepare(`
      SELECT id, userId, name, description, framework, language, status, createdAt, updatedAt
      FROM projects
      WHERE id = ?
    `).get(projectId) as ProjectRecord | undefined;

    if (!project) {
      throw new CollaborationAccessError('Project not found', 404);
    }

    // If user is creator/primary owner of the project
    if (project.userId === userId) {
      return { project, role: 'owner' };
    }

    // Check project_members table
    const member = db.prepare(`
      SELECT role, status
      FROM project_members
      WHERE projectId = ? AND userId = ? AND status = 'active'
    `).get(projectId, userId) as { role: ProjectMemberRole; status: string } | undefined;

    if (member) {
      return { project, role: member.role };
    }

    throw new CollaborationAccessError('You are not a member of this project', 403);
  }

  /**
   * Verify access meets minimum required role:
   * owner >= editor >= viewer
   */
  static verifyAccess(userId: string, projectId: string, minRole: ProjectMemberRole = 'viewer'): { project: ProjectRecord; role: ProjectMemberRole } {
    const { project, role } = this.getProjectAccess(userId, projectId);
    if (ROLE_RANKS[role] < ROLE_RANKS[minRole]) {
      throw new CollaborationAccessError(
        `This action requires ${minRole.toUpperCase()} permissions. Your current role is ${role.toUpperCase()}.`,
        403
      );
    }
    return { project, role };
  }

  // ==========================================
  // Members Management
  // ==========================================

  static listMembers(projectId: string): ProjectMemberRecord[] {
    const project = db.prepare(`SELECT id, userId, createdAt FROM projects WHERE id = ?`).get(projectId) as { id: string; userId: string; createdAt: string } | undefined;
    if (!project) return [];

    const members = db.prepare(`
      SELECT 
        pm.id,
        pm.projectId,
        pm.userId,
        pm.role,
        pm.invitedBy,
        pm.status,
        pm.createdAt,
        pm.updatedAt,
        u.email as userEmail,
        u.displayName as userDisplayName,
        u.avatarUrl as userAvatarUrl
      FROM project_members pm
      JOIN users u ON pm.userId = u.id
      WHERE pm.projectId = ? AND pm.status = 'active'
      ORDER BY 
        CASE pm.role 
          WHEN 'owner' THEN 1 
          WHEN 'editor' THEN 2 
          WHEN 'viewer' THEN 3 
        END ASC,
        pm.createdAt ASC
    `).all(projectId) as unknown as ProjectMemberRecord[];

    // Ensure owner is included in listing if not yet in project_members
    const hasOwner = members.some(m => m.userId === project.userId);
    if (!hasOwner) {
      const ownerUser = db.prepare(`SELECT id, email, displayName, avatarUrl FROM users WHERE id = ?`).get(project.userId) as any;
      if (ownerUser) {
        members.unshift({
          id: `mem_owner_${project.userId}`,
          projectId,
          userId: project.userId,
          role: 'owner',
          invitedBy: null,
          status: 'active',
          createdAt: project.createdAt,
          updatedAt: project.createdAt,
          userEmail: ownerUser.email,
          userDisplayName: ownerUser.displayName,
          userAvatarUrl: ownerUser.avatarUrl
        });
      }
    }

    return members;
  }

  static updateMemberRole(actorId: string, projectId: string, targetUserId: string, newRole: ProjectMemberRole): void {
    this.verifyAccess(actorId, projectId, 'owner');

    const project = db.prepare(`SELECT userId FROM projects WHERE id = ?`).get(projectId) as { userId: string } | undefined;
    if (project?.userId === targetUserId) {
      throw new CollaborationAccessError('Cannot change the role of the primary project owner', 400);
    }

    if (!['editor', 'viewer', 'owner'].includes(newRole)) {
      throw new CollaborationAccessError('Invalid role specified', 400);
    }

    const now = new Date().toISOString();
    const existing = db.prepare(`SELECT id FROM project_members WHERE projectId = ? AND userId = ?`).get(projectId, targetUserId);

    if (existing) {
      db.prepare(`
        UPDATE project_members 
        SET role = ?, updatedAt = ?
        WHERE projectId = ? AND userId = ?
      `).run(newRole, now, projectId, targetUserId);
    } else {
      const memberId = `mem_${crypto.randomUUID().replace(/-/g, '')}`;
      db.prepare(`
        INSERT INTO project_members (id, projectId, userId, role, invitedBy, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(memberId, projectId, targetUserId, newRole, actorId, now, now);
    }

    this.recordActivity(projectId, actorId, 'role_changed', 'member', targetUserId, { newRole });
  }

  static removeMember(actorId: string, projectId: string, targetUserId: string): void {
    const { role } = this.getProjectAccess(actorId, projectId);
    const project = db.prepare(`SELECT userId FROM projects WHERE id = ?`).get(projectId) as { userId: string } | undefined;

    if (project?.userId === targetUserId) {
      throw new CollaborationAccessError('Cannot remove the project owner', 400);
    }

    // Owner can remove anyone; member can remove themselves (leave)
    if (role !== 'owner' && actorId !== targetUserId) {
      throw new CollaborationAccessError('Only the project owner can remove collaborators', 403);
    }

    db.prepare(`
      DELETE FROM project_members 
      WHERE projectId = ? AND userId = ?
    `).run(projectId, targetUserId);

    this.recordActivity(projectId, actorId, 'member_removed', 'member', targetUserId, {
      wasSelfRemoval: actorId === targetUserId
    });
  }

  // ==========================================
  // Invitations
  // ==========================================

  static createInvitation(params: {
    actorId: string;
    projectId: string;
    inviteeEmail: string;
    role: ProjectMemberRole;
  }): ProjectInvitationRecord {
    const { actorId, projectId, inviteeEmail, role } = params;
    this.verifyAccess(actorId, projectId, 'owner');

    const cleanEmail = inviteeEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      throw new CollaborationAccessError('A valid email address is required', 400);
    }

    if (!['editor', 'viewer'].includes(role)) {
      throw new CollaborationAccessError('Invitations can only be issued for Editor or Viewer roles', 400);
    }

    // Check if invitee is already an active member
    const existingUser = db.prepare(`SELECT id FROM users WHERE email = ?`).get(cleanEmail) as { id: string } | undefined;
    if (existingUser) {
      const isMember = db.prepare(`
        SELECT id FROM project_members 
        WHERE projectId = ? AND userId = ? AND status = 'active'
      `).get(projectId, existingUser.id);

      const project = db.prepare(`SELECT userId FROM projects WHERE id = ?`).get(projectId) as { userId: string } | undefined;
      if (isMember || project?.userId === existingUser.id) {
        throw new CollaborationAccessError('User is already a member of this project', 400);
      }
    }

    // Check for existing pending invitation for same email
    const existingInvite = db.prepare(`
      SELECT id FROM project_invitations 
      WHERE projectId = ? AND inviteeEmail = ? AND status = 'pending'
    `).get(projectId, cleanEmail) as { id: string } | undefined;

    if (existingInvite) {
      // Revoke previous pending invite
      db.prepare(`UPDATE project_invitations SET status = 'revoked' WHERE id = ?`).run(existingInvite.id);
    }

    const invitationId = `inv_${crypto.randomUUID().replace(/-/g, '')}`;
    const token = crypto.randomBytes(24).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    db.prepare(`
      INSERT INTO project_invitations (
        id, projectId, inviterId, inviteeEmail, inviteeUserId, role, token, status, expiresAt, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      invitationId,
      projectId,
      actorId,
      cleanEmail,
      existingUser?.id || null,
      role,
      token,
      expiresAt,
      now.toISOString()
    );

    this.recordActivity(projectId, actorId, 'member_invited', 'invitation', invitationId, {
      inviteeEmail: cleanEmail,
      role
    });

    return {
      id: invitationId,
      projectId,
      inviterId: actorId,
      inviteeEmail: cleanEmail,
      inviteeUserId: existingUser?.id || null,
      role,
      token,
      status: 'pending',
      expiresAt,
      createdAt: now.toISOString(),
      acceptedAt: null
    };
  }

  static listProjectInvitations(projectId: string): ProjectInvitationRecord[] {
    return db.prepare(`
      SELECT 
        pi.*,
        u.email as inviterEmail,
        u.displayName as inviterDisplayName
      FROM project_invitations pi
      JOIN users u ON pi.inviterId = u.id
      WHERE pi.projectId = ?
      ORDER BY pi.createdAt DESC
    `).all(projectId) as unknown as ProjectInvitationRecord[];
  }

  static listUserInvitations(userEmail: string, userId?: string): ProjectInvitationRecord[] {
    const cleanEmail = userEmail.trim().toLowerCase();
    const now = new Date().toISOString();

    return db.prepare(`
      SELECT 
        pi.*,
        p.name as projectName,
        u.email as inviterEmail,
        u.displayName as inviterDisplayName
      FROM project_invitations pi
      JOIN projects p ON pi.projectId = p.id
      JOIN users u ON pi.inviterId = u.id
      WHERE (pi.inviteeEmail = ? OR pi.inviteeUserId = ?)
        AND pi.status = 'pending'
        AND pi.expiresAt > ?
      ORDER BY pi.createdAt DESC
    `).all(cleanEmail, userId || '', now) as unknown as ProjectInvitationRecord[];
  }

  static acceptInvitation(userId: string, userEmail: string, token: string): { projectId: string; role: ProjectMemberRole } {
    const invite = db.prepare(`
      SELECT * FROM project_invitations WHERE token = ?
    `).get(token) as ProjectInvitationRecord | undefined;

    if (!invite) {
      throw new CollaborationAccessError('Invalid or expired invitation token', 404);
    }

    if (invite.status !== 'pending') {
      throw new CollaborationAccessError(`Invitation is no longer pending (${invite.status})`, 400);
    }

    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      db.prepare(`UPDATE project_invitations SET status = 'expired' WHERE id = ?`).run(invite.id);
      throw new CollaborationAccessError('Invitation has expired', 400);
    }

    // Verify recipient email match
    if (invite.inviteeEmail.toLowerCase() !== userEmail.toLowerCase()) {
      throw new CollaborationAccessError('This invitation was sent to a different email address', 403);
    }

    const now = new Date().toISOString();

    // Upsert project member
    const existingMember = db.prepare(`
      SELECT id FROM project_members WHERE projectId = ? AND userId = ?
    `).get(invite.projectId, userId);

    if (existingMember) {
      db.prepare(`
        UPDATE project_members 
        SET role = ?, status = 'active', updatedAt = ?
        WHERE projectId = ? AND userId = ?
      `).run(invite.role, now, invite.projectId, userId);
    } else {
      const memberId = `mem_${crypto.randomUUID().replace(/-/g, '')}`;
      db.prepare(`
        INSERT INTO project_members (id, projectId, userId, role, invitedBy, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(memberId, invite.projectId, userId, invite.role, invite.inviterId, now, now);
    }

    // Mark invitation accepted
    db.prepare(`
      UPDATE project_invitations 
      SET status = 'accepted', acceptedAt = ?, inviteeUserId = ?
      WHERE id = ?
    `).run(now, userId, invite.id);

    this.recordActivity(invite.projectId, userId, 'member_joined', 'member', userId, {
      role: invite.role,
      invitationId: invite.id
    });

    return { projectId: invite.projectId, role: invite.role };
  }

  static declineInvitation(userId: string, userEmail: string, token: string): void {
    const invite = db.prepare(`SELECT * FROM project_invitations WHERE token = ?`).get(token) as ProjectInvitationRecord | undefined;
    if (!invite) {
      throw new CollaborationAccessError('Invitation not found', 404);
    }
    if (invite.inviteeEmail.toLowerCase() !== userEmail.toLowerCase()) {
      throw new CollaborationAccessError('This invitation belongs to another user', 403);
    }

    db.prepare(`UPDATE project_invitations SET status = 'declined' WHERE id = ?`).run(invite.id);
  }

  static revokeInvitation(actorId: string, projectId: string, invitationId: string): void {
    this.verifyAccess(actorId, projectId, 'owner');
    db.prepare(`
      UPDATE project_invitations 
      SET status = 'revoked' 
      WHERE id = ? AND projectId = ?
    `).run(invitationId, projectId);

    this.recordActivity(projectId, actorId, 'invitation_revoked', 'invitation', invitationId);
  }

  // ==========================================
  // Secure Share Links
  // ==========================================

  static createShareLink(params: {
    actorId: string;
    projectId: string;
    permission: 'view' | 'comment' | 'edit';
    expiresInDays?: number;
  }): ProjectShareLinkRecord {
    const { actorId, projectId, permission = 'view', expiresInDays = 30 } = params;
    this.verifyAccess(actorId, projectId, 'owner');

    const id = `link_${crypto.randomUUID().replace(/-/g, '')}`;
    const token = crypto.randomBytes(20).toString('hex');
    const now = new Date();
    const expiresAt = expiresInDays > 0 ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;

    db.prepare(`
      INSERT INTO project_share_links (id, projectId, token, permission, createdBy, status, expiresAt, createdAt)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(id, projectId, token, permission, actorId, expiresAt, now.toISOString());

    this.recordActivity(projectId, actorId, 'share_link_created', 'share_link', id, { permission });

    return {
      id,
      projectId,
      token,
      permission,
      createdBy: actorId,
      status: 'active',
      expiresAt,
      createdAt: now.toISOString()
    };
  }

  static listShareLinks(projectId: string): ProjectShareLinkRecord[] {
    return db.prepare(`
      SELECT * FROM project_share_links
      WHERE projectId = ? AND status = 'active'
      ORDER BY createdAt DESC
    `).all(projectId) as unknown as ProjectShareLinkRecord[];
  }

  static revokeShareLink(actorId: string, projectId: string, linkId: string): void {
    this.verifyAccess(actorId, projectId, 'owner');
    db.prepare(`
      UPDATE project_share_links SET status = 'revoked' WHERE id = ? AND projectId = ?
    `).run(linkId, projectId);
    this.recordActivity(projectId, actorId, 'share_link_revoked', 'share_link', linkId);
  }

  static joinViaShareLink(userId: string, token: string): { projectId: string; role: ProjectMemberRole } {
    const link = db.prepare(`
      SELECT * FROM project_share_links WHERE token = ? AND status = 'active'
    `).get(token) as ProjectShareLinkRecord | undefined;

    if (!link) {
      throw new CollaborationAccessError('Invalid or revoked share link', 404);
    }

    if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
      db.prepare(`UPDATE project_share_links SET status = 'revoked' WHERE id = ?`).run(link.id);
      throw new CollaborationAccessError('Share link has expired', 400);
    }

    const assignedRole: ProjectMemberRole = link.permission === 'edit' ? 'editor' : 'viewer';
    const now = new Date().toISOString();

    const existing = db.prepare(`
      SELECT id, role FROM project_members WHERE projectId = ? AND userId = ?
    `).get(link.projectId, userId) as { id: string; role: ProjectMemberRole } | undefined;

    if (!existing) {
      const memberId = `mem_${crypto.randomUUID().replace(/-/g, '')}`;
      db.prepare(`
        INSERT INTO project_members (id, projectId, userId, role, invitedBy, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(memberId, link.projectId, userId, assignedRole, link.createdBy, now, now);

      this.recordActivity(link.projectId, userId, 'member_joined_link', 'member', userId, {
        permission: link.permission
      });
    }

    return { projectId: link.projectId, role: existing?.role || assignedRole };
  }

  // ==========================================
  // Comments System
  // ==========================================

  static addComment(params: {
    userId: string;
    projectId: string;
    filePath?: string | null;
    content: string;
    lineStart?: number | null;
    lineEnd?: number | null;
    parentId?: string | null;
  }): ProjectCommentRecord {
    const { userId, projectId, filePath = null, content, lineStart = null, lineEnd = null, parentId = null } = params;
    // Comments allowed for viewers, editors, and owners
    this.verifyAccess(userId, projectId, 'viewer');

    if (!content || !content.trim()) {
      throw new CollaborationAccessError('Comment content cannot be empty', 400);
    }

    const commentId = `comment_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO project_comments (
        id, projectId, filePath, userId, content, lineStart, lineEnd, resolved, parentId, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(commentId, projectId, filePath, userId, content.trim(), lineStart, lineEnd, parentId, now, now);

    this.recordActivity(projectId, userId, 'comment_added', 'comment', commentId, {
      filePath,
      hasLines: lineStart !== null
    });

    const user = db.prepare(`SELECT displayName, email, avatarUrl FROM users WHERE id = ?`).get(userId) as any;

    return {
      id: commentId,
      projectId,
      filePath,
      userId,
      content: content.trim(),
      lineStart,
      lineEnd,
      resolved: false,
      parentId,
      createdAt: now,
      updatedAt: now,
      userDisplayName: user?.displayName,
      userEmail: user?.email,
      userAvatarUrl: user?.avatarUrl
    };
  }

  static listComments(projectId: string, filePath?: string): ProjectCommentRecord[] {
    let query = `
      SELECT 
        c.*,
        u.displayName as userDisplayName,
        u.email as userEmail,
        u.avatarUrl as userAvatarUrl
      FROM project_comments c
      JOIN users u ON c.userId = u.id
      WHERE c.projectId = ?
    `;
    const params: any[] = [projectId];

    if (filePath !== undefined) {
      query += ` AND (c.filePath = ? OR c.filePath IS NULL)`;
      params.push(filePath);
    }

    query += ` ORDER BY c.createdAt ASC`;

    const allComments = db.prepare(query).all(...params) as any[];

    // Format boolean and build thread hierarchy
    const commentMap = new Map<string, ProjectCommentRecord>();
    const rootComments: ProjectCommentRecord[] = [];

    for (const c of allComments) {
      const formatted: ProjectCommentRecord = {
        id: c.id,
        projectId: c.projectId,
        filePath: c.filePath,
        userId: c.userId,
        content: c.content,
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
        resolved: Boolean(c.resolved),
        isResolved: Boolean(c.resolved),
        parentId: c.parentId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        userDisplayName: c.userDisplayName,
        userEmail: c.userEmail,
        userAvatarUrl: c.userAvatarUrl,
        authorName: c.userDisplayName || c.authorName,
        authorEmail: c.userEmail || c.authorEmail,
        replies: []
      };
      commentMap.set(formatted.id, formatted);
    }

    for (const c of commentMap.values()) {
      if (c.parentId && commentMap.has(c.parentId)) {
        commentMap.get(c.parentId)!.replies!.push(c);
      } else {
        rootComments.push(c);
      }
    }

    return rootComments;
  }

  static toggleCommentResolved(userId: string, projectId: string, commentId: string, resolved: boolean): void {
    // Requires at least editor or owner, or original comment author
    const comment = db.prepare(`SELECT * FROM project_comments WHERE id = ? AND projectId = ?`).get(commentId, projectId) as ProjectCommentRecord | undefined;
    if (!comment) {
      throw new CollaborationAccessError('Comment not found', 404);
    }

    const { role } = this.getProjectAccess(userId, projectId);
    if (role === 'viewer' && comment.userId !== userId) {
      throw new CollaborationAccessError('Viewers can only resolve their own comments', 403);
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE project_comments SET resolved = ?, updatedAt = ? WHERE id = ?
    `).run(resolved ? 1 : 0, now, commentId);

    this.recordActivity(projectId, userId, resolved ? 'comment_resolved' : 'comment_reopened', 'comment', commentId);
  }

  static deleteComment(userId: string, projectId: string, commentId: string): void {
    const comment = db.prepare(`SELECT * FROM project_comments WHERE id = ? AND projectId = ?`).get(commentId, projectId) as ProjectCommentRecord | undefined;
    if (!comment) {
      throw new CollaborationAccessError('Comment not found', 404);
    }

    const { role } = this.getProjectAccess(userId, projectId);
    if (role !== 'owner' && comment.userId !== userId) {
      throw new CollaborationAccessError('You can only delete your own comments', 403);
    }

    db.prepare(`DELETE FROM project_comments WHERE id = ?`).run(commentId);
  }

  // ==========================================
  // Version Conflict Detection & Concurrency
  // ==========================================

  /**
   * Save a file with strict version conflict detection.
   * If another collaborator edited the file since `expectedVersion`, throws VersionConflictError.
   */
  static saveFileWithConflictCheck(params: {
    userId: string;
    projectId: string;
    fileId: string;
    content: string;
    expectedVersion?: number;
    force?: boolean;
  }): ProjectFileRecord {
    const { userId, projectId, fileId, content, expectedVersion, force = false } = params;

    // Viewers cannot modify files
    this.verifyAccess(userId, projectId, 'editor');

    const file = db.prepare(`
      SELECT id, projectId, path, content, fileType, size, version, lastModifiedBy, createdAt, updatedAt
      FROM project_files
      WHERE id = ? AND projectId = ?
    `).get(fileId, projectId) as ProjectFileRecord | undefined;

    if (!file) {
      throw new CollaborationAccessError('File not found', 404);
    }

    const currentVersion = file.version || 1;

    // Check version conflict
    if (!force && expectedVersion !== undefined && expectedVersion < currentVersion) {
      throw new VersionConflictError('File changed by another collaborator.', file);
    }

    const nextVersion = currentVersion + 1;
    const now = new Date().toISOString();
    const size = Buffer.byteLength(content, 'utf8');

    db.prepare(`
      UPDATE project_files 
      SET content = ?, size = ?, version = ?, lastModifiedBy = ?, updatedAt = ?
      WHERE id = ?
    `).run(content, size, nextVersion, userId, now, fileId);

    // Update parent project updatedAt
    db.prepare(`UPDATE projects SET updatedAt = ? WHERE id = ?`).run(now, projectId);

    this.recordActivity(projectId, userId, 'file_edited', 'file', fileId, {
      path: file.path,
      version: nextVersion
    });

    return {
      ...file,
      content,
      size,
      version: nextVersion,
      lastModifiedBy: userId,
      updatedAt: now
    };
  }

  // ==========================================
  // Activity Stream & Audit Trail
  // ==========================================

  static recordActivity(
    projectId: string,
    actorUserId: string,
    eventType: string,
    targetType?: string | null,
    targetId?: string | null,
    metadata?: any
  ): void {
    try {
      const id = `act_${crypto.randomUUID().replace(/-/g, '')}`;
      const now = new Date().toISOString();
      const metadataJson = metadata ? JSON.stringify(metadata) : null;

      db.prepare(`
        INSERT INTO project_activity (id, projectId, actorUserId, eventType, targetType, targetId, metadataJson, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, projectId, actorUserId, eventType, targetType || null, targetId || null, metadataJson, now);
    } catch (err: any) {
      console.warn('[CollaborationActivity] Failed to record activity:', err?.message);
    }
  }

  static listActivity(projectId: string, limit: number = 50): ProjectActivityRecord[] {
    return db.prepare(`
      SELECT 
        pa.*,
        u.email as actorEmail,
        u.displayName as actorDisplayName
      FROM project_activity pa
      JOIN users u ON pa.actorUserId = u.id
      WHERE pa.projectId = ?
      ORDER BY pa.createdAt DESC
      LIMIT ?
    `).all(projectId, limit) as unknown as ProjectActivityRecord[];
  }
}
