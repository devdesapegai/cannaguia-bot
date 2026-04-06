const MAX_RECENT = 10;
const recentReplies: string[] = [];

export function addRecentReply(reply: string) {
  recentReplies.push(reply);
  if (recentReplies.length > MAX_RECENT) recentReplies.shift();
}

export function getRecentReplies(): string[] {
  return [...recentReplies];
}
