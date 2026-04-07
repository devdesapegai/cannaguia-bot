import { NextRequest, NextResponse } from "next/server";
import { getPendingRetries, markRetryAttempt, cleanupOldRetries } from "@/lib/supabase";
import { replyToComment } from "@/lib/instagram";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  // Proteger com token simples
  const token = req.nextUrl.searchParams.get("token");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await getPendingRetries();
  if (pending.length === 0) {
    await cleanupOldRetries();
    return NextResponse.json({ retried: 0 });
  }

  let success = 0;
  let failed = 0;

  for (const item of pending) {
    const mention = item.username ? `@${item.username} ` : "";
    const posted = await replyToComment(item.comment_id, mention + item.message);

    if (posted) {
      await markRetryAttempt(item.id, true);
      log("reply_posted", {
        comment_id: item.comment_id,
        username: item.username || undefined,
        reply: item.message.slice(0, 100),
        retry_attempt: item.attempts + 1,
      });
      success++;
    } else {
      await markRetryAttempt(item.id, false);
      log("reply_failed", {
        comment_id: item.comment_id,
        error: `retry attempt ${item.attempts + 1} failed`,
      });
      failed++;
    }
  }

  await cleanupOldRetries();
  return NextResponse.json({ retried: success, failed, pending: pending.length });
}
