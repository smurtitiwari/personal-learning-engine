/**
 * POST /api/ask
 *
 * Answers questions grounded in the user's actual library, goals,
 * activity history and learning profile. Uses Claude when an API key
 * is configured; falls back to pattern-matching when it is not.
 */

import { Router } from 'express';
import { get, all } from '../db/db.js';
import { createError } from '../middleware/error.js';
import Anthropic from '@anthropic-ai/sdk';

const router = Router();
const USER_ID = 'user_default';

// ── Build context from DB ─────────────────────────────────────

function buildContext() {
  // Profile
  const profileRow = get('SELECT * FROM profiles WHERE user_id = ?', [USER_ID]);
  const topicStrength = safeJson(profileRow?.topic_strength, {});
  const knowledgeGaps = safeJson(profileRow?.knowledge_gaps, []);
  const emergingInterests = safeJson(profileRow?.emerging_interests, []);
  const learningFrequency = safeJson(profileRow?.learning_frequency, {});
  const interests = safeJson(profileRow?.interests, []);

  // Resources (recent 20 for context)
  const resources = all(
    `SELECT r.id, r.title, r.source_type, r.creator_name, r.author_name,
            r.ai_summary, r.progress, r.completed_at, r.added_at, r.status,
            r.duration_seconds, r.reading_time_minutes
     FROM resources r
     WHERE r.user_id = ? AND r.deleted_at IS NULL AND r.status = 'ready'
     ORDER BY r.added_at DESC LIMIT 20`,
    [USER_ID]
  );

  // Topics per resource
  const resIds = resources.map(r => r.id);
  const topicMap = {};
  if (resIds.length > 0) {
    const phs = resIds.map(() => '?').join(',');
    const topicRows = all(
      `SELECT rt.resource_id, t.name FROM resource_topics rt
       JOIN topics t ON t.id = rt.topic_id
       WHERE rt.resource_id IN (${phs})`,
      resIds
    );
    for (const row of topicRows) {
      if (!topicMap[row.resource_id]) topicMap[row.resource_id] = [];
      topicMap[row.resource_id].push(row.name);
    }
  }
  const resourcesWithTopics = resources.map(r => ({ ...r, topics: topicMap[r.id] || [] }));

  // Goals
  const goalRows = all(
    `SELECT id, title, reason, areas, status FROM goals WHERE user_id = ? AND status = 'active'`,
    [USER_ID]
  );
  const goals = goalRows.map(g => ({
    title: g.title,
    reason: g.reason,
    areas: safeJson(g.areas, []),
  }));

  // Recent activity (last 7 days)
  const recentActivity = all(
    `SELECT la.event_type, la.duration_seconds, la.timestamp, r.title
     FROM learning_activities la
     LEFT JOIN resources r ON r.id = la.resource_id
     WHERE la.user_id = ? AND la.timestamp >= datetime('now', '-7 days')
     ORDER BY la.timestamp DESC LIMIT 10`,
    [USER_ID]
  );

  // Trends
  const trends = all(
    `SELECT topic, description FROM trends WHERE is_active = 1 ORDER BY momentum DESC LIMIT 4`,
    []
  );

  // Summary stats
  const stats = {
    totalResources: resources.length,
    completed: resources.filter(r => r.completed_at).length,
    inProgress: resources.filter(r => r.progress > 0 && !r.completed_at).length,
    topTopics: Object.entries(topicStrength)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => t),
    learningFrequency,
    interests,
  };

  return {
    profile: { topicStrength, knowledgeGaps, emergingInterests, interests },
    resources: resourcesWithTopics,
    goals,
    recentActivity,
    trends,
    stats,
  };
}

function safeJson(val, fallback) {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return val ?? fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

// ── Build the system prompt ───────────────────────────────────

function buildSystemPrompt(ctx) {
  const { resources, goals, stats, profile, trends, recentActivity } = ctx;

  const resourceList = resources.slice(0, 15).map(r => {
    const status = r.completed_at ? 'completed' : r.progress > 0 ? `${r.progress}% done` : 'not started';
    const by = r.creator_name || r.author_name || '';
    const topics = r.topics.join(', ') || 'no topics';
    const mins = r.duration_seconds
      ? Math.round(r.duration_seconds / 60)
      : (r.reading_time_minutes || 0);
    return `- "${r.title}"${by ? ` by ${by}` : ''} [${r.source_type}, ${mins > 0 ? mins + ' min, ' : ''}${status}] — topics: ${topics}`;
  }).join('\n');

  const goalList = goals.map(g => {
    const areas = g.areas.join(', ');
    return `- "${g.title}"${g.reason ? ` (${g.reason})` : ''} — areas: ${areas}`;
  }).join('\n') || 'No active goals.';

  const topicsStr = stats.topTopics.join(', ') || 'none yet';
  const gapStr = profile.knowledgeGaps.slice(0, 5).join(', ') || 'none identified';
  const emergingStr = profile.emergingInterests.slice(0, 3).join(', ') || 'none detected';

  const freq = profile.learningFrequency?.learningFrequency || stats.learningFrequency;
  const freqStr = freq?.daily_avg_mins !== undefined
    ? `~${freq.daily_avg_mins} min/day average, ${freq.active_days_30d} active days in the last 30`
    : 'not enough data yet';

  const trendsStr = trends.map(t => `${t.topic}: ${t.description}`).join('\n') || 'none';

  const recentStr = recentActivity.length > 0
    ? recentActivity.slice(0, 5).map(a =>
        `${a.event_type}${a.title ? ` "${a.title}"` : ''}${a.duration_seconds > 60 ? ` (${Math.round(a.duration_seconds / 60)}m)` : ''}`
      ).join(', ')
    : 'no activity in the last 7 days';

  return `You are a personal learning companion for a single user. Answer questions grounded ONLY in what is described below — their actual library, goals, and learning activity. Do not reference the wider internet or external knowledge. Be direct, specific, and concise (2–4 sentences max unless the user asks for more).

LIBRARY (${stats.totalResources} resources, ${stats.completed} completed, ${stats.inProgress} in progress):
${resourceList || '(empty)'}

TOP TOPICS: ${topicsStr}
KNOWLEDGE GAPS (low coverage): ${gapStr}
EMERGING INTERESTS (recently growing): ${emergingStr}
LEARNING FREQUENCY: ${freqStr}

ACTIVE GOALS:
${goalList}

RECENT ACTIVITY (last 7 days): ${recentStr}

TRENDS IN THEIR FIELD:
${trendsStr}

Rules:
- Never make up resources not in the list above
- When the user asks what to learn next, reference specific resources from their library or identified gaps
- Keep answers tightly grounded in their actual data
- If you cannot answer from the data, say so honestly`;
}

// ── Pattern-match fallback ────────────────────────────────────

function fallbackAnswer(question, ctx) {
  const { stats, profile, goals } = ctx;
  const s = question.toLowerCase();
  const topTopics = stats.topTopics;
  const gaps = profile.knowledgeGaps.slice(0, 3);
  const goalTitles = goals.map(g => g.title);

  if (/recent|been learning/.test(s)) {
    const total = stats.totalResources;
    return total > 0
      ? `You've saved ${total} resources. Your most active topics are ${topTopics.slice(0, 3).join(', ')}.`
      : "You haven't saved any resources yet — add a YouTube video, article, or PDF to get started.";
  }
  if (/focus/.test(s)) {
    const gap = gaps[0] || topTopics[0];
    return gap
      ? `Based on your library, ${gap} is where you have the most to gain right now.`
      : 'Add a few resources to get a personalised focus recommendation.';
  }
  if (/learn next/.test(s)) {
    return gaps.length > 0
      ? `Consider exploring ${gaps[0]} — it's an area you've touched on but haven't gone deep in yet.`
      : 'Your library is still growing — add more resources for better recommendations.';
  }
  if (/gap|not explored/.test(s)) {
    return gaps.length > 0
      ? `Your lightest areas are: ${gaps.join(', ')}.`
      : 'No clear gaps yet — your coverage looks balanced.';
  }
  if (/goal|connect/.test(s)) {
    return goalTitles.length > 0
      ? `Your active goal${goalTitles.length > 1 ? 's' : ''}: ${goalTitles.join('; ')}.`
      : 'No active goals — create one in the Goals tab to track a learning direction.';
  }
  return 'I answer from your library, your goals and your activity. Ask about what you\'ve been learning, what to focus on next, or your knowledge gaps.';
}

// ── Route ─────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  try {
    const { question, messages, resource } = req.body || {};

    // Support both old { question } and new { messages } formats
    let msgArray;
    if (messages && Array.isArray(messages) && messages.length > 0) {
      msgArray = messages;
    } else if (question && question.trim()) {
      msgArray = [{ role: 'user', content: question.trim() }];
    } else {
      return next(createError(400, 'question or messages is required'));
    }

    // Extract the last user message for fallback
    const lastUserMsg = [...msgArray].reverse().find(m => m.role === 'user');
    const lastQuestion = lastUserMsg ? lastUserMsg.content : '';

    const ctx = buildContext();

    // Try Claude if API key is set
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        const client = new Anthropic({ apiKey });
        let systemPrompt = buildSystemPrompt(ctx);

        // Append resource context if provided
        if (resource && resource.title) {
          const resourceLines = [
            `\nCURRENT RESOURCE CONTEXT (the user is asking about this specific resource):`,
            `Title: ${resource.title}`,
            resource.type ? `Type: ${resource.type}` : '',
            resource.by ? `By: ${resource.by}` : '',
            resource.summary ? `Summary: ${resource.summary}` : '',
            resource.url ? `URL: ${resource.url}` : '',
          ].filter(Boolean).join('\n');
          systemPrompt += resourceLines;
        }

        const message = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: msgArray.map(m => ({ role: m.role, content: m.content })),
        });

        const text = message.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n')
          .trim();

        return res.json({ data: { answer: text, source: 'ai' } });
      } catch (aiErr) {
        console.error('[ask] Claude error — falling back to pattern match:', aiErr.message);
      }
    }

    // Fallback
    const answer = fallbackAnswer(lastQuestion, ctx);
    res.json({ data: { answer, source: 'fallback' } });
  } catch (err) {
    next(err);
  }
});

export default router;
