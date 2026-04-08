import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/supabase";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, comment_id, original_text, bot_reply, category, username, reply_type, created_at
       FROM response_log
       ORDER BY created_at DESC
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
    await pool.query("DELETE FROM response_log WHERE id = $1", [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, bot_reply } = (await req.json()) as { id: number; bot_reply: string };
    if (!id || !bot_reply) return NextResponse.json({ error: "Missing id or bot_reply" }, { status: 400 });
    await pool.query("UPDATE response_log SET bot_reply = $1 WHERE id = $2", [bot_reply, id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
