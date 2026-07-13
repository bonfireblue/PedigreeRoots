"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useLanguage, LanguageToggle } from "@/contexts/LanguageContext";

export default function SignInPage() {
  const router = useRouter();
  const { t, lang } = useLanguage();

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);

  async function sendMagicLink() {
    setError(null);
    const email = emailOrPhone.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setError(
        lang === "vi"
          ? "Nhập email của bạn ở ô trên trước."
          : "Type your email in the box above first."
      );
      return;
    }

    setMagicLoading(true);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setMagicSent(true);
      } else {
        setError(lang === "vi" ? "Không gửi được liên kết." : "We couldn't send the link. Try again.");
      }
    } finally {
      setMagicLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      redirect: false,
      email: emailOrPhone, // The backend handles both email and phone
      password
    });

    setLoading(false);

    if (result?.error) {
      setError(t.invalidCredentials);
      return;
    }

    router.push("/pedigree");
  }

  return (
    <main
      style={{
        maxWidth: 420,
        margin: "0 auto",
        padding: "40px 20px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
          <span style={{ color: "#2d5a3d" }}>Pedigree</span>
          <span style={{ color: "#4a7c59" }}>Roots</span>
        </div>
        <LanguageToggle />
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        {t.signIn}
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        {lang === "vi" ? "Đăng nhập để xem cây gia đình của bạn." : "Sign in to access your family tree."}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>{lang === "vi" ? "Email hoặc Số điện thoại" : "Email or Phone"}</span>
          <input
            type="text"
            required
            autoComplete="email tel"
            value={emailOrPhone}
            onChange={(e) => setEmailOrPhone(e.target.value)}
            placeholder={lang === "vi" ? "email@example.com hoặc (555) 123-4567" : "email@example.com or (555) 123-4567"}
            style={{
              padding: 10,
              border: "1px solid #ddd",
              borderRadius: 10
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>{t.password}</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: 10,
              border: "1px solid #ddd",
              borderRadius: 10
            }}
          />
        </label>

        <div style={{ textAlign: "right" }}>
          <a
            href="/forgot-password"
            style={{ fontSize: 14, color: "#666" }}
          >
            {t.forgotPassword}
          </a>
        </div>

        {error && (
          <div style={{ color: "crimson", fontSize: 14 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "white",
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          {loading ? t.signingIn : t.signIn}
        </button>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
        <div style={{ flex: 1, height: 1, background: "#ddd" }} />
        <span style={{ fontSize: 13, opacity: 0.6 }}>{lang === "vi" ? "hoặc" : "or"}</span>
        <div style={{ flex: 1, height: 1, background: "#ddd" }} />
      </div>

      {magicSent ? (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: "1px solid #a7f3d0",
            background: "rgba(34, 197, 94, 0.08)",
            fontSize: 16,
            lineHeight: 1.5,
          }}
        >
          {lang === "vi"
            ? "Đã gửi! Kiểm tra email của bạn và nhấn vào liên kết đăng nhập."
            : "Sent! Check your email and tap the sign-in link."}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void sendMagicLink()}
          disabled={magicLoading}
          style={{
            width: "100%",
            minHeight: 48,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #2d5a3d",
            background: "transparent",
            color: "#2d5a3d",
            fontWeight: 600,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          {magicLoading
            ? lang === "vi" ? "Đang gửi…" : "Sending…"
            : lang === "vi"
              ? "Gửi liên kết đăng nhập qua email (không cần mật khẩu)"
              : "Email me a sign-in link (no password needed)"}
        </button>
      )}
    </main>
  );
}
