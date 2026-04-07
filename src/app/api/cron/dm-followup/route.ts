import { NextRequest, NextResponse } from "next/server";
import { getPendingFollowUps, markFollowUpSent, expireOldFollowUps } from "@/lib/supabase";
import { sendDmWithWhatsApp } from "@/lib/dm";
import { log } from "@/lib/logger";

const TEMPLATES: Record<string, string[]> = {
  default: [
    "Oi! Se quiser trocar ideia sobre o que conversamos, a Maria tá no WhatsApp 💚",
    "Ei, tudo bem? Se quiser falar mais sobre isso, a Maria tá no WhatsApp 💚",
  ],
  ansiedade: [
    "Oi! A Maria tem ajudado bastante gente com ansiedade. Se quiser, ela tá no WhatsApp 💚",
  ],
  depressao: [
    "Oi! Se quiser conversar mais sobre isso, a Maria atende pelo WhatsApp com calma 💚",
  ],
  insonia: [
    "Ei! Se quiser falar mais sobre o sono, a Maria atende pelo WhatsApp 💚",
  ],
  dor: [
    "Oi! A Maria pode te orientar melhor pelo WhatsApp, se tiver interesse 💚",
  ],
  tdah: [
    "Oi! A Maria tem ajudado gente com TDAH pelo WhatsApp. Se quiser, tá lá 💚",
  ],
  epilepsia: [
    "Oi! A Maria pode conversar melhor sobre isso pelo WhatsApp 💚",
  ],
  medicacao: [
    "Oi! Se quiser falar mais sobre o tratamento, a Maria tá no WhatsApp 💚",
  ],
};

function pickTemplate(condition: string): string {
  const list = TEMPLATES[condition] || TEMPLATES.default;
  return list[Math.floor(Math.random() * list.length)];
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await expireOldFollowUps();

  const pending = await getPendingFollowUps();
  if (pending.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;
  let failed = 0;

  for (const item of pending) {
    const message = pickTemplate(item.condition);
    const success = await sendDmWithWhatsApp(item.user_id, message);

    if (success) {
      await markFollowUpSent(item.id);
      log("dm_sent", { comment_id: `followup_${item.user_id}`, reply: message.slice(0, 100) });
      sent++;
    } else {
      log("reply_failed", { comment_id: `followup_${item.user_id}`, error: "followup dm failed" });
      failed++;
    }
  }

  return NextResponse.json({ sent, failed, pending: pending.length });
}
