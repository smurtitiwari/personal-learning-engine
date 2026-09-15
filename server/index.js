import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { getDb } from './db/db.js';
import { errorHandler, notFound } from './middleware/error.js';

import profileRouter from './routes/profile.js';
import preferencesRouter from './routes/preferences.js';
import topicsRouter from './routes/topics.js';
import resourcesRouter from './routes/resources.js';
import activityRouter from './routes/activity.js';
import analyticsRouter from './routes/analytics.js';
import goalsRouter from './routes/goals.js';
import recommendationsRouter from './routes/recommendations.js';
import trendsRouter from './routes/trends.js';
import askRouter from './routes/ask.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Static frontend files ───────────────────────────────────
const root = join(__dirname, '..');
app.use(express.static(root, {
  index: 'index.html',
  // Don't serve the server/ directory
  setHeaders: (res, filePath) => {
    if (filePath.includes('/server/')) {
      res.status(403).end();
    }
  },
}));

// ── API routes ──────────────────────────────────────────────
app.use('/api/profile', profileRouter);
app.use('/api/preferences', preferencesRouter);
app.use('/api/topics', topicsRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/activity', activityRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/ask', askRouter);

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT name, created_at FROM users WHERE id = ?').get('user_default');
  res.json({
    ok: true,
    user: user?.name,
    since: user?.created_at,
    timestamp: new Date().toISOString(),
  });
});

// ── SPA fallback (serve index.html for non-API routes) ──────
app.get('*', (_req, res) => {
  res.sendFile(join(root, 'index.html'));
});

// ── Error handling ──────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Boot ────────────────────────────────────────────────────
app.listen(PORT, () => {
  // Ensure DB is initialised and seeded at startup
  getDb();
  console.log(`\n  Learning Engine`);
  console.log(`  ───────────────────────────────`);
  console.log(`  Server:  http://localhost:${PORT}`);
  console.log(`  API:     http://localhost:${PORT}/api/health`);
  console.log(`  Mode:    ${process.env.NODE_ENV || 'development'}`);
  console.log(`  AI:      ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_api_key_here' ? 'configured' : 'not configured (add ANTHROPIC_API_KEY to .env)'}`);
  console.log('');
});

export default app;
