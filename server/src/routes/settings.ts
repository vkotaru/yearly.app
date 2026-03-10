import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Apply auth middleware to all routes
router.use(requireAuth);

// GET /api/settings - Get current user's settings
router.get('/', (req, res) => {
  const userId = req.user!.id;

  const row = db.prepare(
    'SELECT settings_json FROM user_settings WHERE user_id = ?'
  ).get(userId) as { settings_json: string } | undefined;

  if (row) {
    try {
      const settings = JSON.parse(row.settings_json);
      res.json(settings);
    } catch {
      res.json({});
    }
  } else {
    res.json({});
  }
});

// PUT /api/settings - Update current user's settings
router.put('/', (req, res) => {
  const userId = req.user!.id;
  const settings = req.body;

  if (typeof settings !== 'object' || settings === null) {
    res.status(400).json({ error: 'Settings must be an object' });
    return;
  }

  const settingsJson = JSON.stringify(settings);

  // Upsert: insert or update
  db.prepare(`
    INSERT INTO user_settings (user_id, settings_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      settings_json = excluded.settings_json,
      updated_at = datetime('now')
  `).run(userId, settingsJson);

  res.json({ success: true });
});

// PATCH /api/settings - Partial update (merge with existing)
router.patch('/', (req, res) => {
  const userId = req.user!.id;
  const patch = req.body;

  if (typeof patch !== 'object' || patch === null) {
    res.status(400).json({ error: 'Patch must be an object' });
    return;
  }

  // Get existing settings
  const row = db.prepare(
    'SELECT settings_json FROM user_settings WHERE user_id = ?'
  ).get(userId) as { settings_json: string } | undefined;

  let existing = {};
  if (row) {
    try {
      existing = JSON.parse(row.settings_json);
    } catch { /* ignore */ }
  }

  // Merge patch with existing
  const merged = { ...existing, ...patch };
  const settingsJson = JSON.stringify(merged);

  // Upsert
  db.prepare(`
    INSERT INTO user_settings (user_id, settings_json, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      settings_json = excluded.settings_json,
      updated_at = datetime('now')
  `).run(userId, settingsJson);

  res.json(merged);
});

export default router;
