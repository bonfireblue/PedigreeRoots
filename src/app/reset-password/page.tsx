"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage, LanguageToggle } from "@/contexts/LanguageContext";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { t, lang } = useLanguage();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError(lang === "vi" ? "Token đặt lại không hợp lệ hoặc bị thiếu." : "Invalid or missing reset token.");
      return;
    }

    if (password !== confirmPassword) {
      setError(lang === "vi" ? "Mật khẩu không khớp." : "Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError(t.passwordTooShort);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || (lang === "vi" ? "Không thể đặt lại mật khẩu" : "Failed to reset password"));
      }

      router.push("/sign-in?reset=success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t.somethingWentWrong;
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
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
          {lang === "vi" ? "Liên kết không hợp lệ" : "Invalid Link"}
        </h1>
        <p style={{ opacity: 0.8, marginBottom: 24 }}>
          {lang === "vi" 
            ? "Liên kết đặt lại mật khẩu này không hợp lệ hoặc đã hết hạn." 
            : "This password reset link is invalid or has expired."}
        </p>
        <a href="/forgot-password" style={{ color: "#111", textDecoration: "underline" }}>
          {lang === "vi" ? "Yêu cầu liên kết mới" : "Request a new reset link"}
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
        {t.resetPassword}
      </h1>

      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        {lang === "vi" ? "Nhập mật khẩu mới của bạn bên dưới." : "Enter your new password below."}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>{t.newPassword}</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              padding: 10,
              border: "1px solid #ddd",
              borderRadius: 10,
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>{t.confirmPassword}</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
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
          {loading ? t.resettingPassword : t.resetPassword}
        </button>
      </form>

      <div style={{ marginTop: 16, textAlign: "center" }}>
        <a href="/sign-in">{t.backToSignIn}</a>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 420, margin: "80px auto", padding: 16 }}>{/* Loading */}</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
