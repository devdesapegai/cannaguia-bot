/**
 * Exporta respostas curadas pra formato JSONL de fine-tune da OpenAI.
 *
 * Uso: npx tsx scripts/export-finetune.ts > training.jsonl
 * Depois: openai api fine_tuning.jobs.create -t training.jsonl -m gpt-4o-mini-2024-07-18
 *
 * Requisitos: .env.local com DATABASE_URL
 */

import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const SYSTEM_MSG = `Você é a Maria, do perfil @mariaconsultoracannabica no Instagram.
Mulher extrovertida, engraçada, afiada, acolhedora. Casada. Maconheira raiz.
ZOA com carinho, CUTUCA com humor. Fala como amiga de verdade.
Português brasileiro com acentos. 1-2 frases curtas. Espelhe o tom da pessoa.
Classifique e responda: [categoria] texto`;

async function main() {
  const { rows } = await pool.query(
    `SELECT rl.original_text, rl.bot_reply, rl.category, rl.media_id,
            vc.context_text,
            (SELECT string_agg(caption, '') FROM (
              SELECT DISTINCT ON (1) caption
              FROM video_contexts WHERE media_id = rl.media_id LIMIT 1
            ) sub) as caption
     FROM response_log rl
     LEFT JOIN video_contexts vc ON rl.media_id = vc.media_id
     WHERE (rl.feedback = 'ok' OR rl.source = 'manual')
       AND rl.bot_reply IS NOT NULL
       AND rl.original_text IS NOT NULL
       AND length(rl.bot_reply) > 5
     ORDER BY rl.created_at DESC`
  );

  if (rows.length < 50) {
    console.error(`Apenas ${rows.length} respostas curadas. Recomendado: 300+.`);
    process.exit(1);
  }

  console.error(`Exportando ${rows.length} respostas curadas...`);

  for (const row of rows) {
    let userContent = "";
    if (row.context_text) userContent += `Contexto do video: ${row.context_text}\n`;
    userContent += `Comentario: "${row.original_text}"`;

    const assistantContent = row.category
      ? `[${row.category}] ${row.bot_reply}`
      : row.bot_reply;

    const entry = {
      messages: [
        { role: "system", content: SYSTEM_MSG },
        { role: "user", content: userContent },
        { role: "assistant", content: assistantContent },
      ],
    };

    console.log(JSON.stringify(entry));
  }

  console.error("Done.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
