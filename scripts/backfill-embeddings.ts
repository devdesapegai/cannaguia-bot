/**
 * Backfill embeddings para todas as respostas do response_log.
 *
 * Uso: npx tsx scripts/backfill-embeddings.ts
 *
 * Processa em batches de 50, com rate limit de 100ms entre requests.
 * Seguro pra rodar multiplas vezes — pula rows que ja tem embedding.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import OpenAI from "openai";
import pg from "pg";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

const BATCH_SIZE = 50;
const DELAY_MS = 100;

async function embedText(text: string): Promise<number[] | null> {
  try {
    const res = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 512,
    });
    return res.data[0]?.embedding ?? null;
  } catch (e: any) {
    if (e?.status === 429) {
      console.log("  Rate limited, esperando 5s...");
      await new Promise(r => setTimeout(r, 5000));
      return embedText(text);
    }
    console.error("  Erro embed:", e?.message || e);
    return null;
  }
}

async function main() {
  const { rows: [{ count: total }] } = await pool.query(
    "SELECT COUNT(*) as count FROM response_log WHERE embedding IS NULL"
  );
  console.log(`${total} rows sem embedding\n`);

  let processed = 0;
  let errors = 0;

  while (true) {
    const { rows } = await pool.query(
      `SELECT id, original_text, bot_reply FROM response_log
       WHERE embedding IS NULL
       ORDER BY id
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (rows.length === 0) break;

    for (const row of rows) {
      const text = `${row.original_text} -> ${row.bot_reply}`;
      const embedding = await embedText(text);

      if (embedding) {
        const vectorStr = `[${embedding.join(",")}]`;
        await pool.query(
          "UPDATE response_log SET embedding = $1::vector WHERE id = $2",
          [vectorStr, row.id]
        );
        processed++;
      } else {
        errors++;
      }

      if (processed % 10 === 0) {
        process.stdout.write(`\r  ${processed}/${total} processados`);
      }

      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n\nDone: ${processed} embeddings criados, ${errors} erros`);
  await pool.end();
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
