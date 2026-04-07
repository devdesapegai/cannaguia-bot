import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

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
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO failed_replies (comment_id, username, message, reply_type, media_id, next_retry_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '1 minute')
       ON CONFLICT (comment_id) DO NOTHING`,
      [commentId, username || null, message, replyType, mediaId || null]
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
