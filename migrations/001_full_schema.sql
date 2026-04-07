-- Migration: schema completo para persistencia no Supabase
-- Rodar manualmente no SQL Editor do Supabase

-- Deduplicacao de comentarios processados
CREATE TABLE IF NOT EXISTS processed_comments (
  comment_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_processed_comments_created ON processed_comments (created_at);

-- Cooldown por usuario/post (evita responder 2x pro mesmo user no mesmo post)
CREATE TABLE IF NOT EXISTS user_cooldowns (
  user_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, media_id)
);
CREATE INDEX IF NOT EXISTS idx_user_cooldowns_created ON user_cooldowns (created_at);

-- Rate limit global (single row, 500 replies/hora)
CREATE TABLE IF NOT EXISTS rate_limit_window (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  reply_count INTEGER NOT NULL DEFAULT 0
);
INSERT INTO rate_limit_window (id, window_start, reply_count)
VALUES (1, now(), 0) ON CONFLICT (id) DO NOTHING;

-- Historico de conversas DM (por usuario)
CREATE TABLE IF NOT EXISTS dm_conversations (
  user_id TEXT PRIMARY KEY,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_activity ON dm_conversations (last_activity);

-- Perfis de usuario extraidos das DMs
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  profile_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Replies recentes (anti-repeticao no LLM)
CREATE TABLE IF NOT EXISTS recent_replies (
  id SERIAL PRIMARY KEY,
  reply_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recent_replies_created ON recent_replies (created_at);

-- Log de todas as respostas postadas (moderacao humana)
CREATE TABLE IF NOT EXISTS response_log (
  id SERIAL PRIMARY KEY,
  comment_id TEXT,
  original_text TEXT NOT NULL,
  bot_reply TEXT NOT NULL,
  category TEXT,
  media_id TEXT,
  username TEXT,
  reply_type TEXT NOT NULL DEFAULT 'comment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed BOOLEAN NOT NULL DEFAULT false,
  feedback TEXT
);
CREATE INDEX IF NOT EXISTS idx_response_log_created ON response_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_log_pending ON response_log (reviewed) WHERE NOT reviewed;

-- Stats agregadas por hora (dashboard de monitoria)
CREATE TABLE IF NOT EXISTS bot_stats (
  id SERIAL PRIMARY KEY,
  hour_bucket TIMESTAMPTZ NOT NULL UNIQUE,
  replies_sent INTEGER DEFAULT 0,
  replies_failed INTEGER DEFAULT 0,
  webhooks_received INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  categories JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bot_stats_bucket ON bot_stats (hour_bucket DESC);
