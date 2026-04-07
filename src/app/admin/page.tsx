"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

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
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "with" | "without">("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editTexts, setEditTexts] = useState<Record<string, string>>({});
  const [fullyLoaded, setFullyLoaded] = useState(false);
  const loadingRef = useRef(false);

  const fetchPage = useCallback(async (cursor?: string): Promise<{ items: MediaItem[]; nextCursor: string | null; hasMore: boolean }> => {
    const url = cursor ? `/api/admin/media?cursor=${cursor}` : "/api/admin/media";
    const res = await fetch(url);
    if (res.status === 401) { window.location.href = "/admin/login"; throw new Error("unauthorized"); }
    if (!res.ok) throw new Error("Erro ao carregar midia");
    return res.json();
  }, []);

  // Load first page fast, then continue in background
  const loadAll = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    try {
      // First page — show immediately
      const first = await fetchPage();
      setItems(first.items);
      const texts: Record<string, string> = {};
      for (const item of first.items) texts[item.media_id] = item.context_text;
      setEditTexts(texts);
      setLoadProgress(first.items.length);
      setLoading(false);

      if (!first.hasMore) { setFullyLoaded(true); loadingRef.current = false; return; }

      // Continue loading in background
      setLoadingAll(true);
      let cursor = first.nextCursor;
      const allItems = [...first.items];

      while (cursor) {
        const page = await fetchPage(cursor);
        allItems.push(...page.items);
        const newTexts: Record<string, string> = {};
        for (const item of page.items) newTexts[item.media_id] = item.context_text;

        setItems([...allItems]);
        setEditTexts(prev => ({ ...prev, ...newTexts }));
        setLoadProgress(allItems.length);

        cursor = page.hasMore ? page.nextCursor : null;
      }

      setFullyLoaded(true);
    } catch (e) {
      if (String(e) !== "Error: unauthorized") setError(String(e));
    } finally {
      setLoading(false);
      setLoadingAll(false);
      loadingRef.current = false;
    }
  }, [fetchPage]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Filter + search
  const filtered = useMemo(() => {
    let result = items;
    if (filter === "with") result = result.filter(i => i.has_context);
    if (filter === "without") result = result.filter(i => !i.has_context);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.caption.toLowerCase().includes(q) ||
        i.media_id.includes(q) ||
        (editTexts[i.media_id] || "").toLowerCase().includes(q)
      );
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      result = result.filter(i => new Date(i.timestamp).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59").getTime();
      result = result.filter(i => new Date(i.timestamp).getTime() <= to);
    }
    return result;
  }, [items, filter, search, dateFrom, dateTo, editTexts]);

  const withCount = items.filter(i => i.has_context).length;
  const withoutCount = items.filter(i => !i.has_context).length;

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
          media_id: item.media_id, context_text: text,
          caption: item.caption, permalink: item.permalink,
        }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
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

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>

      {error && (
        <div style={{ background: "#fee", color: "#c00", padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, cursor: "pointer" }}>x</button>
        </div>
      )}

      {/* Loading progress bar */}
      {loadingAll && (
        <div style={{ background: "#f3f4f6", borderRadius: 6, padding: 10, marginBottom: 16, fontSize: 13, color: "#666" }}>
          Carregando todos os posts... {loadProgress} carregados
          <div style={{ height: 3, background: "#e5e7eb", borderRadius: 2, marginTop: 6 }}>
            <div style={{ height: 3, background: "#16a34a", borderRadius: 2, transition: "width 0.3s", width: fullyLoaded ? "100%" : "60%" }} />
          </div>
        </div>
      )}

      {/* Search + date filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={fullyLoaded ? "Buscar por caption, contexto ou ID..." : "Buscar (carregando posts...)"}
          style={{
            flex: 1, minWidth: 200, padding: 10, borderRadius: 6,
            border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box"
          }}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <label style={{ fontSize: 13, color: "#666" }}>De:</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
          <label style={{ fontSize: 13, color: "#666" }}>Ate:</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 }} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              style={{ padding: "6px 10px", background: "#e5e7eb", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12 }}>
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button onClick={() => setFilter("all")} style={{
          padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
          background: filter === "all" ? "#111" : "#e5e7eb", color: filter === "all" ? "#fff" : "#333", fontSize: 13
        }}>Todos ({items.length})</button>
        <button onClick={() => setFilter("with")} style={{
          padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
          background: filter === "with" ? "#16a34a" : "#e5e7eb", color: filter === "with" ? "#fff" : "#333", fontSize: 13
        }}>Com contexto ({withCount})</button>
        <button onClick={() => setFilter("without")} style={{
          padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
          background: filter === "without" ? "#dc2626" : "#e5e7eb", color: filter === "without" ? "#fff" : "#333", fontSize: 13
        }}>Sem contexto ({withoutCount})</button>
      </div>

      {loading ? (
        <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Carregando posts do Instagram...</p>
      ) : (
        <>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
            {!fullyLoaded && " (ainda carregando...)"}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {filtered.map(item => (
              <div key={item.media_id} style={{
                border: `2px solid ${item.has_context ? "#bbf7d0" : "#e5e7eb"}`,
                borderRadius: 10, padding: 16, display: "flex", gap: 16,
                background: item.has_context ? "#f0fdf4" : "#fff"
              }}>
                <div style={{ flexShrink: 0 }}>
                  {item.thumbnail ? (
                    <a href={item.permalink} target="_blank" rel="noreferrer">
                      <img src={item.thumbnail} alt=""
                        style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8 }} />
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
        </>
      )}
    </div>
  );
}
