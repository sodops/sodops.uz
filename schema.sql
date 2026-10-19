-- schema.sql
-- Cloudflare D1 SQLite Schema for sodops.uz

-- Posts Table
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  excerpt TEXT,
  cover_image TEXT,
  published INTEGER NOT NULL DEFAULT 0, -- 0 = draft, 1 = published
  published_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reading_time_minutes INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published, published_at DESC);

-- Tags Table
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);

-- Post-Tags Junction Table
CREATE TABLE IF NOT EXISTS post_tags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Projects Table (Planned for Phase 4)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  url TEXT NOT NULL,
  repo_url TEXT,
  status_url TEXT,
  tech_tags TEXT NOT NULL, -- JSON array string: '["Docker", "k3s"]'
  featured INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  allow_iframe INTEGER DEFAULT 0,
  screenshot_url TEXT
);

-- Uptime Checks Table (Planned for Phase 4)
CREATE TABLE IF NOT EXISTS uptime_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL, -- 'up', 'down', 'degraded'
  status_code INTEGER,
  latency_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_uptime_checks_project_time ON uptime_checks(project_id, timestamp DESC);
