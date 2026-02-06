import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import db from '../db.js';
import type { User } from '../../../shared/types.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.auth_token;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized - no token provided' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized - invalid token' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.userId) as User | undefined;

  if (!user) {
    res.status(401).json({ error: 'Unauthorized - user not found' });
    return;
  }

  req.user = user;
  next();
}
