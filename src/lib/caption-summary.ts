const MAX_CAPTION_LENGTH = 150;

export function summarizeCaption(caption: string): string {
  if (!caption) return "";

  let text = caption.trim();

  // Cortar na primeira quebra de linha (antes de qualquer outra limpeza)
  const firstBreak = text.search(/[\n\r]/);
  if (firstBreak > 0) text = text.slice(0, firstBreak).trim();

  // Remover hashtags e limpar espacos extras
  text = text.replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  if (text.length <= MAX_CAPTION_LENGTH) return text;

  // Cortar no fim da primeira frase dentro do limite
  const firstSentenceEnd = text.search(/[.!?]\s/);
  if (firstSentenceEnd > 0 && firstSentenceEnd + 1 <= MAX_CAPTION_LENGTH) {
    return text.slice(0, firstSentenceEnd + 1).trim();
  }

  return text.slice(0, MAX_CAPTION_LENGTH).trim();
}
