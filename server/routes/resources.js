import { Router } from 'express';
import { get, all, run, transaction, newId } from '../db/db.js';
import { createError } from '../middleware/error.js';
import { detectSourceType, extractContent } from '../services/content-extractor.js';
import { processWithAI } from '../services/ai-processor.js';
import { rebuildProfile } from '../services/learning-profile.js';

const router = Router();
const USER_ID = 'user_default';

const RESOURCE_JSON_FIELDS = ['ai_key_takeaways'];

// ── Helpers ──────────────────────────────────────────────────

/** Attach topic names to a resource row */
function withTopics(resource) {
  if (!resource) return null;
  const topicRows = all(
    `SELECT t.name FROM topics t
     JOIN resource_topics rt ON rt.topic_id = t.id
     WHERE rt.resource_id = ?
     ORDER BY rt.relevance DESC`,
    [resource.id]
  );
  return { ...resource, topics: topicRows.map(r => r.name) };
}

/** Attach topics to multiple resources efficiently */
function withTopicsBulk(resources) {
  if (!resources.length) return resources;
  const ids = resources.map(r => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(
    `SELECT rt.resource_id, t.name FROM resource_topics rt
     JOIN topics t ON t.id = rt.topic_id
     WHERE rt.resource_id IN (${placeholders})
     ORDER BY rt.relevance DESC`,
    ids
  );

  const topicMap = {};
  for (const row of rows) {
    if (!topicMap[row.resource_id]) topicMap[row.resource_id] = [];
    topicMap[row.resource_id].push(row.name);
  }

  return resources.map(r => ({ ...r, topics: topicMap[r.id] || [] }));
}

/** Parse JSON fields on a resource */
function parseResource(r) {
  if (!r) return null;
  const out = { ...r };
  for (const f of RESOURCE_JSON_FIELDS) {
    if (typeof out[f] === 'string') {
      try { out[f] = JSON.parse(out[f]); } catch { out[f] = []; }
    }
    if (!Array.isArray(out[f])) out[f] = [];
  }
  return out;
}

// ── GET /api/resources ───────────────────────────────────────

router.get('/', (req, res, next) => {
  try {
    const { type, topic, search, status, limit = 100, offset = 0 } = req.query;

    let sql = `
      SELECT id, user_id, url, title, source, source_type, creator_name, author_name,
             thumbnail, description, ai_summary, ai_key_takeaways,
             duration_seconds, reading_time_minutes, page_count,
             status, progress, added_at, completed_at, updated_at
      FROM resources
      WHERE user_id = ? AND deleted_at IS NULL
    `;
    const params = [USER_ID];

    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (type && type !== 'all') { sql += ' AND source_type = ?'; params.push(type); }

    sql += ' ORDER BY added_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    let rows = all(sql, params).map(parseResource);
    rows = withTopicsBulk(rows);

    // Topic filter (done in JS after join to avoid complex SQL)
    if (topic && topic !== 'all') {
      rows = rows.filter(r => r.topics.includes(topic));
    }

    // Search filter
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        (r.creator_name || '').toLowerCase().includes(q) ||
        (r.author_name || '').toLowerCase().includes(q) ||
        (r.ai_summary || '').toLowerCase().includes(q) ||
        r.topics.some(t => t.toLowerCase().includes(q))
      );
    }

    const total = get(
      'SELECT COUNT(*) as n FROM resources WHERE user_id = ? AND deleted_at IS NULL',
      [USER_ID]
    ).n;

    res.json({ data: rows, total });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/resources/:id ───────────────────────────────────

router.get('/:id', (req, res, next) => {
  try {
    const row = get(
      `SELECT id, user_id, url, title, source, source_type, creator_name, author_name,
              thumbnail, description, ai_summary, ai_key_takeaways,
              duration_seconds, reading_time_minutes, page_count,
              status, progress, added_at, completed_at, updated_at
       FROM resources WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [req.params.id, USER_ID]
    );
    if (!row) return next(createError(404, 'Resource not found'));

    const resource = withTopics(parseResource(row));

    // Related resources: same topics, not the same resource
    const related = [];
    if (resource.topics.length > 0) {
      const placeholders = resource.topics.map(() => '?').join(',');
      const relatedRows = all(
        `SELECT DISTINCT r.id, r.title, r.source_type, r.creator_name, r.ai_summary,
                r.duration_seconds, r.reading_time_minutes, r.added_at
         FROM resources r
         JOIN resource_topics rt ON rt.resource_id = r.id
         JOIN topics t ON t.id = rt.topic_id
         WHERE t.name IN (${placeholders})
           AND r.id != ?
           AND r.user_id = ?
           AND r.deleted_at IS NULL
           AND r.status = 'ready'
         LIMIT 4`,
        [...resource.topics, req.params.id, USER_ID]
      );
      related.push(...withTopicsBulk(relatedRows.map(parseResource)));
    }

    res.json({ data: { ...resource, related } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/resources ──────────────────────────────────────

router.post('/', async (req, res, next) => {
  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    return next(createError(400, 'url is required'));
  }

  // Validate URL
  let cleanUrl;
  try {
    cleanUrl = new URL(url.trim()).href;
  } catch {
    return next(createError(400, 'Invalid URL — paste a full link including https://'));
  }

  // Check for duplicate
  const existing = get(
    'SELECT id, status, title, source_type FROM resources WHERE url = ? AND user_id = ? AND deleted_at IS NULL',
    [cleanUrl, USER_ID]
  );
  if (existing) {
    return res.status(200).json({ data: withTopics(parseResource(get(
      `SELECT id, user_id, url, title, source, source_type, creator_name, author_name,
              thumbnail, description, ai_summary, ai_key_takeaways,
              duration_seconds, reading_time_minutes, page_count,
              status, progress, added_at, completed_at, updated_at
       FROM resources WHERE id = ? AND user_id = ?`,
      [existing.id, USER_ID]
    ))), duplicate: true });
  }

  // Detect source type
  const sourceType = detectSourceType(cleanUrl);
  if (!sourceType) {
    return next(createError(400, 'Unsupported URL — try YouTube, Medium, Substack, an article, or a PDF'));
  }

  // Create record
  const id = newId();
  run(
    `INSERT INTO resources (id, user_id, url, source_type, status, added_at, updated_at)
     VALUES (?, ?, ?, ?, 'processing', datetime('now'), datetime('now'))`,
    [id, USER_ID, cleanUrl, sourceType]
  );

  // Create initial 'added' activity event
  run(
    `INSERT INTO learning_activities (id, resource_id, user_id, event_type, timestamp)
     VALUES (?, ?, ?, 'added', datetime('now'))`,
    [newId(), id, USER_ID]
  );

  // Respond immediately — processing happens in background
  res.status(202).json({ data: { id, status: 'processing', source_type: sourceType } });

  // Background processing (fire and forget)
  processResourceBackground(id, cleanUrl, sourceType).catch(err => {
    console.error(`[processing] Resource ${id} failed fatally:`, err.message);
    try {
      run(
        `UPDATE resources SET status = 'failed', updated_at = datetime('now') WHERE id = ?`,
        [id]
      );
    } catch {}
  });
});

// ── PATCH /api/resources/:id/progress ────────────────────────

router.patch('/:id/progress', (req, res, next) => {
  try {
    const { progress, duration_seconds = 0 } = req.body || {};
    if (progress === undefined) return next(createError(400, 'progress is required'));

    const pct = Math.min(100, Math.max(0, parseInt(progress)));
    const dur = Math.max(0, parseInt(duration_seconds) || 0);

    const resource = get(
      'SELECT id, status FROM resources WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [req.params.id, USER_ID]
    );
    if (!resource) return next(createError(404, 'Resource not found'));

    run(
      `UPDATE resources SET progress = ?, updated_at = datetime('now') WHERE id = ?`,
      [pct, req.params.id]
    );

    // Determine event type
    const eventType = pct === 0 ? 'opened' : pct < 100 ? 'progressed' : 'completed';
    run(
      `INSERT INTO learning_activities
         (id, resource_id, user_id, event_type, duration_seconds, progress_percentage, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [newId(), req.params.id, USER_ID, eventType, dur, pct]
    );

    res.json({ data: { id: req.params.id, progress: pct } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/resources/:id/complete ─────────────────────────

router.post('/:id/complete', (req, res, next) => {
  try {
    const resource = get(
      'SELECT id, progress FROM resources WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [req.params.id, USER_ID]
    );
    if (!resource) return next(createError(404, 'Resource not found'));

    run(
      `UPDATE resources
       SET progress = 100, completed_at = datetime('now'), updated_at = datetime('now'),
           status = CASE WHEN status = 'processing' THEN 'ready' ELSE status END
       WHERE id = ?`,
      [req.params.id]
    );

    run(
      `INSERT INTO learning_activities
         (id, resource_id, user_id, event_type, progress_percentage, timestamp)
       VALUES (?, ?, ?, 'completed', 100, datetime('now'))`,
      [newId(), req.params.id, USER_ID]
    );

    res.json({ data: { id: req.params.id, progress: 100, completed: true } });

    // Rebuild profile after completion (fire and forget)
    rebuildProfile().catch(err => console.error('[profile] Post-complete rebuild failed:', err.message));
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/resources/:id ─────────────────────────────────

router.delete('/:id', (req, res, next) => {
  try {
    const resource = get(
      'SELECT id FROM resources WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [req.params.id, USER_ID]
    );
    if (!resource) return next(createError(404, 'Resource not found'));

    transaction(() => {
      // Soft delete the resource
      run(
        `UPDATE resources SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
        [req.params.id]
      );
      // Dismiss any recommendations that were for this URL
      const r = get('SELECT url FROM resources WHERE id = ?', [req.params.id]);
      if (r?.url) {
        run(
          `UPDATE recommendations SET dismissed_at = datetime('now')
           WHERE user_id = ? AND url = ? AND dismissed_at IS NULL`,
          [USER_ID, r.url]
        );
      }
    });

    res.json({ data: { id: req.params.id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

// ── Background processing pipeline ───────────────────────────

async function processResourceBackground(id, url, sourceType) {
  console.log(`[processing] Starting: ${id} (${sourceType})`);

  // Step 1: Extract content
  let extracted;
  try {
    extracted = await extractContent(url, sourceType);
    console.log(`[processing] Extracted content for ${id} — ${(extracted.content_text || extracted.transcript || '').length} chars`);
  } catch (err) {
    console.error(`[processing] Extraction error for ${id}:`, err.message);
    extracted = { url, source_type: sourceType };
  }

  // Step 2: Save extracted metadata (title, creator, etc.) immediately
  // so even if AI fails, we have something useful
  saveExtractedMetadata(id, extracted);

  // Step 3: Get user profile for personalised summary
  let userProfile = {};
  try {
    const profileRow = get('SELECT interests FROM profiles WHERE user_id = ?', [USER_ID]);
    if (profileRow?.interests) {
      userProfile.interests = typeof profileRow.interests === 'string'
        ? JSON.parse(profileRow.interests)
        : profileRow.interests;
    }
  } catch {}

  // Step 4: AI processing
  let aiData = null;
  try {
    aiData = await processWithAI(extracted, userProfile);
    if (aiData) console.log(`[processing] AI complete for ${id}: "${aiData.title || '—'}"`);
  } catch (err) {
    console.error(`[processing] AI error for ${id}:`, err.message);
  }

  // Step 5: Merge AI data into resource
  transaction(() => {
    if (aiData) {
      run(
        `UPDATE resources SET
          title                = COALESCE(?, title),
          creator_name         = COALESCE(?, creator_name),
          author_name          = COALESCE(?, author_name),
          source               = COALESCE(?, source),
          ai_summary           = ?,
          ai_key_takeaways     = ?,
          duration_seconds     = COALESCE(?, duration_seconds),
          reading_time_minutes = COALESCE(?, reading_time_minutes),
          status               = 'ready',
          updated_at           = datetime('now')
        WHERE id = ?`,
        [
          aiData.title || null,
          aiData.creator_name || null,
          aiData.author_name || null,
          aiData.source || null,
          aiData.ai_summary || null,
          JSON.stringify(aiData.ai_key_takeaways || []),
          aiData.duration_seconds || null,
          aiData.reading_time_minutes || null,
          id,
        ]
      );

      // Save topics
      if (aiData.topics && aiData.topics.length > 0) {
        saveTopics(id, aiData.topics);
      }
    } else {
      // No AI — just mark ready
      run(
        `UPDATE resources SET status = 'ready', updated_at = datetime('now') WHERE id = ?`,
        [id]
      );
    }
  });

  console.log(`[processing] Done: ${id}`);

  // Rebuild learning profile in background after every processed resource
  rebuildProfile().catch(err => console.error('[profile] Background rebuild failed:', err.message));
}

function saveExtractedMetadata(id, extracted) {
  run(
    `UPDATE resources SET
      title                = COALESCE(?, title),
      creator_name         = COALESCE(?, creator_name),
      author_name          = COALESCE(?, author_name),
      source               = COALESCE(?, source),
      description          = COALESCE(?, description),
      thumbnail            = COALESCE(?, thumbnail),
      duration_seconds     = COALESCE(?, duration_seconds),
      reading_time_minutes = COALESCE(?, reading_time_minutes),
      page_count           = COALESCE(?, page_count),
      content_text         = COALESCE(?, content_text),
      transcript           = COALESCE(?, transcript),
      updated_at           = datetime('now')
    WHERE id = ?`,
    [
      extracted.title        || null,
      extracted.creator_name || null,
      extracted.author_name  || null,
      extracted.source       || null,
      extracted.description  || null,
      extracted.thumbnail    || null,
      extracted.duration_seconds     || null,
      extracted.reading_time_minutes || null,
      extracted.page_count   || null,
      extracted.content_text || null,
      extracted.transcript   || null,
      id,
    ]
  );
}

function saveTopics(resourceId, topicNames) {
  for (const name of topicNames) {
    // Get or create topic
    let topic = get('SELECT id FROM topics WHERE name = ? COLLATE NOCASE', [name]);
    if (!topic) {
      const topicId = newId();
      try {
        run('INSERT OR IGNORE INTO topics (id, name) VALUES (?, ?)', [topicId, name]);
        topic = { id: topicId };
      } catch {
        topic = get('SELECT id FROM topics WHERE name = ? COLLATE NOCASE', [name]);
      }
    }
    if (topic) {
      run(
        'INSERT OR IGNORE INTO resource_topics (resource_id, topic_id) VALUES (?, ?)',
        [resourceId, topic.id]
      );
    }
  }
}

export default router;
