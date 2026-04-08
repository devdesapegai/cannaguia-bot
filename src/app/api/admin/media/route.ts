import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/supabase";

const GRAPH_URL = "https://graph.instagram.com/v21.0";

// Cache in-memory: chave = cursor (ou "first"), valor = resposta completa
const mediaCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

export async function GET(req: NextRequest) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "INSTAGRAM_ACCESS_TOKEN not set" }, { status: 500 });
  }

  const cursor = req.nextUrl.searchParams.get("cursor") || "";
  const cacheKey = cursor || "_first";
  const noCache = req.nextUrl.searchParams.get("nocache") === "1";
  const limit = 20;

  // Verificar cache
  const cached = mediaCache.get(cacheKey);
  if (!noCache && cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    // Build Instagram API URL
    let igUrl = `${GRAPH_URL}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=${limit}`;
    if (cursor) {
      igUrl += `&after=${cursor}`;
    }

    const [igRes, contextResult] = await Promise.all([
      fetch(igUrl, { headers: { Authorization: `Bearer ${token}` } }),
      pool.query("SELECT media_id, id, context_text FROM video_contexts WHERE media_id IS NOT NULL"),
    ]);

    if (!igRes.ok) {
      const err = await igRes.text();
      return NextResponse.json({ error: `Instagram API: ${err.slice(0, 200)}` }, { status: 500 });
    }

    const igData = await igRes.json();
    const media = igData.data || [];
    const nextCursor = igData.paging?.cursors?.after || null;
    const hasMore = !!igData.paging?.next;

    // Map existing contexts
    const contextMap = new Map<string, { id: string; context_text: string }>();
    for (const row of contextResult.rows) {
      contextMap.set(row.media_id, { id: row.id, context_text: row.context_text });
    }

    const items = media.map((m: Record<string, string>) => {
      const ctx = contextMap.get(m.id);
      return {
        media_id: m.id,
        media_type: m.media_type,
        caption: m.caption || "",
        thumbnail: m.thumbnail_url || m.media_url || "",
        permalink: m.permalink,
        timestamp: m.timestamp,
        context_id: ctx?.id || null,
        context_text: ctx?.context_text || "",
        has_context: !!ctx,
      };
    });

    const result = { items, nextCursor, hasMore };
    mediaCache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { media_id, context_text, caption, permalink } = body;

  if (!media_id || !context_text) {
    return NextResponse.json({ error: "media_id and context_text are required" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO video_contexts (media_id, title, url, context_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (media_id) DO UPDATE SET context_text = $4
       RETURNING *`,
      [media_id, (caption || "").slice(0, 80) || "Sem titulo", permalink || "", context_text]
    );

    // Invalidar cache pra refletir o novo contexto
    mediaCache.clear();

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
