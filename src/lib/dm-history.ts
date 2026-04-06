const MAX_MESSAGES = 10;
const MAX_USERS = 100;
const TTL = 60 * 60 * 1000; // 1 hora

interface ConversationEntry {
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  lastActivity: number;
}

const conversations = new Map<string, ConversationEntry>();

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of conversations) {
    if (now - entry.lastActivity > TTL) conversations.delete(key);
  }
}

export function addMessage(userId: string, role: "user" | "assistant", text: string) {
  if (conversations.size > MAX_USERS) cleanup();

  let entry = conversations.get(userId);
  if (!entry) {
    entry = { messages: [], lastActivity: Date.now() };
    conversations.set(userId, entry);
  }

  entry.messages.push({ role, text });
  entry.lastActivity = Date.now();

  if (entry.messages.length > MAX_MESSAGES) {
    entry.messages = entry.messages.slice(-MAX_MESSAGES);
  }
}

export function getHistory(userId: string): Array<{ role: "user" | "assistant"; text: string }> {
  const entry = conversations.get(userId);
  if (!entry) return [];
  if (Date.now() - entry.lastActivity > TTL) {
    conversations.delete(userId);
    return [];
  }
  return [...entry.messages];
}

export function getMessageCount(userId: string): number {
  return getHistory(userId).filter(m => m.role === "user").length;
}
