import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../learning-engine.db');

let _db = null;

export function getDb() {
  if (_db) return _db;

  _db = new DatabaseSync(DB_PATH);

  // Performance and correctness settings
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  _db.exec('PRAGMA synchronous = NORMAL');
  _db.exec('PRAGMA temp_store = MEMORY');

  // Run schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  _db.exec(schema);

  // Migrations — ADD COLUMN statements are idempotent via try/catch
  migrate(_db);

  // Seed on first run
  seed(_db);

  return _db;
}

function migrate(db) {
  const migrations = [
    // Phase 6: goals need a JSON areas array (topic names the user wants to cover)
    "ALTER TABLE goals ADD COLUMN areas TEXT DEFAULT '[]'",
    // Phase 8: recommendations need reason columns and created_at alias
    "ALTER TABLE recommendations ADD COLUMN reason TEXT",
    "ALTER TABLE recommendations ADD COLUMN reason_detail TEXT",
    "ALTER TABLE recommendations ADD COLUMN created_at TEXT",
    // Settings: weekly learning target in minutes
    "ALTER TABLE user_preferences ADD COLUMN weekly_target_minutes INTEGER DEFAULT 300",
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* column already exists — safe to ignore */ }
  }
}

function seed(db) {
  // Default user
  const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get('user_default');
  if (!userExists) {
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run('user_default', 'Ayush');
  }

  // Default profile
  const profileExists = db.prepare('SELECT user_id FROM profiles WHERE user_id = ?').get('user_default');
  if (!profileExists) {
    db.prepare(`
      INSERT INTO profiles (user_id, about, interests)
      VALUES (?, ?, ?)
    `).run(
      'user_default',
      'Product designer exploring AI-native products and agent experiences.',
      JSON.stringify(['AI UX', 'AI agents', 'Product design'])
    );
  }

  // Default preferences
  const prefExists = db.prepare('SELECT user_id FROM user_preferences WHERE user_id = ?').get('user_default');
  if (!prefExists) {
    db.prepare(`
      INSERT INTO user_preferences (user_id, appearance, ai_recommendations_enabled)
      VALUES (?, ?, ?)
    `).run('user_default', 'system', 1);
  }

  // Seed base topics
  const baseTopics = [
    'AI UX',
    'AI agents',
    'AI evaluation',
    'AI prototyping',
    'AI product strategy',
    'AI fundamentals',
    'Product design',
    'Product strategy',
    'Design systems',
    'Machine learning',
    'LLMs',
    'Prompt engineering',
    'Agent reliability',
    'Human-AI interaction',
  ];

  const insertTopic = db.prepare('INSERT OR IGNORE INTO topics (id, name) VALUES (?, ?)');
  for (const name of baseTopics) {
    insertTopic.run(randomUUID(), name);
  }

  // Seed trends
  const trendCount = db.prepare('SELECT COUNT(*) as n FROM trends').get();
  if (trendCount.n === 0) {
    const trends = [
      {
        topic: 'AI evaluation',
        description: 'Eval-driven design is entering mainstream AI product practice. Teams are using evals to define, measure and ship product quality.',
        relevance: 0.92,
        momentum: 0.88,
        source_info: JSON.stringify({ areas: ['AI product', 'LLMOps', 'design tools'] }),
      },
      {
        topic: 'Agent reliability',
        description: 'As agents move into production, guardrails, human checkpoints and observability are becoming core product concerns.',
        relevance: 0.88,
        momentum: 0.82,
        source_info: JSON.stringify({ areas: ['AI agents', 'AI infrastructure', 'product engineering'] }),
      },
      {
        topic: 'AI prototyping',
        description: 'Low-code and AI-assisted prototyping tools are collapsing the gap between design and working product.',
        relevance: 0.78,
        momentum: 0.75,
        source_info: JSON.stringify({ areas: ['design tools', 'AI UX', 'product design'] }),
      },
      {
        topic: 'Human-AI interaction',
        description: 'Designing for AI that communicates confidence, uncertainty and provenance is becoming a distinct design discipline.',
        relevance: 0.85,
        momentum: 0.70,
        source_info: JSON.stringify({ areas: ['AI UX', 'HCI', 'product design'] }),
      },
    ];

    const insertTrend = db.prepare(`
      INSERT INTO trends (id, topic, description, relevance, momentum, source_info)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const t of trends) {
      insertTrend.run(randomUUID(), t.topic, t.description, t.relevance, t.momentum, t.source_info);
    }
  }
}

// ============================================================
// Query helpers — mirror better-sqlite3 API surface
// ============================================================

/**
 * Return all matching rows, optionally parsing JSON fields.
 * @param {string} sql
 * @param {any[]} params
 * @param {string[]} jsonFields
 */
export function all(sql, params = [], jsonFields = []) {
  const db = getDb();
  const rows = db.prepare(sql).all(...params);
  if (jsonFields.length === 0) return rows;
  return rows.map(r => parseJsonFields(r, jsonFields));
}

/**
 * Return the first matching row.
 * @param {string} sql
 * @param {any[]} params
 * @param {string[]} jsonFields
 */
export function get(sql, params = [], jsonFields = []) {
  const db = getDb();
  const row = db.prepare(sql).get(...params);
  if (!row || jsonFields.length === 0) return row;
  return parseJsonFields(row, jsonFields);
}

/**
 * Execute an INSERT / UPDATE / DELETE statement.
 * Returns { changes, lastInsertRowid }.
 */
export function run(sql, params = []) {
  const db = getDb();
  return db.prepare(sql).run(...params);
}

/**
 * Execute multiple operations in a single transaction.
 * @param {() => T} fn
 * @returns {T}
 */
export function transaction(fn) {
  const db = getDb();
  const begin    = db.prepare('BEGIN');
  const commit   = db.prepare('COMMIT');
  const rollback = db.prepare('ROLLBACK');

  begin.run();
  try {
    const result = fn(db);
    commit.run();
    return result;
  } catch (err) {
    rollback.run();
    throw err;
  }
}

/** Generate a new UUID */
export function newId() {
  return randomUUID();
}

/** Parse JSON string fields on a row object */
function parseJsonFields(row, fields) {
  const out = { ...row };
  for (const f of fields) {
    if (out[f] !== undefined && out[f] !== null && typeof out[f] === 'string') {
      try {
        out[f] = JSON.parse(out[f]);
      } catch {
        // leave as-is
      }
    }
  }
  return out;
}
