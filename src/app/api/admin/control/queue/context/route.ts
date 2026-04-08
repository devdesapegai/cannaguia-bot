import { NextRequest, NextResponse } from "next/server";
import { getMediaComments, getMediaCaption } from "@/lib/instagram";
import { getVideoContext } from "@/lib/supabase";

// GET: busca contexto completo de um item da fila (comentarios recentes + video context + caption)
export async function GET(req: NextRequest) {
  const mediaId = req.nextUrl.searchParams.get("media_id");
  const commentId = req.nextUrl.searchParams.get("comment_id");

  if (!mediaId) {
    return NextResponse.json({ error: "media_id required" }, { status: 400 });
  }

  try {
    const [comments, caption, videoContext] = await Promise.all([
      getMediaComments(mediaId, commentId || undefined),
      getMediaCaption(mediaId),
      getVideoContext(mediaId),
    ]);

    return NextResponse.json({
      comments: comments.slice(0, 15),
      caption: caption || null,
      videoContext: videoContext || null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
