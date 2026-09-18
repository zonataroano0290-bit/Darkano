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

  -- Performance Indexes
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);
  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(userId, updatedAt DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversationId, createdAt ASC);
  CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(userId);
  CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_records(userId);
`);

console.log('[Darkano Database] Persistent SQLite engine initialized at:', DB_PATH);
