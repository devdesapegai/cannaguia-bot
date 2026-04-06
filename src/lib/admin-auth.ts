import { createHmac, timingSafeEqual } from "crypto";

const ADMIN_SECRET = process.env.ADMIN_SECRET || "";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

// Rate limiting: per-IP login attempts
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry) {
    if (now < entry.blockedUntil) {
      return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
    }
    if (now >= entry.blockedUntil) {
      // Reset after block expires
      loginAttempts.delete(ip);
    }
  }

  return { allowed: true };
}

export function recordFailedAttempt(ip: string) {
  const entry = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
  entry.count++;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_DURATION;
  }
  loginAttempts.set(ip, entry);
}

export function clearAttempts(ip: string) {
  loginAttempts.delete(ip);
}

export function validateCredentials(username: string, password: string): boolean {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return false;

  const usernameMatch = timingSafeEqual(
    Buffer.from(username),
    Buffer.from(ADMIN_USERNAME)
  );
  const passwordMatch = timingSafeEqual(
    Buffer.from(password),
    Buffer.from(ADMIN_PASSWORD)
  );

  return usernameMatch && passwordMatch;
}

export function createSessionToken(): string {
  const payload = {
    iat: Date.now(),
    exp: Date.now() + SESSION_DURATION,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", ADMIN_SECRET).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function validateSessionToken(token: string): boolean {
  if (!ADMIN_SECRET) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [data, sig] = parts;
  const expectedSig = createHmac("sha256", ADMIN_SECRET).update(data).digest("base64url");

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

export const COOKIE_NAME = "admin_session";

export function getSessionCookie(token: string): string {
  const maxAge = SESSION_DURATION / 1000;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function getLogoutCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
