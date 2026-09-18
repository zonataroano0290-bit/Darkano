import crypto from 'node:crypto';
import { db } from './database.js';

export interface DBConversation {
  id: string;
  userId: string;
  title: string;
  model: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
}

export interface DBMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string | null;
  mode?: string | null;
  status: 'ready' | 'loading' | 'streaming' | 'error' | 'stopped';
  createdAt: string;
  updatedAt: string;
}

export class ConversationService {
  /**
   * Get all conversations for a specific user with pagination & search
   */
  static getUserConversations(
    userId: string,
    params: { limit?: number; offset?: number; search?: string } = {}
  ): { conversations: DBConversation[]; total: number } {
    const limit = Math.min(Math.max(params.limit || 50, 1), 100);
    const offset = Math.max(params.offset || 0, 0);
    const search = params.search?.trim();

    let query = `
      SELECT id, userId, title, model, mode, createdAt, updatedAt
      FROM conversations
      WHERE userId = ?
    `;
    const queryParams: any[] = [userId];

    if (search) {
      query += ` AND (title LIKE ? OR id IN (SELECT conversationId FROM messages WHERE userId = ? AND content LIKE ?))`;
      const searchPattern = `%${search}%`;
      queryParams.push(searchPattern, userId, searchPattern);
    }

    query += ` ORDER BY updatedAt DESC LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    const conversations = db.prepare(query).all(...queryParams) as unknown as DBConversation[];

    // Count query
    let countQuery = `SELECT COUNT(*) as count FROM conversations WHERE userId = ?`;
    const countParams: any[] = [userId];
    if (search) {
      countQuery += ` AND (title LIKE ? OR id IN (SELECT conversationId FROM messages WHERE userId = ? AND content LIKE ?))`;
      const searchPattern = `%${search}%`;
      countParams.push(searchPattern, userId, searchPattern);
    }
    const countResult = db.prepare(countQuery).get(...countParams) as { count: number };

    return {
      conversations,
      total: countResult?.count || 0
    };
  }

  /**
   * Get single conversation verifying ownership
   */
  static getConversation(userId: string, conversationId: string): DBConversation | null {
    const conv = db.prepare(`
      SELECT id, userId, title, model, mode, createdAt, updatedAt
      FROM conversations
      WHERE id = ? AND userId = ?
    `).get(conversationId, userId) as unknown as DBConversation | undefined;

    return conv || null;
  }

  /**
   * Create new conversation for user
   */
  static createConversation(
    userId: string,
    params: { id?: string; title?: string; model: string; mode: string }
  ): DBConversation {
    const convId = params.id || `conv_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const title = params.title?.trim() || 'New Session';

    db.prepare(`
      INSERT INTO conversations (id, userId, title, model, mode, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(convId, userId, title, params.model, params.mode, now, now);

    return {
      id: convId,
      userId,
      title,
      model: params.model,
      mode: params.mode,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Rename conversation, strictly enforcing ownership
   */
  static renameConversation(userId: string, conversationId: string, newTitle: string): DBConversation {
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) {
      throw new Error('Title cannot be empty');
    }

    const conv = this.getConversation(userId, conversationId);
    if (!conv) {
      throw new Error('Conversation not found or access denied');
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE conversations
      SET title = ?, updatedAt = ?
      WHERE id = ? AND userId = ?
    `).run(cleanTitle, now, conversationId, userId);

    return {
      ...conv,
      title: cleanTitle,
      updatedAt: now
    };
  }

  /**
   * Delete conversation, strictly enforcing ownership
   */
  static deleteConversation(userId: string, conversationId: string): boolean {
    const conv = this.getConversation(userId, conversationId);
    if (!conv) {
      throw new Error('Conversation not found or access denied');
    }

    // Delete messages first, then conversation
    db.prepare(`DELETE FROM messages WHERE conversationId = ? AND userId = ?`).run(conversationId, userId);
    db.prepare(`DELETE FROM conversations WHERE id = ? AND userId = ?`).run(conversationId, userId);

    return true;
  }

  /**
   * Get all messages for a conversation, strictly checking that conversation belongs to user
   */
  static getConversationMessages(
    userId: string,
    conversationId: string,
    params: { limit?: number; offset?: number } = {}
  ): DBMessage[] {
    const conv = this.getConversation(userId, conversationId);
    if (!conv) {
      throw new Error('Conversation not found or access denied');
    }

    const limit = Math.min(Math.max(params.limit || 200, 1), 500);
    const offset = Math.max(params.offset || 0, 0);

    const messages = db.prepare(`
      SELECT id, conversationId, userId, role, content, model, mode, status, createdAt, updatedAt
      FROM messages
      WHERE conversationId = ? AND userId = ?
      ORDER BY createdAt ASC
      LIMIT ? OFFSET ?
    `).all(conversationId, userId, limit, offset) as unknown as DBMessage[];

    return messages;
  }

  /**
   * Save a message to conversation
   */
  static saveMessage(
    userId: string,
    msg: {
      id?: string;
      conversationId: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      model?: string;
      mode?: string;
      status?: 'ready' | 'loading' | 'streaming' | 'error' | 'stopped';
    }
  ): DBMessage {
    // Verify conversation ownership
    let conv = this.getConversation(userId, msg.conversationId);
    if (!conv) {
      // Auto-create conversation if not exists yet
      conv = this.createConversation(userId, {
        id: msg.conversationId,
        title: msg.role === 'user' ? (msg.content.slice(0, 40) || 'New Chat') : 'New Chat',
        model: msg.model || 'darkano-ultra-v2',
        mode: msg.mode || 'chat'
      });
    }

    const msgId = msg.id || `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const status = msg.status || 'ready';

    db.prepare(`
      INSERT INTO messages (id, conversationId, userId, role, content, model, mode, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msgId,
      msg.conversationId,
      userId,
      msg.role,
      msg.content,
      msg.model || null,
      msg.mode || null,
      status,
      now,
      now
    );

    // Update conversation updatedAt
    db.prepare(`UPDATE conversations SET updatedAt = ? WHERE id = ? AND userId = ?`).run(
      now,
      msg.conversationId,
      userId
    );

    return {
      id: msgId,
      conversationId: msg.conversationId,
      userId,
      role: msg.role,
      content: msg.content,
      model: msg.model || null,
      mode: msg.mode || null,
      status,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Update message status and content (e.g. when streaming completes or is stopped)
   */
  static updateMessage(
    userId: string,
    messageId: string,
    data: {
      content?: string;
      status?: 'ready' | 'loading' | 'streaming' | 'error' | 'stopped';
    }
  ): boolean {
    const existing = db.prepare(`SELECT id, conversationId FROM messages WHERE id = ? AND userId = ?`).get(
      messageId,
      userId
    ) as { id: string; conversationId: string } | undefined;

    if (!existing) return false;

    const now = new Date().toISOString();

    if (data.content !== undefined && data.status !== undefined) {
      db.prepare(`
        UPDATE messages SET content = ?, status = ?, updatedAt = ? WHERE id = ? AND userId = ?
      `).run(data.content, data.status, now, messageId, userId);
    } else if (data.content !== undefined) {
      db.prepare(`
        UPDATE messages SET content = ?, updatedAt = ? WHERE id = ? AND userId = ?
      `).run(data.content, now, messageId, userId);
    } else if (data.status !== undefined) {
      db.prepare(`
        UPDATE messages SET status = ?, updatedAt = ? WHERE id = ? AND userId = ?
      `).run(data.status, now, messageId, userId);
    }

    // Update conversation's updatedAt
    db.prepare(`UPDATE conversations SET updatedAt = ? WHERE id = ? AND userId = ?`).run(
      now,
      existing.conversationId,
      userId
    );

    return true;
  }

  /**
   * Record token usage
   */
  static recordUsage(
    userId: string,
    data: {
      conversationId?: string | null;
      model: string;
      provider: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }
  ) {
    const id = `usg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO usage_records (id, userId, conversationId, model, provider, inputTokens, outputTokens, totalTokens, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      data.conversationId || null,
      data.model,
      data.provider,
      data.inputTokens || 0,
      data.outputTokens || 0,
      data.totalTokens || 0,
      now
    );
  }

  /**
   * Link file attachment to a conversation/message
   */
  static recordAttachment(params: {
    conversationId: string;
    messageId?: string;
    fileId: string;
    userId: string;
  }) {
    const id = `att_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR IGNORE INTO conversation_attachments (id, conversationId, messageId, fileId, userId, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.conversationId,
      params.messageId || null,
      params.fileId,
      params.userId,
      now
    );
  }

  /**
   * Record web research findings and verified sources
   */
  static recordResearch(params: {
    userId: string;
    conversationId: string;
    messageId: string;
    query: string;
    sources: any[];
  }) {
    const id = `res_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO research_records (id, userId, conversationId, messageId, query, sourcesJson, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.userId,
      params.conversationId,
      params.messageId,
      params.query,
      JSON.stringify(params.sources),
      now
    );
  }

  /**
   * Get attachments for a conversation
   */
  static getConversationAttachments(conversationId: string): any[] {
    return db.prepare(`
      SELECT ca.id, ca.fileId, ca.messageId, ca.createdAt,
             f.originalName, f.fileSize, f.mimeType, f.status
      FROM conversation_attachments ca
      JOIN files f ON ca.fileId = f.id
      WHERE ca.conversationId = ?
    `).all(conversationId) as any[];
  }
}
