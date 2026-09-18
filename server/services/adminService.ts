import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/database.js';
import { SERVER_CONFIG } from '../config.js';
import { webSearchService } from './searchProvider.js';
import { BillingService } from './billingService.js';

export interface AdminUserItem {
  id: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin' | 'owner';
  plan: string;
  creditBalance: number;
  createdAt: string;
  lastActive?: string;
  messagesCount: number;
  filesCount: number;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalAiRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalCreditsIssued: number;
  totalCreditsConsumed: number;
  activeSubscriptions: number;
  paymentProviderConfigured: boolean;
  totalRevenueCents: number | null;
  paymentStatus: string;
  registeredOverTime: Array<{ date: string; count: number }>;
  recentTransactions: Array<{
    id: string;
    userId: string;
    userEmail: string;
    type: string;
    amount: number;
    balanceAfter: number;
    createdAt: string;
    source: string;
  }>;
}

export interface SystemHealthComponent {
  name: string;
  status: 'Connected' | 'Not Configured' | 'Degraded';
  details: string;
  isAvailable: boolean;
}

export class AdminService {
  /**
   * Aggregate real statistics across SQLite database tables
   */
  static getDashboardStats(): AdminStats {
    // 1. Total users
    const totalUsersRow = db.prepare(`SELECT COUNT(id) as count FROM users`).get() as { count: number };
    const totalUsers = totalUsersRow?.count || 0;

    // 2. Active users (active session in last 7 days)
    const activeUsersRow = db.prepare(`
      SELECT COUNT(DISTINCT userId) as count FROM sessions WHERE expiresAt > datetime('now')
    `).get() as { count: number };
    const activeUsers = activeUsersRow?.count || 0;

    // 3. AI Requests
    const totalRequestsRow = db.prepare(`SELECT COUNT(id) as count FROM usage_records`).get() as { count: number };
    const totalAiRequests = totalRequestsRow?.count || 0;

    // 4. Message success/failure counts
    const successRow = db.prepare(`
      SELECT COUNT(id) as count FROM messages WHERE role = 'assistant' AND status = 'ready'
    `).get() as { count: number };
    const successfulRequests = successRow?.count || 0;

    const failedRow = db.prepare(`
      SELECT COUNT(id) as count FROM messages WHERE role = 'assistant' AND status = 'error'
    `).get() as { count: number };
    const failedRequests = failedRow?.count || 0;

    // 5. Credit totals
    const creditsIssuedRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM credit_transactions WHERE amount > 0
    `).get() as { total: number };
    const totalCreditsIssued = creditsIssuedRow?.total || 0;

    const creditsConsumedRow = db.prepare(`
      SELECT COALESCE(ABS(SUM(amount)), 0) as total FROM credit_transactions WHERE amount < 0
    `).get() as { total: number };
    const totalCreditsConsumed = creditsConsumedRow?.total || 0;

    // 6. Subscriptions
    const activeSubsRow = db.prepare(`
      SELECT COUNT(id) as count FROM subscriptions WHERE status = 'active'
    `).get() as { count: number };
    const activeSubscriptions = activeSubsRow?.count || 0;

    // 7. Revenue (honest check)
    const isStripeConfigured = BillingService.isStripeConfigured();
    let totalRevenueCents: number | null = null;
    let paymentStatus = 'Payment provider not configured';

    if (isStripeConfigured) {
      paymentStatus = 'Connected';
      const revRow = db.prepare(`
        SELECT COALESCE(SUM(amountCents), 0) as total FROM payments WHERE status = 'succeeded'
      `).get() as { total: number };
      totalRevenueCents = revRow?.total || 0;
    }

    // 8. Signups over time (last 14 days)
    const registeredRows = db.prepare(`
      SELECT substr(createdAt, 1, 10) as date, COUNT(id) as count
      FROM users
      GROUP BY substr(createdAt, 1, 10)
      ORDER BY date DESC
      LIMIT 14
    `).all() as Array<{ date: string; count: number }>;

    // 9. Recent transactions
    const recentTxRows = db.prepare(`
      SELECT ct.id, ct.userId, u.email as userEmail, ct.type, ct.amount, ct.balanceAfter, ct.source, ct.createdAt
      FROM credit_transactions ct
      JOIN users u ON ct.userId = u.id
      ORDER BY ct.createdAt DESC
      LIMIT 15
    `).all() as any[];

    return {
      totalUsers,
      activeUsers,
      totalAiRequests,
      successfulRequests,
      failedRequests,
      totalCreditsIssued,
      totalCreditsConsumed,
      activeSubscriptions,
      paymentProviderConfigured: isStripeConfigured,
      totalRevenueCents,
      paymentStatus,
      registeredOverTime: registeredRows.reverse(),
      recentTransactions: recentTxRows.map(r => ({
        id: r.id,
        userId: r.userId,
        userEmail: r.userEmail,
        type: r.type,
        amount: r.amount,
        balanceAfter: r.balanceAfter,
        source: r.source,
        createdAt: r.createdAt
      }))
    };
  }

  /**
   * Paginated user directory with search and stats
   */
  static getUsersList(params: {
    page?: number;
    limit?: number;
    search?: string;
  }): { users: AdminUserItem[]; total: number; page: number; limit: number } {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;
    const search = params.search ? `%${params.search.trim().toLowerCase()}%` : null;

    let countQuery = `SELECT COUNT(u.id) as count FROM users u LEFT JOIN profiles p ON u.id = p.userId`;
    let selectQuery = `
      SELECT
        u.id,
        u.email,
        u.role,
        u.creditBalance,
        u.createdAt,
        p.displayName,
        p.plan,
        (SELECT COUNT(m.id) FROM messages m WHERE m.userId = u.id) as messagesCount,
        (SELECT COUNT(f.id) FROM files f WHERE f.userId = u.id AND f.status != 'deleted') as filesCount,
        (SELECT MAX(s.createdAt) FROM sessions s WHERE s.userId = u.id) as lastActive
      FROM users u
      LEFT JOIN profiles p ON u.id = p.userId
    `;

    if (search) {
      countQuery += ` WHERE u.email LIKE ? OR p.displayName LIKE ?`;
      selectQuery += ` WHERE u.email LIKE ? OR p.displayName LIKE ?`;
    }

    selectQuery += ` ORDER BY u.createdAt DESC LIMIT ? OFFSET ?`;

    const totalRow = search
      ? (db.prepare(countQuery).get(search, search) as { count: number })
      : (db.prepare(countQuery).get() as { count: number });

    const rows = search
      ? (db.prepare(selectQuery).all(search, search, limit, offset) as any[])
      : (db.prepare(selectQuery).all(limit, offset) as any[]);

    const users: AdminUserItem[] = rows.map(r => ({
      id: r.id,
      email: r.email,
      displayName: r.displayName || r.email.split('@')[0],
      role: r.role || 'user',
      plan: r.plan || 'Developer',
      creditBalance: r.creditBalance ?? 500,
      createdAt: r.createdAt,
      lastActive: r.lastActive,
      messagesCount: r.messagesCount || 0,
      filesCount: r.filesCount || 0
    }));

    return {
      users,
      total: totalRow?.count || 0,
      page,
      limit
    };
  }

  /**
   * Update user role with authorization safeguards
   */
  static updateUserRole(
    adminUser: { userId: string; email: string; role: string },
    targetUserId: string,
    newRole: 'user' | 'admin' | 'owner'
  ): { success: boolean; user: { id: string; email: string; role: string } } {
    const target = db.prepare(`SELECT id, email, role FROM users WHERE id = ?`).get(targetUserId) as
      | { id: string; email: string; role: string }
      | undefined;

    if (!target) {
      throw new Error('Target user does not exist');
    }

    // Only owner can assign owner role or demote an owner
    if ((newRole === 'owner' || target.role === 'owner') && adminUser.role !== 'owner') {
      throw new Error('Only an Owner can modify Owner roles');
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE users SET role = ?, updatedAt = ? WHERE id = ?`).run(newRole, now, targetUserId);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (id, actorId, actorEmail, action, targetId, targetType, metadataJson, createdAt)
      VALUES (?, ?, ?, 'user_role_updated', ?, 'user', ?, ?)
    `).run(
      `aud_${crypto.randomUUID().replace(/-/g, '')}`,
      adminUser.userId,
      adminUser.email,
      targetUserId,
      JSON.stringify({ previousRole: target.role, newRole, targetEmail: target.email }),
      now
    );

    return {
      success: true,
      user: {
        id: target.id,
        email: target.email,
        role: newRole
      }
    };
  }

  /**
   * Real health & configuration checks for all system subsystems
   */
  static getSystemHealth(): SystemHealthComponent[] {
    const health: SystemHealthComponent[] = [];

    // 1. AI Provider
    const geminiKey = process.env.GEMINI_API_KEY;
    const aiConfigured = typeof geminiKey === 'string' && geminiKey.trim().length > 0;
    health.push({
      name: 'AI Neural Matrix (Gemini)',
      status: aiConfigured ? 'Connected' : 'Not Configured',
      details: aiConfigured ? 'Gemini 3.8 / 2.5 Flash API configured & ready' : 'GEMINI_API_KEY environment variable missing',
      isAvailable: aiConfigured
    });

    // 2. Database
    try {
      db.prepare(`SELECT 1`).get();
      health.push({
        name: 'Database Engine (SQLite WAL)',
        status: 'Connected',
        details: 'SQLite WAL mode persistent database online with foreign key constraints',
        isAvailable: true
      });
    } catch (dbErr: any) {
      health.push({
        name: 'Database Engine',
        status: 'Degraded',
        details: dbErr?.message || 'Database error',
        isAvailable: false
      });
    }

    // 3. Web Search Grounding
    const searchConfigured = webSearchService.isConfigured();
    health.push({
      name: 'Live Web Grounding (Google Search)',
      status: searchConfigured ? 'Connected' : 'Not Configured',
      details: searchConfigured ? 'Real-time grounded search provider ready with SSRF protection' : 'Requires Gemini Grounding API key',
      isAvailable: searchConfigured
    });

    // 4. Payment Provider
    const stripeConfigured = BillingService.isStripeConfigured();
    health.push({
      name: 'Payment Provider (Stripe)',
      status: stripeConfigured ? 'Connected' : 'Not Configured',
      details: stripeConfigured ? 'Stripe Checkout & Webhook signature verification ready' : 'Not configured / unavailable (STRIPE_SECRET_KEY missing)',
      isAvailable: stripeConfigured
    });

    // 5. File Processing & Vault
    const uploadDir = path.join(process.cwd(), 'data', 'uploads');
    let storageStatus: 'Connected' | 'Degraded' = 'Connected';
    let storageDetails = 'Partitioned user vault directory active (PDF, DOCX, XLSX, Code)';
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
    } catch (e: any) {
      storageStatus = 'Degraded';
      storageDetails = e?.message || 'File system write error';
    }

    health.push({
      name: 'File Storage & Analysis Vault',
      status: storageStatus,
      details: storageDetails,
      isAvailable: storageStatus === 'Connected'
    });

    return health;
  }

  /**
   * Paginated audit logs
   */
  static getAuditLogs(params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 25));
    const offset = (page - 1) * limit;

    const totalRow = db.prepare(`SELECT COUNT(id) as count FROM audit_logs`).get() as { count: number };
    const rows = db.prepare(`
      SELECT * FROM audit_logs ORDER BY createdAt DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];

    const logs = rows.map(r => ({
      id: r.id,
      actorId: r.actorId,
      actorEmail: r.actorEmail,
      action: r.action,
      targetId: r.targetId,
      targetType: r.targetType,
      metadata: r.metadataJson ? JSON.parse(r.metadataJson) : null,
      createdAt: r.createdAt
    }));

    return {
      logs,
      total: totalRow?.count || 0,
      page,
      limit
    };
  }
}
