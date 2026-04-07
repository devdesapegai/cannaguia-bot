import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { pool } from "@/lib/supabase";

const GRAPH_URL = "https://graph.instagram.com/v21.0";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { media_id } = body;

    if (!media_id) {
      return NextResponse.json({ error: "media_id required" }, { status: 400 });
    }

    const token = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "INSTAGRAM_ACCESS_TOKEN not configured" }, { status: 500 });
    }

    // 1. Buscar media_url e tipo do post
    const mediaRes = await fetch(
      `${GRAPH_URL}/${media_id}?fields=media_url,media_type,caption,permalink`,
      { headers: { "Authorization": `Bearer ${token}` } },
    );

    if (!mediaRes.ok) {
      const err = await mediaRes.text();
      return NextResponse.json({ error: `Failed to fetch media: ${err}` }, { status: 400 });
    }

    const mediaData = await mediaRes.json();

    if (mediaData.media_type !== "VIDEO") {
      return NextResponse.json({ error: "Media is not a video" }, { status: 400 });
    }

    if (!mediaData.media_url) {
      return NextResponse.json({ error: "No media_url available" }, { status: 400 });
    }

    // 2. Baixar o video
    const videoRes = await fetch(mediaData.media_url);
    if (!videoRes.ok) {
      return NextResponse.json({ error: "Failed to download video" }, { status: 500 });
    }

    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    // 3. Enviar pra Whisper
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const file = new File([videoBuffer], "video.mp4", { type: "video/mp4" });

    const transcription = await client.audio.transcriptions.create({
      model: "whisper-1",
      file,
      language: "pt",
    });

    const transcript = transcription.text?.trim();
    if (!transcript) {
      return NextResponse.json({ error: "Transcription returned empty" }, { status: 500 });
    }

    // 4. Salvar na tabela video_contexts
    const title = (mediaData.caption || "").slice(0, 80) || "Video sem caption";
    const permalink = mediaData.permalink || "";

    await pool.query(
      `INSERT INTO video_contexts (media_id, title, url, context_text)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (media_id) DO UPDATE SET
         context_text = $4,
         title = $2,
         url = $3,
         updated_at = now()`,
      [media_id, title, permalink, transcript],
    );

    return NextResponse.json({
      ok: true,
      media_id,
      transcript_length: transcript.length,
      preview: transcript.slice(0, 200),
    });
  } catch (e) {
    console.error("[transcribe] error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
