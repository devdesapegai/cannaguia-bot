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
      `SELECT reply_text FROM recent_replies ORDER BY created_at DESC LIMIT 20`,
    );
    return rows.map(r => r.reply_text);
  } catch {
    return [];
  }
}

/** Checa se a resposta e muito parecida com alguma recente */
export async function isDuplicateReply(reply: string): Promise<boolean> {
  const recent = await getRecentReplies();
  const normalized = reply.toLowerCase().replace(/[^\w\s]/g, "").trim();

  for (const r of recent) {
    const rNorm = r.toLowerCase().replace(/[^\w\s]/g, "").trim();
    // Identica
    if (rNorm === normalized) return true;
    // Contem a outra (uma e substring da outra)
    if (normalized.includes(rNorm) || rNorm.includes(normalized)) return true;
    // Primeiras 5 palavras iguais
    const words = normalized.split(/\s+/).slice(0, 5).join(" ");
    const rWords = rNorm.split(/\s+/).slice(0, 5).join(" ");
    if (words.length > 10 && words === rWords) return true;
  }

  return false;
}
