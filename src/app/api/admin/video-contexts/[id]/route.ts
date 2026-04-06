import { NextResponse } from "next/server";
import { pool } from "@/lib/supabase";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM video_contexts WHERE id = $1",
      [id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { media_id, title, url, context_text } = body;

  const fields: string[] = [];
  const values: (string | null)[] = [];
  let i = 1;

  if (title !== undefined) { fields.push(`title = $${i++}`); values.push(title); }
  if (url !== undefined) { fields.push(`url = $${i++}`); values.push(url); }
  if (context_text !== undefined) { fields.push(`context_text = $${i++}`); values.push(context_text); }
  if (media_id !== undefined) { fields.push(`media_id = $${i++}`); values.push(media_id || null); }

  if (fields.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  values.push(id);

  try {
    const { rows } = await pool.query(
      `UPDATE video_contexts SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await pool.query("DELETE FROM video_contexts WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
