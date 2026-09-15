import { Router } from 'express';
import { get, all } from '../db/db.js';

const router = Router();
const USER_ID = 'user_default';

// ── Helpers ──────────────────────────────────────────────────

/** Generate the last N calendar dates as YYYY-MM-DD strings (today first) */
function lastNDates(n) {
  const dates = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates; // [today, yesterday, ...]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── GET /api/analytics ───────────────────────────────────────

router.get('/', (_req, res, next) => {
  try {
    // Resource counts
    const totalResources = get(
      `SELECT COUNT(*) as n FROM resources WHERE user_id = ? AND deleted_at IS NULL AND status = 'ready'`,
      [USER_ID]
    )?.n ?? 0;

    const completedResources = get(
      `SELECT COUNT(*) as n FROM resources
       WHERE user_id = ? AND deleted_at IS NULL AND completed_at IS NOT NULL`,
      [USER_ID]
    )?.n ?? 0;

    const inProgressResources = get(
      `SELECT COUNT(*) as n FROM resources
       WHERE user_id = ? AND deleted_at IS NULL AND progress > 0 AND progress < 100`,
      [USER_ID]
    )?.n ?? 0;

    // Learning time totals
    const totalSeconds = get(
      `SELECT COALESCE(SUM(duration_seconds), 0) as s
       FROM learning_activities WHERE user_id = ?`,
      [USER_ID]
    )?.s ?? 0;

    const todaySeconds = get(
      `SELECT COALESCE(SUM(duration_seconds), 0) as s
       FROM learning_activities
       WHERE user_id = ? AND date(timestamp) = date('now')`,
      [USER_ID]
    )?.s ?? 0;

    // Learning time: only count actual consumption events with recorded duration.
    // 'added' and 'opened' events carry no real time — exclude them.
    const CONSUMPTION_EVENTS = "'started','progressed','completed'";

    const weekSeconds = get(
      `SELECT COALESCE(SUM(duration_seconds), 0) as s
       FROM learning_activities
       WHERE user_id = ?
         AND event_type IN (${CONSUMPTION_EVENTS})
         AND duration_seconds > 0
         AND timestamp >= datetime('now', '-7 days')`,
      [USER_ID]
    )?.s ?? 0;

    const monthSeconds = get(
      `SELECT COALESCE(SUM(duration_seconds), 0) as s
       FROM learning_activities
       WHERE user_id = ?
         AND event_type IN (${CONSUMPTION_EVENTS})
         AND duration_seconds > 0
         AND timestamp >= datetime('now', '-30 days')`,
      [USER_ID]
    )?.s ?? 0;

    // Resources added this week
    const resourcesAddedWeek = get(
      `SELECT COUNT(*) as n FROM resources
       WHERE user_id = ? AND deleted_at IS NULL AND added_at >= datetime('now', '-7 days')`,
      [USER_ID]
    )?.n ?? 0;

    // Resources actively explored this week (opened, started, progressed, or completed)
    const resourcesExploredWeek = get(
      `SELECT COUNT(DISTINCT resource_id) as n
       FROM learning_activities
       WHERE user_id = ?
         AND event_type IN ('opened','started','progressed','completed')
         AND resource_id IS NOT NULL
         AND timestamp >= datetime('now', '-7 days')`,
      [USER_ID]
    )?.n ?? 0;

    res.json({
      data: {
        total_resources:        totalResources,
        completed_resources:    completedResources,
        in_progress_resources:  inProgressResources,
        total_seconds:          totalSeconds,
        today_seconds:          todaySeconds,
        week_seconds:           weekSeconds,
        month_seconds:          monthSeconds,
        resources_added_week:   resourcesAddedWeek,
        resources_explored_week: resourcesExploredWeek,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/analytics/weekly ────────────────────────────────
// Returns per-day learning seconds for the last 7 days

router.get('/weekly', (_req, res, next) => {
  try {
    // Only sum real consumption time — same rule as the summary endpoint.
    const rows = all(
      `SELECT date(timestamp) as day, COALESCE(SUM(duration_seconds), 0) as seconds
       FROM learning_activities
       WHERE user_id = ?
         AND event_type IN ('started','progressed','completed')
         AND duration_seconds > 0
         AND timestamp >= datetime('now', '-6 days', 'start of day')
       GROUP BY date(timestamp)`,
      [USER_ID]
    );

    // Build a map for fast lookup
    const byDay = {};
    for (const r of rows) byDay[r.day] = r.seconds;

    // Generate all 7 days (oldest → newest)
    const dates = lastNDates(7).reverse(); // oldest first
    const data = dates.map(dateStr => {
      const d = new Date(dateStr + 'T12:00:00Z');
      return {
        date:    dateStr,
        day:     DAY_NAMES[d.getUTCDay()],
        seconds: byDay[dateStr] ?? 0,
      };
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/analytics/topics ────────────────────────────────
// Topic distribution + growth signals

router.get('/topics', (_req, res, next) => {
  try {
    // All-time topic activity: how many distinct resources touched per topic
    const allTime = all(
      `SELECT t.name, COUNT(DISTINCT r.id) as count
       FROM resources r
       JOIN resource_topics rt ON rt.resource_id = r.id
       JOIN topics t ON t.id = rt.topic_id
       WHERE r.user_id = ? AND r.deleted_at IS NULL
       GROUP BY t.name
       ORDER BY count DESC`,
      [USER_ID]
    );

    if (allTime.length === 0) {
      return res.json({ data: [], insight: null });
    }

    const total = allTime.reduce((s, r) => s + r.count, 0);

    // Recent (last 14 days) topic activity
    const recent = all(
      `SELECT t.name, COUNT(DISTINCT la.resource_id) as count
       FROM learning_activities la
       JOIN resource_topics rt ON rt.resource_id = la.resource_id
       JOIN topics t ON t.id = rt.topic_id
       WHERE la.user_id = ? AND la.timestamp >= datetime('now', '-14 days')
       GROUP BY t.name`,
      [USER_ID]
    );

    // Previous period (14-30 days ago)
    const prev = all(
      `SELECT t.name, COUNT(DISTINCT la.resource_id) as count
       FROM learning_activities la
       JOIN resource_topics rt ON rt.resource_id = la.resource_id
       JOIN topics t ON t.id = rt.topic_id
       WHERE la.user_id = ?
         AND la.timestamp >= datetime('now', '-30 days')
         AND la.timestamp <  datetime('now', '-14 days')
       GROUP BY t.name`,
      [USER_ID]
    );

    const recentMap = {};
    for (const r of recent) recentMap[r.name] = r.count;
    const prevMap = {};
    for (const r of prev) prevMap[r.name] = r.count;

    // Build result with growth signal
    const data = allTime.map(r => {
      const recentCount = recentMap[r.name] ?? 0;
      const prevCount   = prevMap[r.name]   ?? 0;
      const delta = recentCount - prevCount;
      const trend = delta > 0 ? 'growing'
                  : delta < 0 ? 'cooling'
                  : recentCount > 0 ? 'steady'
                  : 'inactive';

      return {
        topic:      r.name,
        count:      r.count,
        percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
        recent_count: recentCount,
        trend,
      };
    });

    // Generate an insight sentence from the data
    const insight = generateInsight(data, recentMap, prevMap);

    res.json({ data, insight });
  } catch (err) {
    next(err);
  }
});

// ── Insight generation ───────────────────────────────────────

function generateInsight(topicData, recentMap, prevMap) {
  // Find the topic with the biggest recent growth
  let maxDelta = 0;
  let growingTopic = null;

  for (const t of topicData) {
    const recent = recentMap[t.topic] ?? 0;
    const prev   = prevMap[t.topic]   ?? 0;
    const delta  = recent - prev;
    if (delta > maxDelta) {
      maxDelta = delta;
      growingTopic = t.topic;
    }
  }

  // Find dominant all-time topic
  const dominant = topicData[0];

  // Find a topic that only recently appeared (no previous activity)
  const emerging = topicData.find(
    t => (recentMap[t.topic] ?? 0) > 0 && (prevMap[t.topic] ?? 0) === 0 && t.count <= 2
  );

  if (growingTopic && maxDelta >= 1) {
    return `Your recent learning is increasingly moving toward ${growingTopic}.`;
  }
  if (emerging) {
    return `${emerging.topic} is appearing in your recent learning for the first time.`;
  }
  if (dominant && dominant.percentage >= 40) {
    return `${dominant.topic} accounts for ${dominant.percentage}% of your library — your strongest area.`;
  }
  if (topicData.length > 0) {
    const top2 = topicData.slice(0, 2).map(t => t.topic).join(' and ');
    return `Your learning spans ${topicData.length} topics — ${top2} are the most active.`;
  }
  return null;
}

export default router;
