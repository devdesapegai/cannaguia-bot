import { pool } from "@/lib/db";
import { embedAndStore } from "@/lib/embeddings";

export async function queryRetry(text: string, params?: unknown[]) {
  try {
    return await pool.query(text, params);
  } catch {
    return await pool.query(text, params);
  }
}

export async function getVideoContext(mediaId: string): Promise<string> {
  try {
    const { rows } = await pool.query(
      "SELECT context_text FROM video_contexts WHERE media_id = $1",
      [mediaId]
    );
    return rows[0]?.context_text || "";
  } catch {
    return "";
  }
}

export async function saveFailedReply(
  commentId: string,
  message: string,
  username?: string,
  replyType: "comment" | "dm" = "comment",
  mediaId?: string,
  scheduledAt?: Date,
  originalText?: string,
): Promise<void> {
  try {
    const retryAt = scheduledAt
      ? `$6::timestamptz`
      : `now() + interval '1 minute'`;
    const params: (string | null)[] = [commentId, username || null, message, replyType, mediaId || null];
    if (scheduledAt) params.push(scheduledAt.toISOString());

    const otIdx = params.length + 1;
    params.push(originalText || null);

    await pool.query(
      `INSERT INTO failed_replies (comment_id, username, message, reply_type, media_id, next_retry_at, original_text)
       VALUES ($1, $2, $3, $4, $5, ${retryAt}, $${otIdx})
       ON CONFLICT (comment_id) DO NOTHING`,
      params
    );
  } catch (e) {
    console.error("[failed_replies] save error:", e);
  }
}

export type FailedReply = {
  id: string;
  comment_id: string;
  username: string | null;
  message: string;
  reply_type: string;
  media_id: string | null;
  attempts: number;
  max_attempts: number;
};

export async function getPendingRetries(): Promise<FailedReply[]> {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM failed_replies
       WHERE attempts < max_attempts AND next_retry_at <= now()
       ORDER BY created_at ASC
       LIMIT 10`
    );
    return rows;
  } catch {
    return [];
  }
}

export async function markRetryAttempt(id: string, success: boolean): Promise<void> {
  try {
    if (success) {
      await pool.query("DELETE FROM failed_replies WHERE id = $1", [id]);
    } else {
      // Backoff: 1min, 2min, 4min, 8min, 16min
      await pool.query(
        `UPDATE failed_replies
         SET attempts = attempts + 1,
             next_retry_at = now() + (interval '1 minute' * power(2, attempts))
         WHERE id = $1`,
        [id]
      );
    }
  } catch (e) {
    console.error("[failed_replies] mark error:", e);
  }
}

export async function cleanupOldRetries(): Promise<void> {
  try {
    await pool.query(
      "DELETE FROM failed_replies WHERE attempts >= max_attempts OR created_at < now() - interval '24 hours'"
    );
  } catch {}
}

export async function cleanupExpiredState(): Promise<void> {
  try {
    await pool.query(`DELETE FROM processed_comments WHERE created_at < now() - interval '2 hours'`);
    await pool.query(`DELETE FROM user_cooldowns WHERE created_at < now() - interval '1 hour'`);
    await pool.query(`DELETE FROM dm_conversations WHERE last_activity < now() - interval '2 hours'`);
    await pool.query(`DELETE FROM recent_replies WHERE created_at < now() - interval '3 hours'`);
  } catch (e) {
    console.error("[cleanup] error:", e);
  }
}

export async function logResponse(params: {
  commentId?: string;
  originalText: string;
  botReply: string;
  category?: string;
  mediaId?: string;
  username?: string;
  replyType: "comment" | "dm" | "mention";
}): Promise<number | null> {
  try {
    const result = await pool.query(
      `INSERT INTO response_log (comment_id, original_text, bot_reply, category, media_id, username, reply_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        params.commentId || null,
        params.originalText,
        params.botReply,
        params.category || null,
        params.mediaId || null,
        params.username || null,
        params.replyType,
      ],
    );
    const rowId = result.rows[0]?.id as number | undefined;
    if (rowId && params.replyType === "comment") {
      embedAndStore(rowId, `${params.originalText} -> ${params.botReply}`).catch(() => {});
    }
    return rowId ?? null;
  } catch (e) {
    console.error("[response_log] error:", e);
    return null;
  }
}

export async function recordStat(
  type: "reply_sent" | "reply_failed" | "webhook_received" | "error" | "smart_skipped" | "night_skipped",
  category?: string,
): Promise<void> {
  try {
    const fieldMap: Record<string, string> = {
      reply_sent: "replies_sent",
      reply_failed: "replies_failed",
      webhook_received: "webhooks_received",
      error: "errors",
      smart_skipped: "smart_skipped",
      night_skipped: "night_skipped",
    };
    const field = fieldMap[type] || "errors";

    if (category) {
      await pool.query(
        `INSERT INTO bot_stats (hour_bucket, ${field}, categories)
         VALUES (date_trunc('hour', now()), 1, jsonb_build_object($1::text, 1))
         ON CONFLICT (hour_bucket) DO UPDATE SET
           ${field} = bot_stats.${field} + 1,
           categories = CASE
             WHEN bot_stats.categories ? $1::text
             THEN jsonb_set(bot_stats.categories, ARRAY[$1::text], to_jsonb((bot_stats.categories->>$1::text)::int + 1))
             ELSE bot_stats.categories || jsonb_build_object($1::text, 1)
           END`,
        [category],
      );
    } else {
      await pool.query(
        `INSERT INTO bot_stats (hour_bucket, ${field})
         VALUES (date_trunc('hour', now()), 1)
         ON CONFLICT (hour_bucket) DO UPDATE SET
           ${field} = bot_stats.${field} + 1`,
      );
    }
  } catch {}
}

// --- DM Follow-up ---

export async function scheduleFollowUp(
  userId: string,
  condition: string,
  delayHours = 6,
): Promise<void> {
  try {
    const scheduledAt = new Date(Date.now() + delayHours * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO dm_followups (user_id, condition, scheduled_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, condition, scheduledAt.toISOString()],
    );
  } catch (e) {
    console.error("[dm_followups] schedule error:", e);
  }
}

export type PendingFollowUp = {
  id: string;
  user_id: string;
  condition: string;
  created_at: string;
};

export async function getPendingFollowUps(): Promise<PendingFollowUp[]> {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, condition, created_at FROM dm_followups
       WHERE status = 'pending' AND scheduled_at <= now()
       AND created_at > now() - interval '23 hours'
       LIMIT 5`,
    );
    return rows;
  } catch {
    return [];
  }
}

export async function markFollowUpSent(id: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE dm_followups SET status = 'sent', sent_at = now() WHERE id = $1`,
      [id],
    );
  } catch (e) {
    console.error("[dm_followups] mark sent error:", e);
  }
}

export async function expireOldFollowUps(): Promise<void> {
  try {
    await pool.query(
      `UPDATE dm_followups SET status = 'expired'
       WHERE status = 'pending' AND created_at < now() - interval '23 hours'`,
    );
  } catch {}
}

export async function cancelFollowUp(userId: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE dm_followups SET status = 'cancelled' WHERE user_id = $1 AND status = 'pending'`,
      [userId],
    );
  } catch {}
}

// --- Bot Mode ---

let _modeCache: { mode: string; ts: number } | null = null;
const MODE_TTL = 10_000;

export async function getBotMode(): Promise<string> {
  if (_modeCache && Date.now() - _modeCache.ts < MODE_TTL) return _modeCache.mode;
  try {
    const { rows } = await queryRetry("SELECT mode FROM bot_settings WHERE id = 1");
    const mode = rows[0]?.mode || "automatico";
    _modeCache = { mode, ts: Date.now() };
    return mode;
  } catch {
    return "automatico";
  }
}

export function invalidateModeCache() { _modeCache = null; }

export { pool };

export type VideoContext = {
  id: string;
  media_id: string | null;
  title: string;
  url: string;
  context_text: string;
  created_at: string;
  updated_at: string;
};
