// Cache in-memory com TTL pra deduplicacao de webhooks e cooldown por usuario

const processedComments = new Map<string, number>();
const userCooldowns = new Map<string, number>();

const COMMENT_TTL = 60 * 60 * 1000; // 1 hora
const COOLDOWN_TTL = 30 * 60 * 1000; // 30 min por usuario por post
const CLEANUP_THRESHOLD = 200;

function cleanup(map: Map<string, number>, ttl: number) {
  const now = Date.now();
  for (const [key, timestamp] of map) {
    if (now - timestamp > ttl) map.delete(key);
  }
}

// Retorna true se o comentario ja foi processado
export function isDuplicate(commentId: string): boolean {
  if (processedComments.size > CLEANUP_THRESHOLD) cleanup(processedComments, COMMENT_TTL);
  if (processedComments.has(commentId)) return true;
  processedComments.set(commentId, Date.now());
  return false;
}

// Retorna true se o usuario ja foi respondido nesse post recentemente
export function isOnCooldown(userId: string, mediaId: string): boolean {
  if (userCooldowns.size > CLEANUP_THRESHOLD) cleanup(userCooldowns, COOLDOWN_TTL);
  const key = `${userId}:${mediaId}`;
  if (userCooldowns.has(key)) return true;
  userCooldowns.set(key, Date.now());
  return false;
}
