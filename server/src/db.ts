import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use DATABASE_PATH env var for production (Railway volume), fallback to local for dev
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'yearly.db');

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    day_start INTEGER NOT NULL,
    day_end INTEGER NOT NULL,
    row_index INTEGER NOT NULL,
    title TEXT DEFAULT '',
    description TEXT DEFAULT '',
    url TEXT DEFAULT '',
    color TEXT DEFAULT '#3b82f6',
    category TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// Migrate: rename text -> title, add new columns if missing
const cols = db.prepare("PRAGMA table_info(entries)").all() as { name: string }[];
const colNames = cols.map((c) => c.name);
if (colNames.includes('text') && !colNames.includes('title')) {
  db.exec(`ALTER TABLE entries RENAME COLUMN text TO title`);
}
if (!colNames.includes('description') && !cols.some(c => c.name === 'description')) {
  try { db.exec(`ALTER TABLE entries ADD COLUMN description TEXT DEFAULT ''`); } catch { /* already exists */ }
}
if (!colNames.includes('url')) {
  try { db.exec(`ALTER TABLE entries ADD COLUMN url TEXT DEFAULT ''`); } catch { /* already exists */ }
}
if (!colNames.includes('category')) {
  try { db.exec(`ALTER TABLE entries ADD COLUMN category TEXT DEFAULT ''`); } catch { /* already exists */ }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    author TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
  )
`);

// ── Users table (for Google OAuth) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    picture TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ── Migrate entries: add user_id and is_private ──
const entryCols = db.prepare("PRAGMA table_info(entries)").all() as { name: string }[];
const entryColNames = entryCols.map((c) => c.name);

if (!entryColNames.includes('user_id')) {
  try { db.exec(`ALTER TABLE entries ADD COLUMN user_id INTEGER REFERENCES users(id)`); } catch { /* exists */ }
}
if (!entryColNames.includes('is_private')) {
  try { db.exec(`ALTER TABLE entries ADD COLUMN is_private INTEGER DEFAULT 0`); } catch { /* exists */ }
}

// ── Migrate comments: add user_id ──
const commentCols = db.prepare("PRAGMA table_info(comments)").all() as { name: string }[];
const commentColNames = commentCols.map((c) => c.name);

if (!commentColNames.includes('user_id')) {
  try { db.exec(`ALTER TABLE comments ADD COLUMN user_id INTEGER REFERENCES users(id)`); } catch { /* exists */ }
}

// ── Todos table (for entry checklists) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
  )
`);

export default db;
