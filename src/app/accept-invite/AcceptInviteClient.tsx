"use client";
// AcceptInviteClient - Updated March 27 2026 with confirm password field

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useLanguage, LanguageToggle } from "@/contexts/LanguageContext";

type Stage = "start" | "register" | "done" | "error";

export default function AcceptInviteClient() {
  const { status: authStatus } = useSession();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const { t, lang } = useLanguage();

  const [stage, setStage] = useState<Stage>("start");
  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Format phone number as user types
  function formatPhoneNumber(value: string): string {
    const digits = value.replace(/\D/g, "").slice(0, 12);
    if (digits.length === 0) return "";
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    if (digits.length <= 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`;
  }

  async function accept() {
    setMsg("");
    setLoading(true);

    if (!token) {
      setStage("error");
      setMsg(lang === "vi" ? "Thiếu mã token." : "Missing token.");
      setLoading(false);
      return;
    }

    // If logged in, use existing accept endpoint
    if (authStatus === "authenticated") {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStage("error");
        setMsg(data?.error ?? (lang === "vi" ? `Thất bại với mã ${res.status}` : `Failed with ${res.status}`));
        setLoading(false);
        return;
      }

      setStage("done");
      setMsg(lang === "vi" ? "Đã chấp nhận lời mời. Đang chuyển hướng..." : "Invitation accepted. Redirecting...");
      setTimeout(() => (window.location.href = "/pedigree"), 700);
      return;
    }

    // Not logged in: proceed to account creation
    setStage("register");
    setLoading(false);
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError(null);

    const phoneDigits = phone.replace(/\D/g, "");
    const hasEmail = email.trim().length > 0;
    const hasPhone = phoneDigits.length >= 10;

    // Must have at least email or phone
    if (!hasEmail && !hasPhone) {
      setError(lang === "vi" ? "Vui lòng nhập email hoặc số điện thoại." : "Please enter an email or phone number.");
      return;
    }

    // Validate password match
    if (password !== confirmPassword) {
      setError(lang === "vi" ? "Mật khẩu không khớp." : "Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError(lang === "vi" ? "Mật khẩu phải có ít nhất 8 ký tự." : "Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/invitations/accept-and-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        token, 
        email: hasEmail ? email.trim() : undefined, 
        phone: hasPhone ? `+${phoneDigits}` : undefined,
        password, 
        name: name || undefined 
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data?.error ?? (lang === "vi" ? `Thất bại với mã ${res.status}` : `Failed with ${res.status}`));
      setLoading(false);
      return;
    }

    setStage("done");
    setMsg(lang === "vi" ? "Đã tạo tài khoản. Đăng nhập để tiếp tục." : "Account created. Now sign in to continue.");

    // Send them to sign-in
    setTimeout(() => {
      window.location.href = "/sign-in";
    }, 700);
  }

  // Input style matching sign-up page
  const inputStyle = {
    padding: 12,
    border: "1px solid #444",
    borderRadius: 10,
    width: "100%",
    fontSize: 15,
    background: "transparent",
    color: "inherit",
  };

  const labelStyle = {
    display: "grid" as const,
    gap: 8,
  };

  const labelTextStyle = {
    fontSize: 15,
    fontWeight: 500 as const,
  };

  const buttonStyle = {
    padding: 14,
    borderRadius: 10,
    border: "none",
    background: "white",
    color: "#111",
    fontWeight: 600 as const,
    cursor: "pointer" as const,
    width: "100%",
    fontSize: 15,
    marginTop: 8,
  };

  const secondaryButtonStyle = {
    ...buttonStyle,
    background: "transparent",
    border: "1px solid #444",
    color: "inherit",
  };

  return (
    <main style={{ 
      maxWidth: 480, 
      margin: "0 auto", 
      padding: "40px 24px",
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

      {stage === "start" && (
        <>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>
            {lang === "vi" ? "Lời Mời Gia Đình" : "Family Invitation"}
          </h1>

          <p style={{ opacity: 0.7, marginBottom: 32, fontSize: 16, lineHeight: 1.5 }}>
            {t.youAreInvited}
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            <button 
              onClick={accept} 
              disabled={loading}
              style={{
                ...buttonStyle,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading 
                ? (lang === "vi" ? "Đang xử lý..." : "Processing...") 
                : t.acceptInvite
              }
            </button>
            <button 
              onClick={() => {
                setStage("done");
                setMsg(lang === "vi" ? "Đã từ chối lời mời." : "Invitation declined.");
              }}
              style={secondaryButtonStyle}
            >
              {lang === "vi" ? "Từ chối" : "Decline"}
            </button>
          </div>

          {authStatus === "unauthenticated" && (
            <p style={{ marginTop: 32, textAlign: "center", fontSize: 15 }}>
              {t.alreadyHaveAccount}{" "}
              <a
                href={`/sign-in?callbackUrl=${encodeURIComponent(`/accept-invite?token=${token}`)}`}
                style={{ fontWeight: 600, textDecoration: "underline" }}
              >
                {t.signIn}
              </a>
            </p>
          )}
        </>
      )}

      {stage === "register" && (
        <>
          <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>
            {t.createAccount}
          </h1>

          <p style={{ opacity: 0.7, marginBottom: 32, fontSize: 16, lineHeight: 1.5 }}>
            {lang === "vi" 
              ? "Tạo tài khoản để nhận hồ sơ của bạn trong cây gia đình."
              : "Create an account to claim your profile in the family tree."}
          </p>

          <form onSubmit={createAccount} style={{ display: "grid", gap: 20 }}>
            <label style={labelStyle}>
              <span style={labelTextStyle}>{lang === "vi" ? "Họ và tên" : "Full Name"}</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={lang === "vi" ? "Nhập họ và tên của bạn" : "Enter your full name"}
                autoComplete="name"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              <span style={labelTextStyle}>
                {t.email}
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                style={inputStyle}
              />
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: "#444" }} />
              <span style={{ fontSize: 13, opacity: 0.6 }}>
                {lang === "vi" ? "hoặc" : "or"}
              </span>
              <div style={{ flex: 1, height: 1, background: "#444" }} />
            </div>

            <label style={labelStyle}>
              <span style={labelTextStyle}>
                {t.phone} <span style={{ fontWeight: 400, opacity: 0.6 }}>(with country code)</span>
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                placeholder="(1) 555-123-4567"
                autoComplete="tel"
                style={inputStyle}
              />
            </label>

            <p style={{ fontSize: 13, opacity: 0.6, marginTop: -8 }}>
              {lang === "vi" 
                ? "Nhập email hoặc số điện thoại (ít nhất 1 trong 2)"
                : "Enter email or phone number (at least one required)"}
            </p>

            <label style={labelStyle}>
              <span style={labelTextStyle}>
                {t.password} <span style={{ color: "#ef4444" }}>*</span>
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={lang === "vi" ? "8 ký tự trở lên" : "8+ characters"}
                autoComplete="new-password"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              <span style={labelTextStyle}>
                {t.confirmPassword} <span style={{ color: "#ef4444" }}>*</span>
              </span>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={lang === "vi" ? "Nhập lại mật khẩu" : "Re-enter password"}
                autoComplete="new-password"
                style={inputStyle}
              />
            </label>

            {error && (
              <div style={{ color: "#ef4444", fontSize: 14 }}>
                {error}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              style={{
                ...buttonStyle,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading 
                ? (lang === "vi" ? "Đang tạo..." : "Creating...") 
                : t.createAccount
              }
            </button>

            <button 
              type="button"
              onClick={() => setStage("start")} 
              style={secondaryButtonStyle}
            >
              {t.back}
            </button>
          </form>

          <p style={{ marginTop: 32, textAlign: "center", fontSize: 15 }}>
            {t.alreadyHaveAccount}{" "}
            <a href="/sign-in" style={{ fontWeight: 600, textDecoration: "underline" }}>
              {t.signIn}
            </a>
          </p>
        </>
      )}

      {stage === "done" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ 
            width: 72, 
            height: 72, 
            borderRadius: "50%", 
            background: "#22c55e20", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            margin: "0 auto 20px",
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
            {lang === "vi" ? "Hoàn tất!" : "Done!"}
          </h1>
          <p style={{ opacity: 0.7, fontSize: 16 }}>
            {msg || (lang === "vi" ? "Hoàn tất." : "Done.")}
          </p>
        </div>
      )}

      {stage === "error" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ 
            width: 72, 
            height: 72, 
            borderRadius: "50%", 
            background: "#ef444420", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            margin: "0 auto 20px",
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: "#ef4444" }}>
            {t.error}
          </h1>
          <p style={{ marginBottom: 20, fontSize: 16 }}>{msg}</p>
          <p style={{ opacity: 0.6, fontSize: 14, marginBottom: 24 }}>
            {lang === "vi" 
              ? "Nếu bạn đã tạo tài khoản, hãy đăng nhập rồi thử lại."
              : "If you already created an account, sign in and try again."}
          </p>
          <button 
            onClick={() => setStage("start")} 
            style={buttonStyle}
          >
            {lang === "vi" ? "Thử lại" : "Try Again"}
          </button>
        </div>
      )}
    </main>
  );
}
