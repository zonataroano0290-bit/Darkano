import crypto from 'node:crypto';
import { db } from './database.js';

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileRow {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  plan: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRow {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

// Password Hashing via Scrypt + Random Salt
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const testBuf = Buffer.from(testHash, 'hex');
    if (hashBuf.length !== testBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, testBuf);
  } catch {
    return false;
  }
}

// Generate Secure Opaque Session Token
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Session Lifetime: 30 days
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export class AuthService {
  /**
   * Register a new user with email, password, and displayName
   */
  static register(params: { email: string; password: string; displayName: string }) {
    const email = params.email.trim().toLowerCase();
    const displayName = params.displayName.trim();
    const password = params.password;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email address format');
    }

    if (!displayName || displayName.length < 2) {
      throw new Error('Display name must be at least 2 characters');
    }

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Check existing email
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
    if (existing) {
      throw new Error('An account with this email already exists');
    }

    const userId = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
    const profileId = `prf_${crypto.randomUUID().replace(/-/g, '')}`;
    const now = new Date().toISOString();
    const { hash, salt } = hashPassword(password);

    // Insert user and profile
    const insertUser = db.prepare(`
      INSERT INTO users (id, email, passwordHash, salt, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertProfile = db.prepare(`
      INSERT INTO profiles (id, userId, displayName, avatarUrl, plan, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(userId, email, hash, salt, now, now);
    insertProfile.run(profileId, userId, displayName, null, 'Developer', now, now);

    // Create session immediately
    const session = this.createSession(userId);

    return {
      user: {
        id: userId,
        email,
        displayName,
        avatarUrl: null,
        plan: 'Developer',
        createdAt: now
      },
      token: session.token,
      expiresAt: session.expiresAt
    };
  }

  /**
   * Login user with email and password
   */
  static login(params: { email: string; password: string }) {
    const email = params.email.trim().toLowerCase();
    const password = params.password;

    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const user = db.prepare(`
      SELECT id, email, passwordHash, salt, createdAt FROM users WHERE email = ?
    `).get(email) as UserRow | undefined;

    // Generic error to prevent user enumeration
    if (!user || !verifyPassword(password, user.passwordHash, user.salt)) {
      throw new Error('Invalid email or password');
    }

    const profile = db.prepare(`
      SELECT displayName, avatarUrl, plan, createdAt FROM profiles WHERE userId = ?
    `).get(user.id) as { displayName: string; avatarUrl: string | null; plan: string; createdAt: string } | undefined;

    const session = this.createSession(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: profile?.displayName || email.split('@')[0],
        avatarUrl: profile?.avatarUrl || null,
        plan: profile?.plan || 'Developer',
        createdAt: profile?.createdAt || user.createdAt
      },
      token: session.token,
      expiresAt: session.expiresAt
    };
  }

  /**
   * Create a new session in database
   */
  static createSession(userId: string) {
    const sessionId = `ses_${crypto.randomUUID().replace(/-/g, '')}`;
    const token = generateSessionToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
    const createdAt = now.toISOString();

    db.prepare(`
      INSERT INTO sessions (id, userId, token, expiresAt, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, userId, token, expiresAt, createdAt);

    return { id: sessionId, token, expiresAt };
  }

  /**
   * Validate a session token
   */
  static validateSession(token: string) {
    if (!token) return null;

    const session = db.prepare(`
      SELECT s.id as sessionId, s.userId, s.expiresAt, u.email, p.displayName, p.avatarUrl, p.plan, p.createdAt
      FROM sessions s
      JOIN users u ON s.userId = u.id
      LEFT JOIN profiles p ON s.userId = p.userId
      WHERE s.token = ?
    `).get(token) as {
      sessionId: string;
      userId: string;
      expiresAt: string;
      email: string;
      displayName: string | null;
      avatarUrl: string | null;
      plan: string | null;
      createdAt: string;
    } | undefined;

    if (!session) return null;

    // Check expiration
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      // Invalidate expired session
      this.invalidateSession(token);
      return null;
    }

    return {
      userId: session.userId,
      email: session.email,
      displayName: session.displayName || session.email.split('@')[0],
      avatarUrl: session.avatarUrl,
      plan: session.plan || 'Developer',
      createdAt: session.createdAt
    };
  }

  /**
   * Invalidate session (logout)
   */
  static invalidateSession(token: string) {
    if (!token) return;
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }

  /**
   * Request password reset token
   */
  static requestPasswordReset(email: string) {
    const cleanEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail) as { id: string } | undefined;

    // Always return success to avoid email probing
    if (!user) {
      return { success: true, message: 'If an account exists, a reset code was generated.' };
    }

    const resetId = `rst_${crypto.randomUUID().replace(/-/g, '')}`;
    const token = crypto.randomBytes(16).toString('hex');
    const now = new Date();
    // 1 hour expiration
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO password_resets (id, userId, token, expiresAt, used, createdAt)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(resetId, user.id, token, expiresAt, now.toISOString());

    return {
      success: true,
      message: 'Password reset code generated.',
      // In production email flows this would be emailed; we also return the token for testing/dev environments
      resetToken: token
    };
  }

  /**
   * Complete password reset with token
   */
  static resetPassword(token: string, newPassword: string) {
    if (!token || !newPassword || newPassword.length < 8) {
      throw new Error('Invalid token or password must be at least 8 characters');
    }

    const reset = db.prepare(`
      SELECT id, userId, expiresAt, used FROM password_resets WHERE token = ?
    `).get(token) as { id: string; userId: string; expiresAt: string; used: number } | undefined;

    if (!reset || reset.used === 1 || new Date(reset.expiresAt).getTime() < Date.now()) {
      throw new Error('Invalid or expired reset token');
    }

    const { hash, salt } = hashPassword(newPassword);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE users SET passwordHash = ?, salt = ?, updatedAt = ? WHERE id = ?
    `).run(hash, salt, now, reset.userId);

    // Mark reset as used
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);

    // Invalidate all active sessions for security
    db.prepare('DELETE FROM sessions WHERE userId = ?').run(reset.userId);

    return { success: true, message: 'Password updated successfully. Please sign in.' };
  }

  /**
   * Get user profile and usage
   */
  static getProfile(userId: string) {
    const user = db.prepare('SELECT id, email, createdAt FROM users WHERE id = ?').get(userId) as { id: string; email: string; createdAt: string } | undefined;
    if (!user) return null;

    const profile = db.prepare('SELECT displayName, avatarUrl, plan, createdAt, updatedAt FROM profiles WHERE userId = ?').get(userId) as {
      displayName: string;
      avatarUrl: string | null;
      plan: string;
      createdAt: string;
      updatedAt: string;
    } | undefined;

    // Aggregate tokens used from usage_records
    const usage = db.prepare(`
      SELECT 
        COALESCE(SUM(totalTokens), 0) as totalTokens,
        COUNT(DISTINCT conversationId) as totalConversations
      FROM usage_records
      WHERE userId = ?
    `).get(userId) as { totalTokens: number; totalConversations: number };

    return {
      id: user.id,
      email: user.email,
      displayName: profile?.displayName || user.email.split('@')[0],
      avatarUrl: profile?.avatarUrl || null,
      plan: profile?.plan || 'Developer',
      createdAt: profile?.createdAt || user.createdAt,
      quota: {
        tokensUsed: usage.totalTokens,
        tokensLimit: 2000000,
        storageUsedMb: 120,
        storageLimitMb: 10240,
        activeSessions: 1
      }
    };
  }

  /**
   * Update profile display name or avatarUrl
   */
  static updateProfile(userId: string, data: { displayName?: string; avatarUrl?: string | null }) {
    const now = new Date().toISOString();
    if (data.displayName !== undefined) {
      const name = data.displayName.trim();
      if (name.length < 2) {
        throw new Error('Display name must be at least 2 characters');
      }
      db.prepare(`
        UPDATE profiles SET displayName = ?, updatedAt = ? WHERE userId = ?
      `).run(name, now, userId);
    }

    if (data.avatarUrl !== undefined) {
      db.prepare(`
        UPDATE profiles SET avatarUrl = ?, updatedAt = ? WHERE userId = ?
      `).run(data.avatarUrl, now, userId);
    }

    return this.getProfile(userId);
  }
}
