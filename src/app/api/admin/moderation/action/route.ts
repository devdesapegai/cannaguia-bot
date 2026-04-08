import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/supabase";
import { replyToComment } from "@/lib/instagram";
import { embedAndStore } from "@/lib/embeddings";
import { generateReply } from "@/lib/llm";
import { getMediaCaption, getMediaComments } from "@/lib/instagram";
import { getVideoContext } from "@/lib/supabase";
import { postProcess } from "@/lib/post-process";

// POST: ações sobre respostas (enviar, regenerar, atualizar texto)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id } = body;

    if (!id || !action) {
      return NextResponse.json({ error: "id e action obrigatórios" }, { status: 400 });
    }

    // Buscar resposta no response_log
    const { rows } = await pool.query(
      `SELECT id, comment_id, original_text, bot_reply, category, media_id, username, reply_type
       FROM response_log WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "resposta não encontrada" }, { status: 404 });
    }
    const item = rows[0];

    // === ENVIAR: posta no Instagram + marca como revisada + embedding ===
    if (action === "send") {
      const reply = body.reply || item.bot_reply;
      if (!item.comment_id) {
        return NextResponse.json({ error: "sem comment_id pra responder" }, { status: 400 });
      }

      const mention = item.username ? `@${item.username} ` : "";
      const success = await replyToComment(item.comment_id, mention + reply);
      if (!success) {
        return NextResponse.json({ error: "falha ao postar no Instagram" }, { status: 502 });
      }

      // Atualizar response_log: marcar revisada, atualizar reply se editada, source=manual
      await pool.query(
        `UPDATE response_log SET bot_reply = $2, reviewed = true, feedback = 'ok', source = 'manual' WHERE id = $1`,
        [id, reply],
      );

      // Remover da fila de retries
      if (item.comment_id) {
        await pool.query(`DELETE FROM failed_replies WHERE comment_id = $1`, [item.comment_id]);
      }

      // Embedding
      embedAndStore(id, `${item.original_text} -> ${reply}`).catch(() => {});

      return NextResponse.json({ ok: true, posted: true });
    }

    // === REGENERAR: chama LLM de novo e retorna nova resposta ===
    if (action === "regenerate") {
      const mediaId = item.media_id;
      const [caption, videoContext, recentComments] = await Promise.all([
        mediaId ? getMediaCaption(mediaId) : Promise.resolve(""),
        mediaId ? getVideoContext(mediaId) : Promise.resolve(""),
        mediaId ? getMediaComments(mediaId, item.comment_id) : Promise.resolve([]),
      ]);

      const isHater = item.category === "hater";
      const isReply = !!item.comment_id && recentComments.some(
        (c) => (c as { isOwn?: boolean }).isOwn,
      );

      const result = await generateReply(
        item.original_text, caption, isHater, videoContext, recentComments, isReply,
      );

      if (!result) {
        return NextResponse.json({ error: "LLM não gerou resposta" }, { status: 500 });
      }

      // Atualizar no banco
      await pool.query(
        `UPDATE response_log SET bot_reply = $2, category = $3 WHERE id = $1`,
        [id, result.reply, result.category],
      );

      return NextResponse.json({
        ok: true,
        reply: result.reply,
        category: result.category,
        replyStyle: result.replyStyle,
      });
    }

    // === UPDATE: só atualiza o texto da resposta (edição manual) ===
    if (action === "update") {
      const reply = body.reply;
      if (!reply || typeof reply !== "string") {
        return NextResponse.json({ error: "reply obrigatório" }, { status: 400 });
      }
      const processed = postProcess(reply);

      await pool.query(
        `UPDATE response_log SET bot_reply = $2 WHERE id = $1`,
        [id, processed],
      );

      return NextResponse.json({ ok: true, reply: processed });
    }

    return NextResponse.json({ error: `action desconhecida: ${action}` }, { status: 400 });
  } catch (e) {
    console.error("[moderation action error]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
