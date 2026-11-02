-- baseBot initial schema: threads + messages
-- Migration: 001_initial

CREATE TABLE IF NOT EXISTS basebot_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS threads (
  id UUID PRIMARY KEY,
  user_id VARCHAR(256) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_threads_user_id_last_message_at
  ON threads (user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_threads_user_id_status
  ON threads (user_id, status);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES threads (id) ON DELETE CASCADE,
  user_id VARCHAR(256) NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_id_timestamp
  ON messages (thread_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_messages_user_id
  ON messages (user_id);
