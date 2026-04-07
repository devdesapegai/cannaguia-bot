type EventType =
  | "webhook_received"
  | "processing_started"
  | "comment_skipped"
  | "nested_reply_accepted"
  | "comment_filtered"
  | "reply_generated"
  | "reply_posted"
  | "reply_failed"
  | "signature_invalid"
  | "duplicate_skipped"
  | "comment_classified"
  | "rate_limited"
  | "cooldown_skipped"
  | "dm_received"
  | "dm_sent"
  | "mention_received"
  | "mention_replied"
  | "caption_fetched"
  | "caption_empty"
  | "night_skipped"
  | "smart_skipped"
  | "reply_scheduled"
  | "error";

interface LogData {
  comment_id?: string;
  media_id?: string;
  username?: string;
  text?: string;
  reply?: string;
  filter_action?: string;
  filter_reason?: string;
  category?: string;
  reason?: string;
  fields?: string;
  error?: string;
  processing_time_ms?: number;
  [key: string]: unknown;
}

// Contadores in-memory pra health check
export const stats = {
  webhooks_received: 0,
  replies_sent: 0,
  replies_failed: 0,
  errors: 0,
  last_webhook_at: 0,
  last_reply_at: 0,
  started_at: Date.now(),
  categories: {} as Record<string, number>,
};

export function log(type: EventType, data?: LogData) {
  const event = {
    t: type,
    ts: new Date().toISOString(),
    ...data,
  };

  // Atualiza stats
  if (type === "webhook_received") { stats.webhooks_received++; stats.last_webhook_at = Date.now(); }
  if (type === "reply_posted") { stats.replies_sent++; stats.last_reply_at = Date.now(); }
  if (type === "reply_failed") stats.replies_failed++;
  if (type === "error") stats.errors++;
  if (type === "comment_classified" && data?.category) {
    stats.categories[data.category] = (stats.categories[data.category] || 0) + 1;
  }

  console.log(JSON.stringify(event));
}
