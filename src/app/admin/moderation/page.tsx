"use client";

import { useState, useEffect, useCallback } from "react";

type ResponseItem = {
  id: number;
  comment_id: string | null;
  original_text: string;
  bot_reply: string;
  category: string | null;
  media_id: string | null;
  username: string | null;
  reply_type: string;
  created_at: string;
  reviewed: boolean;
  feedback: string | null;
};

export default function ModerationPage() {
  const [items, setItems] = useState<ResponseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "pending" | "reviewed">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (filter !== "all") params.set("filter", filter);
      const res = await fetch(`/api/admin/moderation?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar");
      const data = await res.json();
      setItems(data.data);
      setTotal(data.total);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function handleReview(id: number, feedback: string) {
    try {
      await fetch("/api/admin/moderation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, feedback }),
      });
      setItems(prev => prev.map(i => i.id === id ? { ...i, reviewed: true, feedback } : i));
    } catch (e) {
      setError(String(e));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      {error && (
        <div style={{ background: "#fee", color: "#c00", padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, cursor: "pointer" }}>x</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {(["pending", "all", "reviewed"] as const).map(f => (
          <button key={f} onClick={() => { setFilter(f); setPage(1); }} style={{
            padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
            background: filter === f ? "#111" : "#e5e7eb", color: filter === f ? "#fff" : "#333", fontSize: 13
          }}>
            {f === "pending" ? "Pendentes" : f === "reviewed" ? "Revisadas" : "Todas"}
          </button>
        ))}
        <span style={{ fontSize: 13, color: "#666", alignSelf: "center", marginLeft: 8 }}>
          {total} resultado{total !== 1 ? "s" : ""}
        </span>
      </div>

      {loading ? (
        <p style={{ textAlign: "center", padding: 40, color: "#999" }}>Carregando...</p>
      ) : items.length === 0 ? (
        <p style={{ textAlign: "center", padding: 40, color: "#999" }}>Nenhuma resposta encontrada.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map(item => (
            <div key={item.id} style={{
              border: `1px solid ${item.reviewed ? "#bbf7d0" : "#e5e7eb"}`,
              borderRadius: 8, padding: 16,
              background: item.reviewed ? "#f0fdf4" : "#fff",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {item.username && <span>@{item.username} </span>}
                  <span style={{
                    background: "#f3f4f6", padding: "2px 8px", borderRadius: 10, fontSize: 11,
                  }}>{item.reply_type}</span>
                  {item.category && (
                    <span style={{
                      background: "#dbeafe", padding: "2px 8px", borderRadius: 10, fontSize: 11, marginLeft: 4,
                    }}>{item.category}</span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: "#999" }}>
                  {new Date(item.created_at).toLocaleString("pt-BR")}
                </span>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>Comentario:</div>
                <div style={{ fontSize: 14, color: "#333" }}>{item.original_text}</div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>Resposta do bot:</div>
                <div style={{ fontSize: 14, color: "#111", fontWeight: 500 }}>{item.bot_reply}</div>
              </div>

              {item.reviewed ? (
                <div style={{ fontSize: 12, color: "#16a34a" }}>
                  Revisada {item.feedback && `— ${item.feedback}`}
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button onClick={() => handleReview(item.id, "ok")} style={{
                    padding: "4px 14px", background: "#dcfce7", border: "none",
                    borderRadius: 4, cursor: "pointer", fontSize: 13, color: "#16a34a",
                  }}>OK</button>
                  <button onClick={() => handleReview(item.id, "ruim")} style={{
                    padding: "4px 14px", background: "#fee2e2", border: "none",
                    borderRadius: 4, cursor: "pointer", fontSize: 13, color: "#dc2626",
                  }}>Ruim</button>
                  <button onClick={() => {
                    const note = prompt("Observacao:");
                    if (note) handleReview(item.id, note);
                  }} style={{
                    padding: "4px 14px", background: "#f3f4f6", border: "none",
                    borderRadius: 4, cursor: "pointer", fontSize: 13, color: "#666",
                  }}>Nota</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1, fontSize: 13 }}>
            Anterior
          </button>
          <span style={{ fontSize: 14, padding: "6px 8px" }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.4 : 1, fontSize: 13 }}>
            Proxima
          </button>
        </div>
      )}
    </div>
  );
}
