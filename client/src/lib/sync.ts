/**
 * Sync engine for offline-first data flow.
 *
 * Write path:  Component → Dexie → pendingSync queue → server (when online)
 * Read path:   Component ← Dexie (instant) ← server (background refresh)
 */

import { db, type PendingSyncRecord, type SyncOperation } from './db';

const SYNC_TAG = 'yearly-sync';
const LAST_SYNC_KEY = 'yearly-last-sync';
const MAX_RETRIES = 10;

// ── Sync error state ──

export type SyncErrorState = {
  type: 'network' | 'server' | 'failed-records';
  message: string;
  failedCount?: number;
} | null;

let _syncError: SyncErrorState = null;
const _syncErrorListeners = new Set<(error: SyncErrorState) => void>();

export function getSyncError(): SyncErrorState {
  return _syncError;
}

export function onSyncErrorChange(fn: (error: SyncErrorState) => void): () => void {
  _syncErrorListeners.add(fn);
  return () => _syncErrorListeners.delete(fn);
}

function setSyncError(error: SyncErrorState): void {
  _syncError = error;
  _syncErrorListeners.forEach(fn => fn(error));
}

function clearSyncError(): void {
  if (_syncError) setSyncError(null);
}

// ── Online/offline state ──

let _online = navigator.onLine;
const _listeners = new Set<(online: boolean) => void>();

window.addEventListener('online', () => {
  _online = true;
  _listeners.forEach(fn => fn(true));
  flushPendingSync();
});

window.addEventListener('offline', () => {
  _online = false;
  _listeners.forEach(fn => fn(false));
});

export function isOnline(): boolean {
  return _online;
}

export function onConnectivityChange(fn: (online: boolean) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

// ── Pending sync queue ──

export async function addToPendingSync(
  table: PendingSyncRecord['table'],
  operation: SyncOperation,
  payload: Record<string, unknown>,
  localId?: number,
  serverId?: number,
): Promise<void> {
  await db.pendingSync.add({
    table,
    operation,
    localId,
    serverId,
    payload,
    timestamp: new Date().toISOString(),
    retries: 0,
  });

  // Try to sync immediately if online
  if (_online) {
    flushPendingSync();
  } else {
    registerBackgroundSync();
  }
}

export async function getPendingSyncCount(): Promise<number> {
  return db.pendingSync.count();
}

/**
 * Flush all pending sync records to the server.
 * Records are sent oldest-first. Failed records stay in the queue
 * with an incremented retry count.
 */
export async function flushPendingSync(): Promise<void> {
  if (!_online) return;

  const pending = await db.pendingSync
    .orderBy('timestamp')
    .filter(r => r.retries < MAX_RETRIES)
    .toArray();
  if (pending.length === 0) return;

  try {
    const res = await fetch('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes: pending }),
      credentials: 'include',
    });

    if (res.ok) {
      const result = await res.json();

      // Only delete successfully synced entries (NOT bulk clear — real bug from askesis)
      if (result.results) {
        const successChangeIds = new Set(
          result.results.filter((r: any) => r.success).map((r: any) => r.id)
        );
        const idsToDelete = pending
          .filter(p => successChangeIds.has(p.id))
          .map(p => p.id!)
          .filter(Boolean);
        if (idsToDelete.length > 0) {
          await db.pendingSync.bulkDelete(idsToDelete);
        }

        // Increment retries on failed items
        const failedRecords = pending.filter(p => !successChangeIds.has(p.id));
        if (failedRecords.length > 0) {
          await incrementRetries(failedRecords);
        }
      } else {
        // Fallback: server didn't return per-item results — delete all
        const ids = pending.map(p => p.id!).filter(Boolean);
        await db.pendingSync.bulkDelete(ids);
      }

      // Apply server-assigned IDs back to local records
      if (result.idMappings) {
        await applyServerIdMappings(result.idMappings);
      }

      clearSyncError();
    } else if (res.status === 404) {
      setSyncError({
        type: 'server',
        message: 'Sync endpoint not available — changes are saved locally',
      });
      return;
    } else if (res.status === 409) {
      // Conflict — server-wins strategy
      const result = await res.json();
      if (result.resolved) {
        await applyServerChanges(result.resolved);
        const ids = pending.map(p => p.id!).filter(Boolean);
        await db.pendingSync.bulkDelete(ids);
      }
      window.dispatchEvent(new CustomEvent('sync-conflict', {
        detail: { message: 'Server updated — your changes were overwritten' },
      }));
    } else {
      setSyncError({
        type: 'server',
        message: `Sync failed (${res.status}) — will retry`,
      });
      await incrementRetries(pending);
    }
  } catch (err) {
    setSyncError({
      type: 'network',
      message: 'Network error — changes saved locally, will retry when connected',
    });
  }
}

/**
 * Pull changes from server since last sync.
 * Merges into Dexie and returns the set of affected months for re-render.
 */
export async function pullChanges(): Promise<Set<number>> {
  if (!_online) return new Set();

  const lastSync = localStorage.getItem(LAST_SYNC_KEY) || '1970-01-01T00:00:00.000Z';
  const affectedMonths = new Set<number>();

  try {
    const res = await fetch(`/api/sync/changes?since=${encodeURIComponent(lastSync)}`, {
      credentials: 'include',
    });

    if (!res.ok) {
      if (res.status !== 404) {
        setSyncError({
          type: 'server',
          message: `Failed to pull changes (${res.status})`,
        });
      }
      return affectedMonths;
    }

    const data = await res.json();

    if (data.entries?.length) {
      await applyServerChanges(data.entries);
      for (const e of data.entries) {
        affectedMonths.add(e.month);
      }
    }

    if (data.comments?.length) {
      await applyServerComments(data.comments);
    }

    if (data.todos?.length) {
      await applyServerTodos(data.todos);
    }

    localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    clearSyncError();
  } catch {
    setSyncError({
      type: 'network',
      message: 'Could not reach server — using local data',
    });
  }

  return affectedMonths;
}

// ── Internal helpers ──

async function applyServerIdMappings(
  mappings: Array<{ table: string; localId: number; serverId: number }>
): Promise<void> {
  for (const { table, localId, serverId } of mappings) {
    if (table === 'entries') {
      await db.entries.update(localId, { serverId });
    } else if (table === 'comments') {
      await db.comments.update(localId, { serverId });
    } else if (table === 'todos') {
      await db.todos.update(localId, { serverId });
    }
  }
}

async function applyServerChanges(
  entries: Array<Record<string, unknown>>
): Promise<void> {
  for (const entry of entries) {
    const serverId = entry.id as number;
    const existing = await db.entries.where('serverId').equals(serverId).first();

    if (entry.deleted_at) {
      // Server says deleted — remove locally
      if (existing) {
        await db.entries.delete(existing.localId!);
      }
    } else if (existing) {
      // Update existing local record with server data
      await db.entries.update(existing.localId!, {
        ...entry,
        serverId,
      });
    } else {
      // New record from server
      await db.entries.add({
        serverId,
        year: entry.year as number,
        month: entry.month as number,
        end_month: (entry.end_month ?? entry.month) as number,
        day_start: entry.day_start as number,
        day_end: entry.day_end as number,
        row_index: entry.row_index as number,
        title: (entry.title as string) || '',
        description: (entry.description as string) || '',
        url: (entry.url as string) || '',
        color: (entry.color as string) || '',
        category: (entry.category as string) || '',
        emoji: (entry.emoji as string) || '',
        departure_time: (entry.departure_time as string) || '',
        arrival_time: (entry.arrival_time as string) || '',
        user_id: entry.user_id as number | undefined,
        is_private: !!entry.is_private,
        is_tentative: !!entry.is_tentative,
        created_at: (entry.created_at as string) || new Date().toISOString(),
        updated_at: (entry.updated_at as string) || new Date().toISOString(),
      });
    }
  }
}

async function applyServerComments(
  comments: Array<Record<string, unknown>>
): Promise<void> {
  for (const comment of comments) {
    const serverId = comment.id as number;
    const existing = await db.comments.where('serverId').equals(serverId).first();

    if (comment.deleted_at) {
      if (existing) await db.comments.delete(existing.localId!);
    } else if (existing) {
      await db.comments.update(existing.localId!, { ...comment, serverId });
    } else {
      await db.comments.add({
        serverId,
        entryServerId: comment.entry_id as number,
        text: (comment.text as string) || '',
        author: (comment.author as string) || '',
        user_id: comment.user_id as number | undefined,
        created_at: (comment.created_at as string) || new Date().toISOString(),
        updated_at: (comment.updated_at as string) || new Date().toISOString(),
      });
    }
  }
}

async function applyServerTodos(
  todos: Array<Record<string, unknown>>
): Promise<void> {
  for (const todo of todos) {
    const serverId = todo.id as number;
    const existing = await db.todos.where('serverId').equals(serverId).first();

    if (todo.deleted_at) {
      if (existing) await db.todos.delete(existing.localId!);
    } else if (existing) {
      await db.todos.update(existing.localId!, { ...todo, serverId });
    } else {
      await db.todos.add({
        serverId,
        entryServerId: todo.entry_id as number,
        text: (todo.text as string) || '',
        completed: !!todo.completed,
        sort_order: (todo.sort_order as number) || 0,
        created_at: (todo.created_at as string) || new Date().toISOString(),
        updated_at: (todo.updated_at as string) || new Date().toISOString(),
      });
    }
  }
}

async function incrementRetries(records: PendingSyncRecord[]): Promise<void> {
  let failedCount = 0;
  for (const record of records) {
    if (record.id) {
      const newRetries = record.retries + 1;
      await db.pendingSync.update(record.id, { retries: newRetries });
      if (newRetries >= MAX_RETRIES) {
        failedCount++;
      }
    }
  }
  if (failedCount > 0) {
    setSyncError({
      type: 'failed-records',
      message: `${failedCount} change${failedCount > 1 ? 's' : ''} failed to sync after ${MAX_RETRIES} attempts`,
      failedCount,
    });
  }
}

/** Count records that have exhausted retries */
export async function getFailedSyncCount(): Promise<number> {
  return db.pendingSync.where('retries').aboveOrEqual(MAX_RETRIES).count();
}

/** Get all failed records for debugging UI */
export async function getFailedSyncRecords(): Promise<PendingSyncRecord[]> {
  return db.pendingSync.where('retries').aboveOrEqual(MAX_RETRIES).toArray();
}

/** Get all pending records (including failed) for debugging UI */
export async function getAllPendingSyncRecords(): Promise<PendingSyncRecord[]> {
  return db.pendingSync.orderBy('timestamp').toArray();
}

/** Retry all failed records by resetting their retry count */
export async function retryFailedSync(): Promise<void> {
  await db.pendingSync.where('retries').aboveOrEqual(MAX_RETRIES).modify({ retries: 0 });
  clearSyncError();
  flushPendingSync();
}

function registerBackgroundSync(): void {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then(registration => {
      (registration as any).sync?.register(SYNC_TAG).catch(() => {
        // Background sync not available — will retry on next online event
      });
    });
  }
}
