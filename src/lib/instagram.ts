import { log } from "./logger";

const GRAPH_URL = "https://graph.instagram.com";

async function fetchWithRetry(url: string, options: RequestInit, retries = 1): Promise<Response> {
  const res = await fetch(url, options);
  if (res.ok) return res;

  // Parsear erro
  const errorText = await res.text();
  let errorCode = 0;
  try {
    const parsed = JSON.parse(errorText);
    errorCode = parsed?.error?.code || 0;
  } catch {}

  // Erros temporarios: retry
  const retryableCodes = [1, 2, 4, 17]; // unknown, service unavailable, rate limit
  if (retries > 0 && retryableCodes.includes(errorCode)) {
    log("error", { error: `Retrying after error code ${errorCode}` });
    await new Promise(r => setTimeout(r, 2000));
    return fetchWithRetry(url, options, retries - 1);
  }

  // Erro permanente: logar e retornar
  log("error", { error: `Instagram API error ${errorCode}: ${errorText.slice(0, 200)}` });
  return res;
}

export async function replyToComment(commentId: string, message: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) { log("error", { error: "INSTAGRAM_ACCESS_TOKEN not set" }); return false; }

  const res = await fetchWithRetry(`${GRAPH_URL}/${commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: token }),
  });

  return res.ok;
}

export async function hideComment(commentId: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return false;

  const res = await fetch(`${GRAPH_URL}/${commentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hide: true, access_token: token }),
  });

  return res.ok;
}

export async function getMediaCaption(mediaId: string): Promise<string> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return "";

  try {
    const res = await fetch(`${GRAPH_URL}/${mediaId}?fields=caption&access_token=${token}`);
    if (!res.ok) return "";
    const data = await res.json();
    return data.caption || "";
  } catch {
    return "";
  }
}
