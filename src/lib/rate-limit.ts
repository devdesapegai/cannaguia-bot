import { pool } from "./supabase";

const MAX_REPLIES = 500;
const WARN_THRESHOLD = 400;
const WINDOW_MS = 60 * 60 * 1000; // 1 hora

export async function canReply(): Promise<boolean> {
  try {
    // Ler window atual
    const { rows } = await pool.query(
      `SELECT window_start, reply_count FROM rate_limit_window WHERE id = 1`,
    );

    if (rows.length === 0) {
      // Primeira vez — criar row
      await pool.query(
        `INSERT INTO rate_limit_window (id, window_start, reply_count) VALUES (1, now(), 1) ON CONFLICT (id) DO NOTHING`,
      );
      return true;
    }

    const windowStart = new Date(rows[0].window_start).getTime();
    const currentCount = rows[0].reply_count;

    // Se window expirou, reseta
    if (Date.now() - windowStart > WINDOW_MS) {
      await pool.query(
        `UPDATE rate_limit_window SET window_start = now(), reply_count = 1 WHERE id = 1`,
      );
      return true;
    }

    if (currentCount >= MAX_REPLIES) {
      console.warn(`[rate-limit] Limite atingido: ${currentCount}/${MAX_REPLIES} replies na ultima hora`);
      return false;
    }

    if (currentCount >= WARN_THRESHOLD) {
      console.warn(`[rate-limit] Aproximando do limite: ${currentCount}/${MAX_REPLIES}`);
    }

    // Incremento atomico com check
    const { rowCount } = await pool.query(
      `UPDATE rate_limit_window SET reply_count = reply_count + 1 WHERE id = 1 AND reply_count < $1 RETURNING reply_count`,
      [MAX_REPLIES],
    );

    return (rowCount ?? 0) > 0;
  } catch {
    return true; // em caso de erro de DB, permite (fail-open)
  }
}
