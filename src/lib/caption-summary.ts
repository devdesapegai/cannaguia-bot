const MAX_CAPTION_LENGTH = 150;

const NICHE_TAGS = /#(cultiv[oa]?|flora|vega|indoor|outdoor|medicinal|cbd|thc|terpenos?|colheita|harvest|grow|semente|clone|poda|trico|strain|gen[eé]tica|indica|sativa|prensado|flor)\b/gi;

export function summarizeCaption(caption: string): string {
  if (!caption) return "";

  let text = caption.trim();

  // Extrair hashtags do nicho ANTES de limpar
  const nicheMatches = text.match(NICHE_TAGS) || [];
  const nicheTags = [...new Set(nicheMatches.map(t => t.toLowerCase().replace("#", "")))];

  // Cortar na primeira quebra de linha
  const firstBreak = text.search(/[\n\r]/);
  if (firstBreak > 0) text = text.slice(0, firstBreak).trim();

  // Remover hashtags e limpar espacos extras
  text = text.replace(/#\S+/g, "").replace(/\s+/g, " ").trim();

  // Appendar tags do nicho como contexto
  if (nicheTags.length > 0) {
    const tagStr = nicheTags.join(", ");
    text = text ? `${text} [tags: ${tagStr}]` : `[tags: ${tagStr}]`;
  }

  if (!text) return "";
  if (text.length <= MAX_CAPTION_LENGTH) return text;

  // Cortar no fim da primeira frase dentro do limite
  const firstSentenceEnd = text.search(/[.!?]\s/);
  if (firstSentenceEnd > 0 && firstSentenceEnd + 1 <= MAX_CAPTION_LENGTH) {
    return text.slice(0, firstSentenceEnd + 1).trim();
  }

  return text.slice(0, MAX_CAPTION_LENGTH).trim();
}
