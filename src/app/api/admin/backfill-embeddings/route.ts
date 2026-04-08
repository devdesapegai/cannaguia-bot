import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { embedText } from "@/lib/embeddings";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rows: pending } = await pool.query(
    `SELECT id, original_text, bot_reply FROM response_log
     WHERE embedding IS NULL AND reply_type = 'comment'
     ORDER BY created_at DESC
     LIMIT 50`,
  );

  let processed = 0;
  for (const row of pending) {
    const text = `${row.original_text} -> ${row.bot_reply}`;
    const embedding = await embedText(text);
    if (!embedding) continue;

    const vectorStr = `[${embedding.join(",")}]`;
    await pool.query(
      `UPDATE response_log SET embedding = $1::vector WHERE id = $2`,
      [vectorStr, row.id],
    );
    processed++;
  }

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) as remaining FROM response_log
     WHERE embedding IS NULL AND reply_type = 'comment'`,
  );
  const remaining = parseInt(countRows[0]?.remaining || "0", 10);

  return NextResponse.json({ processed, remaining });
}
