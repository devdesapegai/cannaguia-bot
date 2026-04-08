-- bot_settings: single-row, persiste modo do bot entre restarts do PM2
CREATE TABLE IF NOT EXISTS bot_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  mode TEXT NOT NULL DEFAULT 'automatico' CHECK (mode IN ('automatico', 'manual', 'pausado')),
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO bot_settings (id, mode) VALUES (1, 'automatico') ON CONFLICT DO NOTHING;

-- original_text na failed_replies pra mostrar o comentario original na UI do admin
ALTER TABLE failed_replies ADD COLUMN IF NOT EXISTS original_text TEXT;
