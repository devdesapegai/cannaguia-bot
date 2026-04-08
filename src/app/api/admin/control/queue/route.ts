import { NextRequest, NextResponse } from "next/server";
import { logResponse, recordStat, queryRetry, getVideoContext } from "@/lib/supabase";
import { replyToComment, getMediaCaption, getMediaComments } from "@/lib/instagram";
import { generateReply } from "@/lib/llm";
import { log } from "@/lib/logger";

export async function GET() {
  try {
    const { rows } = await queryRetry(
      `SELECT fr.id, fr.comment_id, fr.username, fr.message, fr.original_text, fr.reply_type,
              fr.media_id, fr.attempts, fr.max_attempts, fr.created_at, fr.next_retry_at,
              vc.title as media_title, vc.url as media_permalink
       FROM failed_replies fr
       LEFT JOIN video_contexts vc ON fr.media_id = vc.media_id
       ORDER BY fr.created_at DESC
       LIMIT 100`
    );
    return NextResponse.json({ data: rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

const VALID_ACTIONS = ["approve", "reject", "edit", "retry", "pause", "resume", "regenerate"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id, message } = body as { action: string; id: number; message?: string };

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    switch (action) {
      case "approve": {
        const { rows } = await queryRetry("SELECT * FROM failed_replies WHERE id = $1", [id]);
        if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const item = rows[0];
        const replyText = message || item.message;
        const wasEdited = !!message && message !== item.message;
        const source = wasEdited ? "manual" : "bot";
        const mention = item.username ? `@${item.username} ` : "";
        const success = await replyToComment(item.comment_id, mention + replyText);
        if (success) {
          await queryRetry("DELETE FROM failed_replies WHERE id = $1", [id]);
          log("reply_posted", { comment_id: item.comment_id, username: item.username, reply: replyText.slice(0, 100), source });

          // Atualizar response_log existente (webhook manual ja inseriu) ou criar novo
          const { rows: existing } = await queryRetry(
            "SELECT id FROM response_log WHERE comment_id = $1", [item.comment_id]
          );
          if (existing[0]) {
            await queryRetry(
              "UPDATE response_log SET bot_reply = $2, source = $3 WHERE id = $1",
              [existing[0].id, replyText, source]
            );
            // Gerar embedding com o texto final
            const { embedAndStore } = await import("@/lib/embeddings");
            embedAndStore(existing[0].id, `${item.original_text || ""} -> ${replyText}`).catch(() => {});
          } else {
            await logResponse({
              commentId: item.comment_id,
              originalText: item.original_text || "",
              botReply: replyText,
              mediaId: item.media_id,
              username: item.username,
              replyType: item.reply_type === "dm" ? "dm" : "comment",
              source,
            });
          }

          await recordStat("reply_sent");
          return NextResponse.json({ ok: true, posted: true });
        }
        return NextResponse.json({ error: "Instagram API failed" }, { status: 502 });
      }

      case "reject": {
        await queryRetry("DELETE FROM failed_replies WHERE id = $1", [id]);
        return NextResponse.json({ ok: true });
      }

      case "edit": {
        if (!message) return NextResponse.json({ error: "Missing message" }, { status: 400 });
        await queryRetry("UPDATE failed_replies SET message = $2 WHERE id = $1", [id, message]);
        return NextResponse.json({ ok: true });
      }

      case "retry": {
        await queryRetry(
          "UPDATE failed_replies SET attempts = 0, next_retry_at = now() WHERE id = $1",
          [id]
        );
        return NextResponse.json({ ok: true });
      }

      case "pause": {
        await queryRetry(
          "UPDATE failed_replies SET next_retry_at = now() + interval '100 years' WHERE id = $1",
          [id]
        );
        return NextResponse.json({ ok: true });
      }

      case "resume": {
        await queryRetry(
          "UPDATE failed_replies SET next_retry_at = now() WHERE id = $1",
          [id]
        );
        return NextResponse.json({ ok: true });
      }

      case "regenerate": {
        const { rows: rRows } = await queryRetry("SELECT * FROM failed_replies WHERE id = $1", [id]);
        if (!rRows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const rItem = rRows[0];
        const originalText = rItem.original_text || "";
        const mediaId = rItem.media_id;

        const [caption, videoContext, recentComments] = await Promise.all([
          mediaId ? getMediaCaption(mediaId) : Promise.resolve(""),
          mediaId ? getVideoContext(mediaId) : Promise.resolve(""),
          mediaId ? getMediaComments(mediaId, rItem.comment_id) : Promise.resolve([]),
        ]);

        const isReply = !!rItem.comment_id && recentComments.some(
          (c) => (c as { isOwn?: boolean }).isOwn,
        );

        const result = await generateReply(originalText, caption, false, videoContext, recentComments, isReply);
        if (!result) {
          return NextResponse.json({ error: "LLM não gerou resposta" }, { status: 500 });
        }

        await queryRetry("UPDATE failed_replies SET message = $2 WHERE id = $1", [id, result.reply]);
        return NextResponse.json({ ok: true, reply: result.reply, category: result.category, replyStyle: result.replyStyle });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
