import { pool } from "./supabase";

const MAX_REPLIES = 200;
const BURST_MAX = 300;
const WARN_THRESHOLD = 170;
const WINDOW_MS = 60 * 60 * 1000; // 1 hora

/** Detecta se tem post novo (primeira resposta ha menos de 1h) */
async function isRecentPost(): Promise<boolean> {
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM response_log
       WHERE created_at > now() - interval '60 minutes'
       AND reply_type = 'comment'
       GROUP BY media_id
       HAVING MIN(created_at) > now() - interval '60 minutes'
       LIMIT 1`,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function canReply(): Promise<boolean> {
  try {
    const effectiveMax = await isRecentPost() ? BURST_MAX : MAX_REPLIES;

    const { rows } = await pool.query(
      `SELECT window_start, reply_count FROM rate_limit_window WHERE id = 1`,
    );

    if (rows.length === 0) {
      await pool.query(
        `INSERT INTO rate_limit_window (id, window_start, reply_count) VALUES (1, now(), 1) ON CONFLICT (id) DO NOTHING`,
      );
      return true;
    }

    const windowStart = new Date(rows[0].window_start).getTime();
    const currentCount = rows[0].reply_count;

    if (Date.now() - windowStart > WINDOW_MS) {
      await pool.query(
        `UPDATE rate_limit_window SET window_start = now(), reply_count = 1 WHERE id = 1`,
      );
      return true;
    }

    if (currentCount >= effectiveMax) {
      console.warn(`[rate-limit] Limite atingido: ${currentCount}/${effectiveMax} replies na ultima hora`);
      return false;
    }

    if (currentCount >= WARN_THRESHOLD) {
      console.warn(`[rate-limit] Aproximando do limite: ${currentCount}/${effectiveMax}`);
    }

    const { rowCount } = await pool.query(
      `UPDATE rate_limit_window SET reply_count = reply_count + 1 WHERE id = 1 AND reply_count < $1 RETURNING reply_count`,
      [effectiveMax],
    );

    return (rowCount ?? 0) > 0;
  } catch {
    return true;
  }
}
