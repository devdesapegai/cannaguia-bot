-- Habilitar extensao pgvector no Supabase
CREATE EXTENSION IF NOT EXISTS vector;

-- Adicionar coluna de embedding na tabela response_log
ALTER TABLE response_log ADD COLUMN IF NOT EXISTS embedding vector(512);

-- Indice unico em comment_id pra dedup na importacao (permite NULL pra DMs sem comment_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_response_log_comment_id ON response_log (comment_id) WHERE comment_id IS NOT NULL;

-- Indice para busca por similaridade (rodar APOS backfill, quando tiver >500 rows):
-- CREATE INDEX idx_response_log_embedding ON response_log USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
