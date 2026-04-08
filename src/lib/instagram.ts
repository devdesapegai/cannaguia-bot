import { log } from "./logger";

const GRAPH_URL = "https://graph.instagram.com/v21.0";

const captionCache = new Map<string, { caption: string; ts: number }>();
const CAPTION_CACHE_TTL = 60 * 60 * 1000; // 1 hora

async function fetchWithRetry(url: string, options: RequestInit, retries = 3, attempt = 0): Promise<Response> {
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
    const delay = 2000 * Math.pow(2, attempt);
    log("error", { error: `Retrying after error code ${errorCode}, attempt ${attempt + 1}, waiting ${delay / 1000}s` });
    await new Promise(r => setTimeout(r, delay));
    return fetchWithRetry(url, options, retries - 1, attempt + 1);
  }

  log("error", { error: `Instagram API error ${errorCode}: ${errorText.slice(0, 200)}` });
  return res;
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
