import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "admin_session";

function validateToken(token: string, secret: string): boolean {
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [data, sig] = parts;
  const expectedSig = createHmac("sha256", secret).update(data).digest("base64url");

  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip login page and login API
  if (pathname === "/admin/login" || pathname === "/api/admin/auth") {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const secret = process.env.ADMIN_SECRET || "";

  if (!token || !validateToken(token, secret)) {
    // API routes return 401
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Pages redirect to login
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
