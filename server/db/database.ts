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
  PRAGMA busy_timeout = 5000;
  PRAGMA synchronous = NORMAL;
  PRAGMA cache_size = -64000;

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

  -- ==========================================
  -- PHASE 7: Multi-Step Real AI Agent Engine
  -- ==========================================

  -- 17. Tasks Table (Real Database-Backed Task System)
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversationId TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    originalPrompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'planning', 'running', 'waiting_for_tool', 'waiting_for_approval', 'paused', 'completed', 'failed', 'cancelled'
    planJson TEXT,
    currentStep INTEGER NOT NULL DEFAULT 0,
    totalSteps INTEGER NOT NULL DEFAULT 0,
    result TEXT,
    error TEXT,
    requiresApproval INTEGER NOT NULL DEFAULT 0,
    pendingApprovalAction TEXT,
    modelId TEXT,
    creditsUsed INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    completedAt TEXT
  );

  -- 18. Task Steps Table
  CREATE TABLE IF NOT EXISTS task_steps (
    id TEXT PRIMARY KEY,
    taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    action TEXT NOT NULL,
    tool TEXT,
    inputJson TEXT,
    outputJson TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'waiting_for_approval', 'completed', 'failed', 'cancelled', 'skipped'
    error TEXT,
    startedAt TEXT,
    completedAt TEXT
  );

  -- 19. Tool Executions Table
  CREATE TABLE IF NOT EXISTS tool_executions (
    id TEXT PRIMARY KEY,
    taskId TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    stepId TEXT REFERENCES task_steps(id) ON DELETE SET NULL,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    toolName TEXT NOT NULL,
    inputJson TEXT,
    outputJson TEXT,
    status TEXT NOT NULL DEFAULT 'running', -- 'running', 'succeeded', 'failed', 'cancelled'
    error TEXT,
    duration INTEGER NOT NULL DEFAULT 0,
    creditsUsed INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  -- ==========================================
  -- PHASE 8: Real Multimodal AI System
  -- ==========================================

  -- 20. Media Records (Images, Audio, Generated Media)
  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversationId TEXT REFERENCES conversations(id) ON DELETE SET NULL,
    messageId TEXT REFERENCES messages(id) ON DELETE SET NULL,
    type TEXT NOT NULL, -- 'image', 'audio', 'generated_image', 'edited_image', 'tts_audio'
    mimeType TEXT NOT NULL,
    storagePath TEXT NOT NULL,
    fileUrl TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    prompt TEXT,
    width INTEGER,
    height INTEGER,
    duration REAL,
    status TEXT NOT NULL DEFAULT 'ready', -- 'ready', 'processing', 'failed', 'deleted'
    error TEXT,
    metadataJson TEXT,
    createdAt TEXT NOT NULL
  );

  -- ==========================================
  -- PHASE 9: Real AI Coding Workspace + Project Builder
  -- ==========================================

  -- 21. Projects Table
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    framework TEXT NOT NULL DEFAULT 'react-vite',
    language TEXT NOT NULL DEFAULT 'typescript',
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'building', 'archived'
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- 22. Project Files Table
  CREATE TABLE IF NOT EXISTS project_files (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    fileType TEXT NOT NULL DEFAULT 'file', -- 'file', 'directory'
    size INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE(projectId, path)
  );

  -- 23. Project Snapshots Table
  CREATE TABLE IF NOT EXISTS project_snapshots (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    createdBy TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    filesJson TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  -- 24. Project Builds Table
  CREATE TABLE IF NOT EXISTS project_builds (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL, -- 'queued', 'running', 'success', 'failed', 'cancelled'
    command TEXT NOT NULL,
    output TEXT NOT NULL DEFAULT '',
    errors TEXT,
    startedAt TEXT NOT NULL,
    completedAt TEXT,
    durationMs INTEGER NOT NULL DEFAULT 0
  );

  -- 25. Project Tasks Table (AI Coding Tasks)
  CREATE TABLE IF NOT EXISTS project_tasks (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    planJson TEXT,
    result TEXT,
    creditsUsed INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    completedAt TEXT
  );

  -- 26. Project Changes / Patches (Safe Review System)
  CREATE TABLE IF NOT EXISTS project_changes (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    originalContent TEXT,
    proposedContent TEXT NOT NULL,
    diffSummary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'applied', 'rejected'
    createdAt TEXT NOT NULL,
    appliedAt TEXT
  );

  -- 27. Project Environment Variables (Masked Secret Storage)
  CREATE TABLE IF NOT EXISTS project_env_vars (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    valueEncrypted TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE(projectId, key)
  );

  -- ==========================================
  -- PHASE 10: Real Deployment & Cloud Workspace Tables
  -- ==========================================

  -- 28. Real Deployments Table
  CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    snapshotId TEXT REFERENCES project_snapshots(id) ON DELETE SET NULL,
    environment TEXT NOT NULL DEFAULT 'production', -- 'production', 'preview', 'development'
    provider TEXT NOT NULL, -- 'vercel', 'netlify', 'cloudflare', 'none'
    status TEXT NOT NULL, -- 'queued', 'building', 'deploying', 'running', 'failed', 'cancelled', 'stopped'
    deploymentUrl TEXT,
    buildId TEXT REFERENCES project_builds(id) ON DELETE SET NULL,
    logsReference TEXT,
    errorMessage TEXT,
    healthStatus TEXT NOT NULL DEFAULT 'unknown', -- 'healthy', 'unhealthy', 'unknown'
    creditsDeducted INTEGER NOT NULL DEFAULT 0,
    durationMs INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    startedAt TEXT,
    completedAt TEXT,
    stoppedAt TEXT
  );

  -- 29. Real Deployment Logs Table
  CREATE TABLE IF NOT EXISTS deployment_logs (
    id TEXT PRIMARY KEY,
    deploymentId TEXT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    level TEXT NOT NULL DEFAULT 'info', -- 'info', 'warn', 'error', 'system'
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );

  -- 30. Scoped Deployment Environments Variables
  CREATE TABLE IF NOT EXISTS deployment_environments (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    environment TEXT NOT NULL, -- 'production', 'preview', 'development'
    key TEXT NOT NULL,
    valueEncrypted TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE(projectId, environment, key)
  );

  -- 31. Deployment Custom Domains
  CREATE TABLE IF NOT EXISTS deployment_domains (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'production',
    verified INTEGER NOT NULL DEFAULT 0,
    sslStatus TEXT NOT NULL DEFAULT 'unknown', -- 'active', 'pending', 'unknown', 'failed'
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE(projectId, domain)
  );

  -- ==========================================
  -- PHASE 11: Real Collaboration, Project Sharing & Git Integration
  -- ==========================================

  -- 32. Project Members System
  CREATE TABLE IF NOT EXISTS project_members (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor', -- 'owner', 'editor', 'viewer'
    invitedBy TEXT REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'invited'
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE(projectId, userId)
  );

  -- 33. Real Project Invitations
  CREATE TABLE IF NOT EXISTS project_invitations (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    inviterId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    inviteeEmail TEXT NOT NULL COLLATE NOCASE,
    inviteeUserId TEXT REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor', -- 'editor', 'viewer'
    token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'expired', 'revoked'
    expiresAt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    acceptedAt TEXT
  );

  -- 34. Shared Project Secure Links
  CREATE TABLE IF NOT EXISTS project_share_links (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    permission TEXT NOT NULL DEFAULT 'view', -- 'view', 'comment', 'edit'
    createdBy TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'revoked'
    expiresAt TEXT,
    createdAt TEXT NOT NULL
  );

  -- 35. Real Database-Backed Project Comments
  CREATE TABLE IF NOT EXISTS project_comments (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filePath TEXT,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    lineStart INTEGER,
    lineEnd INTEGER,
    resolved INTEGER NOT NULL DEFAULT 0,
    parentId TEXT REFERENCES project_comments(id) ON DELETE CASCADE,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- 36. Real Project Activity & Audit Stream
  CREATE TABLE IF NOT EXISTS project_activity (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    actorUserId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    eventType TEXT NOT NULL,
    targetType TEXT,
    targetId TEXT,
    metadataJson TEXT,
    createdAt TEXT NOT NULL
  );

  -- 37. Real Git Connections
  CREATE TABLE IF NOT EXISTS git_connections (
    id TEXT PRIMARY KEY,
    projectId TEXT UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'github', -- 'github', 'gitlab', 'git'
    repoUrl TEXT NOT NULL,
    repoName TEXT NOT NULL,
    defaultBranch TEXT NOT NULL DEFAULT 'main',
    tokenEncrypted TEXT,
    status TEXT NOT NULL DEFAULT 'connected', -- 'connected', 'disconnected', 'error'
    lastSyncAt TEXT,
    lastCommitHash TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- 38. Real Git Commits
  CREATE TABLE IF NOT EXISTS git_commits (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    commitHash TEXT NOT NULL,
    message TEXT NOT NULL,
    authorName TEXT NOT NULL,
    authorEmail TEXT NOT NULL,
    branch TEXT NOT NULL DEFAULT 'main',
    snapshotId TEXT REFERENCES project_snapshots(id) ON DELETE SET NULL,
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
  CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(userId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_tasks_conv ON tasks(conversationId);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_task_steps_task ON task_steps(taskId, sequence ASC);
  CREATE INDEX IF NOT EXISTS idx_tool_exec_task ON tool_executions(taskId);
  CREATE INDEX IF NOT EXISTS idx_tool_exec_user ON tool_executions(userId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_tool_exec_name ON tool_executions(toolName);
  CREATE INDEX IF NOT EXISTS idx_media_user ON media(userId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_media_conv ON media(conversationId);
  CREATE INDEX IF NOT EXISTS idx_media_type ON media(type);
  CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(userId, updatedAt DESC);
  CREATE INDEX IF NOT EXISTS idx_project_files_proj ON project_files(projectId, path);
  CREATE INDEX IF NOT EXISTS idx_project_snapshots_proj ON project_snapshots(projectId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_project_builds_proj ON project_builds(projectId, startedAt DESC);
  CREATE INDEX IF NOT EXISTS idx_project_tasks_proj ON project_tasks(projectId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_project_changes_proj ON project_changes(projectId, status);
  CREATE INDEX IF NOT EXISTS idx_deployments_proj ON deployments(projectId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_deployments_user ON deployments(userId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
  CREATE INDEX IF NOT EXISTS idx_deployment_logs_dep ON deployment_logs(deploymentId, timestamp ASC);
  CREATE INDEX IF NOT EXISTS idx_deployment_env_proj ON deployment_environments(projectId, environment);
  CREATE INDEX IF NOT EXISTS idx_deployment_domains_proj ON deployment_domains(projectId);
  CREATE INDEX IF NOT EXISTS idx_project_members_proj ON project_members(projectId);
  CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(userId);
  CREATE INDEX IF NOT EXISTS idx_project_invitations_proj ON project_invitations(projectId);
  CREATE INDEX IF NOT EXISTS idx_project_invitations_email ON project_invitations(inviteeEmail);
  CREATE INDEX IF NOT EXISTS idx_project_invitations_token ON project_invitations(token);
  CREATE INDEX IF NOT EXISTS idx_project_share_links_proj ON project_share_links(projectId);
  CREATE INDEX IF NOT EXISTS idx_project_share_links_token ON project_share_links(token);
  CREATE INDEX IF NOT EXISTS idx_project_comments_proj ON project_comments(projectId);
  CREATE INDEX IF NOT EXISTS idx_project_comments_file ON project_comments(projectId, filePath);
  CREATE INDEX IF NOT EXISTS idx_project_activity_proj ON project_activity(projectId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_git_connections_proj ON git_connections(projectId);
  CREATE INDEX IF NOT EXISTS idx_git_commits_proj ON git_commits(projectId, createdAt DESC);
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

  const msgTableInfo = db.prepare(`PRAGMA table_info(messages)`).all() as Array<{ name: string }>;
  const msgCols = msgTableInfo.map(col => col.name);
  if (!msgCols.includes('mediaJson')) {
    db.exec(`ALTER TABLE messages ADD COLUMN mediaJson TEXT`);
    console.log('[Darkano Database] Added `mediaJson` column to `messages` table.');
  }

  const projFilesInfo = db.prepare(`PRAGMA table_info(project_files)`).all() as Array<{ name: string }>;
  const projFilesCols = projFilesInfo.map(col => col.name);
  if (!projFilesCols.includes('version')) {
    db.exec(`ALTER TABLE project_files ADD COLUMN version INTEGER NOT NULL DEFAULT 1`);
    console.log('[Darkano Database] Added `version` column to `project_files` table.');
  }
  if (!projFilesCols.includes('lastModifiedBy')) {
    db.exec(`ALTER TABLE project_files ADD COLUMN lastModifiedBy TEXT`);
    console.log('[Darkano Database] Added `lastModifiedBy` column to `project_files` table.');
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
