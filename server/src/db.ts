import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'yearly.db');

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

export default db;
