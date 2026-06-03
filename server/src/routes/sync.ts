import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/sync/changes?since={ISO timestamp}
 *
 * Returns entries, comments, and todos where updated_at > since OR deleted_at > since,
 * scoped to the authenticated user (shared entries + user's private entries).
 */
router.get('/changes', (req, res) => {
  const since = (req.query.since as string) || '1970-01-01T00:00:00.000Z';
  const userId = req.user!.id;

  // Entries: shared + user's private, changed since timestamp
  // Include soft-deleted entries so the client can remove them locally
  const entries = db.prepare(`
    SELECT * FROM entries
    WHERE (is_private = 0 OR is_private IS NULL OR user_id = ?)
      AND (updated_at > ? OR deleted_at > ?)
    ORDER BY updated_at ASC
  `).all(userId, since, since);

  // Comments: for entries the user can see, changed since timestamp
  const comments = db.prepare(`
    SELECT c.* FROM comments c
    JOIN entries e ON c.entry_id = e.id
    WHERE (e.is_private = 0 OR e.is_private IS NULL OR e.user_id = ?)
      AND (c.updated_at > ? OR c.deleted_at > ?)
    ORDER BY c.updated_at ASC
  `).all(userId, since, since);

  // Todos: for entries the user can see, changed since timestamp
  const todos = db.prepare(`
    SELECT t.* FROM todos t
    JOIN entries e ON t.entry_id = e.id
    WHERE (e.is_private = 0 OR e.is_private IS NULL OR e.user_id = ?)
      AND (t.updated_at > ? OR t.deleted_at > ?)
    ORDER BY t.updated_at ASC
  `).all(userId, since, since);

  res.json({
    entries,
    comments,
    todos,
    serverTime: new Date().toISOString(),
  });
});

/**
 * POST /api/sync/push
 *
 * Accepts batch mutations from the client. Returns per-item success/failure
 * with server-assigned IDs for creates.
 *
 * Body: { changes: Array<{ id, table, operation, localId, serverId, payload, timestamp }> }
 * Response: { results: Array<{ id, success, serverId?, error? }>, idMappings: Array<{ table, localId, serverId }> }
 *
 * Conflict resolution: server-wins via updated_at comparison.
 */
router.post('/push', (req, res) => {
  const { changes } = req.body;
  if (!Array.isArray(changes)) {
    res.status(400).json({ error: 'changes must be an array' });
    return;
  }

  const userId = req.user!.id;
  const results: Array<{ id: number; success: boolean; serverId?: number; error?: string }> = [];
  const idMappings: Array<{ table: string; localId: number; serverId: number }> = [];

  for (const change of changes) {
    const { table, operation, localId, serverId, payload, id: changeId } = change;

    try {
      if (table === 'entries') {
        const result = processEntryChange(operation, serverId, payload, userId, localId);
        results.push({ id: changeId, success: true, serverId: result.serverId });
        if (result.isNew && localId) {
          idMappings.push({ table: 'entries', localId, serverId: result.serverId });
        }
      } else if (table === 'comments') {
        const result = processCommentChange(operation, serverId, payload, userId, localId);
        results.push({ id: changeId, success: true, serverId: result.serverId });
        if (result.isNew && localId) {
          idMappings.push({ table: 'comments', localId, serverId: result.serverId });
        }
      } else if (table === 'todos') {
        const result = processTodoChange(operation, serverId, payload, userId, localId);
        results.push({ id: changeId, success: true, serverId: result.serverId });
        if (result.isNew && localId) {
          idMappings.push({ table: 'todos', localId, serverId: result.serverId });
        }
      } else if (table === 'settings') {
        processSettingsChange(operation, payload, userId);
        results.push({ id: changeId, success: true });
      } else {
        results.push({ id: changeId, success: false, error: `Unknown table: ${table}` });
      }
    } catch (err: any) {
      results.push({ id: changeId, success: false, error: err.message || 'Unknown error' });
    }
  }

  res.json({ results, idMappings });
});

// ── Entry change processing ──

function processEntryChange(
  operation: string,
  serverId: number | undefined,
  payload: Record<string, unknown>,
  userId: number,
  localId?: number,
): { serverId: number; isNew: boolean } {
  if (operation === 'create') {
    const result = db.prepare(`
      INSERT INTO entries (year, month, end_month, day_start, day_end, row_index, title, description,
        url, color, category, emoji, departure_time, arrival_time, start_time, end_time, timezone, user_id, is_private, is_tentative)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.year, payload.month, payload.end_month ?? payload.month,
      payload.day_start, payload.day_end, payload.row_index,
      payload.title ?? '', payload.description ?? '', payload.url ?? '',
      payload.color ?? '#3b82f6', payload.category ?? '',
      payload.emoji ?? '', payload.departure_time ?? '', payload.arrival_time ?? '',
      payload.start_time || null, payload.end_time || null, payload.timezone || null,
      userId, payload.is_private ? 1 : 0, payload.is_tentative ? 1 : 0,
    );
    return { serverId: Number(result.lastInsertRowid), isNew: true };
  }

  if (operation === 'update' && serverId) {
    const existing = db.prepare('SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL').get(serverId) as any;
    if (!existing) throw new Error('Entry not found');

    // Ownership check
    if (existing.user_id !== null && existing.user_id !== userId) {
      throw new Error('Forbidden');
    }

    // Server-wins: skip if server version is newer
    if (payload.updated_at && existing.updated_at > payload.updated_at) {
      return { serverId, isNew: false };
    }

    const fields = ['month', 'end_month', 'day_start', 'day_end', 'row_index', 'title',
      'description', 'url', 'color', 'category', 'emoji', 'departure_time',
      'arrival_time', 'start_time', 'end_time', 'timezone', 'is_private', 'is_tentative'];
    const updates: string[] = [];
    const values: unknown[] = [];

    for (const f of fields) {
      if (payload[f] != null) {
        if (f === 'is_private' || f === 'is_tentative') {
          updates.push(`${f} = ?`);
          values.push(payload[f] ? 1 : 0);
        } else {
          updates.push(`${f} = ?`);
          values.push(payload[f]);
        }
      }
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(serverId);
      db.prepare(`UPDATE entries SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    return { serverId, isNew: false };
  }

  if (operation === 'delete' && serverId) {
    const existing = db.prepare('SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL').get(serverId) as any;
    if (!existing) return { serverId, isNew: false }; // Already deleted

    if (existing.user_id !== null && existing.user_id !== userId) {
      throw new Error('Forbidden');
    }

    db.prepare("UPDATE entries SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(serverId);
    db.prepare("UPDATE comments SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE entry_id = ?").run(serverId);
    db.prepare("UPDATE todos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE entry_id = ?").run(serverId);
    return { serverId, isNew: false };
  }

  throw new Error(`Invalid entry operation: ${operation}`);
}

// ── Comment change processing ──

function processCommentChange(
  operation: string,
  serverId: number | undefined,
  payload: Record<string, unknown>,
  userId: number,
  localId?: number,
): { serverId: number; isNew: boolean } {
  if (operation === 'create') {
    const entryId = payload.entry_id as number;
    if (!entryId) throw new Error('entry_id required for comment create');

    const result = db.prepare(
      'INSERT INTO comments (entry_id, text, author, user_id) VALUES (?, ?, ?, ?)'
    ).run(entryId, payload.text ?? '', payload.author ?? '', userId);

    return { serverId: Number(result.lastInsertRowid), isNew: true };
  }

  if (operation === 'delete' && serverId) {
    const existing = db.prepare('SELECT * FROM comments WHERE id = ? AND deleted_at IS NULL').get(serverId) as any;
    if (!existing) return { serverId, isNew: false };

    if (existing.user_id !== userId) throw new Error('Forbidden');

    db.prepare("UPDATE comments SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(serverId);
    return { serverId, isNew: false };
  }

  throw new Error(`Invalid comment operation: ${operation}`);
}

// ── Todo change processing ──

function processTodoChange(
  operation: string,
  serverId: number | undefined,
  payload: Record<string, unknown>,
  userId: number,
  localId?: number,
): { serverId: number; isNew: boolean } {
  if (operation === 'create') {
    const entryId = payload.entry_id as number;
    if (!entryId) throw new Error('entry_id required for todo create');

    const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM todos WHERE entry_id = ? AND deleted_at IS NULL').get(entryId) as any;
    const sortOrder = (maxOrder?.max ?? -1) + 1;

    const result = db.prepare(
      'INSERT INTO todos (entry_id, text, sort_order) VALUES (?, ?, ?)'
    ).run(entryId, payload.text ?? '', payload.sort_order ?? sortOrder);

    return { serverId: Number(result.lastInsertRowid), isNew: true };
  }

  if (operation === 'update' && serverId) {
    const existing = db.prepare('SELECT * FROM todos WHERE id = ? AND deleted_at IS NULL').get(serverId) as any;
    if (!existing) throw new Error('Todo not found');

    // Server-wins: skip if server version is newer
    if (payload.updated_at && existing.updated_at > payload.updated_at) {
      return { serverId, isNew: false };
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (payload.text != null) { updates.push('text = ?'); values.push(payload.text); }
    if (payload.completed != null) { updates.push('completed = ?'); values.push(payload.completed ? 1 : 0); }
    if (payload.sort_order != null) { updates.push('sort_order = ?'); values.push(payload.sort_order); }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(serverId);
      db.prepare(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    return { serverId, isNew: false };
  }

  if (operation === 'delete' && serverId) {
    const existing = db.prepare('SELECT * FROM todos WHERE id = ? AND deleted_at IS NULL').get(serverId) as any;
    if (!existing) return { serverId, isNew: false };

    db.prepare("UPDATE todos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(serverId);
    return { serverId, isNew: false };
  }

  throw new Error(`Invalid todo operation: ${operation}`);
}

// ── Settings change processing ──

function processSettingsChange(
  operation: string,
  payload: Record<string, unknown>,
  userId: number,
): void {
  if (operation === 'update') {
    const existing = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;
    if (existing) {
      const current = JSON.parse(existing.settings_json || '{}');
      const merged = { ...current, ...payload };
      db.prepare("UPDATE user_settings SET settings_json = ?, updated_at = datetime('now') WHERE user_id = ?")
        .run(JSON.stringify(merged), userId);
    } else {
      db.prepare("INSERT INTO user_settings (user_id, settings_json) VALUES (?, ?)")
        .run(userId, JSON.stringify(payload));
    }
  }
}

export default router;
