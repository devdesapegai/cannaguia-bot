import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/supabase";

const GRAPH_URL = "https://graph.instagram.com/v21.0";

type IgMedia = {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
};

async function fetchAllMedia(token: string): Promise<IgMedia[]> {
  const all: IgMedia[] = [];
  let nextUrl: string | null =
    `${GRAPH_URL}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=50`;

  while (nextUrl) {
    const res: Response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const data: { data?: IgMedia[]; paging?: { next?: string } } = await res.json();
    all.push(...(data.data || []));
    nextUrl = data.paging?.next || null;
  }

  return all;
}

export async function GET(req: NextRequest) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "INSTAGRAM_ACCESS_TOKEN not set" }, { status: 500 });
  }

  try {
    // Fetch media from Instagram and existing contexts in parallel
    const [media, contextResult] = await Promise.all([
      fetchAllMedia(token),
      pool.query("SELECT media_id, id, context_text FROM video_contexts WHERE media_id IS NOT NULL"),
    ]);

    // Map existing contexts by media_id
    const contextMap = new Map<string, { id: string; context_text: string }>();
    for (const row of contextResult.rows) {
      contextMap.set(row.media_id, { id: row.id, context_text: row.context_text });
    }

    // Merge
    const merged = media.map((m) => {
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

    return NextResponse.json(merged);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// Save/update context for a media
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { media_id, context_text, caption, permalink } = body;

  if (!media_id || !context_text) {
    return NextResponse.json({ error: "media_id and context_text are required" }, { status: 400 });
  }

  try {
    // Upsert: insert or update if media_id already exists
    const { rows } = await pool.query(
      `INSERT INTO video_contexts (media_id, title, url, context_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (media_id) DO UPDATE SET context_text = $4
       RETURNING *`,
      [media_id, (caption || "").slice(0, 80) || "Sem titulo", permalink || "", context_text]
    );

    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
