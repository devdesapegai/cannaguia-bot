"use client";

import { usePathname, useRouter } from "next/navigation";

const tabs = [
  { label: "Videos", href: "/admin" },
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Moderacao", href: "/admin/moderation" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Skip layout on login page
  if (pathname === "/admin/login") return <>{children}</>;

  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin/login");
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{
        background: "#111", padding: "12px 24px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginRight: 24 }}>CannaGuia</span>
          {tabs.map(tab => {
            const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
            return (
              <a key={tab.href} href={tab.href} style={{
                padding: "8px 16px", borderRadius: 6, fontSize: 14, textDecoration: "none",
                background: active ? "#333" : "transparent",
                color: active ? "#fff" : "#999",
              }}>
                {tab.label}
              </a>
            );
          })}
        </div>
        <button onClick={handleLogout} style={{
          padding: "6px 14px", background: "#333", color: "#999",
          border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13,
        }}>Sair</button>
      </div>
      {children}
    </div>
  );
}
