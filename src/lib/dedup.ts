import { pool } from "./supabase";

// Retorna true se o comentario ja foi processado
export async function isDuplicate(commentId: string): Promise<boolean> {
  try {
    const { rowCount } = await pool.query(
      `INSERT INTO processed_comments (comment_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING comment_id`,
      [commentId],
    );
    return rowCount === 0; // se nao inseriu, ja existia
  } catch {
    return false; // em caso de erro, permite processar
  }
}

// Retorna true se o usuario ja foi respondido nesse post recentemente (30 min)
export async function isOnCooldown(userId: string, mediaId: string): Promise<boolean> {
  try {
    // Tenta inserir; se ja existe e ta dentro de 30 min, e cooldown
    const { rows } = await pool.query(
      `SELECT created_at FROM user_cooldowns WHERE user_id = $1 AND media_id = $2`,
      [userId, mediaId],
    );

    if (rows.length > 0) {
      const created = new Date(rows[0].created_at).getTime();
      if (Date.now() - created < 30 * 60 * 1000) return true;
      // Expirou, atualiza o timestamp
      await pool.query(
        `UPDATE user_cooldowns SET created_at = now() WHERE user_id = $1 AND media_id = $2`,
        [userId, mediaId],
      );
      return false;
    }

    await pool.query(
      `INSERT INTO user_cooldowns (user_id, media_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, mediaId],
    );
    return false;
  } catch {
    return false;
  }
}
