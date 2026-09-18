import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '../db/database.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const SANDBOXES_DIR = path.join(DATA_DIR, 'sandboxes');

// Ensure backups directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

export interface MaintenanceReport {
  timestamp: string;
  sessionsCleaned: number;
  passwordResetsCleaned: number;
  invitationsExpired: number;
  shareLinksExpired: number;
  orphanedSandboxesCleaned: number;
  databaseIntegrity: {
    status: 'ok' | 'error';
    details: string[];
    foreignKeyErrors: number;
  };
  creditLedgerAudit: {
    totalUsersChecked: number;
    discrepanciesFound: number;
    discrepancies: Array<{ userId: string; userEmail: string; cachedBalance: number; calculatedBalance: number; difference: number }>;
  };
}

export interface BackupResult {
  success: boolean;
  backupPath: string;
  backupFileName: string;
  sizeBytes: number;
  createdAt: string;
  retainedBackupsCount: number;
}

export class SystemMaintenanceService {
  /**
   * Remove expired user sessions
   */
  static cleanupExpiredSessions(): number {
    const res = db.prepare(`DELETE FROM sessions WHERE expiresAt <= datetime('now')`).run();
    return Number(res.changes);
  }

  /**
   * Remove used or expired password reset requests older than 24 hours
   */
  static cleanupExpiredPasswordResets(): number {
    const res = db.prepare(`
      DELETE FROM password_resets 
      WHERE expiresAt <= datetime('now') OR used = 1
    `).run();
    return Number(res.changes);
  }

  /**
   * Expire stale project invitations
   */
  static cleanupExpiredInvitations(): number {
    const now = new Date().toISOString();
    const res = db.prepare(`
      UPDATE project_invitations 
      SET status = 'expired'
      WHERE expiresAt <= ? AND status = 'pending'
    `).run(now);
    return Number(res.changes);
  }

  /**
   * Expire stale project share links
   */
  static cleanupExpiredShareLinks(): number {
    const now = new Date().toISOString();
    const res = db.prepare(`
      UPDATE project_share_links 
      SET status = 'revoked'
      WHERE expiresAt IS NOT NULL AND expiresAt <= ? AND status = 'active'
    `).run(now);
    return Number(res.changes);
  }

  /**
   * Clean up orphaned sandboxes in data/sandboxes/ that do not correspond to any active project
   */
  static cleanupOrphanedSandboxes(): number {
    if (!fs.existsSync(SANDBOXES_DIR)) return 0;

    let cleaned = 0;
    try {
      const activeProjects = db.prepare(`SELECT id FROM projects`).all() as Array<{ id: string }>;
      const validProjectIds = new Set(activeProjects.map(p => p.id.replace(/[^a-zA-Z0-9_-]/g, '')));

      const entries = fs.readdirSync(SANDBOXES_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const folderName = entry.name;
          if (!validProjectIds.has(folderName)) {
            const dirToDelete = path.join(SANDBOXES_DIR, folderName);
            fs.rmSync(dirToDelete, { recursive: true, force: true });
            cleaned++;
          }
        }
      }
    } catch (err) {
      console.warn('[SystemMaintenanceService] Sandbox sweep error:', err);
    }

    return cleaned;
  }

  /**
   * Run SQLite physical integrity checks and foreign key checks
   */
  static verifyDatabaseIntegrity(): { status: 'ok' | 'error'; details: string[]; foreignKeyErrors: number } {
    try {
      const integrityRows = db.prepare(`PRAGMA integrity_check;`).all() as Array<{ integrity_check: string }>;
      const isIntegrityOk = integrityRows.length === 1 && integrityRows[0].integrity_check === 'ok';

      const fkRows = db.prepare(`PRAGMA foreign_key_check;`).all() as any[];

      return {
        status: isIntegrityOk && fkRows.length === 0 ? 'ok' : 'error',
        details: integrityRows.map(r => r.integrity_check),
        foreignKeyErrors: fkRows.length
      };
    } catch (err: any) {
      return {
        status: 'error',
        details: [err.message || String(err)],
        foreignKeyErrors: -1
      };
    }
  }

  /**
   * Verify consistency between credit transaction ledger and users.creditBalance
   */
  static auditCreditLedger(): {
    totalUsersChecked: number;
    discrepanciesFound: number;
    discrepancies: Array<{ userId: string; userEmail: string; cachedBalance: number; calculatedBalance: number; difference: number }>;
  } {
    const users = db.prepare(`SELECT id, email, creditBalance FROM users`).all() as Array<{
      id: string;
      email: string;
      creditBalance: number;
    }>;

    const discrepancies: Array<{ userId: string; userEmail: string; cachedBalance: number; calculatedBalance: number; difference: number }> = [];

    for (const u of users) {
      const sumRow = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total FROM credit_transactions WHERE userId = ?
      `).get(u.id) as { total: number };

      const diff = (u.creditBalance ?? 0) - (sumRow?.total ?? 0);
      if (diff !== 0) {
        discrepancies.push({
          userId: u.id,
          userEmail: u.email,
          cachedBalance: u.creditBalance ?? 0,
          calculatedBalance: sumRow?.total ?? 0,
          difference: diff
        });
      }
    }

    return {
      totalUsersChecked: users.length,
      discrepanciesFound: discrepancies.length,
      discrepancies
    };
  }

  /**
   * Create an atomic hot database snapshot using SQLite's native VACUUM INTO
   * Retains up to 7 most recent backups and cleans older snapshots.
   */
  static createDatabaseBackup(): BackupResult {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `darkano_backup_${timestamp}.db`;
    const backupPath = path.join(BACKUPS_DIR, backupFileName);

    // Atomic SQLite backup using VACUUM INTO
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}';`);

    const stats = fs.statSync(backupPath);

    // Prune backups beyond the 7 most recent
    const existingBackups = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.startsWith('darkano_backup_') && f.endsWith('.db'))
      .map(f => ({ name: f, path: path.join(BACKUPS_DIR, f), time: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (existingBackups.length > 7) {
      const toRemove = existingBackups.slice(7);
      for (const b of toRemove) {
        try {
          fs.unlinkSync(b.path);
        } catch {}
      }
    }

    const remainingCount = Math.min(existingBackups.length, 7);

    return {
      success: true,
      backupPath,
      backupFileName,
      sizeBytes: stats.size,
      createdAt: new Date().toISOString(),
      retainedBackupsCount: remainingCount
    };
  }

  /**
   * Run full system maintenance suite
   */
  static runAllMaintenance(): MaintenanceReport {
    const sessionsCleaned = this.cleanupExpiredSessions();
    const passwordResetsCleaned = this.cleanupExpiredPasswordResets();
    const invitationsExpired = this.cleanupExpiredInvitations();
    const shareLinksExpired = this.cleanupExpiredShareLinks();
    const orphanedSandboxesCleaned = this.cleanupOrphanedSandboxes();
    const databaseIntegrity = this.verifyDatabaseIntegrity();
    const creditLedgerAudit = this.auditCreditLedger();

    return {
      timestamp: new Date().toISOString(),
      sessionsCleaned,
      passwordResetsCleaned,
      invitationsExpired,
      shareLinksExpired,
      orphanedSandboxesCleaned,
      databaseIntegrity,
      creditLedgerAudit
    };
  }
}
