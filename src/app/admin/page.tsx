"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type VideoContext = {
  id: string;
  media_id: string | null;
  title: string;
  url: string;
  context_text: string;
  created_at: string;
  updated_at: string;
};

const emptyForm = { media_id: "", title: "", url: "", context_text: "" };

export default function AdminPage() {
  const [items, setItems] = useState<VideoContext[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/video-contexts");
      if (!res.ok) throw new Error("Erro ao carregar");
      setItems(await res.json());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = editingId
        ? `/api/admin/video-contexts/${editingId}`
        : "/api/admin/video-contexts";

      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao salvar");
      }

      setForm(emptyForm);
      setEditingId(null);
      await fetchItems();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que quer deletar?")) return;
    try {
      await fetch(`/api/admin/video-contexts/${id}`, { method: "DELETE" });
      await fetchItems();
    } catch (e) {
      setError(String(e));
    }
  }

  function handleEdit(item: VideoContext) {
    setForm({
      media_id: item.media_id || "",
      title: item.title,
      url: item.url,
      context_text: item.context_text,
    });
    setEditingId(item.id);
  }

  function handleCancel() {
    setForm(emptyForm);
    setEditingId(null);
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>Contextos de Video</h1>
        <button
          onClick={handleLogout}
          style={{
            padding: "8px 16px",
            background: "#374151",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Sair
        </button>
      </div>

      {error && (
        <div style={{ background: "#fee", color: "#c00", padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, cursor: "pointer" }}>x</button>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ background: "#f5f5f5", padding: 20, borderRadius: 8, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4, fontWeight: 600 }}>Titulo</label>
            <input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Ex: Video sobre oleo de CBD"
              required
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, marginBottom: 4, fontWeight: 600 }}>URL do Post/Reel</label>
            <input
              value={form.url}
              onChange={e => setForm({ ...form, url: e.target.value })}
              placeholder="https://www.instagram.com/reel/..."
              required
              style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc", boxSizing: "border-box" }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4, fontWeight: 600 }}>Media ID (opcional)</label>
          <input
            value={form.media_id}
            onChange={e => setForm({ ...form, media_id: e.target.value })}
            placeholder="ID do Instagram (ex: 17890455278083140)"
            style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc", boxSizing: "border-box" }}
          />
          <span style={{ fontSize: 11, color: "#888" }}>O bot usa esse ID pra associar o contexto ao post automaticamente</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4, fontWeight: 600 }}>Contexto do Video</label>
          <textarea
            value={form.context_text}
            onChange={e => setForm({ ...form, context_text: e.target.value })}
            placeholder="Descreva o que a Maria fala nesse video: pontos-chave, orientacoes, dicas..."
            required
            rows={5}
            style={{ width: "100%", padding: 8, borderRadius: 4, border: "1px solid #ccc", boxSizing: "border-box", resize: "vertical" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "10px 20px",
              background: editingId ? "#f59e0b" : "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {loading ? "Salvando..." : editingId ? "Atualizar" : "Adicionar"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={handleCancel}
              style={{ padding: "10px 20px", background: "#e5e7eb", border: "none", borderRadius: 6, cursor: "pointer" }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div style={{ fontSize: 14, color: "#666", marginBottom: 12 }}>
        {items.length} contexto{items.length !== 1 ? "s" : ""} cadastrado{items.length !== 1 ? "s" : ""}
      </div>

      {items.length === 0 ? (
        <p style={{ color: "#999", textAlign: "center", padding: 40 }}>Nenhum contexto cadastrado ainda.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map(item => (
            <div key={item.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <strong style={{ fontSize: 16 }}>{item.title}</strong>
                  {item.media_id && (
                    <span style={{ fontSize: 11, color: "#888", marginLeft: 8, fontFamily: "monospace" }}>
                      ID: {item.media_id}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => handleEdit(item)}
                    style={{ padding: "4px 12px", background: "#dbeafe", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 }}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    style={{ padding: "4px 12px", background: "#fee2e2", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13 }}
                  >
                    Deletar
                  </button>
                </div>
              </div>
              <a href={item.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#2563eb", wordBreak: "break-all" }}>
                {item.url}
              </a>
              <p style={{ fontSize: 14, color: "#444", marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {item.context_text}
              </p>
              <div style={{ fontSize: 11, color: "#aaa", marginTop: 8 }}>
                Atualizado: {new Date(item.updated_at).toLocaleString("pt-BR")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
