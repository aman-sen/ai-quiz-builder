/**
 * Database layer using @libsql/client (pure JS SQLite, no native compilation).
 * Works on Node 18, 20, 22, 26+ on macOS/Linux/Windows without any build step.
 *
 * The client is async. All query helpers return Promises.
 * For the socket server (which needs synchronous-style batching) we use
 * the batch() API to group writes atomically.
 */

import { createClient, Client, ResultSet } from '@libsql/client';
import path from 'path';

// const DB_URL = (() => {
//   const raw = process.env.DATABASE_URL ?? 'file:./dev.db';
//   if (raw.startsWith('file:')) return raw;
//   // Handle plain path like "./dev.db"
//   return `file:${path.resolve(process.cwd(), raw)}`;
// })();
const DB_URL = (() => {
  const raw = process.env.DATABASE_URL ?? 'file:./dev.db';
  if (raw.startsWith('file:') || raw.startsWith('libsql://') || raw.startsWith('https://')) return raw;
  return `file:${path.resolve(process.cwd(), raw)}`;
})();

let _client: Client | null = null;

// export function getDb(): Client {
//   if (!_client) {
//     _client = createClient({ url: DB_URL });
//   }
//   return _client;
// }

export function getDb(): Client {
  if (!_client) {
    _client = createClient({ url: DB_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
  }
  return _client;
}

export async function initSchema(): Promise<void> {
  const db = getDb();
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      creator_id TEXT NOT NULL,
      settings TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'mcq',
      text TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_answer INTEGER NOT NULL,
      explanation TEXT,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      points INTEGER NOT NULL DEFAULT 100,
      time_limit INTEGER NOT NULL DEFAULT 30,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quiz_id, order_index);

    CREATE TABLE IF NOT EXISTS quiz_sessions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      host_id TEXT NOT NULL,
      join_code TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      current_question INTEGER NOT NULL DEFAULT -1,
      question_started_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
      FOREIGN KEY (host_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_code ON quiz_sessions(join_code);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON quiz_sessions(status);

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      rank INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      incorrect INTEGER NOT NULL DEFAULT 0,
      joined_at TEXT DEFAULT (datetime('now')),
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE,
      UNIQUE(session_id, nickname COLLATE NOCASE)
    );

    CREATE INDEX IF NOT EXISTS idx_participants_session ON participants(session_id, score);

    CREATE TABLE IF NOT EXISTS answers (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      participant_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      selected_option INTEGER NOT NULL,
      is_correct INTEGER NOT NULL,
      points_earned INTEGER NOT NULL DEFAULT 0,
      time_taken REAL NOT NULL,
      submitted_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
      UNIQUE(participant_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS idx_answers_session_question ON answers(session_id, question_id);

    CREATE TABLE IF NOT EXISTS prizes (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL,
      rank INTEGER NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
      UNIQUE(quiz_id, rank)
    );
  `);
}

/** Run a single query and return all rows typed as T */
export async function query<T = Record<string, unknown>>(
  sql: string,
  args: (string | number | null | boolean)[] = []
): Promise<T[]> {
  const db = getDb();
  const result = await db.execute({ sql, args });
  return result.rows as unknown as T[];
}

/** Run a single query and return the first row or null */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  args: (string | number | null | boolean)[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, args);
  return rows[0] ?? null;
}

/** Run a write (INSERT/UPDATE/DELETE) and return affected rows count */
export async function execute(
  sql: string,
  args: (string | number | null | boolean)[] = []
): Promise<number> {
  const db = getDb();
  const result = await db.execute({ sql, args });
  return result.rowsAffected;
}

/** Run multiple statements as an atomic batch (like a transaction) */
export async function batch(
  statements: Array<{ sql: string; args?: (string | number | null | boolean)[] }>
): Promise<void> {
  const db = getDb();
  await db.batch(
    statements.map(s => ({ sql: s.sql, args: s.args ?? [] })),
    'write'
  );
}

// Re-export types for use elsewhere
export type { Client, ResultSet };
