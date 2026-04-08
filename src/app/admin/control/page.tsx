"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// --- Types ---

type LogEvent = {
  t: string;
  ts: string;
  comment_id?: string;
  username?: string;
  text?: string;
  reply?: string;
  category?: string;
  reason?: string;
  error?: string;
  [key: string]: unknown;
};

type QueueItem = {
  id: number;
  comment_id: string;
  username: string | null;
  message: string;
  original_text: string | null;
  reply_type: string;
  media_id: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  next_retry_at: string;
  media_title: string | null;
  media_permalink: string | null;
};

type ResponseItem = {
  id: number;
  comment_id: string | null;
  original_text: string;
  bot_reply: string;
  category: string | null;
  username: string | null;
  reply_type: string;
  created_at: string;
  media_id: string | null;
  media_title: string | null;
  media_permalink: string | null;
};

type Stats = {
  today: { sent: number; failed: number; webhooks: number; errors: number };
  categories: Array<{ category: string; count: number }>;
  queue: { total: number; pending: number; paused: number };
};

// --- Helpers ---

const LOG_COLORS: Record<string, string> = {
  reply_posted: "#22c55e", dm_sent: "#22c55e", mention_replied: "#22c55e",
  reply_generated: "#f59e0b", reply_scheduled: "#f59e0b", comment_classified: "#f59e0b",
  cooldown_skipped: "#f59e0b", rate_limited: "#f59e0b",
  error: "#ef4444", reply_failed: "#ef4444", signature_invalid: "#ef4444",
};

function logColor(type: string): string {
  return LOG_COLORS[type] || "#666";
}

function formatLogLine(ev: LogEvent): string {
  const time = ev.ts ? new Date(ev.ts).toLocaleTimeString("pt-BR") : "";
  const parts: string[] = [];
  if (ev.username) parts.push(`@${ev.username}`);
  if (ev.text) parts.push(ev.text.slice(0, 60));
  if (ev.reply) parts.push(`-> ${ev.reply.slice(0, 60)}`);
  if (ev.category) parts.push(`[${ev.category}]`);
  if (ev.reason) parts.push(`(${ev.reason})`);
  if (ev.error) parts.push(ev.error.slice(0, 80));
  return `[${time}] ${ev.t}: ${parts.join(" ")}`;
}

function queueStatus(item: QueueItem): { label: string; color: string; bg: string } {
  if (item.attempts >= item.max_attempts) return { label: "Esgotado", color: "#666", bg: "#f3f4f6" };
  const retryAt = new Date(item.next_retry_at).getTime();
  if (retryAt > Date.now() + 50 * 365 * 24 * 60 * 60 * 1000) return { label: "Pausado", color: "#f59e0b", bg: "#fef3c7" };
  if (retryAt > Date.now()) return { label: "Agendado", color: "#7c3aed", bg: "#ede9fe" };
  return { label: "Pendente", color: "#2563eb", bg: "#dbeafe" };
}

const MODE_CONFIG = {
  automatico: { label: "Automatico", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
  manual: { label: "Manual", color: "#f59e0b", bg: "#fef3c7", border: "#fde68a" },
  pausado: { label: "Pausado", color: "#dc2626", bg: "#fee2e2", border: "#fecaca" },
} as const;

// --- Component ---

export default function ControlPage() {
  // Mode
  const [mode, setMode] = useState<string>("automatico");
  const [modeLoading, setModeLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState<Stats | null>(null);

  // Logs
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsRef = useRef<HTMLDivElement>(null);

  // Queue
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [queueLoading, setQueueLoading] = useState<Record<number, boolean>>({});

  // Responses
  const [responses, setResponses] = useState<ResponseItem[]>([]);
  const [editingRespId, setEditingRespId] = useState<number | null>(null);
  const [editRespText, setEditRespText] = useState("");

  // Error
  const [error, setError] = useState<string | null>(null);

  // --- Fetch helpers ---

  const fetchMode = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/control/mode");
      if (res.ok) { const d = await res.json(); setMode(d.mode); }
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/control/stats");
      if (res.ok) { const d = await res.json(); setStats(d); }
    } catch {}
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/control/queue");
      if (res.ok) { const d = await res.json(); setQueue(d.data || []); }
    } catch {}
  }, []);

  const fetchResponses = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/control/responses");
      if (res.ok) { const d = await res.json(); setResponses(d.data || []); }
    } catch {}
  }, []);

  // --- Initial load + polling ---

  useEffect(() => {
    fetchMode();
    fetchStats();
    fetchQueue();
    fetchResponses();
  }, [fetchMode, fetchStats, fetchQueue, fetchResponses]);

  useEffect(() => {
    const i = setInterval(fetchStats, 30_000);
    return () => clearInterval(i);
  }, [fetchStats]);

  useEffect(() => {
    const i = setInterval(fetchQueue, 10_000);
    return () => clearInterval(i);
  }, [fetchQueue]);

  useEffect(() => {
    const i = setInterval(fetchResponses, 30_000);
    return () => clearInterval(i);
  }, [fetchResponses]);

  // --- SSE Logs ---

  useEffect(() => {
    const es = new EventSource("/api/admin/control/logs");
    es.onmessage = (e) => {
      try {
        const event: LogEvent = JSON.parse(e.data);
        setLogs(prev => [...prev.slice(-199), event]);
      } catch {}
    };
    es.onerror = () => {};
    return () => es.close();
  }, []);

  useEffect(() => {
    if (autoScroll && logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // --- Actions ---

  async function changeMode(newMode: string) {
    setModeLoading(true);
    try {
      const res = await fetch("/api/admin/control/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
      if (res.ok) setMode(newMode);
      else setError("Erro ao mudar modo");
    } catch (e) {
      setError(String(e));
    } finally {
      setModeLoading(false);
    }
  }

  async function queueAction(id: number, action: string, message?: string) {
    setQueueLoading(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch("/api/admin/control/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, message }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || `Erro ${res.status}`);
      } else {
        fetchQueue();
        if (action === "approve") fetchResponses();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setQueueLoading(prev => ({ ...prev, [id]: false }));
      if (action === "approve" || action === "reject") setEditingId(null);
    }
  }

  async function deleteResponse(id: number) {
    try {
      const res = await fetch("/api/admin/control/responses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setResponses(prev => prev.filter(r => r.id !== id));
      else setError("Erro ao excluir");
    } catch (e) {
      setError(String(e));
    }
  }

  async function editResponse(id: number) {
    if (!editRespText.trim()) return;
    try {
      const res = await fetch("/api/admin/control/responses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, bot_reply: editRespText }),
      });
      if (res.ok) {
        setResponses(prev => prev.map(r => r.id === id ? { ...r, bot_reply: editRespText } : r));
        setEditingRespId(null);
        setEditRespText("");
      } else setError("Erro ao editar");
    } catch (e) {
      setError(String(e));
    }
  }

  // --- Render ---

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      {error && (
        <div style={{ background: "#fee", color: "#c00", padding: 12, borderRadius: 6, marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c00", fontWeight: 700 }}>x</button>
        </div>
      )}

      {/* ===== MODO + STATS ===== */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        {/* Mode toggle */}
        <div style={{ flex: "0 0 auto" }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Modo do Bot</div>
          <div style={{ display: "flex", gap: 4 }}>
            {(Object.keys(MODE_CONFIG) as Array<keyof typeof MODE_CONFIG>).map(m => {
              const cfg = MODE_CONFIG[m];
              const active = mode === m;
              return (
                <button key={m} onClick={() => changeMode(m)} disabled={modeLoading}
                  style={{
                    padding: "10px 20px", borderRadius: 8, cursor: modeLoading ? "wait" : "pointer",
                    border: active ? `2px solid ${cfg.border}` : "1px solid #d1d5db",
                    background: active ? cfg.bg : "#fff",
                    color: active ? cfg.color : "#666",
                    fontWeight: active ? 700 : 400, fontSize: 14,
                    transition: "all 0.15s",
                  }}>
                  {active && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: cfg.color, marginRight: 8 }} />}
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Stats cards */}
        {stats && (
          <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
            {[
              { label: "Respostas", value: stats.today.sent, color: "#16a34a" },
              { label: "Falhas", value: stats.today.failed, color: "#dc2626" },
              { label: "Webhooks", value: stats.today.webhooks, color: "#2563eb" },
              { label: "Erros", value: stats.today.errors, color: "#f59e0b" },
              { label: "Na Fila", value: stats.queue.total, color: "#7c3aed" },
            ].map(card => (
              <div key={card.label} style={{
                flex: "1 1 100px", padding: "12px 16px", borderRadius: 8, border: "1px solid #e5e7eb",
                background: "#fff", textAlign: "center", minWidth: 90,
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 11, color: "#666" }}>{card.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Categories */}
      {stats && stats.categories.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {stats.categories.map(c => (
            <span key={c.category} style={{ padding: "3px 10px", borderRadius: 12, background: "#dbeafe", color: "#1d4ed8", fontSize: 12 }}>
              {c.category}: {c.count}
            </span>
          ))}
        </div>
      )}

      {/* ===== LOGS ===== */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>Logs em Tempo Real</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setAutoScroll(a => !a)} style={{
              padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: autoScroll ? "#111" : "#fff",
              color: autoScroll ? "#fff" : "#333", fontSize: 12, cursor: "pointer",
            }}>
              {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
            </button>
            <button onClick={() => setLogs([])} style={{
              padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff",
              color: "#333", fontSize: 12, cursor: "pointer",
            }}>
              Limpar
            </button>
          </div>
        </div>
        <div ref={logsRef} style={{
          background: "#111", borderRadius: 8, padding: 12, maxHeight: 400, overflowY: "auto",
          fontFamily: "monospace", fontSize: 12, lineHeight: 1.6,
        }}>
          {logs.length === 0 ? (
            <div style={{ color: "#555" }}>Aguardando eventos...</div>
          ) : (
            logs.map((ev, i) => (
              <div key={i} style={{ color: logColor(ev.t) }}>
                {formatLogLine(ev)}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ===== FILA ===== */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>
            Fila de Mensagens ({queue.length})
          </div>
          <button onClick={fetchQueue} style={{
            padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff",
            color: "#333", fontSize: 12, cursor: "pointer",
          }}>
            Atualizar
          </button>
        </div>

        {queue.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "#999", background: "#f9fafb", borderRadius: 8 }}>
            Nenhuma mensagem na fila
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {queue.map(item => {
              const st = queueStatus(item);
              const isEditing = editingId === item.id;
              const loading = queueLoading[item.id];

              return (
                <div key={item.id} style={{
                  border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff",
                }}>
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {item.username && <span style={{ fontSize: 13, fontWeight: 500 }}>@{item.username}</span>}
                      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: st.bg, color: st.color }}>{st.label}</span>
                      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#f3f4f6", color: "#666" }}>{item.reply_type}</span>
                      {item.media_permalink && (
                        <a href={item.media_permalink} target="_blank" rel="noopener noreferrer"
                          style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#fef3c7", color: "#92400e", textDecoration: "none" }}>
                          {item.media_title || "ver post"}
                        </a>
                      )}
                      <span style={{ fontSize: 11, color: "#999" }}>{item.attempts}/{item.max_attempts}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "#999" }}>
                      {new Date(item.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>

                  {/* Content */}
                  {item.original_text && (
                    <div style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "#999" }}>Comentario: </span>
                      <span style={{ fontSize: 13, color: "#333" }}>{item.original_text.slice(0, 120)}</span>
                    </div>
                  )}
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "#999" }}>Resposta: </span>
                    <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{item.message}</span>
                  </div>

                  {/* Edit area */}
                  {isEditing && (
                    <div style={{ marginBottom: 8 }}>
                      <textarea value={editText} onChange={e => setEditText(e.target.value)}
                        style={{
                          width: "100%", minHeight: 60, padding: 8, borderRadius: 6, border: "1px solid #d1d5db",
                          fontSize: 13, fontFamily: "system-ui", resize: "vertical",
                        }}
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button onClick={() => queueAction(item.id, "approve", editText)} disabled={loading}
                          style={{ padding: "4px 14px", background: "#dcfce7", color: "#16a34a", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
                          {loading ? "Enviando..." : "Enviar editado"}
                        </button>
                        <button onClick={() => queueAction(item.id, "edit", editText)} disabled={loading}
                          style={{ padding: "4px 14px", background: "#dbeafe", color: "#2563eb", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
                          Salvar sem enviar
                        </button>
                        <button onClick={() => setEditingId(null)}
                          style={{ padding: "4px 14px", background: "#f3f4f6", color: "#666", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  {!isEditing && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => queueAction(item.id, "approve")} disabled={loading}
                        style={{ padding: "4px 14px", background: "#dcfce7", color: "#16a34a", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                        {loading ? "..." : "Enviar"}
                      </button>
                      <button onClick={() => { setEditingId(item.id); setEditText(item.message); }}
                        style={{ padding: "4px 14px", background: "#dbeafe", color: "#2563eb", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                        Editar
                      </button>
                      {st.label === "Pausado" ? (
                        <button onClick={() => queueAction(item.id, "resume")} disabled={loading}
                          style={{ padding: "4px 14px", background: "#fef3c7", color: "#f59e0b", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                          Retomar
                        </button>
                      ) : (
                        <button onClick={() => queueAction(item.id, "pause")} disabled={loading}
                          style={{ padding: "4px 14px", background: "#f3f4f6", color: "#666", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                          Pausar
                        </button>
                      )}
                      {item.attempts > 0 && st.label !== "Esgotado" ? null : item.attempts >= item.max_attempts && (
                        <button onClick={() => queueAction(item.id, "retry")} disabled={loading}
                          style={{ padding: "4px 14px", background: "#ffedd5", color: "#ea580c", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                          Reenviar
                        </button>
                      )}
                      <button onClick={() => queueAction(item.id, "reject")} disabled={loading}
                        style={{ padding: "4px 14px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== ULTIMAS RESPOSTAS ===== */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>
            Ultimas Respostas ({responses.length})
          </div>
          <button onClick={fetchResponses} style={{
            padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff",
            color: "#333", fontSize: 12, cursor: "pointer",
          }}>
            Atualizar
          </button>
        </div>

        {responses.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "#999", background: "#f9fafb", borderRadius: 8 }}>
            Nenhuma resposta recente
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {responses.map(item => {
              const isEditing = editingRespId === item.id;

              return (
                <div key={item.id} style={{
                  border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {item.username && <span style={{ fontSize: 13, fontWeight: 500 }}>@{item.username}</span>}
                      <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#f3f4f6", color: "#666" }}>{item.reply_type}</span>
                      {item.category && <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#dbeafe", color: "#1d4ed8" }}>{item.category}</span>}
                      {item.media_permalink && (
                        <a href={item.media_permalink} target="_blank" rel="noopener noreferrer"
                          style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#fef3c7", color: "#92400e", textDecoration: "none" }}>
                          {item.media_title || "ver post"}
                        </a>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: "#999" }}>{new Date(item.created_at).toLocaleString("pt-BR")}</span>
                  </div>

                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#999" }}>Comentario: </span>
                    <span style={{ fontSize: 13, color: "#333" }}>{item.original_text?.slice(0, 120)}</span>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "#999" }}>Resposta: </span>
                    <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{item.bot_reply}</span>
                  </div>

                  {isEditing ? (
                    <div style={{ marginBottom: 6 }}>
                      <textarea value={editRespText} onChange={e => setEditRespText(e.target.value)}
                        style={{
                          width: "100%", minHeight: 50, padding: 8, borderRadius: 6, border: "1px solid #d1d5db",
                          fontSize: 13, fontFamily: "system-ui", resize: "vertical",
                        }}
                      />
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <button onClick={() => editResponse(item.id)}
                          style={{ padding: "4px 14px", background: "#dcfce7", color: "#16a34a", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                          Salvar
                        </button>
                        <button onClick={() => { setEditingRespId(null); setEditRespText(""); }}
                          style={{ padding: "4px 14px", background: "#f3f4f6", color: "#666", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setEditingRespId(item.id); setEditRespText(item.bot_reply); }}
                        style={{ padding: "4px 14px", background: "#dbeafe", color: "#2563eb", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                        Editar
                      </button>
                      <button onClick={() => deleteResponse(item.id)}
                        style={{ padding: "4px 14px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
