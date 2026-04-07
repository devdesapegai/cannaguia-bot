import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import crypto from "crypto";
import { filterComment } from "@/lib/filters";
import { generateReply } from "@/lib/llm";
import { replyToComment, hideComment, getMediaCaption, getMediaComments, hasAlreadyReplied } from "@/lib/instagram";
import { generateDmReply, sendDm, sendDmWithWhatsApp } from "@/lib/dm";
import { generateMentionReply, commentOnMedia, getMentionMediaInfo } from "@/lib/mentions";
import { isDuplicate, isOnCooldown } from "@/lib/dedup";
import { canReply } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { OWN_USERNAME } from "@/lib/constants";
import { getVideoContext, saveFailedReply, logResponse, recordStat } from "@/lib/supabase";
import { shouldSkip, EMOJI_ONLY_SKIP_RATE } from "@/lib/smart-skip";
import { shouldSkipNight } from "@/lib/time-awareness";
import { calculateDelay, INLINE_DELAY_MAX } from "@/lib/delay";
import "@/lib/env";

const EMOJI_ONLY_REGEX = /^[\p{Emoji}\p{Emoji_Component}\s]+$/u;

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

  const fields = (body.entry || []).flatMap((e: WebhookEntry) => (e.changes || []).map(c => c.field));
  const hasMessaging = (body.entry || []).some((e: WebhookEntry) => e.messaging && e.messaging.length > 0);

  // Log completo do payload pra debug
  const payloadSummary = (body.entry || []).map((e: WebhookEntry) => ({
    changes: (e.changes || []).map(c => ({
      field: c.field,
      comment_id: c.value?.id,
      text: c.value?.text?.slice(0, 80),
      username: c.value?.from?.username,
      media_id: c.value?.media?.id,
      parent_id: c.value?.parent_id,
    })),
    messaging: (e.messaging || []).map(m => ({
      sender: m.sender?.id,
      text: m.message?.text?.slice(0, 80),
      is_echo: m.message?.is_echo,
    })),
  }));
  log("webhook_received", {
    processing_time_ms: Date.now() - startTime,
    fields: fields.join(",") || (hasMessaging ? "messaging" : "empty"),
    payload: JSON.stringify(payloadSummary),
  });

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

  const entryCount = body.entry?.length || 0;
  const totalChanges = (body.entry || []).reduce((n, e) => n + (e.changes?.length || 0), 0);
  const totalMsgs = (body.entry || []).reduce((n, e) => n + (e.messaging?.length || 0), 0);
  log("processing_started", { text: `entries=${entryCount} changes=${totalChanges} msgs=${totalMsgs}` });
  recordStat("webhook_received");

  for (const entry of body.entry || []) {
    // Processar DMs
    await processMessaging(entry);

    // Processar mentions
    await processMentions(entry);

    // Processar comentarios
    for (const change of entry.changes || []) {
      if (change.field !== "comments") continue;

      const { id: commentId, text, media, from, parent_id } = change.value;
      if (!commentId || !text) {
        log("comment_skipped", { comment_id: commentId || "none", reason: "no_id_or_text" });
        continue;
      }

      // Ignorar proprios comentarios
      if (from?.username === OWN_USERNAME) {
        log("comment_skipped", { comment_id: commentId, reason: "own_comment" });
        continue;
      }

      // Replies aninhados: so responde se marcou @Maria
      if (parent_id) {
        if (!text.toLowerCase().includes(`@${OWN_USERNAME}`)) {
          log("comment_skipped", { comment_id: commentId, reason: "nested_reply_no_mention", username: from?.username });
          continue;
        }
        log("nested_reply_accepted", { comment_id: commentId, username: from?.username });
      }

      // Deduplicacao
      if (await isDuplicate(commentId)) {
        log("duplicate_skipped", { comment_id: commentId });
        continue;
      }

      // Cooldown por usuario por post (pula se marcou @bot diretamente)
      const userId = from?.id || "unknown";
      const mediaId = media?.id || "unknown";
      const mentionedBot = text.toLowerCase().includes(`@${OWN_USERNAME}`);
      if (!mentionedBot && await isOnCooldown(userId, mediaId)) {
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

      // Smart skip pre-LLM: emoji-only
      const isEmojiOnly = EMOJI_ONLY_REGEX.test(text.trim());
      if (isEmojiOnly && !mentionedBot && Math.random() < EMOJI_ONLY_SKIP_RATE) {
        log("smart_skipped", { comment_id: commentId, reason: "emoji_only" });
        recordStat("smart_skipped");
        continue;
      }

      // Night mode: pula 80% dos comentarios, MAS nunca pula se mencionou @bot
      if (!mentionedBot && shouldSkipNight()) {
        log("night_skipped", { comment_id: commentId });
        recordStat("night_skipped");
        continue;
      }

      // Rate limiting
      if (!await canReply()) {
        log("rate_limited", { comment_id: commentId });
        continue;
      }

      // Check se ja respondeu (protege contra cold start em serverless)
      if (await hasAlreadyReplied(commentId)) {
        log("duplicate_skipped", { comment_id: commentId, reason: "already_replied_api" });
        continue;
      }

      // Buscar caption e contexto do video
      const isHater = filter.action === "respond_hater";
      const [caption, videoContext, recentComments] = await Promise.all([
        media?.id ? getMediaCaption(media.id) : Promise.resolve(""),
        media?.id ? getVideoContext(media.id) : Promise.resolve(""),
        media?.id ? getMediaComments(media.id, commentId) : Promise.resolve([]),
      ]);
      if (caption) {
        log("caption_fetched", { comment_id: commentId, media_id: mediaId, text: caption.slice(0, 100) });
      } else {
        log("caption_empty", { comment_id: commentId, media_id: mediaId });
      }

      // Gerar resposta (LLM classifica + responde com estilo aleatorio)
      const result = await generateReply(text, caption, isHater, videoContext, recentComments, !!parent_id);
      if (!result) {
        log("reply_failed", { comment_id: commentId, error: "no reply generated" });
        continue;
      }

      log("comment_classified", { comment_id: commentId, category: result.category, reply_style: result.replyStyle });
      log("reply_generated", { comment_id: commentId, reply: result.reply.slice(0, 100) });

      // Smart skip pos-LLM: baseado na categoria
      if (shouldSkip(result.category, mentionedBot)) {
        log("smart_skipped", { comment_id: commentId, category: result.category, reason: "category_skip" });
        recordStat("smart_skipped");
        continue;
      }

      // Delay natural (distribuicao log-normal, mediana 90s)
      const mention = from?.username ? `@${from.username} ` : "";
      const delayMs = calculateDelay();

      if (delayMs <= INLINE_DELAY_MAX) {
        // Fast path: delay curto, faz inline
        await new Promise(r => setTimeout(r, delayMs));
        const success = await replyToComment(commentId, mention + result.reply);
        if (success) {
          log("reply_posted", { comment_id: commentId, username: from?.username, reply: result.reply.slice(0, 100), delay_s: Math.round(delayMs / 1000) });
          logResponse({ commentId, originalText: text, botReply: result.reply, category: result.category, mediaId, username: from?.username, replyType: "comment" });
          recordStat("reply_sent", result.category);
        } else {
          log("reply_failed", { comment_id: commentId, error: "instagram API error, saving to retry queue" });
          await saveFailedReply(commentId, result.reply, from?.username, "comment", mediaId);
          recordStat("reply_failed");
        }
      } else {
        // Slow path: delay longo, agenda na fila pro cron postar
        const scheduledAt = new Date(Date.now() + delayMs);
        await saveFailedReply(commentId, result.reply, from?.username, "comment", mediaId, scheduledAt);
        log("reply_scheduled", { comment_id: commentId, delay_s: Math.round(delayMs / 1000), scheduled_at: scheduledAt.toISOString() });
        logResponse({ commentId, originalText: text, botReply: result.reply, category: result.category, mediaId, username: from?.username, replyType: "comment" });
        recordStat("reply_sent", result.category);
      }
    }
  }
}

async function processMentions(entry: WebhookEntry) {
  for (const change of entry.changes || []) {
    if (change.field !== "mentions") continue;

    const mediaId = change.value?.media?.id;
    if (!mediaId) continue;

    // Deduplicacao
    const mentionKey = `mention_${mediaId}`;
    if (await isDuplicate(mentionKey)) {
      log("duplicate_skipped", { comment_id: mentionKey });
      continue;
    }

    log("mention_received", { media_id: mediaId });

    // Rate limiting
    if (!await canReply()) {
      log("rate_limited", { comment_id: mentionKey });
      continue;
    }

    // Buscar info do post que nos marcou
    const mediaInfo = await getMentionMediaInfo(mediaId);
    const caption = mediaInfo?.caption || "";
    const username = mediaInfo?.username || "amigo";

    log("mention_received", { media_id: mediaId, username, text: caption.slice(0, 100) });

    // Delay
    const delay = Math.floor(Math.random() * 30 + 15) * 1000;
    await new Promise(r => setTimeout(r, delay));

    // Gerar resposta
    const reply = await generateMentionReply(caption, username);
    if (!reply) {
      log("reply_failed", { comment_id: mentionKey, error: "no mention reply generated" });
      continue;
    }

    log("reply_generated", { comment_id: mentionKey, reply: reply.slice(0, 100) });

    // Comentar no post
    const success = await commentOnMedia(mediaId, reply);
    if (success) {
      log("mention_replied", { media_id: mediaId, username, reply: reply.slice(0, 100) });
      logResponse({ originalText: caption, botReply: reply, mediaId, username, replyType: "mention" });
      recordStat("reply_sent");
      if (reply.includes("perfil") || reply.includes("@mariaconsultoracannabica")) {
        recordStat("reply_sent", "mention_cta");
      }
    } else {
      log("reply_failed", { comment_id: mentionKey, error: "comment on mention failed" });
      recordStat("reply_failed");
    }
  }
}

async function processMessaging(entry: WebhookEntry) {
  for (const msg of entry.messaging || []) {
    // Ignorar echos (mensagens enviadas por nos)
    if (msg.message?.is_echo) continue;

    const senderId = msg.sender?.id;
    const text = msg.message?.text;
    if (!senderId || !text) continue;

    // Deduplicacao
    const msgId = msg.message?.mid || `dm_${senderId}_${Date.now()}`;
    if (await isDuplicate(msgId)) {
      log("duplicate_skipped", { comment_id: msgId });
      continue;
    }

    log("dm_received", { comment_id: msgId, username: senderId, text: text.slice(0, 100) });

    // Rate limiting
    if (!await canReply()) {
      log("rate_limited", { comment_id: msgId });
      continue;
    }

    // Gerar resposta
    const result = await generateDmReply(text, senderId);
    if (!result) {
      log("reply_failed", { comment_id: msgId, error: "no dm reply generated" });
      continue;
    }

    log("reply_generated", { comment_id: msgId, reply: result.reply.slice(0, 100) });

    // Enviar resposta (com ou sem botao WhatsApp)
    const success = result.whatsapp
      ? await sendDmWithWhatsApp(senderId, result.reply)
      : await sendDm(senderId, result.reply);

    if (success) {
      log("dm_sent", { comment_id: msgId, username: senderId, reply: result.reply.slice(0, 100) });
      logResponse({ commentId: msgId, originalText: text, botReply: result.reply, username: senderId, replyType: "dm" });
      recordStat("reply_sent");
    } else {
      log("reply_failed", { comment_id: msgId, error: "dm send error" });
      recordStat("reply_failed");
    }
  }
}

interface WebhookEntry {
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
  messaging?: Array<{
    sender?: { id: string };
    recipient?: { id: string };
    timestamp?: number;
    message?: {
      mid?: string;
      text?: string;
      is_echo?: boolean;
    };
  }>;
}

interface WebhookPayload {
  object: string;
  entry?: WebhookEntry[];
}
