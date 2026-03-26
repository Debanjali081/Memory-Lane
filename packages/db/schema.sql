CREATE EXTENSION IF NOT EXISTS vector;

-- Core items saved by users
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY,
  user_id UUID,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  content_text TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  confidence REAL,
  PRIMARY KEY (item_id, tag_id)
);

-- Embeddings
CREATE TABLE IF NOT EXISTS embeddings (
  item_id UUID PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  vector VECTOR(3072)
);

-- Collections
CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY,
  user_id UUID,
  name TEXT NOT NULL,
  rules_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_id, item_id)
);

-- Highlights
CREATE TABLE IF NOT EXISTS highlights (
  id UUID PRIMARY KEY,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  note TEXT,
  start_offset INT,
  end_offset INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Relations
CREATE TABLE IF NOT EXISTS relations (
  item_a UUID REFERENCES items(id) ON DELETE CASCADE,
  item_b UUID REFERENCES items(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  score REAL,
  PRIMARY KEY (item_a, item_b, relation_type)
);

-- Resurfacing log
CREATE TABLE IF NOT EXISTS resurfacing_log (
  id UUID PRIMARY KEY,
  user_id UUID,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  surfaced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  api_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE items ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE collections ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE resurfacing_log ADD COLUMN IF NOT EXISTS user_id UUID;
