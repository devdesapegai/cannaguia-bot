const GRAPH_URL = "https://graph.instagram.com";
export async function replyToComment(commentId: string, message: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error("INSTAGRAM_ACCESS_TOKEN not set");
  const res = await fetch(`${GRAPH_URL}/${commentId}/replies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, access_token: token }) });
  if (!res.ok) { console.error(`[instagram] Reply failed for ${commentId}:`, await res.text()); return false; }
  console.log(`[instagram] Replied to ${commentId}`);
  return true;
}
export async function hideComment(commentId: string): Promise<boolean> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error("INSTAGRAM_ACCESS_TOKEN not set");
  const res = await fetch(`${GRAPH_URL}/${commentId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hide: true, access_token: token }) });
  if (!res.ok) { console.error(`[instagram] Hide failed for ${commentId}:`, await res.text()); return false; }
  console.log(`[instagram] Hidden comment ${commentId}`);
  return true;
}
export async function getMediaCaption(mediaId: string): Promise<string> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return "";
  try { const res = await fetch(`${GRAPH_URL}/${mediaId}?fields=caption&access_token=${token}`); if (!res.ok) return ""; const data = await res.json(); return data.caption || ""; } catch { return ""; }
}
