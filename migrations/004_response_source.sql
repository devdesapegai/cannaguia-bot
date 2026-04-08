-- source: quem gerou a resposta (bot, manual pelo painel, manual pelo instagram)
ALTER TABLE response_log ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'bot';
