import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
import processResourceRouter from './routes/process-resource.js';

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
  setHeaders: (res, filePath) => {
    if (filePath.includes('/server/')) res.status(403).end();
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
app.use('/api/process-resource', processResourceRouter);

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    backend: 'supabase',
    timestamp: new Date().toISOString(),
    supabase_url: process.env.SUPABASE_URL ? '✓ configured' : '✗ missing SUPABASE_URL',
    deepseek: process.env.DEEPSEEK_API_KEY ? '✓ configured' : '✗ missing DEEPSEEK_API_KEY',
    embeddings: process.env.OPENAI_API_KEY ? '✓ openai' : '⚠ fallback (no OPENAI_API_KEY)',
  });
});

// ── SPA fallback ────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(join(root, 'index.html'));
});

// ── Error handling ──────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Boot (local only — Vercel uses the exported app directly) ──
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n  Learning Engine`);
    console.log(`  ───────────────────────────────────────`);
    console.log(`  Server:   http://localhost:${PORT}`);
    console.log(`  Health:   http://localhost:${PORT}/api/health`);
    console.log(`  Supabase: ${process.env.SUPABASE_URL ?? '⚠  SUPABASE_URL not set'}`);
    console.log(`  DeepSeek: ${process.env.DEEPSEEK_MODEL ?? 'deepseek-flash'}`);
    console.log(`  Embed:    ${process.env.OPENAI_API_KEY ? '✓ OpenAI configured' : '⚠  OPENAI_API_KEY not set (using fallback)'}`);
    if (process.env.SUPABASE_DEV_USER_ID) {
      console.log(`  Dev user: ${process.env.SUPABASE_DEV_USER_ID}`);
    }
    console.log('');
  });
}

export default app;
