/**
 * Learning Profile Service
 * Rebuilds the user's learning profile from real activity and resource data.
 * Called after resource processing completes, after mark-complete, and on demand.
 */

import { get, all, run } from '../db/db.js';

const USER_ID = 'user_default';

export async function rebuildProfile() {
  try {
    // ── 1. All resources with topics (not deleted) ─────────────────
    const resources = all(
      `SELECT r.id, r.source_type, r.completed_at, r.progress, r.added_at
       FROM resources r
       WHERE r.user_id = ? AND r.deleted_at IS NULL AND r.status = 'ready'`,
      [USER_ID]
    );

    if (resources.length === 0) return; // nothing to compute

    const resourceIds = resources.map(r => r.id);
    const placeholders = resourceIds.map(() => '?').join(',');

    // ── 2. Topics per resource ─────────────────────────────────────
    const topicRows = all(
      `SELECT rt.resource_id, t.name
       FROM resource_topics rt JOIN topics t ON t.id = rt.topic_id
       WHERE rt.resource_id IN (${placeholders})`,
      resourceIds
    );

    const topicsByResource = {};
    for (const row of topicRows) {
      if (!topicsByResource[row.resource_id]) topicsByResource[row.resource_id] = [];
      topicsByResource[row.resource_id].push(row.name);
    }

    // ── 3. Topic strength ──────────────────────────────────────────
    // Score: completed=3, progress>0=1.5, added=0.5
    const topicScores = {};
    for (const r of resources) {
      const topics = topicsByResource[r.id] || [];
      const weight = r.completed_at ? 3 : (r.progress > 0 ? 1.5 : 0.5);
      for (const t of topics) {
        topicScores[t] = (topicScores[t] || 0) + weight;
      }
    }

    // Normalize to 0–1 (max score = 1.0)
    const maxScore = Math.max(...Object.values(topicScores), 1);
    const topic_strength = {};
    for (const [t, s] of Object.entries(topicScores)) {
      topic_strength[t] = Math.round((s / maxScore) * 100) / 100;
    }

    // ── 4. Preferred content types ─────────────────────────────────
    const typeCount = {};
    const typeComplete = {};
    for (const r of resources) {
      const t = r.source_type || 'article';
      typeCount[t] = (typeCount[t] || 0) + 1;
      if (r.completed_at) typeComplete[t] = (typeComplete[t] || 0) + 1;
    }
    // Score = completion_rate weighted by volume
    const preferred_content_types = {};
    for (const [t, count] of Object.entries(typeCount)) {
      const completionRate = (typeComplete[t] || 0) / count;
      preferred_content_types[t] = Math.round(completionRate * 100) / 100;
    }

    // ── 5. Emerging interests ─────────────────────────────────────
    // Topics growing in the last 14 days vs previous 14 days
    const recentTopics = all(
      `SELECT t.name, COUNT(DISTINCT r.id) as cnt
       FROM resources r
       JOIN resource_topics rt ON rt.resource_id = r.id
       JOIN topics t ON t.id = rt.topic_id
       WHERE r.user_id = ? AND r.deleted_at IS NULL
         AND r.added_at >= datetime('now', '-14 days')
       GROUP BY t.name`,
      [USER_ID]
    );
    const prevTopics = all(
      `SELECT t.name, COUNT(DISTINCT r.id) as cnt
       FROM resources r
       JOIN resource_topics rt ON rt.resource_id = r.id
       JOIN topics t ON t.id = rt.topic_id
       WHERE r.user_id = ? AND r.deleted_at IS NULL
         AND r.added_at >= datetime('now', '-28 days')
         AND r.added_at <  datetime('now', '-14 days')
       GROUP BY t.name`,
      [USER_ID]
    );

    const recentMap = Object.fromEntries(recentTopics.map(r => [r.name, r.cnt]));
    const prevMap   = Object.fromEntries(prevTopics.map(r => [r.name, r.cnt]));
    const emerging_interests = Object.entries(recentMap)
      .filter(([name, cnt]) => cnt > (prevMap[name] || 0))
      .sort((a, b) => (b[1] - (prevMap[b[0]] || 0)) - (a[1] - (prevMap[a[0]] || 0)))
      .slice(0, 5)
      .map(([name]) => name);

    // ── 6. Knowledge gaps ─────────────────────────────────────────
    // Get user's stated interests from profile
    const profileRow = get('SELECT interests FROM profiles WHERE user_id = ?', [USER_ID]);
    let interests = [];
    try { interests = JSON.parse(profileRow?.interests || '[]'); } catch {}

    const coveredTopics = new Set(Object.keys(topicScores));
    const knowledge_gaps = interests
      .filter(i => !coveredTopics.has(i) || (topic_strength[i] || 0) < 0.2)
      .slice(0, 8);

    // Also add topics from active goals that have no linked resources
    const goalRows = all(
      `SELECT areas FROM goals WHERE user_id = ? AND status = 'active'`,
      [USER_ID]
    );
    for (const g of goalRows) {
      let areas = [];
      try { areas = JSON.parse(g.areas || '[]'); } catch {}
      for (const a of areas) {
        if (!coveredTopics.has(a) && !knowledge_gaps.includes(a)) {
          knowledge_gaps.push(a);
        }
      }
    }

    // ── 7. Learning frequency ─────────────────────────────────────
    const thirtyDaySecs = get(
      `SELECT COALESCE(SUM(duration_seconds),0) as s
       FROM learning_activities
       WHERE user_id = ? AND timestamp >= datetime('now', '-30 days')`,
      [USER_ID]
    )?.s ?? 0;

    const sevenDaySecs = get(
      `SELECT COALESCE(SUM(duration_seconds),0) as s
       FROM learning_activities
       WHERE user_id = ? AND timestamp >= datetime('now', '-7 days')`,
      [USER_ID]
    )?.s ?? 0;

    // Active days in last 30 days
    const activeDays = get(
      `SELECT COUNT(DISTINCT date(timestamp)) as n
       FROM learning_activities
       WHERE user_id = ? AND timestamp >= datetime('now', '-30 days')
         AND duration_seconds > 0`,
      [USER_ID]
    )?.n ?? 0;

    const learning_frequency = {
      daily_avg_mins:   Math.round(thirtyDaySecs / 30 / 60),
      weekly_avg_mins:  Math.round(sevenDaySecs / 7 / 60),
      active_days_30d:  activeDays,
    };

    // ── 8. Top interests (derived from topic strength) ─────────────
    const top_interests = Object.entries(topic_strength)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name]) => name);

    // ── 9. Write profile ───────────────────────────────────────────
    run(
      `UPDATE profiles SET
        topic_strength          = ?,
        knowledge_gaps          = ?,
        emerging_interests      = ?,
        preferred_content_types = ?,
        learning_frequency      = ?,
        interests               = ?,
        updated_at              = datetime('now')
       WHERE user_id = ?`,
      [
        JSON.stringify(topic_strength),
        JSON.stringify([...new Set(knowledge_gaps)].slice(0, 10)),
        JSON.stringify(emerging_interests),
        JSON.stringify(preferred_content_types),
        JSON.stringify(learning_frequency),
        JSON.stringify(top_interests.length ? top_interests : interests),
        USER_ID,
      ]
    );

    console.log(`[profile] Rebuilt — ${Object.keys(topic_strength).length} topics, ${knowledge_gaps.length} gaps, ${emerging_interests.length} emerging`);
  } catch (err) {
    console.error('[profile] Rebuild failed:', err.message);
  }
}
