"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useLanguage, LanguageToggle } from "@/contexts/LanguageContext";

export default function SignUpPage() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  
  const [passcode, setPasscode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!passcode.trim()) {
      setError(t.passcodeRequired);
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
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ 
          email, 
          password, 
          name: name || undefined,
          passcode: passcode.trim().toUpperCase(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.error?.includes("passcode") || data?.error?.includes("Passcode")) {
          throw new Error(t.invalidPasscode);
        }
        if (data?.error?.includes("already been used")) {
          throw new Error(t.passcodeUsed);
        }
        if (data?.error?.includes("Email is already")) {
          throw new Error(t.emailInUse);
        }
        throw new Error(data?.error || (lang === "vi" ? "Đăng ký thất bại" : "Sign up failed"));
      }

      // Auto sign-in after successful registration
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });

      if (result?.error) {
        router.push("/sign-in");
        return;
      }

      router.push("/pedigree");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : (lang === "vi" ? "Đăng ký thất bại" : "Sign up failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ 
      maxWidth: 420, 
      margin: "0 auto", 
      padding: "40px 20px",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
          <span style={{ color: "#2d5a3d" }}>Pedigree</span>
          <span style={{ color: "#4a7c59" }}>Roots</span>
        </div>
        <LanguageToggle />
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        {t.createAccount}
      </h1>
      <p style={{ opacity: 0.8, marginBottom: 20 }}>
        {lang === "vi" 
          ? "Nhập mã đăng ký để tham gia cây gia đình." 
          : "Enter your passcode to join the family tree."}
      </p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>{t.passcode} <span style={{ color: "crimson" }}>*</span></span>
          <input
            value={passcode}
            onChange={(e) => setPasscode(e.target.value.toUpperCase())}
            required
            placeholder={t.passcodePlaceholder}
            autoComplete="off"
            style={{ 
              padding: 10, 
              border: "1px solid #ddd", 
              borderRadius: 10,
              fontFamily: "monospace",
              fontSize: 16,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>{t.name}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={lang === "vi" ? "Nhập họ và tên của bạn" : "Enter your full name"}
            autoComplete="name"
            style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>{t.email} <span style={{ color: "crimson" }}>*</span></span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            autoComplete="email"
            style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>{t.password} <span style={{ color: "crimson" }}>*</span></span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            autoComplete="new-password"
            style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>{t.confirmPassword} <span style={{ color: "crimson" }}>*</span></span>
          <input
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            type="password"
            autoComplete="new-password"
            style={{ padding: 10, border: "1px solid #ddd", borderRadius: 10 }}
          />
        </label>

        {error ? (
          <div style={{ color: "crimson", fontSize: 14 }}>{error}</div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "white",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? t.creatingAccount : t.createAccount}
        </button>

        <a href="/sign-in" style={{ textAlign: "center", marginTop: 6 }}>
          {t.alreadyHaveAccount} {t.signIn}
        </a>
      </form>
    </main>
  );
}
