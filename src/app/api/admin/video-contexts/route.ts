import { NextResponse } from "next/server";
import { pool } from "@/lib/supabase";

export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM video_contexts ORDER BY created_at DESC"
    );
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { media_id, title, url, context_text } = body;

  if (!title || !url || !context_text) {
    return NextResponse.json(
      { error: "title, url and context_text are required" },
      { status: 400 }
    );
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO video_contexts (media_id, title, url, context_text)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [media_id || null, title, url, context_text]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
