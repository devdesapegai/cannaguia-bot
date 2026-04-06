"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao fazer login");
        return;
      }

      router.push("/admin");
    } catch {
      setError("Erro de conexao");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#111",
      fontFamily: "system-ui, sans-serif",
    }}>
      <form onSubmit={handleSubmit} style={{
        background: "#1a1a1a",
        padding: 40,
        borderRadius: 12,
        width: 360,
        border: "1px solid #333",
      }}>
        <h1 style={{ color: "#fff", fontSize: 22, marginBottom: 8, textAlign: "center" }}>
          CannaGuia Admin
        </h1>
        <p style={{ color: "#666", fontSize: 13, marginBottom: 28, textAlign: "center" }}>
          Acesso restrito
        </p>

        {error && (
          <div style={{
            background: "#2d1215",
            color: "#f87171",
            padding: 12,
            borderRadius: 6,
            marginBottom: 16,
            fontSize: 14,
            textAlign: "center",
          }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: "#999", fontSize: 13, marginBottom: 6 }}>Usuario</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
            autoComplete="username"
            style={{
              width: "100%",
              padding: 12,
              background: "#222",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
              fontSize: 15,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", color: "#999", fontSize: 13, marginBottom: 6 }}>Senha</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: 12,
              background: "#222",
              border: "1px solid #444",
              borderRadius: 6,
              color: "#fff",
              fontSize: 15,
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: 12,
            background: loading ? "#555" : "#16a34a",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 15,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
