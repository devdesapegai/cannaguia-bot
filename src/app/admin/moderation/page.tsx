"use client";

import { useState, useEffect } from "react";

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

type MediaInfo = {
  media_id: string;
  count: number;
  permalink?: string;
  caption?: string;
  thumbnail_url?: string;
};

export default function ModerationPage() {
  const [items, setItems] = useState<ResponseItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "pending" | "reviewed">("pending");
  const [mediaFilter, setMediaFilter] = useState("");
  const [mediaList, setMediaList] = useState<MediaInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reviews locais pendentes de envio
  const [localReviews, setLocalReviews] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  // Estado de edicao/envio por item
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [sending, setSending] = useState<Record<number, boolean>>({});
  const [regenerating, setRegenerating] = useState<Record<number, boolean>>({});
  const [actionMsg, setActionMsg] = useState<Record<number, { type: "ok" | "err"; text: string }>>({});

  // Buscar lista de posts
  useEffect(() => {
    fetch("/api/admin/moderation?action=media_list")
      .then(r => r.json())
      .then(d => setMediaList(d.data || []))
      .catch(() => {});
  }, []);

  // Buscar items
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (filter !== "all") params.set("filter", filter);
    if (mediaFilter) params.set("media_id", mediaFilter);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);

    fetch(`/api/admin/moderation?${params}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        setItems(data.data || []);
        setTotal(data.total || 0);
      })
      .catch(e => {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === "AbortError") {
          setError("Timeout ao carregar — recarregue a pagina");
        } else {
          setError(String(e));
        }
      })
      .finally(() => { clearTimeout(timer); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; ctrl.abort(); };
  }, [page, filter, mediaFilter]);

  // Marcar review localmente (sem enviar ao banco)
  function doReview(id: number, feedback: string) {
    setLocalReviews(prev => ({ ...prev, [id]: feedback }));
  }

  // Enviar todos os reviews pendentes em uma unica chamada
  async function flushReviews() {
    const entries = Object.entries(localReviews);
    if (entries.length === 0) return;

    setSaving(true);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);

      const res = await fetch("/api/admin/moderation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviews: entries.map(([id, feedback]) => ({ id: Number(id), feedback })),
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error("Erro " + res.status);

      // Limpar reviews enviados e remover items da lista
      const sentIds = new Set(entries.map(([id]) => Number(id)));
      setLocalReviews(prev => {
        const next = { ...prev };
        for (const id of sentIds) delete next[id];
        return next;
      });
      setItems(prev => prev.filter(i => !sentIds.has(Number(i.id))));
      setTotal(prev => Math.max(0, prev - sentIds.size));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("Timeout ao salvar — tente novamente");
      } else {
        setError(String(e));
      }
    } finally {
      setSaving(false);
    }
  }


  // Regenerar resposta via LLM
  async function handleRegenerate(item: ResponseItem) {
    setRegenerating(prev => ({ ...prev, [item.id]: true }));
    setActionMsg(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    try {
      const res = await fetch("/api/admin/moderation/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate", id: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao regenerar");
      // Atualizar item na lista
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, bot_reply: data.reply, category: data.category } : i));
      setActionMsg(prev => ({ ...prev, [item.id]: { type: "ok", text: `Regenerada (${data.replyStyle})` } }));
    } catch (e: any) {
      setActionMsg(prev => ({ ...prev, [item.id]: { type: "err", text: e.message } }));
    } finally {
      setRegenerating(prev => ({ ...prev, [item.id]: false }));
    }
  }

  // Enviar resposta pro Instagram
  async function handleSend(item: ResponseItem) {
    const reply = editing[item.id] ?? item.bot_reply;
    if (!confirm(`Enviar pro Instagram?\n\n"${reply}"`)) return;

    setSending(prev => ({ ...prev, [item.id]: true }));
    setActionMsg(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    try {
      const res = await fetch("/api/admin/moderation/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", id: item.id, reply }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar");
      // Marcar como revisada e remover da lista de pendentes
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, reviewed: true, feedback: "ok", bot_reply: reply } : i));
      setEditing(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      setActionMsg(prev => ({ ...prev, [item.id]: { type: "ok", text: "Enviado + embedding salvo" } }));
    } catch (e: any) {
      setActionMsg(prev => ({ ...prev, [item.id]: { type: "err", text: e.message } }));
    } finally {
      setSending(prev => ({ ...prev, [item.id]: false }));
    }
  }

  // Salvar edicao manual
  async function handleSaveEdit(item: ResponseItem) {
    const reply = editing[item.id];
    if (!reply || reply === item.bot_reply) return;

    try {
      const res = await fetch("/api/admin/moderation/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: item.id, reply }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar");
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, bot_reply: data.reply } : i));
      setEditing(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      setActionMsg(prev => ({ ...prev, [item.id]: { type: "ok", text: "Texto atualizado" } }));
    } catch (e: any) {
      setActionMsg(prev => ({ ...prev, [item.id]: { type: "err", text: e.message } }));
    }
  }

  const pendingCount = items.filter(i => !localReviews[i.id] && !i.reviewed).length;
  const localCount = Object.keys(localReviews).length;
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const getMedia = (mediaId: string | null) => mediaId ? mediaList.find(m => m.media_id === mediaId) : undefined;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      {error && (
        <div style={{ background: "#fee", color: "#c00", padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, cursor: "pointer" }}>x</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
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

      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
        <button onClick={() => { setMediaFilter(""); setPage(1); }} style={{
          padding: "6px 12px", borderRadius: 6, border: mediaFilter === "" ? "2px solid #111" : "1px solid #d1d5db",
          background: mediaFilter === "" ? "#111" : "#fff", color: mediaFilter === "" ? "#fff" : "#333",
          fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
        }}>
          Todos ({mediaList.reduce((s, m) => s + Number(m.count), 0)})
        </button>
        {mediaList.map(m => (
          <button key={m.media_id} onClick={() => { setMediaFilter(m.media_id); setPage(1); }} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "4px 10px 4px 4px", borderRadius: 6,
            border: mediaFilter === m.media_id ? "2px solid #111" : "1px solid #d1d5db",
            background: mediaFilter === m.media_id ? "#f3f4f6" : "#fff",
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {m.thumbnail_url && (
              <img src={m.thumbnail_url} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4 }} />
            )}
            <span style={{ fontSize: 12, color: "#333", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
              {m.caption || m.media_id.slice(-8)}
            </span>
            <span style={{ fontSize: 11, color: "#999" }}>({m.count})</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>

        {pendingCount > 0 && (
          <>
            <button onClick={() => {
              const pending = items.filter(i => !localReviews[i.id] && !i.reviewed);
              setLocalReviews(prev => ({ ...prev, ...Object.fromEntries(pending.map(i => [i.id, "ok"])) }));
            }} style={{
              padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#dcfce7", color: "#16a34a", fontSize: 13, fontWeight: 500,
            }}>
              Aprovar pagina ({pendingCount})
            </button>
            <button onClick={() => {
              const pending = items.filter(i => !localReviews[i.id] && !i.reviewed);
              setLocalReviews(prev => ({ ...prev, ...Object.fromEntries(pending.map(i => [i.id, "ruim"])) }));
            }} style={{
              padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
              background: "#fee2e2", color: "#dc2626", fontSize: 13, fontWeight: 500,
            }}>
              Reprovar pagina
            </button>
          </>
        )}

        {localCount > 0 && (
          <button onClick={flushReviews} disabled={saving} style={{
            padding: "6px 14px", borderRadius: 6, border: "2px solid #3b82f6", cursor: saving ? "wait" : "pointer",
            background: "#eff6ff", color: "#1d4ed8", fontSize: 13, fontWeight: 600,
          }}>
            {saving ? "Salvando..." : `Salvar (${localCount})`}
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ textAlign: "center", padding: 40, color: "#999" }}>Carregando...</p>
      ) : items.length === 0 ? (
        <p style={{ textAlign: "center", padding: 40, color: "#999" }}>Nenhuma resposta encontrada.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map(item => {
            const media = getMedia(item.media_id);
            const localFb = localReviews[item.id];
            const isMarked = !!localFb;

            return (
              <div key={item.id} style={{
                border: `1px solid ${isMarked ? (localFb === "ok" ? "#bbf7d0" : localFb === "ruim" ? "#fecaca" : "#bfdbfe") : item.reviewed ? "#bbf7d0" : "#e5e7eb"}`,
                borderRadius: 8, padding: 16,
                background: isMarked ? (localFb === "ok" ? "#f0fdf4" : localFb === "ruim" ? "#fef2f2" : "#eff6ff") : item.reviewed ? "#f0fdf4" : "#fff",
                display: "flex", gap: 12,
                transition: "all 0.15s",
              }}>
                {media?.thumbnail_url && (
                  <a href={media.permalink || "#"} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                    <img src={media.thumbnail_url} alt="" style={{
                      width: 64, height: 64, objectFit: "cover", borderRadius: 6,
                    }} />
                  </a>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {item.username && <span>@{item.username} </span>}
                      <span style={{ background: "#f3f4f6", padding: "2px 8px", borderRadius: 10, fontSize: 11 }}>{item.reply_type}</span>
                      {item.category && (
                        <span style={{ background: "#dbeafe", padding: "2px 8px", borderRadius: 10, fontSize: 11, marginLeft: 4 }}>{item.category}</span>
                      )}
                      {media?.permalink && (
                        <>
                          <a href={media.permalink} target="_blank" rel="noopener noreferrer" style={{
                            background: "#fef3c7", padding: "2px 8px", borderRadius: 10, fontSize: 11, marginLeft: 4,
                            color: "#92400e", textDecoration: "none",
                          }}>ver post</a>
                          {media.caption && <span style={{ fontSize: 11, color: "#999", marginLeft: 6 }}>{media.caption}</span>}
                        </>
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
                    {editing[item.id] !== undefined ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                        <textarea
                          value={editing[item.id]}
                          onChange={e => setEditing(prev => ({ ...prev, [item.id]: e.target.value }))}
                          style={{
                            flex: 1, fontSize: 14, padding: 8, borderRadius: 6,
                            border: "1px solid #d1d5db", resize: "vertical", minHeight: 60,
                            fontFamily: "inherit",
                          }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <button onClick={() => handleSaveEdit(item)} style={{
                            padding: "4px 10px", background: "#dbeafe", border: "none",
                            borderRadius: 4, cursor: "pointer", fontSize: 12, color: "#1d4ed8",
                          }}>Salvar</button>
                          <button onClick={() => setEditing(prev => { const n = { ...prev }; delete n[item.id]; return n; })} style={{
                            padding: "4px 10px", background: "#f3f4f6", border: "none",
                            borderRadius: 4, cursor: "pointer", fontSize: 12, color: "#666",
                          }}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 14, color: "#111", fontWeight: 500 }}>{item.bot_reply}</div>
                    )}
                  </div>

                  {/* Botoes de acao: Editar, Regenerar, Enviar */}
                  {!item.reviewed && editing[item.id] === undefined && (
                    <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                      <button onClick={() => setEditing(prev => ({ ...prev, [item.id]: item.bot_reply }))} style={{
                        padding: "4px 12px", background: "#f3f4f6", border: "1px solid #d1d5db",
                        borderRadius: 4, cursor: "pointer", fontSize: 12, color: "#333",
                      }}>Editar</button>
                      <button onClick={() => handleRegenerate(item)} disabled={regenerating[item.id]} style={{
                        padding: "4px 12px", background: "#fef3c7", border: "1px solid #fcd34d",
                        borderRadius: 4, cursor: regenerating[item.id] ? "wait" : "pointer",
                        fontSize: 12, color: "#92400e", opacity: regenerating[item.id] ? 0.6 : 1,
                      }}>{regenerating[item.id] ? "Gerando..." : "Regenerar"}</button>
                      <button onClick={() => handleSend(item)} disabled={sending[item.id]} style={{
                        padding: "4px 12px", background: "#dcfce7", border: "1px solid #86efac",
                        borderRadius: 4, cursor: sending[item.id] ? "wait" : "pointer",
                        fontSize: 12, color: "#16a34a", fontWeight: 600, opacity: sending[item.id] ? 0.6 : 1,
                      }}>{sending[item.id] ? "Enviando..." : "Enviar"}</button>
                    </div>
                  )}

                  {/* Mensagem de acao */}
                  {actionMsg[item.id] && (
                    <div style={{
                      fontSize: 12, marginBottom: 6, padding: "4px 8px", borderRadius: 4,
                      background: actionMsg[item.id].type === "ok" ? "#f0fdf4" : "#fef2f2",
                      color: actionMsg[item.id].type === "ok" ? "#16a34a" : "#dc2626",
                    }}>
                      {actionMsg[item.id].text}
                    </div>
                  )}

                  {item.reviewed ? (
                    <div style={{ fontSize: 12, color: "#16a34a" }}>
                      Revisada {item.feedback && `— ${item.feedback}`}
                    </div>
                  ) : isMarked ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: localFb === "ok" ? "#16a34a" : localFb === "ruim" ? "#dc2626" : "#1d4ed8",
                      }}>
                        {localFb === "ok" ? "OK" : localFb === "ruim" ? "Ruim" : `Nota: ${localFb}`}
                      </span>
                      <button onClick={() => setLocalReviews(prev => { const n = { ...prev }; delete n[item.id]; return n; })} style={{
                        padding: "2px 8px", background: "none", border: "1px solid #d1d5db",
                        borderRadius: 4, cursor: "pointer", fontSize: 11, color: "#666",
                      }}>desfazer</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button onClick={() => doReview(item.id, "ok")} style={{
                        padding: "4px 14px", background: "#dcfce7", border: "none",
                        borderRadius: 4, cursor: "pointer", fontSize: 13, color: "#16a34a",
                      }}>OK</button>
                      <button onClick={() => doReview(item.id, "ruim")} style={{
                        padding: "4px 14px", background: "#fee2e2", border: "none",
                        borderRadius: 4, cursor: "pointer", fontSize: 13, color: "#dc2626",
                      }}>Ruim</button>
                      <button onClick={() => {
                        const note = prompt("Observacao:");
                        if (note) doReview(item.id, note);
                      }} style={{
                        padding: "4px 14px", background: "#f3f4f6", border: "none",
                        borderRadius: 4, cursor: "pointer", fontSize: 13, color: "#666",
                      }}>Nota</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 20 }}>
          <button onClick={async () => { if (localCount > 0) await flushReviews(); setPage(p => Math.max(1, p - 1)); }} disabled={page === 1}
            style={{ padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.4 : 1, fontSize: 13 }}>
            Anterior
          </button>
          <span style={{ fontSize: 14, padding: "6px 8px" }}>{page} / {totalPages}</span>
          <button onClick={async () => { if (localCount > 0) await flushReviews(); setPage(p => Math.min(totalPages, p + 1)); }} disabled={page === totalPages}
            style={{ padding: "6px 12px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.4 : 1, fontSize: 13 }}>
            Proxima
          </button>
        </div>
      )}
    </div>
  );
}
