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
  dm_sent: "#22c55e", reply_generated: "#f59e0b",
  rate_limited: "#f59e0b", error: "#ef4444",
  reply_failed: "#ef4444", signature_invalid: "#ef4444",
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

const MODE_CONFIG = {
  automatico: { label: "Automatico", color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
  manual: { label: "Manual", color: "#f59e0b", bg: "#fef3c7", border: "#fde68a" },
  pausado: { label: "Pausado", color: "#dc2626", bg: "#fee2e2", border: "#fecaca" },
} as const;

// --- Component ---

export default function ControlPage() {
  const [mode, setMode] = useState<string>("automatico");
  const [modeLoading, setModeLoading] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsRef = useRef<HTMLDivElement>(null);
  const [responses, setResponses] = useState<ResponseItem[]>([]);
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

  const fetchResponses = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/control/responses");
      if (res.ok) { const d = await res.json(); setResponses(d.data || []); }
    } catch {}
  }, []);

  useEffect(() => {
    fetchMode();
    fetchStats();
    fetchResponses();
  }, [fetchMode, fetchStats, fetchResponses]);

  useEffect(() => {
    const i = setInterval(fetchStats, 30_000);
    return () => clearInterval(i);
  }, [fetchStats]);

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
        <div style={{ flex: "0 0 auto" }}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>Modo do Bot (DMs)</div>
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

        {stats && (
          <div style={{ display: "flex", gap: 8, flex: 1, flexWrap: "wrap" }}>
            {[
              { label: "DMs Enviadas", value: stats.today.sent, color: "#16a34a" },
              { label: "Falhas", value: stats.today.failed, color: "#dc2626" },
              { label: "Webhooks", value: stats.today.webhooks, color: "#2563eb" },
              { label: "Erros", value: stats.today.errors, color: "#f59e0b" },
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

      {/* ===== ULTIMAS RESPOSTAS (DMs) ===== */}
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
            {responses.map(item => (
              <div key={item.id} style={{
                border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, background: "#fff",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {item.username && <span style={{ fontSize: 13, fontWeight: 500 }}>@{item.username}</span>}
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#f3f4f6", color: "#666" }}>{item.reply_type}</span>
                    {item.category && <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "#dbeafe", color: "#1d4ed8" }}>{item.category}</span>}
                  </div>
                  <span style={{ fontSize: 11, color: "#999" }}>{new Date(item.created_at).toLocaleString("pt-BR")}</span>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#999" }}>Mensagem: </span>
                  <span style={{ fontSize: 13, color: "#333" }}>{item.original_text?.slice(0, 120)}</span>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: "#999" }}>Resposta: </span>
                  <span style={{ fontSize: 13, color: "#111", fontWeight: 500 }}>{item.bot_reply}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
