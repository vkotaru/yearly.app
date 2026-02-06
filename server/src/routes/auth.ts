import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import db from '../db.js';
import { createToken } from '../utils/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import type { GoogleAuthDto, User, AuthResponse } from '../../../shared/types.js';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// POST /api/auth/google - Verify Google ID token and create/login user
router.post('/google', async (req, res) => {
  try {
    const { credential }: GoogleAuthDto = req.body;

    if (!credential) {
      res.status(400).json({ error: 'Missing credential' });
      return;
    }

    if (!GOOGLE_CLIENT_ID) {
      res.status(500).json({ error: 'GOOGLE_CLIENT_ID not configured' });
      return;
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const { sub: googleId, email, name, picture } = payload;

    if (!email || !name) {
      res.status(400).json({ error: 'Missing required user info from Google' });
      return;
    }

    // Check if user exists
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as User | undefined;

    if (!user) {
      // Create new user
      const result = db.prepare(
        'INSERT INTO users (google_id, email, name, picture) VALUES (?, ?, ?, ?)'
      ).run(googleId, email, name, picture || '');

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as User;
    } else {
      // Update existing user info (in case name/picture changed)
      db.prepare(
        'UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?'
      ).run(email, name, picture || '', user.id);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as User;
    }

    const token = createToken(user);

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const response: AuthResponse = { user };
    res.json(response);
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// GET /api/auth/me - Get current user
router.get('/me', requireAuth, (req, res) => {
  const response: AuthResponse = { user: req.user! };
  res.json(response);
});

// POST /api/auth/logout - Clear auth cookie
router.post('/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

export default router;
