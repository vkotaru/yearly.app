import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import authRouter from './routes/auth.js';
import entriesRouter from './routes/entries.js';
import settingsRouter from './routes/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// CORS: allow localhost for dev, Railway domain and FRONTEND_URL in production
const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  process.env.FRONTEND_URL,
  railwayDomain ? `https://${railwayDomain}` : null,
].filter(Boolean) as string[];

console.log('Allowed CORS origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, mobile apps, curl)
    if (!origin) {
      callback(null, true);
    } else if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS rejected origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/settings', settingsRouter);

// In production, serve the built frontend
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  console.log('Serving static files from:', clientDist);
  app.use(express.static(clientDist));
  // SPA fallback - only for non-API routes
  app.get('*', (_req, res) => {
    if (_req.path.startsWith('/api')) {
      res.status(404).json({ error: 'Not found' });
    } else {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
