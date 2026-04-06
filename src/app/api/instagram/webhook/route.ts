import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import crypto from "crypto";
import { filterComment } from "@/lib/filters";
import { generateReply } from "@/lib/llm";
import { replyToComment, hideComment, getMediaCaption, hasAlreadyReplied } from "@/lib/instagram";
import { isDuplicate, isOnCooldown } from "@/lib/dedup";
import { canReply } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { OWN_USERNAME } from "@/lib/constants";
import "@/lib/env";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    log("webhook_received", { text: "challenge verified" });
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  // Ler raw body pra validacao de assinatura
  const rawBody = await req.text();

  // Validar assinatura (se APP_SECRET configurado)
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (appSecret) {
    const signature = req.headers.get("x-hub-signature-256") || "";
    const expectedSig = "sha256=" + crypto
      .createHmac("sha256", appSecret)
      .update(rawBody)
      .digest("hex");

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);

    if (sigBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      log("signature_invalid");
      // Retorna 200 mesmo assim — Meta interpreta 401 como endpoint quebrado
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }
  }

  let body: WebhookPayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    log("error", { error: "invalid JSON" });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const fields = (body.entry || []).flatMap((e: { changes?: Array<{ field: string }> }) => (e.changes || []).map(c => c.field));
  log("webhook_received", { processing_time_ms: Date.now() - startTime, fields: fields.join(",") || "empty" });

  // Processar em background com after() — retorna 200 imediatamente
  after(async () => {
    try {
      await processWebhook(body);
    } catch (err) {
      log("error", { error: String(err) });
    }
  });

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

async function processWebhook(body: WebhookPayload) {
  if (body.object !== "instagram") return;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== "comments") continue;

      const { id: commentId, text, media, from, parent_id } = change.value;
      if (!commentId || !text) continue;

      // Ignorar proprios comentarios
      if (from?.username === OWN_USERNAME) continue;

      // Ignorar replies aninhados (so responde primeiro nivel)
      if (parent_id) continue;

      // Deduplicacao
      if (isDuplicate(commentId)) {
        log("duplicate_skipped", { comment_id: commentId });
        continue;
      }

      // Cooldown por usuario por post
      const userId = from?.id || "unknown";
      const mediaId = media?.id || "unknown";
      if (isOnCooldown(userId, mediaId)) {
        log("cooldown_skipped", { comment_id: commentId, username: from?.username, media_id: mediaId });
        continue;
      }

      log("webhook_received", {
        comment_id: commentId,
        username: from?.username,
        media_id: mediaId,
        text: text.slice(0, 100),
      });

      // Filtro de entrada
      const filter = filterComment(text, from?.username);
      if (filter.action === "ignore") {
        log("comment_filtered", { comment_id: commentId, filter_action: "ignore", filter_reason: filter.reason });
        continue;
      }
      if (filter.action === "hide") {
        log("comment_filtered", { comment_id: commentId, filter_action: "hide", filter_reason: filter.reason });
        await hideComment(commentId);
        continue;
      }

      // Rate limiting
      if (!canReply()) {
        log("rate_limited", { comment_id: commentId });
        continue;
      }

      // Check se ja respondeu (protege contra cold start em serverless)
      if (await hasAlreadyReplied(commentId)) {
        log("duplicate_skipped", { comment_id: commentId, reason: "already_replied_api" });
        continue;
      }

      // Buscar caption do post
      const isHater = filter.action === "respond_hater";
      const caption = media?.id ? await getMediaCaption(media.id) : "";

      // Gerar resposta (LLM classifica + responde numa unica chamada)
      const result = await generateReply(text, caption, isHater);
      if (!result) {
        log("reply_failed", { comment_id: commentId, error: "no reply generated" });
        continue;
      }

      log("comment_classified", { comment_id: commentId, category: result.category });
      log("reply_generated", { comment_id: commentId, reply: result.reply.slice(0, 100) });

      // Postar resposta (marca o usuario)
      const mention = from?.username ? `@${from.username} ` : "";
      const success = await replyToComment(commentId, mention + result.reply);
      if (success) {
        log("reply_posted", { comment_id: commentId, username: from?.username, reply: result.reply.slice(0, 100) });
      } else {
        log("reply_failed", { comment_id: commentId, error: "instagram API error" });
      }
    }
  }
}

interface WebhookPayload {
  object: string;
  entry?: Array<{
    id: string;
    time: number;
    changes?: Array<{
      field: string;
      value: {
        id: string;
        text: string;
        from?: { id: string; username: string };
        media?: { id: string };
        parent_id?: string;
      };
    }>;
  }>;
}
