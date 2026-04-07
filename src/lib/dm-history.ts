import { pool } from "./supabase";

const MAX_MESSAGES = 10;
const TTL_MS = 60 * 60 * 1000; // 1 hora

type Message = { role: "user" | "assistant"; text: string };

export async function addMessage(userId: string, role: "user" | "assistant", text: string): Promise<void> {
  try {
    const newMsg = JSON.stringify([{ role, text }]);

    // Upsert: insere ou append ao array existente
    const { rows } = await pool.query(
      `INSERT INTO dm_conversations (user_id, messages, last_activity)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id) DO UPDATE SET
         messages = dm_conversations.messages || $2::jsonb,
         last_activity = now()
       RETURNING messages`,
      [userId, newMsg],
    );

    // Trim pra MAX_MESSAGES se necessario
    const msgs = rows[0]?.messages || [];
    if (msgs.length > MAX_MESSAGES) {
      await pool.query(
        `UPDATE dm_conversations SET messages = $2::jsonb WHERE user_id = $1`,
        [userId, JSON.stringify(msgs.slice(-MAX_MESSAGES))],
      );
    }
  } catch (e) {
    console.error("[dm-history] addMessage error:", e);
  }
}

export async function getHistory(userId: string): Promise<Message[]> {
  try {
    const { rows } = await pool.query(
      `SELECT messages, last_activity FROM dm_conversations WHERE user_id = $1`,
      [userId],
    );

    if (rows.length === 0) return [];

    const lastActivity = new Date(rows[0].last_activity).getTime();
    if (Date.now() - lastActivity > TTL_MS) {
      // Expirou — limpa
      await pool.query(`DELETE FROM dm_conversations WHERE user_id = $1`, [userId]);
      return [];
    }

    return rows[0].messages || [];
  } catch {
    return [];
  }
}

export async function getMessageCount(userId: string): Promise<number> {
  const history = await getHistory(userId);
  return history.filter(m => m.role === "user").length;
}
