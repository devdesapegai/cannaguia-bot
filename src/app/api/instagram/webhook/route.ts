import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import crypto from "crypto";
import { generateDmReply, sendDm, sendDmWithWhatsApp } from "@/lib/dm";
import { isDuplicate } from "@/lib/dedup";
import { canReply } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { recordStat, getBotMode, logResponse, saveFailedReply } from "@/lib/supabase";
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
  const botMode = await getBotMode();
  if (botMode === "pausado") {
    return NextResponse.json({ status: "maintenance" }, { status: 200 });
  }

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
      await processWebhook(body, botMode);
    } catch (err) {
      log("error", { error: String(err) });
    }
  });

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

async function processWebhook(body: WebhookPayload, botMode: string) {
  if (body.object !== "instagram") return;

  const entryCount = body.entry?.length || 0;
  const totalChanges = (body.entry || []).reduce((n, e) => n + (e.changes?.length || 0), 0);
  const totalMsgs = (body.entry || []).reduce((n, e) => n + (e.messaging?.length || 0), 0);
  log("processing_started", { text: `entries=${entryCount} changes=${totalChanges} msgs=${totalMsgs}` });
  recordStat("webhook_received");

  for (const entry of body.entry || []) {
    // Processar DMs (unico fluxo ativo)
    await processMessaging(entry, botMode);

    // Comentarios e mentions desativados — Maria responde manualmente
    // Webhooks continuam chegando pra log/debug
  }
}

async function processMessaging(entry: WebhookEntry, botMode: string) {
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

    // Modo manual: salva na fila
    if (botMode === "manual") {
      await saveFailedReply(msgId, result.reply, senderId, "dm", undefined, undefined, text);
      log("reply_scheduled", { comment_id: msgId, reason: "manual_mode" });
      logResponse({ commentId: msgId, originalText: text, botReply: result.reply, username: senderId, replyType: "dm" });
      continue;
    }

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
