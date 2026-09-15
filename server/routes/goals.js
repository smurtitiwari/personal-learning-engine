import { Router } from 'express';
import { get, all, run, transaction, newId } from '../db/db.js';
import { createError } from '../middleware/error.js';

const router = Router();
const USER_ID = 'user_default';

// ── Helpers ──────────────────────────────────────────────────

function parseGoal(g) {
  if (!g) return null;
  const out = { ...g };
  if (typeof out.areas === 'string') {
    try { out.areas = JSON.parse(out.areas); } catch { out.areas = []; }
  }
  if (!Array.isArray(out.areas)) out.areas = [];
  return out;
}

/** Attach topics to an array of resource rows (same helper pattern as resources route) */
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

function goalMetrics(goalId, areas) {
  const linked = all(
    `SELECT r.id, r.completed_at FROM resources r
     JOIN resource_goals rg ON rg.resource_id = r.id
     WHERE rg.goal_id = ? AND r.deleted_at IS NULL`,
    [goalId]
  );

  // Topic coverage: topics of linked resources that overlap goal areas
  const topicCoverage = {};
  if (linked.length > 0) {
    const ids = linked.map(r => r.id);
    const placeholders = ids.map(() => '?').join(',');
    const topicRows = all(
      `SELECT rt.resource_id, t.name FROM resource_topics rt
       JOIN topics t ON t.id = rt.topic_id
       WHERE rt.resource_id IN (${placeholders})`,
      ids
    );
    for (const r of topicRows) {
      topicCoverage[r.name] = (topicCoverage[r.name] || 0) + 1;
    }
  }

  // Learning time on linked resources
  const timeRow = linked.length > 0
    ? get(
        `SELECT COALESCE(SUM(duration_seconds),0) as secs
         FROM learning_activities la
         WHERE la.user_id = ? AND la.resource_id IN (${linked.map(()=>'?').join(',')})`,
        [USER_ID, ...linked.map(r => r.id)]
      )
    : null;

  // Knowledge gaps: areas with no linked resources covering them
  const coveredAreas = new Set(Object.keys(topicCoverage));
  const knowledgeGaps = (areas || []).filter(a => !coveredAreas.has(a));

  // Which area has fewest resources (focus suggestion)
  let focusArea = null;
  if (areas && areas.length > 0) {
    const sorted = [...areas].sort(
      (a, b) => (topicCoverage[a] || 0) - (topicCoverage[b] || 0)
    );
    focusArea = sorted[0];
  }

  return {
    resource_count:     linked.length,
    completed_count:    linked.filter(r => r.completed_at).length,
    learning_seconds:   timeRow?.secs ?? 0,
    topic_coverage:     topicCoverage,
    knowledge_gaps:     knowledgeGaps,
    focus_area:         focusArea,
  };
}

// ── GET /api/goals ───────────────────────────────────────────

router.get('/', (_req, res, next) => {
  try {
    const goals = all(
      `SELECT * FROM goals WHERE user_id = ? AND status != 'archived' ORDER BY created_at DESC`,
      [USER_ID]
    ).map(parseGoal);

    // Attach metrics to each goal for the list view
    const withMetrics = goals.map(g => ({
      ...g,
      ...goalMetrics(g.id, g.areas),
    }));

    res.json({ data: withMetrics });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/goals ──────────────────────────────────────────

router.post('/', (req, res, next) => {
  try {
    const { title, description, reason, areas = [] } = req.body || {};
    if (!title || !title.trim()) return next(createError(400, 'title is required'));

    const id = newId();
    run(
      `INSERT INTO goals (id, user_id, title, description, reason, areas, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`,
      [id, USER_ID, title.trim(), description || null, reason || null, JSON.stringify(areas)]
    );

    const goal = parseGoal(get('SELECT * FROM goals WHERE id = ?', [id]));
    res.status(201).json({ data: { ...goal, ...goalMetrics(id, goal.areas) } });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/goals/:id ───────────────────────────────────────

router.get('/:id', (req, res, next) => {
  try {
    const goal = parseGoal(
      get('SELECT * FROM goals WHERE id = ? AND user_id = ?', [req.params.id, USER_ID])
    );
    if (!goal) return next(createError(404, 'Goal not found'));

    // Linked resources with AI fields
    const linkedRows = all(
      `SELECT r.id, r.title, r.source_type, r.creator_name, r.author_name,
              r.ai_summary, r.ai_key_takeaways, r.progress, r.completed_at,
              r.duration_seconds, r.reading_time_minutes, r.page_count,
              r.url, r.added_at, r.status, rg.added_at as linked_at
       FROM resources r
       JOIN resource_goals rg ON rg.resource_id = r.id
       WHERE rg.goal_id = ? AND r.deleted_at IS NULL
       ORDER BY rg.added_at DESC`,
      [req.params.id]
    ).map(r => {
      if (typeof r.ai_key_takeaways === 'string') {
        try { r.ai_key_takeaways = JSON.parse(r.ai_key_takeaways); } catch { r.ai_key_takeaways = []; }
      }
      return r;
    });

    const linkedResources = withTopicsBulk(linkedRows);
    const metrics = goalMetrics(req.params.id, goal.areas);

    // Library resources not yet linked to this goal (for linking UI)
    const linkedIds = linkedResources.map(r => r.id);
    let availableResources = [];
    if (goal.areas && goal.areas.length > 0) {
      const placeholders = goal.areas.map(() => '?').join(',');
      const candidates = all(
        `SELECT DISTINCT r.id, r.title, r.source_type, r.creator_name, r.status
         FROM resources r
         JOIN resource_topics rt ON rt.resource_id = r.id
         JOIN topics t ON t.id = rt.topic_id
         WHERE t.name IN (${placeholders})
           AND r.user_id = ?
           AND r.deleted_at IS NULL
           AND r.status = 'ready'
         LIMIT 20`,
        [...goal.areas, USER_ID]
      );
      availableResources = candidates.filter(r => !linkedIds.includes(r.id));
    }

    res.json({
      data: {
        ...goal,
        ...metrics,
        resources: linkedResources,
        available_resources: availableResources,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/goals/:id ─────────────────────────────────────

router.patch('/:id', (req, res, next) => {
  try {
    const goal = get('SELECT id FROM goals WHERE id = ? AND user_id = ?', [req.params.id, USER_ID]);
    if (!goal) return next(createError(404, 'Goal not found'));

    const allowed = ['title', 'description', 'reason', 'areas', 'status'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = key === 'areas'
          ? JSON.stringify(req.body[key])
          : req.body[key];
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.json({ data: parseGoal(get('SELECT * FROM goals WHERE id = ?', [req.params.id])) });
    }
    updates.updated_at = new Date().toISOString();
    const cols = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    run(`UPDATE goals SET ${cols} WHERE id = ?`, [...Object.values(updates), req.params.id]);

    const updated = parseGoal(get('SELECT * FROM goals WHERE id = ?', [req.params.id]));
    res.json({ data: { ...updated, ...goalMetrics(req.params.id, updated.areas) } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/goals/:id ────────────────────────────────────

router.delete('/:id', (req, res, next) => {
  try {
    const goal = get('SELECT id FROM goals WHERE id = ? AND user_id = ?', [req.params.id, USER_ID]);
    if (!goal) return next(createError(404, 'Goal not found'));
    // resource_goals cascade via ON DELETE CASCADE
    run('DELETE FROM goals WHERE id = ?', [req.params.id]);
    res.json({ data: { id: req.params.id, deleted: true } });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/goals/:id/resources ────────────────────────────

router.post('/:id/resources', (req, res, next) => {
  try {
    const { resource_id } = req.body || {};
    if (!resource_id) return next(createError(400, 'resource_id is required'));

    const goal = get('SELECT id FROM goals WHERE id = ? AND user_id = ?', [req.params.id, USER_ID]);
    if (!goal) return next(createError(404, 'Goal not found'));

    const resource = get(
      'SELECT id FROM resources WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [resource_id, USER_ID]
    );
    if (!resource) return next(createError(404, 'Resource not found'));

    run(
      'INSERT OR IGNORE INTO resource_goals (resource_id, goal_id, added_at) VALUES (?, ?, datetime(\'now\'))',
      [resource_id, req.params.id]
    );

    res.status(201).json({ data: { goal_id: req.params.id, resource_id, linked: true } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/goals/:id/resources/:rid ─────────────────────

router.delete('/:id/resources/:rid', (req, res, next) => {
  try {
    run(
      'DELETE FROM resource_goals WHERE goal_id = ? AND resource_id = ?',
      [req.params.id, req.params.rid]
    );
    res.json({ data: { goal_id: req.params.id, resource_id: req.params.rid, unlinked: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
