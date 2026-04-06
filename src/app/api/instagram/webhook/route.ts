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

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  console.log("[webhook] POST received");
  try {
    const body = await req.json();
    console.log("[webhook] Body parsed:", JSON.stringify(body).slice(0, 500));
    await processWebhook(body);
    console.log("[webhook] Processing complete");
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("[webhook] Error:", error);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

async function processWebhook(body: WebhookPayload) {
  console.log("[webhook] Object:", body.object);
  if (body.object !== "instagram") { console.log("[webhook] Not instagram, skipping"); return; }

  for (const entry of body.entry || []) {
    console.log("[webhook] Entry:", entry.id);
    for (const change of entry.changes || []) {
      console.log("[webhook] Field:", change.field);
      if (change.field !== "comments") { console.log("[webhook] Not comments, skipping"); continue; }

      const { id: commentId, text, media } = change.value;
      if (!commentId || !text) { console.log("[webhook] No commentId or text"); continue; }

      console.log(`[webhook] Comment: "${text}" (${commentId})`);

      const filter = filterComment(text);
      console.log("[webhook] Filter result:", JSON.stringify(filter));

      if (filter.action === "ignore") { console.log(`[webhook] Ignored: ${filter.reason}`); return; }
      if (filter.action === "hide") { await hideComment(commentId); return; }

      console.log("[webhook] Getting caption...");
      const caption = media?.id ? await getMediaCaption(media.id) : "";
      console.log("[webhook] Caption:", caption.slice(0, 100));

      const isHater = filter.action === "respond_hater";
      console.log("[webhook] Generating reply...");
      const reply = await generateReply(text, caption, isHater);
      console.log("[webhook] Reply:", reply);

      if (!reply) { console.log("[webhook] No reply generated"); return; }

      console.log("[webhook] Posting reply...");
      const success = await replyToComment(commentId, reply);
      console.log(`[webhook] ${success ? "SUCCESS" : "FAILED"}`);
    }
  }
}

interface WebhookPayload {
  object: string;
  entry?: Array<{ id: string; time: number; changes?: Array<{ field: string; value: { id: string; text: string; from?: { id: string; username: string }; media?: { id: string }; parent_id?: string; }; }>; }>;
}
