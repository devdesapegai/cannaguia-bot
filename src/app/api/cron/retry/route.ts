import { NextRequest, NextResponse } from "next/server";
import { cleanupOldRetries, cleanupExpiredState } from "@/lib/supabase";

// Comentarios automaticos desativados — cron so faz limpeza de estado
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await cleanupOldRetries();
  await cleanupExpiredState();
  return NextResponse.json({ retried: 0 });
}
