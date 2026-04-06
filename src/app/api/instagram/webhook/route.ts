import { NextRequest, NextResponse } from "next/server";
import { filterComment } from "@/lib/filters";
import { generateReply } from "@/lib/llm";
import { replyToComment, hideComment, getMediaCaption } from "@/lib/instagram";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log("[webhook] Challenge verified");
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    processWebhook(body).catch((err) => console.error("[webhook] Processing error:", err));
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("[webhook] Parse error:", error);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

async function processWebhook(body: WebhookPayload) {
  if (body.object !== "instagram") return;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "comments") continue;
      const { id: commentId, text, media } = change.value;
      if (!commentId || !text) continue;
      console.log(`[webhook] Comment: "${text}" (${commentId})`);
      const filter = filterComment(text);
      if (filter.action === "ignore") { console.log(`[webhook] Ignored: ${filter.reason}`); continue; }
      if (filter.action === "hide") { console.log(`[webhook] Hiding spam: ${filter.reason}`); await hideComment(commentId); continue; }
      const caption = media?.id ? await getMediaCaption(media.id) : "";
      const delay = 30000 + Math.random() * 30000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      const isHater = filter.action === "respond_hater";
      const reply = await generateReply(text, caption, isHater);
      if (!reply) { console.log("[webhook] No reply generated"); continue; }
      const success = await replyToComment(commentId, reply);
      console.log(`[webhook] ${success ? "Replied" : "Failed"}: "${reply.slice(0, 50)}..."`);
    }
  }
}

interface WebhookPayload {
  object: string;
  entry?: Array<{ id: string; time: number; changes?: Array<{ field: string; value: { id: string; text: string; from?: { id: string; username: string }; media?: { id: string }; parent_id?: string; }; }>; }>;
}
