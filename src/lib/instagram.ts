import { log } from "./logger";
import { OWN_USERNAME } from "./constants";

const GRAPH_URL = "https://graph.instagram.com/v21.0";

const captionCache = new Map<string, { caption: string; ts: number }>();
const CAPTION_CACHE_TTL = 60 * 60 * 1000; // 1 hora

function authHeaders(token: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 1): Promise<Response> {
  const res = await fetch(url, options);
  if (res.ok) return res;

  const errorText = await res.text();
  let errorCode = 0;
  try {
    const parsed = JSON.parse(errorText);
    errorCode = parsed?.error?.code || 0;
  } catch {}

  const retryableCodes = [1, 2, 4, 17];
  if (retries > 0 && retryableCodes.includes(errorCode)) {
    log("error", { error: `Retrying after error code ${errorCode}` });
    await new Promise(r => setTimeout(r, 2000));
    return fetchWithRetry(url, options, retries - 1);
  }

  log("error", { error: `Instagram API error ${errorCode}: ${errorText.slice(0, 200)}` });
  return res;
}

export async function hasAlreadyReplied(commentId: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return false;

  try {
    const res = await fetchWithRetry(`${GRAPH_URL}/${commentId}/replies?fields=from`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return (data.data || []).some((r: { from?: { username?: string } }) =>
      r.from?.username === OWN_USERNAME
    );
  } catch {
    return false;
  }
}

export async function replyToComment(commentId: string, message: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) { log("error", { error: "INSTAGRAM_ACCESS_TOKEN not set" }); return false; }

  const res = await fetchWithRetry(`${GRAPH_URL}/${commentId}/replies`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ message }),
  });

  return res.ok;
}

export async function likeComment(commentId: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return false;

  const res = await fetchWithRetry(`${GRAPH_URL}/${commentId}/likes`, {
    method: "POST",
    headers: authHeaders(token),
  });

  return res.ok;
}

export async function hideComment(commentId: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return false;

  const res = await fetchWithRetry(`${GRAPH_URL}/${commentId}`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ hide: true }),
  });

  return res.ok;
}

export async function getMediaCaption(mediaId: string): Promise<string> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return "";

  // Check cache
  const cached = captionCache.get(mediaId);
  if (cached && Date.now() - cached.ts < CAPTION_CACHE_TTL) return cached.caption;

  try {
    const res = await fetchWithRetry(`${GRAPH_URL}/${mediaId}?fields=caption`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!res.ok) return "";
    const data = await res.json();
    const caption = data.caption || "";
    captionCache.set(mediaId, { caption, ts: Date.now() });
    return caption;
  } catch {
    return "";
  }
}
