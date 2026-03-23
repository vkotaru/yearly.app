/**
 * Dexie.js client-side database for offline-first data access.
 *
 * SCHEMA VERSIONING RULES (for future agents):
 * ─────────────────────────────────────────────
 * 1. Versions are APPEND-ONLY — never delete or modify old db.version() blocks.
 * 2. Each schema change requires a new db.version(N+1) block with an .upgrade() migration.
 * 3. Dexie runs all necessary migrations sequentially when the database opens
 *    (e.g., a user on v1 opening v3 will run v1→v2→v3 migrations automatically).
 * 4. The SW update prompt ensures users get new JS before Dexie opens,
 *    so migrations run on the first page load after an app update.
 * 5. Only indexed columns are listed in .stores() — all other fields are still stored.
 *    See https://dexie.org/docs/Version/Version.stores()
 */

import Dexie, { type EntityTable } from 'dexie';

// ── Table interfaces ──
// These mirror the SQLite schema but add localId for client-side identity
// and track sync state with serverId + updatedAt.

export interface DexieEntry {
  localId?: number;       // Auto-incremented client-side ID
  serverId?: number;      // Server-assigned ID (null until first sync)
  year: number;
  month: number;
  end_month: number;
  day_start: number;
  day_end: number;
  row_index: number;
  title: string;
  description: string;
  url: string;
  color: string;
  category: string;
  emoji: string;
  departure_time: string;
  arrival_time: string;
  user_id?: number;
  is_private: boolean;
  is_tentative: boolean;
  created_at: string;
  updated_at: string;
  incomplete_todos?: number;
  _deleted?: boolean;     // Soft-delete flag for sync
}

export interface DexieComment {
  localId?: number;
  serverId?: number;
  entryLocalId?: number;  // FK to DexieEntry.localId
  entryServerId?: number; // FK to server entry ID
  text: string;
  author: string;
  user_id?: number;
  created_at: string;
  updated_at: string;
  _deleted?: boolean;
}

export interface DexieTodo {
  localId?: number;
  serverId?: number;
  entryLocalId?: number;
  entryServerId?: number;
  text: string;
  completed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  _deleted?: boolean;
}

export interface DexieSetting {
  key: string;            // Primary key (e.g., 'backgroundCategories')
  value: unknown;
  updated_at: string;
}

export type SyncOperation = 'create' | 'update' | 'delete';

export interface PendingSyncRecord {
  id?: number;            // Auto-incremented
  table: 'entries' | 'comments' | 'todos' | 'settings';
  operation: SyncOperation;
  localId?: number;       // Client-side ID of the record
  serverId?: number;      // Server ID (if known)
  payload: Record<string, unknown>; // The data to sync
  timestamp: string;      // ISO timestamp of when the mutation happened
  retries: number;        // Number of failed sync attempts
}

// ── Database class ──

class YearlyDatabase extends Dexie {
  entries!: EntityTable<DexieEntry, 'localId'>;
  comments!: EntityTable<DexieComment, 'localId'>;
  todos!: EntityTable<DexieTodo, 'localId'>;
  settings!: EntityTable<DexieSetting, 'key'>;
  pendingSync!: EntityTable<PendingSyncRecord, 'id'>;

  constructor() {
    super('yearly');

    // ── Version 1: Initial schema ──
    // Indexes listed here — all other fields are stored automatically.
    // Compound indexes use [field1+field2] syntax.
    this.version(1).stores({
      entries: '++localId, serverId, year, month, category, user_id, updated_at',
      comments: '++localId, serverId, entryLocalId, entryServerId, updated_at',
      todos: '++localId, serverId, entryLocalId, entryServerId, updated_at',
      settings: 'key',
      pendingSync: '++id, table, operation, localId, serverId, timestamp',
    });

    // Future versions go below. Example:
    // this.version(2).stores({
    //   entries: '++localId, serverId, year, month, category, user_id, updated_at, newField',
    // }).upgrade(tx => {
    //   return tx.table('entries').toCollection().modify(entry => {
    //     entry.newField = 'default';
    //   });
    // });
  }
}

export const db = new YearlyDatabase();
