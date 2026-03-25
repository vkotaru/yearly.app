import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import type { CreateEntryDto, UpdateEntryDto, CreateCommentDto, CreateTodoDto, UpdateTodoDto } from '../../../shared/types.js';

const router = Router();

// URL validation: only allow http/https or empty
function isValidUrl(url: string | undefined | null): boolean {
  if (!url || url.trim() === '') return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

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
    SELECT e.*,
      (SELECT COUNT(*) FROM todos t WHERE t.entry_id = e.id AND t.completed = 0 AND t.deleted_at IS NULL) as incomplete_todos
    FROM entries e
    WHERE e.year = ? AND e.deleted_at IS NULL AND (e.is_private = 0 OR e.is_private IS NULL OR e.user_id = ?)
    ORDER BY e.month, e.row_index, e.day_start
  `).all(year, userId);

  res.json(entries);
});

// POST /api/entries — auto-set user_id
router.post('/', (req, res) => {
  const body: CreateEntryDto = req.body;
  const { year, month, end_month, day_start, day_end, row_index, title, description, url, color, category, emoji, departure_time, arrival_time, is_private, is_tentative } = body;

  if (!year || !month || !day_start || !day_end || row_index == null) {
    res.status(400).json({ error: 'Missing required fields: year, month, day_start, day_end, row_index' });
    return;
  }

  // Validate end_month (for cross-month entries)
  const finalEndMonth = end_month ?? month;
  if (finalEndMonth < month) {
    res.status(400).json({ error: 'end_month must be >= month' });
    return;
  }

  // For same-month entries, validate day_end >= day_start
  if (finalEndMonth === month && day_end < day_start) {
    res.status(400).json({ error: 'day_end must be >= day_start for same-month entries' });
    return;
  }

  // Validate URL to prevent XSS via javascript: or other dangerous schemes
  if (!isValidUrl(url)) {
    res.status(400).json({ error: 'Invalid URL: must be http:// or https://' });
    return;
  }

  const userId = req.user!.id;
  const isPrivate = is_private ? 1 : 0;
  const isTentative = is_tentative ? 1 : 0;

  const result = db.prepare(`
    INSERT INTO entries (year, month, end_month, day_start, day_end, row_index, title, description, url, color, category, emoji, departure_time, arrival_time, user_id, is_private, is_tentative)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    year, month, finalEndMonth, day_start, day_end, row_index,
    title ?? '', description ?? '', url ?? '', color ?? '#3b82f6', category ?? '',
    emoji ?? '', departure_time ?? '', arrival_time ?? '',
    userId, isPrivate, isTentative
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

  const existing = db.prepare('SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  // Ownership check: only owner can edit their entries
  // Allow editing entries with null user_id (legacy entries created before auth)
  if (existing.user_id !== null && existing.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - you can only edit your own entries' });
    return;
  }

  const body: UpdateEntryDto = req.body;

  // Validate URL if provided
  if (body.url !== undefined && !isValidUrl(body.url)) {
    res.status(400).json({ error: 'Invalid URL: must be http:// or https://' });
    return;
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.month != null) { updates.push('month = ?'); values.push(body.month); }
  if (body.end_month != null) { updates.push('end_month = ?'); values.push(body.end_month); }
  if (body.day_start != null) { updates.push('day_start = ?'); values.push(body.day_start); }
  if (body.day_end != null) { updates.push('day_end = ?'); values.push(body.day_end); }
  if (body.row_index != null) { updates.push('row_index = ?'); values.push(body.row_index); }
  if (body.title != null) { updates.push('title = ?'); values.push(body.title); }
  if (body.description != null) { updates.push('description = ?'); values.push(body.description); }
  if (body.url != null) { updates.push('url = ?'); values.push(body.url); }
  if (body.color != null) { updates.push('color = ?'); values.push(body.color); }
  if (body.category != null) { updates.push('category = ?'); values.push(body.category); }
  if (body.emoji != null) { updates.push('emoji = ?'); values.push(body.emoji); }
  if (body.departure_time != null) { updates.push('departure_time = ?'); values.push(body.departure_time); }
  if (body.arrival_time != null) { updates.push('arrival_time = ?'); values.push(body.arrival_time); }
  if (body.is_private != null) { updates.push('is_private = ?'); values.push(body.is_private ? 1 : 0); }
  if (body.is_tentative != null) { updates.push('is_tentative = ?'); values.push(body.is_tentative ? 1 : 0); }

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

  const existing = db.prepare('SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  // Ownership check: only owner can delete their entries
  // Allow deleting entries with null user_id (legacy entries created before auth)
  if (existing.user_id !== null && existing.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - you can only delete your own entries' });
    return;
  }

  // Soft-delete: set deleted_at instead of removing the row
  db.prepare("UPDATE entries SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
  // Also soft-delete child comments and todos
  db.prepare("UPDATE comments SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE entry_id = ?").run(id);
  db.prepare("UPDATE todos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE entry_id = ?").run(id);
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

  const entry = db.prepare('SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL').get(entryId) as any;
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  // Access check for private entries
  if (entry.is_private && entry.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - cannot access private entry' });
    return;
  }

  const comments = db.prepare('SELECT * FROM comments WHERE entry_id = ? AND deleted_at IS NULL ORDER BY created_at ASC').all(entryId);
  res.json(comments);
});

// POST /api/entries/:id/comments — auto-set user_id and author
router.post('/:id/comments', (req, res) => {
  const entryId = parseInt(req.params.id, 10);
  if (isNaN(entryId)) {
    res.status(400).json({ error: 'Invalid entry id' });
    return;
  }

  const entry = db.prepare('SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL').get(entryId) as any;
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

  const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND deleted_at IS NULL').get(commentId) as any;
  if (!comment) {
    res.status(404).json({ error: 'Comment not found' });
    return;
  }

  // Ownership check: only owner can delete their comments
  if (comment.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - you can only delete your own comments' });
    return;
  }

  db.prepare("UPDATE comments SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(commentId);
  res.status(204).send();
});

// ── Todos ──

// GET /api/entries/:id/todos — get all todos for an entry
router.get('/:id/todos', (req, res) => {
  const entryId = parseInt(req.params.id, 10);
  if (isNaN(entryId)) {
    res.status(400).json({ error: 'Invalid entry id' });
    return;
  }

  const entry = db.prepare('SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL').get(entryId) as any;
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  // Access check for private entries
  if (entry.is_private && entry.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - cannot access private entry' });
    return;
  }

  const todos = db.prepare('SELECT * FROM todos WHERE entry_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC').all(entryId);
  res.json(todos);
});

// POST /api/entries/:id/todos — create a new todo
router.post('/:id/todos', (req, res) => {
  const entryId = parseInt(req.params.id, 10);
  if (isNaN(entryId)) {
    res.status(400).json({ error: 'Invalid entry id' });
    return;
  }

  const entry = db.prepare('SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL').get(entryId) as any;
  if (!entry) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  // Access check for private entries
  if (entry.is_private && entry.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - cannot add todo to private entry' });
    return;
  }

  const body: CreateTodoDto = req.body;
  if (!body.text?.trim()) {
    res.status(400).json({ error: 'Todo text is required' });
    return;
  }

  // Get max sort_order for this entry (only non-deleted todos)
  const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM todos WHERE entry_id = ? AND deleted_at IS NULL').get(entryId) as any;
  const sortOrder = (maxOrder?.max ?? -1) + 1;

  const result = db.prepare(
    'INSERT INTO todos (entry_id, text, sort_order) VALUES (?, ?, ?)'
  ).run(entryId, body.text.trim(), sortOrder);

  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(todo);
});

// PUT /api/entries/todos/:todoId — update a todo
router.put('/todos/:todoId', (req, res) => {
  const todoId = parseInt(req.params.todoId, 10);
  if (isNaN(todoId)) {
    res.status(400).json({ error: 'Invalid todo id' });
    return;
  }

  const todo = db.prepare('SELECT * FROM todos WHERE id = ? AND deleted_at IS NULL').get(todoId) as any;
  if (!todo) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }

  // Check entry access
  const entry = db.prepare('SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL').get(todo.entry_id) as any;
  if (entry.is_private && entry.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - cannot modify todo on private entry' });
    return;
  }

  const body: UpdateTodoDto = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.text != null) { updates.push('text = ?'); values.push(body.text); }
  if (body.completed != null) { updates.push('completed = ?'); values.push(body.completed ? 1 : 0); }
  if (body.sort_order != null) { updates.push('sort_order = ?'); values.push(body.sort_order); }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  updates.push("updated_at = datetime('now')");
  values.push(todoId);

  db.prepare(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const updatedTodo = db.prepare('SELECT * FROM todos WHERE id = ?').get(todoId);
  res.json(updatedTodo);
});

// DELETE /api/entries/todos/:todoId — soft-delete a todo
router.delete('/todos/:todoId', (req, res) => {
  const todoId = parseInt(req.params.todoId, 10);
  if (isNaN(todoId)) {
    res.status(400).json({ error: 'Invalid todo id' });
    return;
  }

  const todo = db.prepare('SELECT * FROM todos WHERE id = ? AND deleted_at IS NULL').get(todoId) as any;
  if (!todo) {
    res.status(404).json({ error: 'Todo not found' });
    return;
  }

  // Check entry access
  const entry = db.prepare('SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL').get(todo.entry_id) as any;
  if (entry.is_private && entry.user_id !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden - cannot delete todo on private entry' });
    return;
  }

  db.prepare("UPDATE todos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(todoId);
  res.status(204).send();
});

export default router;
