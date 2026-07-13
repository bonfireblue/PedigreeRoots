"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useLanguage, LanguageToggle } from "@/contexts/LanguageContext";

export default function SettingsPage() {
  const { status } = useSession();
  const { lang } = useLanguage();
  const vi = lang === "vi";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(vi ? "Mật khẩu phải có ít nhất 8 ký tự." : "Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError(vi ? "Mật khẩu không khớp." : "Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/account/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setSaved(true);
        setPassword("");
        setConfirm("");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(String(data?.error ?? "FAILED"));
      }
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 12,
    border: "1px solid #d1d5db",
    borderRadius: 10,
    fontSize: 16,
    background: "transparent",
    color: "inherit",
  };

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
          <span style={{ color: "#2d5a3d" }}>Pedigree</span>
          <span style={{ color: "#4a7c59" }}>Roots</span>
        </div>
        <LanguageToggle />
      </div>

      <div style={{ marginBottom: 20 }}>
        <Link href="/pedigree" style={{ fontSize: 15, textDecoration: "underline" }}>
          ← {vi ? "Về cây gia đình" : "Back to tree"}
        </Link>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24 }}>
        {vi ? "Cài đặt" : "Settings"}
      </h1>

      {status !== "authenticated" ? (
        <p style={{ fontSize: 16, opacity: 0.7 }}>
          {vi ? "Hãy đăng nhập để xem cài đặt." : "Please sign in to see your settings."}{" "}
          <a href="/sign-in" style={{ textDecoration: "underline" }}>
            {vi ? "Đăng nhập" : "Sign in"}
          </a>
        </p>
      ) : (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            {vi ? "Mật khẩu (không bắt buộc)" : "Password (optional)"}
          </h2>
          <p style={{ fontSize: 14, opacity: 0.7, lineHeight: 1.5, marginBottom: 16 }}>
            {vi
              ? "Bạn luôn có thể đăng nhập bằng liên kết gửi qua email. Đặt mật khẩu nếu bạn cũng muốn đăng nhập theo cách đó."
              : "You can always sign in with an emailed link. Set a password if you'd also like to sign in that way."}
          </p>

          {saved ? (
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                border: "1px solid #a7f3d0",
                background: "rgba(34, 197, 94, 0.08)",
                fontSize: 15,
              }}
            >
              {vi ? "Đã lưu mật khẩu." : "Password saved."}
            </div>
          ) : (
            <form onSubmit={(e) => void savePassword(e)} style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {vi ? "Mật khẩu mới" : "New password"}
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={vi ? "8 ký tự trở lên" : "8+ characters"}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {vi ? "Nhập lại mật khẩu" : "Confirm password"}
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  style={inputStyle}
                />
              </label>

              {error && <div style={{ color: "#ef4444", fontSize: 14 }}>{error}</div>}

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: 12,
                  borderRadius: 10,
                  border: "none",
                  background: "#2d5a3d",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                }}
              >
                {loading ? (vi ? "Đang lưu…" : "Saving…") : vi ? "Lưu mật khẩu" : "Save password"}
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
