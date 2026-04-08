import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/supabase";

// Cache da media list (evita buscar permalinks a cada request)
let mediaListCache: { data: any[]; ts: number } | null = null;
const MEDIA_LIST_TTL = 10 * 60 * 1000; // 10 min

// GET: listar respostas recentes com paginacao
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  // Acao especial: listar posts com contagem e permalink
  if (searchParams.get("action") === "media_list") {
    // Retorna cache se disponivel
    if (mediaListCache && Date.now() - mediaListCache.ts < MEDIA_LIST_TTL) {
      return NextResponse.json({ data: mediaListCache.data });
    }

    try {
      const { rows } = await pool.query(
        `SELECT media_id, COUNT(*) as count FROM response_log
         WHERE media_id IS NOT NULL
         GROUP BY media_id ORDER BY count DESC`,
      );

      // Buscar permalinks do Instagram em paralelo
      const token = process.env.INSTAGRAM_ACCESS_TOKEN;
      if (token) {
        await Promise.all(rows.map(async (row) => {
          try {
            const res = await fetch(`https://graph.instagram.com/v21.0/${row.media_id}?fields=permalink,caption,thumbnail_url`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              row.permalink = data.permalink || null;
              row.caption = data.caption?.slice(0, 60) || null;
              row.thumbnail_url = data.thumbnail_url || null;
            }
          } catch {}
        }));
      }

      mediaListCache = { data: rows, ts: Date.now() };
      return NextResponse.json({ data: rows });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const filter = searchParams.get("filter"); // "pending" | "reviewed" | null (all)
  const mediaId = searchParams.get("media_id");
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (filter === "pending") conditions.push("NOT reviewed");
    else if (filter === "reviewed") conditions.push("reviewed");

    if (mediaId) {
      conditions.push(`media_id = $${paramIdx}`);
      params.push(mediaId);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    params.push(limit, offset);
    const { rows } = await pool.query(
      `SELECT id, comment_id, original_text, bot_reply, category, media_id, username, reply_type, created_at, reviewed, feedback,
       COUNT(*) OVER() AS _total
       FROM response_log ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params,
    );

    return NextResponse.json({
      data: rows.map(({ _total, ...rest }) => rest),
      total: parseInt(rows[0]?._total || "0"),
      page,
      limit,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH: marcar como revisada com feedback (suporta single e batch)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    // Batch: { reviews: [{ id, feedback }, ...] }
    if (body.reviews && Array.isArray(body.reviews)) {
      const reviews: Array<{ id: number; feedback: string }> = body.reviews;
      if (reviews.length === 0) return NextResponse.json({ ok: true });

      // Um unico UPDATE com CASE
      const ids = reviews.map(r => r.id);
      const cases = reviews.map((r, i) => `WHEN id = $${i * 2 + 1} THEN $${i * 2 + 2}`).join(" ");
      const params = reviews.flatMap(r => [r.id, r.feedback || null]);

      await pool.query(
        `UPDATE response_log SET reviewed = true, feedback = CASE ${cases} END WHERE id = ANY($${params.length + 1}::int[])`,
        [...params, ids],
      );

      return NextResponse.json({ ok: true, count: reviews.length });
    }

    // Single: { id, feedback }
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
    console.error("[moderation PATCH error]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
