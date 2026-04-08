import { NextRequest, NextResponse } from "next/server";
import { queryRetry } from "@/lib/supabase";

export async function GET() {
  try {
    const { rows } = await queryRetry(
      `SELECT rl.id, rl.comment_id, rl.original_text, rl.bot_reply, rl.category,
              rl.username, rl.reply_type, rl.created_at, rl.media_id,
              vc.title as media_title, vc.url as media_permalink
       FROM response_log rl
       LEFT JOIN video_contexts vc ON rl.media_id = vc.media_id
       ORDER BY rl.created_at DESC
       LIMIT 20`
    );
    return NextResponse.json({ data: rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = (await req.json()) as { id: number };
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await queryRetry("DELETE FROM response_log WHERE id = $1", [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, bot_reply } = (await req.json()) as { id: number; bot_reply: string };
    if (!id || !bot_reply) return NextResponse.json({ error: "Missing id or bot_reply" }, { status: 400 });
    await queryRetry("UPDATE response_log SET bot_reply = $1 WHERE id = $2", [bot_reply, id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
