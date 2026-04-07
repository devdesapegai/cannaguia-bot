import { pool } from "./supabase";

export async function addRecentReply(reply: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO recent_replies (reply_text) VALUES ($1)`,
      [reply],
    );
    // Limpa replies antigas (> 2 horas)
    await pool.query(
      `DELETE FROM recent_replies WHERE created_at < now() - interval '2 hours'`,
    );
  } catch {}
}

export async function getRecentReplies(): Promise<string[]> {
  try {
    const { rows } = await pool.query(
      `SELECT reply_text FROM recent_replies ORDER BY created_at DESC LIMIT 10`,
    );
    return rows.map(r => r.reply_text);
  } catch {
    return [];
  }
}
