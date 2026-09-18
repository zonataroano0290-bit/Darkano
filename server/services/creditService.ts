import crypto from 'node:crypto';
import { db } from '../db/database.js';

export type CreditTransactionType =
  | 'purchase'
  | 'subscription_grant'
  | 'ai_usage'
  | 'web_search_usage'
  | 'file_analysis_usage'
  | 'image_generation_usage'
  | 'video_generation_usage'
  | 'refund'
  | 'manual_admin_adjustment'
  | 'signup_bonus'
  | 'deployment_usage';

export interface CreditTransaction {
  id: string;
  userId: string;
  transactionId: string;
  type: CreditTransactionType;
  amount: number;
  balanceAfter: number;
  source: string;
  metadata?: any;
  createdAt: string;
}

export interface PricingBreakdown {
  totalCredits: number;
  breakdown: {
    baseCost: number;
    tokenCost: number;
    searchCost: number;
    fileCost: number;
  };
}

export class CreditService {
  /**
   * Get user's current credit balance directly from database
   */
  static getBalance(userId: string): number {
    const row = db.prepare(`SELECT creditBalance FROM users WHERE id = ?`).get(userId) as
      | { creditBalance: number }
      | undefined;
    return row?.creditBalance ?? 0;
  }

  /**
   * Transparent configured pricing table for Darkano AI models & features
   */
  static calculateCost(params: {
    modelId?: string;
    mode?: string;
    webSearch?: boolean;
    fileCount?: number;
    inputTokens?: number;
    outputTokens?: number;
  }): PricingBreakdown {
    const { modelId = 'darkano-ultra-v2', mode = 'chat', webSearch = false, fileCount = 0, inputTokens = 0, outputTokens = 0 } = params;

    // Base model execution fee (configured pricing)
    let baseCost = 4;
    const m = modelId.toLowerCase();
    if (m.includes('ultra')) {
      baseCost = 8;
    } else if (m.includes('coder')) {
      baseCost = 6;
    } else if (m.includes('pro')) {
      baseCost = 6;
    } else if (m.includes('flash')) {
      baseCost = 2;
    } else if (m.includes('prime')) {
      baseCost = 4;
    }

    // Token-based compute cost: 1 credit per 2,000 processed tokens
    const totalTokens = (inputTokens || 0) + (outputTokens || 0);
    const tokenCost = totalTokens > 0 ? Math.ceil(totalTokens / 2000) : 0;

    // Live search grounding cost
    const isSearch = webSearch || mode === 'research';
    const searchCost = isSearch ? 4 : 0;

    // Document analysis vault processing cost
    const fileCost = fileCount > 0 ? fileCount * 2 : (mode === 'analyze' ? 2 : 0);

    const totalCredits = Math.max(1, baseCost + tokenCost + searchCost + fileCost);

    return {
      totalCredits,
      breakdown: {
        baseCost,
        tokenCost,
        searchCost,
        fileCost
      }
    };
  }

  /**
   * Atomically deduct credits with database transaction and idempotency support
   */
  static deductCredits(params: {
    userId: string;
    amount: number;
    type: CreditTransactionType;
    source: string;
    metadata?: any;
    idempotencyKey?: string;
  }): { success: boolean; balanceAfter: number; transactionId: string; alreadyProcessed?: boolean } {
    const { userId, amount, type, source, metadata, idempotencyKey } = params;

    if (amount <= 0) {
      const currentBalance = this.getBalance(userId);
      return { success: true, balanceAfter: currentBalance, transactionId: 'no_op' };
    }

    // Check idempotency if key provided
    if (idempotencyKey) {
      const existingTx = db.prepare(`
        SELECT id, transactionId, balanceAfter FROM credit_transactions WHERE transactionId = ? AND userId = ?
      `).get(idempotencyKey, userId) as { id: string; transactionId: string; balanceAfter: number } | undefined;

      if (existingTx) {
        return {
          success: true,
          balanceAfter: existingTx.balanceAfter,
          transactionId: existingTx.transactionId,
          alreadyProcessed: true
        };
      }
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const user = db.prepare(`SELECT creditBalance FROM users WHERE id = ?`).get(userId) as
        | { creditBalance: number }
        | undefined;

      if (!user) {
        db.exec('ROLLBACK');
        throw new Error('User account not found');
      }

      if (user.creditBalance < amount) {
        db.exec('ROLLBACK');
        throw new Error(`Insufficient credits. Required: ${amount}, Available: ${user.creditBalance}`);
      }

      const newBalance = user.creditBalance - amount;
      const txId = idempotencyKey || `ctx_${crypto.randomUUID().replace(/-/g, '')}`;
      const now = new Date().toISOString();

      // Update user balance
      db.prepare(`
        UPDATE users SET creditBalance = ?, updatedAt = ? WHERE id = ?
      `).run(newBalance, now, userId);

      // Insert transaction ledger record
      db.prepare(`
        INSERT INTO credit_transactions (
          id, userId, transactionId, type, amount, balanceAfter, source, metadataJson, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `tx_${crypto.randomUUID().replace(/-/g, '')}`,
        userId,
        txId,
        type,
        -amount,
        newBalance,
        source,
        metadata ? JSON.stringify(metadata) : null,
        now
      );

      db.exec('COMMIT');
      return {
        success: true,
        balanceAfter: newBalance,
        transactionId: txId
      };
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }

  /**
   * Atomically add credits with database transaction
   */
  static addCredits(params: {
    userId: string;
    amount: number;
    type: CreditTransactionType;
    source: string;
    metadata?: any;
    idempotencyKey?: string;
  }): { success: boolean; balanceAfter: number; transactionId: string } {
    const { userId, amount, type, source, metadata, idempotencyKey } = params;

    if (amount <= 0) {
      throw new Error('Credit amount to add must be greater than zero');
    }

    // Check idempotency if key provided
    if (idempotencyKey) {
      const existingTx = db.prepare(`
        SELECT transactionId, balanceAfter FROM credit_transactions WHERE transactionId = ? AND userId = ?
      `).get(idempotencyKey, userId) as { transactionId: string; balanceAfter: number } | undefined;

      if (existingTx) {
        return {
          success: true,
          balanceAfter: existingTx.balanceAfter,
          transactionId: existingTx.transactionId
        };
      }
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const user = db.prepare(`SELECT creditBalance FROM users WHERE id = ?`).get(userId) as
        | { creditBalance: number }
        | undefined;

      if (!user) {
        db.exec('ROLLBACK');
        throw new Error('User not found');
      }

      const newBalance = (user.creditBalance || 0) + amount;
      const txId = idempotencyKey || `ctx_${crypto.randomUUID().replace(/-/g, '')}`;
      const now = new Date().toISOString();

      // Update user balance
      db.prepare(`
        UPDATE users SET creditBalance = ?, updatedAt = ? WHERE id = ?
      `).run(newBalance, now, userId);

      // Record transaction
      db.prepare(`
        INSERT INTO credit_transactions (
          id, userId, transactionId, type, amount, balanceAfter, source, metadataJson, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `tx_${crypto.randomUUID().replace(/-/g, '')}`,
        userId,
        txId,
        type,
        amount,
        newBalance,
        source,
        metadata ? JSON.stringify(metadata) : null,
        now
      );

      db.exec('COMMIT');
      return {
        success: true,
        balanceAfter: newBalance,
        transactionId: txId
      };
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }

  /**
   * Retrieve paginated transaction ledger history
   */
  static getTransactionHistory(params: {
    userId: string;
    limit?: number;
    offset?: number;
    type?: string;
  }): { transactions: CreditTransaction[]; total: number; limit: number; offset: number } {
    const { userId, limit = 20, offset = 0, type } = params;

    const countQuery = type
      ? `SELECT COUNT(id) as count FROM credit_transactions WHERE userId = ? AND type = ?`
      : `SELECT COUNT(id) as count FROM credit_transactions WHERE userId = ?`;

    const totalRow = (type
      ? db.prepare(countQuery).get(userId, type)
      : db.prepare(countQuery).get(userId)) as { count: number };

    const selectQuery = type
      ? `SELECT * FROM credit_transactions WHERE userId = ? AND type = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`
      : `SELECT * FROM credit_transactions WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?`;

    const rows = (type
      ? db.prepare(selectQuery).all(userId, type, limit, offset)
      : db.prepare(selectQuery).all(userId, limit, offset)) as any[];

    const transactions: CreditTransaction[] = rows.map(r => ({
      id: r.id,
      userId: r.userId,
      transactionId: r.transactionId,
      type: r.type,
      amount: r.amount,
      balanceAfter: r.balanceAfter,
      source: r.source,
      metadata: r.metadataJson ? JSON.parse(r.metadataJson) : null,
      createdAt: r.createdAt
    }));

    return {
      transactions,
      total: totalRow?.count || 0,
      limit,
      offset
    };
  }

  /**
   * Get user usage metrics (total used, by feature, by model)
   */
  static getUsageSummary(userId: string): {
    currentBalance: number;
    totalConsumed: number;
    totalGranted: number;
    byFeature: Record<string, number>;
    byModel: Record<string, number>;
  } {
    const currentBalance = this.getBalance(userId);

    const transactions = db.prepare(`
      SELECT type, amount, metadataJson FROM credit_transactions WHERE userId = ?
    `).all(userId) as Array<{ type: string; amount: number; metadataJson: string | null }>;

    let totalConsumed = 0;
    let totalGranted = 0;
    const byFeature: Record<string, number> = {
      ai_chat: 0,
      code_generation: 0,
      web_search: 0,
      file_analysis: 0,
      research_synthesis: 0
    };
    const byModel: Record<string, number> = {};

    for (const tx of transactions) {
      if (tx.amount < 0) {
        const absAmount = Math.abs(tx.amount);
        totalConsumed += absAmount;

        // Categorize by feature
        if (tx.type === 'web_search_usage') {
          byFeature.web_search += absAmount;
        } else if (tx.type === 'file_analysis_usage') {
          byFeature.file_analysis += absAmount;
        } else if (tx.type === 'ai_usage') {
          byFeature.ai_chat += absAmount;
        }

        // Parse model from metadata if available
        if (tx.metadataJson) {
          try {
            const meta = JSON.parse(tx.metadataJson);
            if (meta.model) {
              byModel[meta.model] = (byModel[meta.model] || 0) + absAmount;
            }
            if (meta.mode === 'code') {
              byFeature.code_generation += absAmount;
            } else if (meta.mode === 'research') {
              byFeature.research_synthesis += absAmount;
            }
          } catch {}
        }
      } else {
        totalGranted += tx.amount;
      }
    }

    return {
      currentBalance,
      totalConsumed,
      totalGranted,
      byFeature,
      byModel
    };
  }

  /**
   * Admin manual credit adjustment with mandatory reason and immutable audit log entry
   */
  static manualAdjustment(params: {
    adminId: string;
    adminEmail: string;
    targetUserId: string;
    amount: number;
    reason: string;
  }): { success: boolean; newBalance: number; transactionId: string } {
    const { adminId, adminEmail, targetUserId, amount, reason } = params;

    if (!reason || reason.trim().length < 3) {
      throw new Error('A detailed reason is required for manual credit adjustments');
    }

    if (amount === 0) {
      throw new Error('Adjustment amount cannot be zero');
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      const targetUser = db.prepare(`SELECT id, email, creditBalance FROM users WHERE id = ?`).get(targetUserId) as
        | { id: string; email: string; creditBalance: number }
        | undefined;

      if (!targetUser) {
        db.exec('ROLLBACK');
        throw new Error('Target user does not exist');
      }

      const balanceBefore = targetUser.creditBalance || 0;
      const newBalance = Math.max(0, balanceBefore + amount);
      const txId = `adj_${crypto.randomUUID().replace(/-/g, '')}`;
      const now = new Date().toISOString();

      // Update balance
      db.prepare(`UPDATE users SET creditBalance = ?, updatedAt = ? WHERE id = ?`).run(
        newBalance,
        now,
        targetUserId
      );

      // Record transaction
      db.prepare(`
        INSERT INTO credit_transactions (
          id, userId, transactionId, type, amount, balanceAfter, source, metadataJson, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `tx_${crypto.randomUUID().replace(/-/g, '')}`,
        targetUserId,
        txId,
        'manual_admin_adjustment',
        amount,
        newBalance,
        'admin_panel',
        JSON.stringify({
          reason,
          adjustedBy: adminEmail,
          adminId,
          balanceBefore,
          balanceAfter: newBalance
        }),
        now
      );

      // Record in immutable audit log
      db.prepare(`
        INSERT INTO audit_logs (id, actorId, actorEmail, action, targetId, targetType, metadataJson, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `aud_${crypto.randomUUID().replace(/-/g, '')}`,
        adminId,
        adminEmail,
        'manual_credit_adjustment',
        targetUserId,
        'user',
        JSON.stringify({
          targetUserEmail: targetUser.email,
          amount,
          reason,
          balanceBefore,
          balanceAfter: newBalance
        }),
        now
      );

      db.exec('COMMIT');
      return {
        success: true,
        newBalance,
        transactionId: txId
      };
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }
}
