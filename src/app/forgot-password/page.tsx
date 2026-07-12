"use client";

import { useState } from "react";
import { useLanguage, LanguageToggle } from "@/contexts/LanguageContext";

export default function ForgotPasswordPage() {
  const { t, lang } = useLanguage();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || (lang === "vi" ? "Không thể gửi email đặt lại" : "Failed to send reset email"));
      }

      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t.somethingWentWrong;
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <main style={{ maxWidth: 420, margin: "0 auto", padding: "40px 20px", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
            <span style={{ color: "#2d5a3d" }}>Pedigree</span>
            <span style={{ color: "#4a7c59" }}>Roots</span>
          </div>
          <LanguageToggle />
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          {lang === "vi" ? "Kiểm tra email của bạn" : "Check your email"}
        </h1>
        <p style={{ opacity: 0.8, marginBottom: 24 }}>
          {lang === "vi" 
            ? "Nếu tài khoản với email đó tồn tại, chúng tôi đã gửi liên kết đặt lại mật khẩu. Vui lòng kiểm tra hộp thư đến và thư rác." 
            : "If an account with that email exists, we've sent a password reset link. Please check your inbox and spam folder."}
        </p>
        <a href="/sign-in" style={{ color: "#111", textDecoration: "underline" }}>
          {t.backToSignIn}
        </a>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: "40px 20px", minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
          <span style={{ color: "#2d5a3d" }}>Pedigree</span>
          <span style={{ color: "#4a7c59" }}>Roots</span>
        </div>
        <LanguageToggle />
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        {lang === "vi" ? "Quên mật khẩu" : "Forgot Password"}
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        {lang === "vi" 
          ? "Nhập địa chỉ email của bạn và chúng tôi sẽ gửi cho bạn liên kết để đặt lại mật khẩu." 
          : "Enter your email address and we'll send you a link to reset your password."}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>{t.email}</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              padding: 10,
              border: "1px solid #ddd",
              borderRadius: 10,
            }}
          />
        </label>

        {error && (
          <div style={{ color: "crimson", fontSize: 14 }}>{error}</div>
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
            cursor: "pointer",
          }}
        >
          {loading ? t.sendingResetLink : t.sendResetLink}
        </button>
      </form>

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <a href="/sign-in">{t.backToSignIn}</a>
      </div>
    </main>
  );
}
