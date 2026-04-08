import { NextRequest, NextResponse } from "next/server";
import { queryRetry } from "@/lib/supabase";

// Fila de comentarios — so leitura e limpeza (auto-reply desativado)
export async function GET() {
  try {
    const { rows } = await queryRetry(
      `SELECT fr.id, fr.comment_id, fr.username, fr.message, fr.original_text, fr.reply_type,
              fr.media_id, fr.attempts, fr.max_attempts, fr.created_at, fr.next_retry_at
       FROM failed_replies fr
       ORDER BY fr.created_at DESC
       LIMIT 100`
    );
    return NextResponse.json({ data: rows });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

const VALID_ACTIONS = ["reject"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, id } = body as { action: string; id: number };

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // So permite excluir da fila
    await queryRetry("DELETE FROM failed_replies WHERE id = $1", [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
