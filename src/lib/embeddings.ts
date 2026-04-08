import OpenAI from "openai";
import { pool } from "@/lib/db";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type SimilarComment = {
  original_text: string;
  bot_reply: string;
  media_id: string;
  category: string;
  similarity: number;
};

export async function embedText(text: string): Promise<number[] | null> {
  try {
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 512,
    });
    return response.data[0]?.embedding ?? null;
  } catch (e) {
    console.error("[embeddings] embedText error:", e);
    return null;
  }
}

export async function embedAndStore(responseLogId: number, text: string): Promise<void> {
  try {
    const embedding = await embedText(text);
    if (!embedding) return;

    const vectorStr = `[${embedding.join(",")}]`;
    await pool.query(
      `UPDATE response_log SET embedding = $1::vector WHERE id = $2`,
      [vectorStr, responseLogId],
    );
  } catch (e) {
    console.error("[embeddings] embedAndStore error:", e);
  }
}

export async function searchSimilar(
  text: string,
  excludeMediaId: string,
  limit = 5,
): Promise<SimilarComment[]> {
  try {
    const embedding = await embedText(text);
    if (!embedding) return [];

    const vectorStr = `[${embedding.join(",")}]`;
    const { rows } = await pool.query(
      `SELECT original_text, bot_reply, media_id, category,
              1 - (embedding <=> $1::vector) as similarity
       FROM response_log
       WHERE embedding IS NOT NULL
         AND media_id != $2
         AND created_at > now() - interval '30 days'
         AND 1 - (embedding <=> $1::vector) > 0.4
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [vectorStr, excludeMediaId, limit],
    );

    return rows.filter((r: SimilarComment) => r.similarity >= 0.4);
  } catch (e) {
    console.error("[embeddings] searchSimilar error:", e);
    return [];
  }
}
