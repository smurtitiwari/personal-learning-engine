/**
 * Recommendation Engine
 *
 * Scores a curated seed pool of content against the user's learning profile
 * and returns a ranked, de-duplicated list of recommendations.
 *
 * Scoring factors (each 0–1):
 *   interest_match   – overlaps user's top interests / topic_strength
 *   goal_match       – overlaps active goal areas
 *   knowledge_gap    – fills a gap (low coverage topic)
 *   trend_boost      – topic appears in live trends table
 *   novelty          – not already in user's library
 */

import { get, all, run, newId } from '../db/db.js';

const USER_ID = 'user_default';

// ── Seed pool ─────────────────────────────────────────────────
// Curated list of high-signal learning resources.
// Each entry: { title, url, source_type, creator, topics[], description }
const SEED_POOL = [
  {
    title: 'Evaluating LLMs: A practical guide for product teams',
    url: 'https://www.anthropic.com/research/evaluating-llms',
    source_type: 'article',
    creator: 'Anthropic',
    topics: ['AI evaluation', 'AI agents'],
    description: 'How to build robust evaluation pipelines for LLM-powered features.',
  },
  {
    title: 'Designing AI products: principles and patterns',
    url: 'https://uxdesign.cc/designing-ai-products',
    source_type: 'article',
    creator: 'UX Collective',
    topics: ['AI UX', 'Product design'],
    description: 'Core UX principles for AI-powered product design with real examples.',
  },
  {
    title: 'Building with Claude: agent patterns that work',
    url: 'https://www.anthropic.com/news/building-with-claude',
    source_type: 'article',
    creator: 'Anthropic',
    topics: ['AI agents', 'AI prototyping'],
    description: 'Practical patterns for building reliable agents: tool use, memory, orchestration.',
  },
  {
    title: 'The UX of AI features — when AI should be invisible',
    url: 'https://www.nngroup.com/articles/ai-ux-invisible',
    source_type: 'article',
    creator: 'Nielsen Norman Group',
    topics: ['AI UX', 'Product design'],
    description: 'When to surface AI and when to hide it — a UX research perspective.',
  },
  {
    title: 'How to prototype AI features in a weekend',
    url: 'https://www.youtube.com/watch?v=ai-prototyping-weekend',
    source_type: 'youtube',
    creator: 'buildspace',
    topics: ['AI prototyping', 'AI agents'],
    description: 'End-to-end walkthrough: prompt design, tool use, UI — shipped in 48 hours.',
  },
  {
    title: 'Product strategy for AI-native companies',
    url: 'https://stratechery.com/ai-product-strategy',
    source_type: 'article',
    creator: 'Ben Thompson',
    topics: ['AI product strategy', 'Product design'],
    description: 'Why AI changes the unit economics of software and what that means for strategy.',
  },
  {
    title: 'Multi-agent systems: orchestration over automation',
    url: 'https://lilianweng.github.io/posts/multi-agent-overview',
    source_type: 'article',
    creator: 'Lilian Weng',
    topics: ['AI agents', 'AI evaluation'],
    description: 'A thorough technical overview of multi-agent system design and tradeoffs.',
  },
  {
    title: 'AI product thinking: a framework for teams',
    url: 'https://www.reforge.com/blog/ai-product-thinking',
    source_type: 'article',
    creator: 'Reforge',
    topics: ['AI UX', 'AI product strategy', 'Product design'],
    description: 'How to approach AI feature scoping, experimentation, and measurement.',
  },
  {
    title: 'Prompting for product designers',
    url: 'https://www.figma.com/blog/prompting-for-designers',
    source_type: 'article',
    creator: 'Figma',
    topics: ['AI prototyping', 'AI UX'],
    description: 'How designers can leverage prompting skills as a core workflow tool.',
  },
  {
    title: 'Evals are your new unit tests',
    url: 'https://hamel.dev/blog/posts/evals',
    source_type: 'article',
    creator: 'Hamel Husain',
    topics: ['AI evaluation'],
    description: 'A practical framework for building LLM eval suites that actually catch regressions.',
  },
  {
    title: 'Memory and context in AI agents',
    url: 'https://www.youtube.com/watch?v=memory-in-agents',
    source_type: 'youtube',
    creator: 'Harrison Chase',
    topics: ['AI agents', 'AI prototyping'],
    description: 'Short-term, long-term, episodic, and semantic memory patterns for agents.',
  },
  {
    title: 'The state of AI product design in 2025',
    url: 'https://www.figma.com/blog/ai-product-design-2025',
    source_type: 'article',
    creator: 'Figma',
    topics: ['AI UX', 'Product design', 'AI product strategy'],
    description: 'A survey of patterns emerging across the top AI product companies.',
  },
  {
    title: 'Responsible AI: a designer\'s checklist',
    url: 'https://uxdesign.cc/responsible-ai-checklist',
    source_type: 'article',
    creator: 'UX Collective',
    topics: ['AI UX', 'AI evaluation'],
    description: 'Bias, transparency, and safety considerations baked into the design process.',
  },
  {
    title: 'Prototyping with Claude: a live demo',
    url: 'https://www.youtube.com/watch?v=claude-prototyping-demo',
    source_type: 'youtube',
    creator: 'Anthropic',
    topics: ['AI prototyping', 'AI agents'],
    description: 'See Claude used as a prototyping partner — from idea to working demo.',
  },
  {
    title: 'AI-native product design patterns',
    url: 'https://www.oreilly.com/library/view/ai-native-patterns',
    source_type: 'article',
    creator: "O'Reilly",
    topics: ['AI UX', 'Product design', 'AI prototyping'],
    description: 'Design patterns for AI-first products: uncertainty, fallibility, control.',
  },
  {
    title: 'How Notion built their AI features',
    url: 'https://www.notion.so/blog/how-we-built-ai',
    source_type: 'article',
    creator: 'Notion',
    topics: ['AI UX', 'AI product strategy'],
    description: 'A product team retrospective on shipping AI writing, search, and Q&A.',
  },
  {
    title: 'LLM benchmarks and what they actually measure',
    url: 'https://www.youtube.com/watch?v=llm-benchmarks-explained',
    source_type: 'youtube',
    creator: 'Sebastian Raschka',
    topics: ['AI evaluation'],
    description: 'A critical look at MMLU, HumanEval, and emerging evaluation frameworks.',
  },
  {
    title: 'Agentic AI: a UX research perspective',
    url: 'https://www.nngroup.com/articles/agentic-ai-ux',
    source_type: 'article',
    creator: 'Nielsen Norman Group',
    topics: ['AI agents', 'AI UX'],
    description: 'How autonomous agents change user trust, control, and expectation models.',
  },
  {
    title: 'Cursor and the future of AI-assisted development',
    url: 'https://stratechery.com/cursor-ai-development',
    source_type: 'article',
    creator: 'Ben Thompson',
    topics: ['AI prototyping', 'AI product strategy'],
    description: 'What Cursor tells us about how AI reshapes entire professional workflows.',
  },
  {
    title: 'Designing for uncertainty: AI error states',
    url: 'https://uxdesign.cc/designing-ai-error-states',
    source_type: 'article',
    creator: 'UX Collective',
    topics: ['AI UX', 'Product design'],
    description: 'Patterns for graceful degradation when AI output is wrong, slow, or absent.',
  },
];

// ── Scoring ───────────────────────────────────────────────────

function scoreCandidate(candidate, profile, goalAreas, libraryUrls, trends) {
  const topicStrength = profile.topic_strength || {};
  const knowledgeGaps = profile.knowledge_gaps || [];
  const trendTopics   = new Set(trends.map(t => t.name));

  let score = 0;
  const reasons = [];

  // 1. Interest match — how well candidate topics overlap with things user already cares about
  const interestHits = candidate.topics.filter(t => topicStrength[t] !== undefined);
  if (interestHits.length > 0) {
    const avg = interestHits.reduce((s, t) => s + (topicStrength[t] || 0), 0) / interestHits.length;
    score += avg * 0.35;
    if (avg > 0.5) reasons.push(`Matches your interest in ${interestHits[0]}`);
  }

  // 2. Goal match — topics appear in active goal areas
  const goalHits = candidate.topics.filter(t => goalAreas.includes(t));
  if (goalHits.length > 0) {
    score += 0.25 * Math.min(1, goalHits.length / candidate.topics.length);
    reasons.push(`Relevant to your goal on ${goalHits[0]}`);
  }

  // 3. Knowledge gap — fills something the user lacks coverage on
  const gapHits = candidate.topics.filter(t => knowledgeGaps.includes(t));
  if (gapHits.length > 0) {
    score += 0.25;
    reasons.push(`Covers ${gapHits[0]} — an area you haven't explored much`);
  }

  // 4. Trend boost — topic is trending in the field
  const trendHits = candidate.topics.filter(t => trendTopics.has(t));
  if (trendHits.length > 0) {
    score += 0.1;
    reasons.push(`${trendHits[0]} is gaining momentum in your field`);
  }

  // 5. Novelty — not already in library
  if (!libraryUrls.has(candidate.url)) {
    score += 0.05;
  } else {
    score = 0; // Already in library — never recommend
  }

  return {
    score: Math.round(score * 1000) / 1000,
    reason: reasons[0] || 'Connects to your recent learning',
    reason_detail: reasons.slice(1).join('. ') || null,
  };
}

// ── Main export ────────────────────────────────────────────────

export async function buildRecommendations() {
  try {
    // Get user profile
    const profileRow = get('SELECT * FROM profiles WHERE user_id = ?', [USER_ID]);
    const profile = {};
    for (const field of ['topic_strength', 'knowledge_gaps', 'emerging_interests', 'preferred_content_types']) {
      try {
        profile[field] = JSON.parse(profileRow?.[field] || 'null') || {};
      } catch {
        profile[field] = field === 'knowledge_gaps' || field === 'emerging_interests' ? [] : {};
      }
    }

    // Active goal areas
    const goalRows = all(
      `SELECT areas FROM goals WHERE user_id = ? AND status = 'active'`,
      [USER_ID]
    );
    const goalAreas = [];
    for (const g of goalRows) {
      try {
        const areas = JSON.parse(g.areas || '[]');
        goalAreas.push(...areas);
      } catch {}
    }

    // Library URLs (to exclude already-saved content)
    const libraryRows = all(
      `SELECT url FROM resources WHERE user_id = ? AND deleted_at IS NULL`,
      [USER_ID]
    );
    const libraryUrls = new Set(libraryRows.map(r => r.url));

    // Trends (trends table has no user_id — it's global seed data)
    const trends = all(
      `SELECT topic as name FROM trends WHERE is_active = 1 ORDER BY momentum DESC LIMIT 10`,
      []
    );

    // Score all candidates
    const scored = SEED_POOL
      .map(candidate => ({
        ...candidate,
        ...scoreCandidate(candidate, profile, goalAreas, libraryUrls, trends),
      }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);

    // Write to recommendations table (upsert pattern)
    const now = new Date().toISOString();

    // Clear old undismissed recommendations for this user
    run(
      `DELETE FROM recommendations WHERE user_id = ? AND dismissed_at IS NULL`,
      [USER_ID]
    );

    // Insert top 12
    const top = scored.slice(0, 12);
    for (const rec of top) {
      run(
        `INSERT OR IGNORE INTO recommendations
           (id, user_id, url, title, source_type, creator_name, description, topics,
            reason, reason_detail, score, generated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(), USER_ID,
          rec.url, rec.title, rec.source_type, rec.creator,
          rec.description,
          JSON.stringify(rec.topics),
          rec.reason, rec.reason_detail,
          rec.score, now, now,
        ]
      );
    }

    console.log(`[recs] Built ${top.length} recommendations from ${scored.length} candidates`);
    return top;
  } catch (err) {
    console.error('[recs] Build failed:', err.message);
    return [];
  }
}
