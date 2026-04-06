const MAX_SENTENCES = 2;
const MAX_CHARS = 150;
const MAX_EMOJIS = 3;
const EMOJI_REGEX = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu;
const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

export function postProcess(text: string): string {
  let result = text;

  // Limitar a 2 frases
  const sentences = result.split(SENTENCE_SPLIT).filter(Boolean);
  if (sentences.length > MAX_SENTENCES) {
    result = sentences.slice(0, MAX_SENTENCES).join(" ");
  }

  // Limitar emojis a 3
  const emojis = result.match(EMOJI_REGEX) || [];
  if (emojis.length > MAX_EMOJIS) {
    let count = 0;
    result = result.replace(EMOJI_REGEX, (match) => {
      count++;
      return count <= MAX_EMOJIS ? match : "";
    });
  }

  // Remover aspas ao redor (LLM as vezes coloca)
  result = result.replace(/^["']|["']$/g, "");

  // Limite de caracteres - corta na ultima palavra inteira
  result = result.trim();
  if (result.length > MAX_CHARS) {
    result = result.slice(0, MAX_CHARS).replace(/\s+\S*$/, "").trim();
  }

  return result;
}
