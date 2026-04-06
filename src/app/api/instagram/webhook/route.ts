import { NextRequest, NextResponse } from "next/server";
import { filterComment } from "@/lib/filters";
import { generateReply } from "@/lib/llm";
import { replyToComment, hideComment, getMediaCaption } from "@/lib/instagram";

const OWN_USERNAME = "mariaconsultoracannabica";

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
    await processWebhook(body);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    console.error("[webhook] Error:", error);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

async function processWebhook(body: WebhookPayload) {
  if (body.object !== "instagram") return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "comments") continue;

      const { id: commentId, text, media, from, parent_id } = change.value;
      if (!commentId || !text) continue;

      // Ignorar comentarios do proprio bot
      if (from?.username === OWN_USERNAME) {
        console.log("[webhook] Ignoring own comment");
        return;
      }

      // Ignorar replies (comentarios aninhados) — so responde primeiro nivel
      if (parent_id) {
        console.log("[webhook] Ignoring nested reply");
        return;
      }

      console.log(`[webhook] Comment from @${from?.username}: "${text}" (${commentId})`);

      const filter = filterComment(text);
      console.log("[webhook] Filter:", JSON.stringify(filter));

      if (filter.action === "ignore") { console.log(`[webhook] Ignored: ${filter.reason}`); return; }
      if (filter.action === "hide") { await hideComment(commentId); return; }

      const caption = media?.id ? await getMediaCaption(media.id) : "";
      const isHater = filter.action === "respond_hater";

      console.log("[webhook] Generating reply...");
      const reply = await generateReply(text, caption, isHater);
      if (!reply) { console.log("[webhook] No reply generated"); return; }

      console.log(`[webhook] Replying: "${reply}"`);
      const success = await replyToComment(commentId, reply);
      console.log(`[webhook] ${success ? "SUCCESS" : "FAILED"}`);
    }
  }
}

interface WebhookPayload {
  object: string;
  entry?: Array<{ id: string; time: number; changes?: Array<{ field: string; value: { id: string; text: string; from?: { id: string; username: string }; media?: { id: string }; parent_id?: string; }; }>; }>;
}
