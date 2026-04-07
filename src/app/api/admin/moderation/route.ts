import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/supabase";

// GET: listar respostas recentes com paginacao
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const filter = searchParams.get("filter"); // "pending" | "reviewed" | null (all)
  const offset = (page - 1) * limit;

  try {
    let whereClause = "";
    if (filter === "pending") whereClause = "WHERE NOT reviewed";
    else if (filter === "reviewed") whereClause = "WHERE reviewed";

    const { rows } = await pool.query(
      `SELECT id, comment_id, original_text, bot_reply, category, media_id, username, reply_type, created_at, reviewed, feedback
       FROM response_log ${whereClause}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) as total FROM response_log ${whereClause}`,
    );

    return NextResponse.json({
      data: rows,
      total: parseInt(countRows[0]?.total || "0"),
      page,
      limit,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH: marcar como revisada com feedback
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, feedback } = body;

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    await pool.query(
      `UPDATE response_log SET reviewed = true, feedback = $2 WHERE id = $1`,
      [id, feedback || null],
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
