"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type MediaItem = {
  media_id: string;
  media_type: string;
  caption: string;
  thumbnail: string;
  permalink: string;
  timestamp: string;
  context_id: string | null;
  context_text: string;
  has_context: boolean;
};

export default function AdminPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "with" | "without">("all");
  const [editTexts, setEditTexts] = useState<Record<string, string>>({});
  const router = useRouter();

  const fetchMedia = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/media");
      if (res.status === 401) { router.push("/admin/login"); return; }
      if (!res.ok) throw new Error("Erro ao carregar midia");
      const data: MediaItem[] = await res.json();
      setItems(data);
      // Initialize edit texts
      const texts: Record<string, string> = {};
      for (const item of data) {
        texts[item.media_id] = item.context_text;
      }
      setEditTexts(texts);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchMedia(); }, [fetchMedia]);

  async function handleSave(item: MediaItem) {
    const text = editTexts[item.media_id]?.trim();
    if (!text) return;

    setSaving(item.media_id);
    setError(null);

    try {
      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_id: item.media_id,
          context_text: text,
          caption: item.caption,
          permalink: item.permalink,
        }),
      });

      if (!res.ok) throw new Error("Erro ao salvar");

      // Update local state
      setItems(prev => prev.map(i =>
        i.media_id === item.media_id
          ? { ...i, context_text: text, has_context: true, context_id: "saved" }
          : i
      ));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(null);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  const filtered = items.filter(i => {
    if (filter === "with") return i.has_context;
    if (filter === "without") return !i.has_context;
    return true;
  });

  const withCount = items.filter(i => i.has_context).length;
  const withoutCount = items.filter(i => !i.has_context).length;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>CannaGuia - Contextos de Video</h1>
        <button onClick={handleLogout} style={{
          padding: "8px 16px", background: "#374151", color: "#fff",
          border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13
        }}>Sair</button>
      </div>

      {error && (
        <div style={{ background: "#fee", color: "#c00", padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, cursor: "pointer" }}>x</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setFilter("all")} style={{
          padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
          background: filter === "all" ? "#111" : "#e5e7eb", color: filter === "all" ? "#fff" : "#333",
          fontSize: 13
        }}>Todos ({items.length})</button>
        <button onClick={() => setFilter("with")} style={{
          padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
          background: filter === "with" ? "#16a34a" : "#e5e7eb", color: filter === "with" ? "#fff" : "#333",
          fontSize: 13
        }}>Com contexto ({withCount})</button>
        <button onClick={() => setFilter("without")} style={{
          padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
          background: filter === "without" ? "#dc2626" : "#e5e7eb", color: filter === "without" ? "#fff" : "#333",
          fontSize: 13
        }}>Sem contexto ({withoutCount})</button>
      </div>

      {loading ? (
        <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Carregando posts do Instagram...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {filtered.map(item => (
            <div key={item.media_id} style={{
              border: `2px solid ${item.has_context ? "#bbf7d0" : "#e5e7eb"}`,
              borderRadius: 10, padding: 16, display: "flex", gap: 16,
              background: item.has_context ? "#f0fdf4" : "#fff"
            }}>
              {/* Thumbnail */}
              <div style={{ flexShrink: 0 }}>
                {item.thumbnail ? (
                  <a href={item.permalink} target="_blank" rel="noreferrer">
                    <img
                      src={item.thumbnail}
                      alt=""
                      style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8 }}
                    />
                  </a>
                ) : (
                  <div style={{
                    width: 120, height: 120, background: "#f3f4f6", borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#999", fontSize: 12
                  }}>Sem thumb</div>
                )}
                <div style={{ fontSize: 11, color: "#888", marginTop: 4, textAlign: "center" }}>
                  {item.media_type === "VIDEO" ? "Reel" : item.media_type === "CAROUSEL_ALBUM" ? "Carrossel" : "Post"}
                </div>
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#666" }}>
                    {new Date(item.timestamp).toLocaleDateString("pt-BR")} —
                    <span style={{ fontFamily: "monospace", fontSize: 11, marginLeft: 4 }}>{item.media_id}</span>
                  </span>
                  <a href={item.permalink} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, color: "#2563eb" }}>Ver no Instagram</a>
                </div>

                {item.caption && (
                  <p style={{
                    fontSize: 13, color: "#555", margin: "0 0 10px 0",
                    maxHeight: 60, overflow: "hidden", lineHeight: 1.4
                  }}>
                    {item.caption.slice(0, 200)}{item.caption.length > 200 ? "..." : ""}
                  </p>
                )}

                <textarea
                  value={editTexts[item.media_id] || ""}
                  onChange={e => setEditTexts(prev => ({ ...prev, [item.media_id]: e.target.value }))}
                  placeholder="Descreva o que a Maria fala nesse video: pontos-chave, orientacoes, dicas..."
                  rows={3}
                  style={{
                    width: "100%", padding: 8, borderRadius: 6,
                    border: "1px solid #d1d5db", fontSize: 13,
                    boxSizing: "border-box", resize: "vertical",
                  }}
                />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: item.has_context ? "#16a34a" : "#999" }}>
                    {item.has_context ? "Contexto salvo" : "Sem contexto"}
                  </span>
                  <button
                    onClick={() => handleSave(item)}
                    disabled={saving === item.media_id || !(editTexts[item.media_id]?.trim())}
                    style={{
                      padding: "6px 16px",
                      background: saving === item.media_id ? "#999" :
                        editTexts[item.media_id] !== item.context_text ? "#16a34a" : "#6b7280",
                      color: "#fff", border: "none", borderRadius: 6,
                      cursor: saving === item.media_id ? "not-allowed" : "pointer",
                      fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {saving === item.media_id ? "Salvando..." :
                      item.has_context ? "Atualizar" : "Salvar"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
