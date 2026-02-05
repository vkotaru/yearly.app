import { Router } from 'express';
import db from '../db.js';
import type { CreateEntryDto, UpdateEntryDto } from '../../../shared/types.js';

const router = Router();

// GET /api/entries/:year
router.get('/:year', (req, res) => {
  const year = parseInt(req.params.year, 10);
  if (isNaN(year)) {
    res.status(400).json({ error: 'Invalid year' });
    return;
  }
  const entries = db.prepare('SELECT * FROM entries WHERE year = ? ORDER BY month, row_index, day_start').all(year);
  res.json(entries);
});

// POST /api/entries
router.post('/', (req, res) => {
  const body: CreateEntryDto = req.body;
  const { year, month, day_start, day_end, row_index, text, color } = body;

  if (!year || !month || !day_start || !day_end || row_index == null) {
    res.status(400).json({ error: 'Missing required fields: year, month, day_start, day_end, row_index' });
    return;
  }

  if (day_end < day_start) {
    res.status(400).json({ error: 'day_end must be >= day_start' });
    return;
  }

  const result = db.prepare(`
    INSERT INTO entries (year, month, day_start, day_end, row_index, text, color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(year, month, day_start, day_end, row_index, text ?? '', color ?? '#3b82f6');

  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(entry);
});

// PUT /api/entries/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  const body: UpdateEntryDto = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (body.day_start != null) { updates.push('day_start = ?'); values.push(body.day_start); }
  if (body.day_end != null) { updates.push('day_end = ?'); values.push(body.day_end); }
  if (body.row_index != null) { updates.push('row_index = ?'); values.push(body.row_index); }
  if (body.text != null) { updates.push('text = ?'); values.push(body.text); }
  if (body.color != null) { updates.push('color = ?'); values.push(body.color); }

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

// DELETE /api/entries/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }

  const result = db.prepare('DELETE FROM entries WHERE id = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }

  res.status(204).send();
});

export default router;
