// Rate limiting interno pra nao bater o limite da Meta (750/hora)

const WINDOW_MS = 60 * 60 * 1000; // 1 hora
const MAX_REPLIES = 500; // margem de seguranca (limite real: 750)
const WARN_THRESHOLD = 400;

let windowStart = Date.now();
let replyCount = 0;

export function canReply(): boolean {
  const now = Date.now();

  // Reset window se passou 1 hora
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    replyCount = 0;
  }

  if (replyCount >= MAX_REPLIES) {
    console.warn(`[rate-limit] Limite atingido: ${replyCount}/${MAX_REPLIES} replies na ultima hora`);
    return false;
  }

  if (replyCount >= WARN_THRESHOLD) {
    console.warn(`[rate-limit] Aproximando do limite: ${replyCount}/${MAX_REPLIES}`);
  }

  replyCount++;
  return true;
}
