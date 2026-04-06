const EMOJI_ONLY_REGEX = /^[\p{Emoji}\p{Emoji_Component}\s]+$/u;
const TAG_REGEX = /^@[\w.]+(\s@[\w.]+)*\s*$/;
const SPAM_KEYWORDS = ["compre","compra","vendo","venda","promoção","promocao","desconto","oferta","link na bio","sigam","seguir de volta","ganhe","sorteio","clique","acesse","www.","http",".com.br","pix","whatsapp","telegram"];
const RISK_KEYWORDS = ["suicidio","suicídio","overdose","morrer","matar","se matar","me matar","vou morrer"];
const OFFENSIVE_KEYWORDS = ["vagabunda","lixo","merda","porra","caralho","puta","fdp","arrombado","arrombada","otário","otaria","burra","burro","idiota","imbecil","retardado","retardada"];
export type FilterResult = { action: "respond" } | { action: "ignore"; reason: string } | { action: "respond_hater" } | { action: "hide"; reason: string };
export function filterComment(text: string): FilterResult {
  const trimmed = text.trim();
  if (!trimmed) return { action: "ignore", reason: "empty" };
  if (trimmed.length < 3) return { action: "ignore", reason: "too_short" };
  if (EMOJI_ONLY_REGEX.test(trimmed)) return { action: "ignore", reason: "emoji_only" };
  if (TAG_REGEX.test(trimmed)) return { action: "ignore", reason: "tags_only" };
  const lower = trimmed.toLowerCase();
  if (RISK_KEYWORDS.some((kw) => lower.includes(kw))) return { action: "ignore", reason: "risk" };
  if (SPAM_KEYWORDS.some((kw) => lower.includes(kw))) return { action: "hide", reason: "spam" };
  if (OFFENSIVE_KEYWORDS.some((kw) => lower.includes(kw))) return { action: "respond_hater" };
  return { action: "respond" };
}
