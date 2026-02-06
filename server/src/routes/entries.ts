import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import type { CreateEntryDto, UpdateEntryDto, CreateCommentDto } from '../../../shared/types.js';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

// GET /api/entries/:year — shared entries + user's private entries
router.get('/:year', (req, res) => {
  const year = parseInt(req.params.year, 10);
  if (isNaN(year)) {
    res.status(400).json({ error: 'Invalid year' });
    return;
  }

  const userId = req.user!.id;
  const entries = db.prepare(`
    SELECT * FROM entries
    WHERE year = ? AND (is_private = 0 OR is_private IS NULL OR user_id = ?)
    ORDER BY month, row_index, day_start
  `).all(year, userId);

  res.json(entries);
});

// POST /api/entries — auto-set user_id
router.post('/', (req, res) => {
  const body: CreateEntryDto = req.body;
  const { year, month, day_start, day_end, row_index, title, description, url, color, category, is_private } = body;

  if (!year || !month || !day_start || !day_end || row_index == null) {
    res.status(400).json({ error: 'Missing required fields: year, month, day_start, day_end, row_index' });
    return;
  }

  if (day_end < day_start) {
    res.status(400).json({ error: 'day_end must be >= day_start' });
    return;
  }

  const userId = req.user!.id;
  const isPrivate = is_private ? 1 : 0;

  const result = db.prepare(`
    INSERT INTO entries (year, month, day_start, day_end, row_index, title, description, url, color, category, user_id, is_private)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    year, month, day_start, day_end, row_index,
    title ?? '', description ?? '', url ?? '', color ?? '#3b82f6', category ?? '',
    userId, isPrivate
  );

  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(entry);
});

// PUT /api/entries/:id — ownership check
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  // Ownership check: only owner can edit (legacy entries with null user_id can be edited by anyone)
  if (existing.user_id !== null && existing.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - you can only edit your own entries' });
    return;
  }

  const body: UpdateEntryDto = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.day_start != null) { updates.push('day_start = ?'); values.push(body.day_start); }
  if (body.day_end != null) { updates.push('day_end = ?'); values.push(body.day_end); }
  if (body.row_index != null) { updates.push('row_index = ?'); values.push(body.row_index); }
  if (body.title != null) { updates.push('title = ?'); values.push(body.title); }
  if (body.description != null) { updates.push('description = ?'); values.push(body.description); }
  if (body.url != null) { updates.push('url = ?'); values.push(body.url); }
  if (body.color != null) { updates.push('color = ?'); values.push(body.color); }
  if (body.category != null) { updates.push('category = ?'); values.push(body.category); }
  if (body.is_private != null) { updates.push('is_private = ?'); values.push(body.is_private ? 1 : 0); }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE entries SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
  res.json(entry);
});

// DELETE /api/entries/:id — ownership check
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  // Ownership check
  if (existing.user_id !== null && existing.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - you can only delete your own entries' });
    return;
  }

  db.prepare('DELETE FROM entries WHERE id = ?').run(id);
  res.status(204).send();
});

// ── Comments ──

// GET /api/entries/:id/comments — access check for private entries
router.get('/:id/comments', (req, res) => {
  const entryId = parseInt(req.params.id, 10);
  if (isNaN(entryId)) {
    res.status(400).json({ error: 'Invalid entry id' });
    return;
  }

  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as any;
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  // Access check for private entries
  if (entry.is_private && entry.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - cannot access private entry' });
    return;
  }

  const comments = db.prepare('SELECT * FROM comments WHERE entry_id = ? ORDER BY created_at ASC').all(entryId);
  res.json(comments);
});

// POST /api/entries/:id/comments — auto-set user_id and author
router.post('/:id/comments', (req, res) => {
  const entryId = parseInt(req.params.id, 10);
  if (isNaN(entryId)) {
    res.status(400).json({ error: 'Invalid entry id' });
    return;
  }

  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId) as any;
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  // Access check for private entries
  if (entry.is_private && entry.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - cannot comment on private entry' });
    return;
  }

  const body: CreateCommentDto = req.body;
  if (!body.text?.trim()) {
    res.status(400).json({ error: 'Comment text is required' });
    return;
  }

  const userId = req.user!.id;
  const author = req.user!.name;

  const result = db.prepare(
    'INSERT INTO comments (entry_id, text, author, user_id) VALUES (?, ?, ?, ?)'
  ).run(entryId, body.text.trim(), author, userId);

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(comment);
});

// DELETE /api/entries/comments/:commentId — ownership check
router.delete('/comments/:commentId', (req, res) => {
  const commentId = parseInt(req.params.commentId, 10);
  if (isNaN(commentId)) {
    res.status(400).json({ error: 'Invalid comment id' });
    return;
  }

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId) as any;
  if (!comment) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }

  // Ownership check (legacy comments with null user_id can be deleted by anyone)
  if (comment.user_id !== null && comment.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - you can only delete your own comments' });
    return;
  }

  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
  res.status(204).send();
});

export default router;
