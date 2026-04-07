import type { CommentCategory } from "./llm";

const SKIP_RATES: Record<CommentCategory, number> = {
  duvida: 0.05,
  desabafo: 0.0,
  elogio: 0.30,
  zueira: 0.40,
  geral: 0.50,
  cultivo: 0.10,
  hater: 0.0,
};

/**
 * Decide se deve pular a resposta baseado na categoria.
 * Nunca pula se o usuario marcou @bot diretamente.
 */
export function shouldSkip(category: CommentCategory, mentionedBot: boolean): boolean {
  if (mentionedBot) return false;
  const rate = SKIP_RATES[category] ?? 0;
  return Math.random() < rate;
}

/** Skip rate pra comentarios emoji-only (aplicar ANTES do LLM) */
export const EMOJI_ONLY_SKIP_RATE = 0.70;
