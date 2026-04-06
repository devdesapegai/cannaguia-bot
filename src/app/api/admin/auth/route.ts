import { NextRequest, NextResponse } from "next/server";
import {
  validateCredentials,
  createSessionToken,
  getSessionCookie,
  getLogoutCookie,
  checkRateLimit,
  recordFailedAttempt,
  clearAttempts,
} from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const { allowed, retryAfter } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: `Muitas tentativas. Tente novamente em ${retryAfter}s.` },
      { status: 429 }
    );
  }

  const body = await req.json();
  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json({ error: "Credenciais obrigatorias" }, { status: 400 });
  }

  if (!validateCredentials(username, password)) {
    recordFailedAttempt(ip);
    return NextResponse.json({ error: "Credenciais invalidas" }, { status: 401 });
  }

  clearAttempts(ip);
  const token = createSessionToken();

  const response = NextResponse.json({ success: true });
  response.headers.set("Set-Cookie", getSessionCookie(token));
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.headers.set("Set-Cookie", getLogoutCookie());
  return response;
}
