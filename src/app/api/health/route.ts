import { NextResponse } from "next/server";
import { stats } from "@/lib/logger";

export async function GET() {
  const now = Date.now();
  const uptimeMs = now - stats.started_at;
  const lastWebhookAgo = stats.last_webhook_at ? now - stats.last_webhook_at : null;
  const lastReplyAgo = stats.last_reply_at ? now - stats.last_reply_at : null;

  return NextResponse.json({
    status: "ok",
    uptime_seconds: Math.floor(uptimeMs / 1000),
    webhooks_received: stats.webhooks_received,
    replies_sent: stats.replies_sent,
    replies_failed: stats.replies_failed,
    errors: stats.errors,
    last_webhook_ago_seconds: lastWebhookAgo ? Math.floor(lastWebhookAgo / 1000) : null,
    last_reply_ago_seconds: lastReplyAgo ? Math.floor(lastReplyAgo / 1000) : null,
    token_configured: !!process.env.INSTAGRAM_ACCESS_TOKEN,
    app_secret_configured: !!process.env.INSTAGRAM_APP_SECRET,
  });
}
