import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

// GET /api/backup — export all user data as JSON
router.get('/', (req, res) => {
  const userId = req.user!.id;

  const entries = db.prepare(`
    SELECT * FROM entries WHERE user_id = ? ORDER BY year, month, day_start
  `).all(userId);

  const entryIds = entries.map((e: any) => e.id);

  let comments: any[] = [];
  let todos: any[] = [];

  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => '?').join(',');
    comments = db.prepare(
      `SELECT * FROM comments WHERE entry_id IN (${placeholders}) ORDER BY created_at`
    ).all(...entryIds);
    todos = db.prepare(
      `SELECT * FROM todos WHERE entry_id IN (${placeholders}) ORDER BY entry_id, sort_order`
    ).all(...entryIds);
  }

  const settingsRow = db.prepare(
    'SELECT settings_json FROM user_settings WHERE user_id = ?'
  ).get(userId) as { settings_json: string } | undefined;

  let settings = {};
  if (settingsRow) {
    try { settings = JSON.parse(settingsRow.settings_json); } catch { /* ignore */ }
  }

  const backup = {
    version: 1,
    exported_at: new Date().toISOString(),
    user: { email: req.user!.email, name: req.user!.name },
    entries,
    comments,
    todos,
    settings,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="yearly-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(backup);
});

// POST /api/backup/restore — import user data from JSON
router.post('/restore', (req, res) => {
  const userId = req.user!.id;
  const backup = req.body;

  if (!backup || typeof backup !== 'object' || !Array.isArray(backup.entries)) {
    res.status(400).json({ error: 'Invalid backup format: expected object with entries array' });
    return;
  }

  const transaction = db.transaction(() => {
    // Delete existing user data (cascading deletes handle comments & todos)
    db.prepare('DELETE FROM entries WHERE user_id = ?').run(userId);

    // Map old entry IDs to new ones for comments and todos
    const idMap = new Map<number, number>();

    for (const entry of backup.entries) {
      const result = db.prepare(`
        INSERT INTO entries (year, month, end_month, day_start, day_end, row_index, title, description, url, color, category, emoji, departure_time, arrival_time, start_time, end_time, timezone, user_id, is_private, is_tentative, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.year, entry.month, entry.end_month ?? entry.month,
        entry.day_start, entry.day_end, entry.row_index,
        entry.title ?? '', entry.description ?? '', entry.url ?? '',
        entry.color ?? '#3b82f6', entry.category ?? '',
        entry.emoji ?? '', entry.departure_time ?? '', entry.arrival_time ?? '',
        entry.start_time ?? null, entry.end_time ?? null, entry.timezone ?? null,
        userId, entry.is_private ? 1 : 0, entry.is_tentative ? 1 : 0,
        entry.created_at ?? new Date().toISOString(),
        entry.updated_at ?? new Date().toISOString()
      );
      idMap.set(entry.id, Number(result.lastInsertRowid));
    }

    // Restore comments
    if (Array.isArray(backup.comments)) {
      for (const comment of backup.comments) {
        const newEntryId = idMap.get(comment.entry_id);
        if (newEntryId == null) continue;
        db.prepare(
          'INSERT INTO comments (entry_id, text, author, user_id, created_at) VALUES (?, ?, ?, ?, ?)'
        ).run(newEntryId, comment.text, comment.author ?? '', userId, comment.created_at ?? new Date().toISOString());
      }
    }

    // Restore todos
    if (Array.isArray(backup.todos)) {
      for (const todo of backup.todos) {
        const newEntryId = idMap.get(todo.entry_id);
        if (newEntryId == null) continue;
        db.prepare(
          'INSERT INTO todos (entry_id, text, completed, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(
          newEntryId, todo.text, todo.completed ? 1 : 0, todo.sort_order ?? 0,
          todo.created_at ?? new Date().toISOString(),
          todo.updated_at ?? new Date().toISOString()
        );
      }
    }

    // Restore settings
    if (backup.settings && typeof backup.settings === 'object' && Object.keys(backup.settings).length > 0) {
      const settingsJson = JSON.stringify(backup.settings);
      db.prepare(`
        INSERT INTO user_settings (user_id, settings_json, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          settings_json = excluded.settings_json,
          updated_at = datetime('now')
      `).run(userId, settingsJson);
    }

    return {
      entries: backup.entries.length,
      comments: Array.isArray(backup.comments) ? backup.comments.length : 0,
      todos: Array.isArray(backup.todos) ? backup.todos.length : 0,
    };
  });

  try {
    const counts = transaction();
    res.json({ success: true, restored: counts });
  } catch (err: any) {
    res.status(500).json({ error: 'Restore failed: ' + (err.message || 'unknown error') });
  }
});

export default router;
