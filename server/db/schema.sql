PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- USERS
-- Single user for V1, seeded at startup
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY DEFAULT 'user_default',
  name       TEXT DEFAULT 'Ayush',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- PROFILE
-- Continuously updated learning profile
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  user_id                  TEXT PRIMARY KEY REFERENCES users(id),
  about                    TEXT DEFAULT '',
  interests                TEXT DEFAULT '[]',
  preferred_content_types  TEXT DEFAULT '{}',
  topic_strength           TEXT DEFAULT '{}',
  knowledge_gaps           TEXT DEFAULT '[]',
  emerging_interests       TEXT DEFAULT '[]',
  learning_frequency       TEXT DEFAULT '{}',
  updated_at               TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- USER PREFERENCES
-- Appearance, AI settings
-- ============================================================
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id                    TEXT PRIMARY KEY REFERENCES users(id),
  appearance                 TEXT DEFAULT 'system'
                               CHECK(appearance IN ('light','dark','system')),
  ai_recommendations_enabled INTEGER DEFAULT 1,
  updated_at                 TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- TOPICS
-- Normalised topic registry
-- ============================================================
CREATE TABLE IF NOT EXISTS topics (
  id         TEXT PRIMARY KEY,
  name       TEXT UNIQUE NOT NULL COLLATE NOCASE,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- RESOURCES
-- Core content store — soft deleted via deleted_at
-- ============================================================
CREATE TABLE IF NOT EXISTS resources (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id),
  url                  TEXT NOT NULL,
  title                TEXT,
  source               TEXT,
  source_type          TEXT CHECK(source_type IN
                         ('youtube','article','medium','substack','pdf')),
  creator_name         TEXT,
  author_name          TEXT,
  thumbnail            TEXT,
  description          TEXT,
  ai_summary           TEXT,
  ai_key_takeaways     TEXT DEFAULT '[]',
  duration_seconds     INTEGER,
  reading_time_minutes INTEGER,
  page_count           INTEGER,
  content_text         TEXT,
  transcript           TEXT,
  status               TEXT DEFAULT 'processing'
                         CHECK(status IN ('processing','ready','failed')),
  progress             INTEGER DEFAULT 0,
  added_at             TEXT DEFAULT (datetime('now')),
  completed_at         TEXT,
  updated_at           TEXT DEFAULT (datetime('now')),
  deleted_at           TEXT
);

CREATE INDEX IF NOT EXISTS idx_resources_user_status
  ON resources(user_id, status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_resources_added
  ON resources(added_at DESC);

-- ============================================================
-- RESOURCE ↔ TOPIC (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS resource_topics (
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  topic_id    TEXT NOT NULL REFERENCES topics(id),
  relevance   REAL DEFAULT 1.0,
  PRIMARY KEY (resource_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_topics_topic
  ON resource_topics(topic_id);

-- ============================================================
-- GOALS
-- User-defined intentional learning directions
-- ============================================================
CREATE TABLE IF NOT EXISTS goals (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  description TEXT,
  reason      TEXT,
  status      TEXT DEFAULT 'active'
                CHECK(status IN ('active','paused','archived')),
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- RESOURCE ↔ GOAL (many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS resource_goals (
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  goal_id     TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  added_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (resource_id, goal_id)
);

-- ============================================================
-- LEARNING ACTIVITIES
-- Source of truth for all learning behaviour
-- Rows are NOT deleted when a resource is deleted (preserves history)
-- ============================================================
CREATE TABLE IF NOT EXISTS learning_activities (
  id                  TEXT PRIMARY KEY,
  resource_id         TEXT REFERENCES resources(id),
  user_id             TEXT NOT NULL REFERENCES users(id),
  event_type          TEXT NOT NULL CHECK(event_type IN
                        ('added','opened','started','progressed','completed','note_added')),
  timestamp           TEXT DEFAULT (datetime('now')),
  duration_seconds    INTEGER DEFAULT 0,
  progress_percentage INTEGER DEFAULT 0,
  metadata            TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_activities_user_time
  ON learning_activities(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activities_resource
  ON learning_activities(resource_id);

-- ============================================================
-- RECOMMENDATIONS
-- Generated by the recommendation engine
-- External URLs not yet saved by the user
-- ============================================================
CREATE TABLE IF NOT EXISTS recommendations (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  title           TEXT,
  url             TEXT,
  source_type     TEXT,
  creator_name    TEXT,
  description     TEXT,
  topics          TEXT DEFAULT '[]',
  score           REAL DEFAULT 0,
  reason          TEXT,
  score_breakdown TEXT DEFAULT '{}',
  generated_at    TEXT DEFAULT (datetime('now')),
  dismissed_at    TEXT,
  saved_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_recs_user_score
  ON recommendations(user_id, score DESC, dismissed_at);

-- ============================================================
-- TRENDS
-- Emerging topics in the user's domain
-- Seeded manually in V1
-- ============================================================
CREATE TABLE IF NOT EXISTS trends (
  id          TEXT PRIMARY KEY,
  topic       TEXT NOT NULL,
  description TEXT,
  relevance   REAL DEFAULT 0.5,
  momentum    REAL DEFAULT 0.5,
  detected_at TEXT DEFAULT (datetime('now')),
  source_info TEXT DEFAULT '{}',
  is_active   INTEGER DEFAULT 1
);
