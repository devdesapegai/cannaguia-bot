import { NextRequest, NextResponse } from "next/server";
import { pool, getBotMode, invalidateModeCache } from "@/lib/supabase";

const VALID_MODES = ["automatico", "manual", "pausado"];

export async function GET() {
  try {
    const mode = await getBotMode();
    return NextResponse.json({ mode });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { mode } = (await req.json()) as { mode: string };
    if (!VALID_MODES.includes(mode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
    }
    await pool.query(
      "UPDATE bot_settings SET mode = $1, updated_at = now() WHERE id = 1",
      [mode]
    );
    invalidateModeCache();
    return NextResponse.json({ ok: true, mode });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
