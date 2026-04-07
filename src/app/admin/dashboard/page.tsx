"use client";

import { useState, useEffect } from "react";

type DashboardData = {
  totals: { total_sent: number; total_failed: number; total_webhooks: number; total_errors: number };
  categories: Array<{ category: string; count: string }>;
  replyTypes: Array<{ reply_type: string; count: string }>;
  pendingRetries: number;
  moderation: { total: number; reviewed: number; pending: number };
  hourly: Array<{
    hour_bucket: string; replies_sent: number; replies_failed: number;
    webhooks_received: number; errors: number; categories: Record<string, number>;
  }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then(r => { if (!r.ok) throw new Error("Erro"); return r.json(); })
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ textAlign: "center", padding: 40, color: "#999" }}>Carregando...</p>;
  if (error) return <p style={{ textAlign: "center", padding: 40, color: "#c00" }}>{error}</p>;
  if (!data) return null;

  const t = data.totals;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      {/* Totais 24h */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <Card label="Respostas enviadas" value={t.total_sent} color="#16a34a" />
        <Card label="Falhas" value={t.total_failed} color="#dc2626" />
        <Card label="Webhooks" value={t.total_webhooks} color="#2563eb" />
        <Card label="Erros" value={t.total_errors} color="#f59e0b" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Categorias */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 12px 0", color: "#666" }}>Categorias (24h)</h3>
          {data.categories.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13 }}>Sem dados ainda</p>
          ) : data.categories.map(c => (
            <div key={c.category} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
              <span>{c.category}</span>
              <strong>{c.count}</strong>
            </div>
          ))}
        </div>

        {/* Tipo de reply */}
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 12px 0", color: "#666" }}>Por tipo (24h)</h3>
          {data.replyTypes.length === 0 ? (
            <p style={{ color: "#999", fontSize: 13 }}>Sem dados ainda</p>
          ) : data.replyTypes.map(r => (
            <div key={r.reply_type} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
              <span>{r.reply_type}</span>
              <strong>{r.count}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Status */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 8px 0", color: "#666" }}>Fila de retry</h3>
          <span style={{ fontSize: 24, fontWeight: 700, color: data.pendingRetries > 0 ? "#f59e0b" : "#16a34a" }}>
            {data.pendingRetries}
          </span>
          <span style={{ fontSize: 13, color: "#999", marginLeft: 8 }}>pendentes</span>
        </div>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 8px 0", color: "#666" }}>Moderacao</h3>
          <span style={{ fontSize: 24, fontWeight: 700, color: data.moderation.pending > 0 ? "#f59e0b" : "#16a34a" }}>
            {data.moderation.pending}
          </span>
          <span style={{ fontSize: 13, color: "#999", marginLeft: 8 }}>
            pendentes / {data.moderation.reviewed} revisadas
          </span>
        </div>
      </div>

      {/* Historico por hora */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
        <h3 style={{ fontSize: 14, margin: "0 0 12px 0", color: "#666" }}>Ultimas 24h por hora</h3>
        {data.hourly.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13 }}>Sem dados ainda</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: 6, color: "#666" }}>Hora</th>
                  <th style={{ textAlign: "right", padding: 6, color: "#16a34a" }}>Enviadas</th>
                  <th style={{ textAlign: "right", padding: 6, color: "#dc2626" }}>Falhas</th>
                  <th style={{ textAlign: "right", padding: 6, color: "#2563eb" }}>Webhooks</th>
                  <th style={{ textAlign: "right", padding: 6, color: "#f59e0b" }}>Erros</th>
                </tr>
              </thead>
              <tbody>
                {data.hourly.map(h => (
                  <tr key={h.hour_bucket} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: 6 }}>{new Date(h.hour_bucket).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</td>
                    <td style={{ textAlign: "right", padding: 6, fontWeight: 600 }}>{h.replies_sent}</td>
                    <td style={{ textAlign: "right", padding: 6 }}>{h.replies_failed}</td>
                    <td style={{ textAlign: "right", padding: 6 }}>{h.webhooks_received}</td>
                    <td style={{ textAlign: "right", padding: 6 }}>{h.errors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
