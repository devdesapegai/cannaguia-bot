import { NextRequest, NextResponse } from "next/server";
import { pool, logResponse, recordStat } from "@/lib/supabase";
import { replyToComment } from "@/lib/instagram";
import { log } from "@/lib/logger";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, comment_id, username, message, original_text, reply_type,
              media_id, attempts, max_attempts, created_at, next_retry_at
       FROM failed_replies
       ORDER BY created_at DESC
       LIMIT 100`
    );
    return NextResponse.json({ data: rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

const VALID_ACTIONS = ["approve", "reject", "edit", "retry", "pause", "resume"];

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
        const { rows } = await pool.query("SELECT * FROM failed_replies WHERE id = $1", [id]);
        if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const item = rows[0];
        const replyText = message || item.message;
        const mention = item.username ? `@${item.username} ` : "";
        const success = await replyToComment(item.comment_id, mention + replyText);
        if (success) {
          await pool.query("DELETE FROM failed_replies WHERE id = $1", [id]);
          log("reply_posted", { comment_id: item.comment_id, username: item.username, reply: replyText.slice(0, 100) });
          await logResponse({
            commentId: item.comment_id,
            originalText: item.original_text || "",
            botReply: replyText,
            mediaId: item.media_id,
            username: item.username,
            replyType: item.reply_type === "dm" ? "dm" : "comment",
          });
          await recordStat("reply_sent");
          return NextResponse.json({ ok: true, posted: true });
        }
        return NextResponse.json({ error: "Instagram API failed" }, { status: 502 });
      }

      case "reject": {
        await pool.query("DELETE FROM failed_replies WHERE id = $1", [id]);
        return NextResponse.json({ ok: true });
      }

      case "edit": {
        if (!message) return NextResponse.json({ error: "Missing message" }, { status: 400 });
        await pool.query("UPDATE failed_replies SET message = $2 WHERE id = $1", [id, message]);
        return NextResponse.json({ ok: true });
      }

      case "retry": {
        await pool.query(
          "UPDATE failed_replies SET attempts = 0, next_retry_at = now() WHERE id = $1",
          [id]
        );
        return NextResponse.json({ ok: true });
      }

      case "pause": {
        await pool.query(
          "UPDATE failed_replies SET next_retry_at = now() + interval '100 years' WHERE id = $1",
          [id]
        );
        return NextResponse.json({ ok: true });
      }

      case "resume": {
        await pool.query(
          "UPDATE failed_replies SET next_retry_at = now() WHERE id = $1",
          [id]
        );
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
