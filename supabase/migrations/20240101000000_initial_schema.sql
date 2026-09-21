-- ============================================================
-- Learning Engine — Initial Schema
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- USER PROFILES
-- Extends Supabase auth.users with learning-specific data
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  about       TEXT,
  interests   JSONB    NOT NULL DEFAULT '[]',
  preferred_content_types JSONB NOT NULL DEFAULT '{}',
  topic_strength          JSONB NOT NULL DEFAULT '{}',
  knowledge_gaps          JSONB NOT NULL DEFAULT '[]',
  emerging_interests      JSONB NOT NULL DEFAULT '[]',
  learning_frequency      JSONB NOT NULL DEFAULT '{"daily_avg_mins":0,"active_days_30d":0}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- USER PREFERENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  appearance                 TEXT NOT NULL DEFAULT 'system' CHECK (appearance IN ('light','dark','system')),
  ai_recommendations_enabled BOOLEAN NOT NULL DEFAULT true,
  weekly_target_minutes      INTEGER NOT NULL DEFAULT 300,
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TOPICS
-- Normalized learning topic registry
-- ============================================================
CREATE TABLE IF NOT EXISTS topics (
  id         UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT    NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- RESOURCES
-- Every learning resource the user saves
-- ============================================================
CREATE TABLE IF NOT EXISTS resources (
  id                    UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url                   TEXT         NOT NULL,
  title                 TEXT,
  source                TEXT,
  source_type           TEXT         NOT NULL DEFAULT 'other'
                          CHECK (source_type IN ('video','article','newsletter','pdf','other')),
  creator_name          TEXT,
  thumbnail_url         TEXT,
  duration_seconds      INTEGER,
  reading_time_minutes  INTEGER,
  page_count            INTEGER,
  published_at          TIMESTAMPTZ,
  saved_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Extracted content
  content_text          TEXT,
  transcript            TEXT,
  -- AI analysis
  ai_summary            TEXT,
  ai_key_takeaways      JSONB        NOT NULL DEFAULT '[]',
  ai_concepts           JSONB        NOT NULL DEFAULT '[]',
  ai_keywords           JSONB        NOT NULL DEFAULT '[]',
  -- Processing
  processing_status     TEXT         NOT NULL DEFAULT 'processing'
                          CHECK (processing_status IN ('processing','ready','failed')),
  processing_error      TEXT,
  -- Progress tracking
  progress_percentage   INTEGER      NOT NULL DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
  completed_at          TIMESTAMPTZ,
  -- Soft delete
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, url)
);

CREATE INDEX IF NOT EXISTS idx_resources_user_id       ON resources(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resources_status        ON resources(processing_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resources_saved_at      ON resources(saved_at DESC)     WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_resources_source_type   ON resources(source_type)       WHERE deleted_at IS NULL;

-- ============================================================
-- RESOURCE_TOPICS
-- Many-to-many: resources ↔ topics
-- ============================================================
CREATE TABLE IF NOT EXISTS resource_topics (
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  topic_id    UUID NOT NULL REFERENCES topics(id)    ON DELETE CASCADE,
  PRIMARY KEY (resource_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_topics_topic ON resource_topics(topic_id);

-- ============================================================
-- RESOURCE_EMBEDDINGS
-- pgvector embeddings for semantic retrieval (1536-dim = text-embedding-3-small)
-- ============================================================
CREATE TABLE IF NOT EXISTS resource_embeddings (
  resource_id UUID    PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
  embedding   vector(1536),
  model       TEXT    NOT NULL DEFAULT 'text-embedding-3-small',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_embeddings_vec
  ON resource_embeddings USING hnsw (embedding vector_cosine_ops);

-- ============================================================
-- GOALS
-- User learning goals
-- ============================================================
CREATE TABLE IF NOT EXISTS goals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','paused','archived')),
  ai_rationale TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id) WHERE status = 'active';

-- ============================================================
-- GOAL_TOPICS
-- Topics associated with a goal (AI-identified or user-specified)
-- ============================================================
CREATE TABLE IF NOT EXISTS goal_topics (
  goal_id  UUID NOT NULL REFERENCES goals(id)  ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (goal_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_topics_topic ON goal_topics(topic_id);

-- ============================================================
-- ACTIVITY_EVENTS
-- Granular learning activity tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_events (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id         UUID REFERENCES resources(id) ON DELETE SET NULL,
  event_type          TEXT NOT NULL
                        CHECK (event_type IN ('added','opened','started','progressed','completed','note_added')),
  duration_seconds    INTEGER NOT NULL DEFAULT 0,
  progress_percentage INTEGER NOT NULL DEFAULT 0,
  metadata            JSONB   NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_user_id    ON activity_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_resource   ON activity_events(resource_id);
CREATE INDEX IF NOT EXISTS idx_activity_event_type ON activity_events(event_type);

-- ============================================================
-- RECOMMENDATIONS
-- AI-generated recommendations (single engine for Discover + Goals)
-- ============================================================
CREATE TABLE IF NOT EXISTS recommendations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id             UUID REFERENCES goals(id) ON DELETE SET NULL,
  -- Recommended resource info (external or from library)
  title               TEXT NOT NULL,
  url                 TEXT,
  source              TEXT,
  source_type         TEXT,
  creator_name        TEXT,
  description         TEXT,
  topics              JSONB  NOT NULL DEFAULT '[]',
  -- Ranking
  score               NUMERIC(5,4) NOT NULL DEFAULT 0,
  reason              TEXT,
  reason_detail       TEXT,
  score_breakdown     JSONB  NOT NULL DEFAULT '{}',
  recommendation_type TEXT   NOT NULL DEFAULT 'general',
  -- Status
  status              TEXT   NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','dismissed','saved')),
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dismissed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recs_user_active ON recommendations(user_id, score DESC)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_recs_goal ON recommendations(goal_id)
  WHERE status = 'active';

-- ============================================================
-- CHAT_CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_conversations (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_convs_user ON chat_conversations(user_id, updated_at DESC);

-- ============================================================
-- CHAT_MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msgs_conv ON chat_messages(conversation_id, created_at ASC);

-- ============================================================
-- TRENDS
-- AI/curated trending topics in learning
-- ============================================================
CREATE TABLE IF NOT EXISTS trends (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic        TEXT NOT NULL,
  description  TEXT,
  relevance    TEXT DEFAULT 'medium' CHECK (relevance IN ('low','medium','high')),
  momentum     TEXT DEFAULT 'stable' CHECK (momentum IN ('rising','stable','falling')),
  source_info  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- HELPER: updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_resources_updated_at
  BEFORE UPDATE ON resources
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_convs_updated_at
  BEFORE UPDATE ON chat_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_prefs_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SEMANTIC SEARCH FUNCTION
-- Used by retrieval to find semantically similar resources
-- ============================================================
CREATE OR REPLACE FUNCTION search_resources_by_embedding(
  p_user_id   UUID,
  p_embedding vector(1536),
  p_limit     INT DEFAULT 10,
  p_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  resource_id UUID,
  title       TEXT,
  similarity  FLOAT
) LANGUAGE sql STABLE AS $$
  SELECT
    r.id          AS resource_id,
    r.title,
    1 - (re.embedding <=> p_embedding) AS similarity
  FROM resource_embeddings re
  JOIN resources r ON r.id = re.resource_id
  WHERE r.user_id = p_user_id
    AND r.deleted_at IS NULL
    AND r.processing_status = 'ready'
    AND 1 - (re.embedding <=> p_embedding) >= p_threshold
  ORDER BY re.embedding <=> p_embedding
  LIMIT p_limit;
$$;

-- ============================================================
-- ANALYTICS HELPER: topic counts per user
-- ============================================================
CREATE OR REPLACE FUNCTION get_topic_analytics(p_user_id UUID)
RETURNS TABLE (
  topic       TEXT,
  count       BIGINT,
  recent_count BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT
    t.name                    AS topic,
    COUNT(rt.resource_id)     AS count,
    COUNT(rt.resource_id) FILTER (
      WHERE r.saved_at >= NOW() - INTERVAL '30 days'
    )                         AS recent_count
  FROM topics t
  JOIN resource_topics rt ON rt.topic_id = t.id
  JOIN resources r        ON r.id = rt.resource_id
  WHERE r.user_id = p_user_id
    AND r.deleted_at IS NULL
  GROUP BY t.name
  ORDER BY count DESC;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_profiles_self" ON user_profiles
  FOR ALL USING (auth.uid() = user_id);

-- user_preferences
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_preferences_self" ON user_preferences
  FOR ALL USING (auth.uid() = user_id);

-- resources
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resources_self" ON resources
  FOR ALL USING (auth.uid() = user_id);

-- resource_topics (read via resource ownership)
ALTER TABLE resource_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_topics_self" ON resource_topics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM resources r
      WHERE r.id = resource_id AND r.user_id = auth.uid()
    )
  );

-- resource_embeddings
ALTER TABLE resource_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_embeddings_self" ON resource_embeddings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM resources r
      WHERE r.id = resource_id AND r.user_id = auth.uid()
    )
  );

-- topics: readable by all authenticated users, not directly writable by users
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topics_read" ON topics
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- activity_events
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_self" ON activity_events
  FOR ALL USING (auth.uid() = user_id);

-- goals
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals_self" ON goals
  FOR ALL USING (auth.uid() = user_id);

-- goal_topics
ALTER TABLE goal_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goal_topics_self" ON goal_topics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM goals g
      WHERE g.id = goal_id AND g.user_id = auth.uid()
    )
  );

-- recommendations
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recommendations_self" ON recommendations
  FOR ALL USING (auth.uid() = user_id);

-- chat_conversations
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_self" ON chat_conversations
  FOR ALL USING (auth.uid() = user_id);

-- chat_messages (access via conversation ownership)
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_self" ON chat_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM chat_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- trends: readable by all authenticated users
ALTER TABLE trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trends_read" ON trends
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ============================================================
-- SEED: default trends
-- ============================================================
INSERT INTO trends (topic, description, relevance, momentum, source_info) VALUES
  ('AI evaluation', 'Systematic methods for assessing LLM and AI system quality', 'high', 'rising',
   'Emerging from AI teams at major tech companies'),
  ('AI agents', 'Autonomous AI systems that can plan and execute multi-step tasks', 'high', 'rising',
   'Growing rapidly in product and engineering circles'),
  ('AI UX', 'Designing user experiences for AI-powered products', 'high', 'rising',
   'Nielsen Norman Group, Figma, and design communities'),
  ('Prompt engineering', 'Crafting effective prompts for language models', 'medium', 'stable',
   'Established practice across AI product teams'),
  ('AI prototyping', 'Rapid prototyping techniques for AI-first products', 'medium', 'rising',
   'Product and design communities')
ON CONFLICT DO NOTHING;
