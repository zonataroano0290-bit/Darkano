import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// Ensure the storage directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'darkano.db');

export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high concurrency and enable foreign key constraints
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- 1. Users table
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    passwordHash TEXT NOT NULL,
    salt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- 2. User Profiles
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    userId TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    displayName TEXT NOT NULL,
    avatarUrl TEXT,
    plan TEXT NOT NULL DEFAULT 'Developer',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- 3. Sessions table for persistent authentication
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expiresAt TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  -- 4. Password Resets
  CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expiresAt TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  -- 5. Conversations
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    mode TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- 6. Messages
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT,
    mode TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- 7. Token and Compute Usage Records
  CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversationId TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    inputTokens INTEGER NOT NULL DEFAULT 0,
    outputTokens INTEGER NOT NULL DEFAULT 0,
    totalTokens INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  -- 8. Phase 5: Files Storage Vault
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    originalName TEXT NOT NULL,
    storagePath TEXT NOT NULL,
    mimeType TEXT NOT NULL,
    fileSize INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded', -- 'uploaded', 'processing', 'ready', 'failed', 'deleted'
    processingError TEXT,
    extractedText TEXT,
    metadataJson TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- 9. Phase 5: Conversation File Attachments
  CREATE TABLE IF NOT EXISTS conversation_attachments (
    id TEXT PRIMARY KEY,
    conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    messageId TEXT REFERENCES messages(id) ON DELETE CASCADE,
    fileId TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL
  );

  -- 10. Phase 5: Web Research Records & Grounded Sources
  CREATE TABLE IF NOT EXISTS research_records (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversationId TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    messageId TEXT REFERENCES messages(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    sourcesJson TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  -- ==========================================
  -- PHASE 6: Billing, Credits, Subscriptions, Admin & Audit
  -- ==========================================

  -- 11. Credit Transactions Ledger
  CREATE TABLE IF NOT EXISTS credit_transactions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transactionId TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL, -- 'purchase', 'subscription_grant', 'ai_usage', 'web_search_usage', 'file_analysis_usage', 'image_generation_usage', 'video_generation_usage', 'refund', 'manual_admin_adjustment', 'signup_bonus'
    amount INTEGER NOT NULL,
    balanceAfter INTEGER NOT NULL,
    source TEXT NOT NULL,
    metadataJson TEXT,
    createdAt TEXT NOT NULL
  );

  -- 12. Configurable Plans
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    priceCents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    billingInterval TEXT NOT NULL DEFAULT 'month', -- 'month', 'year', 'one_time'
    creditsIncluded INTEGER NOT NULL,
    featuresJson TEXT NOT NULL,
    isActive INTEGER NOT NULL DEFAULT 1,
    stripePriceId TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- 13. Subscriptions
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    providerCustomerId TEXT,
    providerSubscriptionId TEXT UNIQUE,
    planId TEXT NOT NULL REFERENCES plans(id),
    status TEXT NOT NULL, -- 'active', 'trialing', 'past_due', 'canceled', 'incomplete', 'unpaid'
    currentPeriodStart TEXT,
    currentPeriodEnd TEXT,
    cancelAtPeriodEnd INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- 14. Real Payments Records
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    providerPaymentId TEXT UNIQUE,
    amountCents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL, -- 'pending', 'succeeded', 'failed', 'refunded'
    planId TEXT,
    creditsGranted INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- 15. Webhook Events (Idempotency & Auditing)
  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    providerEventId TEXT UNIQUE NOT NULL,
    eventType TEXT NOT NULL,
    status TEXT NOT NULL, -- 'processed', 'failed', 'ignored'
    processedAt TEXT,
    error TEXT,
    payloadJson TEXT,
    createdAt TEXT NOT NULL
  );

  -- 16. Audit Log Records
  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actorId TEXT NOT NULL,
    actorEmail TEXT NOT NULL,
    action TEXT NOT NULL,
    targetId TEXT,
    targetType TEXT,
    metadataJson TEXT,
    createdAt TEXT NOT NULL
  );

  -- Performance Indexes
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);
  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(userId, updatedAt DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversationId, createdAt ASC);
  CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(userId);
  CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_records(userId);
  CREATE INDEX IF NOT EXISTS idx_files_user ON files(userId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
  CREATE INDEX IF NOT EXISTS idx_attachments_conv ON conversation_attachments(conversationId);
  CREATE INDEX IF NOT EXISTS idx_attachments_file ON conversation_attachments(fileId);
  CREATE INDEX IF NOT EXISTS idx_research_conv ON research_records(conversationId);
  CREATE INDEX IF NOT EXISTS idx_credit_trans_user ON credit_transactions(userId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_credit_trans_id ON credit_transactions(transactionId);
  CREATE INDEX IF NOT EXISTS idx_sub_user ON subscriptions(userId);
  CREATE INDEX IF NOT EXISTS idx_sub_prov_id ON subscriptions(providerSubscriptionId);
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(userId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_webhook_prov_id ON webhook_events(providerEventId);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actorId);
  CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
`);

// Run column migrations for `users` table safely
try {
  const tableInfo = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  const columnNames = tableInfo.map(col => col.name);

  if (!columnNames.includes('role')) {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
    console.log('[Darkano Database] Added `role` column to `users` table.');
  }

  if (!columnNames.includes('creditBalance')) {
    db.exec(`ALTER TABLE users ADD COLUMN creditBalance INTEGER NOT NULL DEFAULT 500`);
    console.log('[Darkano Database] Added `creditBalance` column to `users` table.');
  }
} catch (migErr: any) {
  console.warn('[Darkano Database] Migration check notice:', migErr?.message);
}

// Seed default plans if table is empty
try {
  const existingPlans = db.prepare(`SELECT COUNT(id) as count FROM plans`).get() as { count: number };
  if (existingPlans.count === 0) {
    const now = new Date().toISOString();
    const insertPlan = db.prepare(`
      INSERT INTO plans (id, name, priceCents, currency, billingInterval, creditsIncluded, featuresJson, isActive, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    insertPlan.run(
      'plan_free',
      'Developer Free',
      0,
      'usd',
      'month',
      500,
      JSON.stringify([
        '500 monthly credits',
        'Standard reasoning models',
        'Chat & Code modes',
        'Basic document analysis',
        'Community compute tier'
      ]),
      now,
      now
    );

    insertPlan.run(
      'plan_pro',
      'Darkano Pro',
      2000,
      'usd',
      'month',
      5000,
      JSON.stringify([
        '5,000 monthly credits',
        'All Frontier models (Ultra, Coder, Prime)',
        'Live Web Search & Grounding',
        'Deep File & Excel analysis vault',
        'Priority neural matrix queue'
      ]),
      now,
      now
    );

    insertPlan.run(
      'plan_business',
      'Darkano Business',
      6000,
      'usd',
      'month',
      20000,
      JSON.stringify([
        '20,000 monthly credits',
        'Dedicated compute nodes',
        'Advanced batch document forensics',
        'Deep research synthesis engine',
        'Enterprise admin audit & usage reports'
      ]),
      now,
      now
    );

    console.log('[Darkano Database] Seeded default plans: Developer Free, Darkano Pro, Darkano Business.');
  }
} catch (planErr: any) {
  console.warn('[Darkano Database] Plans seed notice:', planErr?.message);
}

// Auto-elevate configured admin email or user email to owner
try {
  const adminEmail = (process.env.ADMIN_EMAILS || 'anotiktok42@gmail.com').toLowerCase();
  if (adminEmail) {
    db.prepare(`UPDATE users SET role = 'owner' WHERE email = ?`).run(adminEmail);
  }
} catch (adminErr: any) {
  console.warn('[Darkano Database] Admin elevation notice:', adminErr?.message);
}

console.log('[Darkano Database] Persistent SQLite engine initialized at:', DB_PATH);
