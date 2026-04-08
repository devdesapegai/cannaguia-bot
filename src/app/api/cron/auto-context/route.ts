import { NextRequest, NextResponse } from "next/server";
import { queryRetry } from "@/lib/supabase";
import { getMediaCaption } from "@/lib/instagram";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONTEXT_PROMPT = `Você é uma assistente que analisa posts do Instagram. Com base na caption do post e nos comentários dos usuários, gere um contexto descritivo de 3-4 frases que explique:

1. Do que o vídeo/post trata (tema principal)
2. Qual o gancho que engajou (a piada, o meme, a situação que viralizou)
3. As piadas internas e gírias que surgiram nos comentários
4. O tom geral da conversa (humor, sério, educativo, etc)

Seja direto e específico. Use linguagem informal. Não invente — baseie-se apenas no que os comentários revelam.`;

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Buscar posts com 20+ respostas que nao tem contexto ou contexto velho (>6h)
    const { rows: posts } = await queryRetry(
      `SELECT rl.media_id, COUNT(*)::int as comment_count
       FROM response_log rl
       LEFT JOIN video_contexts vc ON rl.media_id = vc.media_id
       WHERE rl.media_id IS NOT NULL
         AND rl.reply_type = 'comment'
         AND (vc.media_id IS NULL OR vc.updated_at < now() - interval '6 hours')
       GROUP BY rl.media_id
       HAVING COUNT(*) >= 20
       ORDER BY COUNT(*) DESC
       LIMIT 3`
    );

    if (posts.length === 0) {
      return NextResponse.json({ updated: 0, reason: "no posts need context" });
    }

    let updated = 0;

    for (const post of posts) {
      const mediaId = post.media_id;

      // Buscar caption
      const caption = await getMediaCaption(mediaId);

      // Buscar comentarios + respostas da Maria
      const { rows: comments } = await queryRetry(
        `SELECT username, original_text, bot_reply
         FROM response_log
         WHERE media_id = $1 AND reply_type = 'comment'
         ORDER BY created_at DESC
         LIMIT 30`,
        [mediaId]
      );

      if (comments.length < 10) continue;

      // Montar input pro LLM
      let input = "";
      if (caption) input += `Caption do post: "${caption}"\n\n`;
      input += `Comentários e respostas (${comments.length} mais recentes):\n`;
      for (const c of comments) {
        input += `- @${c.username || "user"}: "${c.original_text}"\n`;
        if (c.bot_reply) input += `  Maria respondeu: "${c.bot_reply}"\n`;
      }

      // Gerar contexto
      const response = await client.responses.create({
        model: "gpt-4o-mini",
        instructions: CONTEXT_PROMPT,
        input,
        temperature: 0.5,
        max_output_tokens: 300,
      });

      const contextText = response.output_text?.trim();
      if (!contextText) continue;

      // Salvar/atualizar video_contexts
      await queryRetry(
        `INSERT INTO video_contexts (media_id, title, url, context_text)
         VALUES ($1, $2, '', $3)
         ON CONFLICT (media_id) DO UPDATE SET
           context_text = $3,
           updated_at = now()`,
        [mediaId, (caption || "").slice(0, 80) || "Auto-contexto", contextText]
      );

      updated++;
    }

    return NextResponse.json({ updated, posts: posts.map(p => p.media_id) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
