"use client";
// AcceptInviteClient — Phase 2 rework: value-first, passwordless, elder-proof.
// Flow: (1) see your spot in the tree, (2) "Yes, that's me", (3) confirm your
// name. No password anywhere; phone-only invites ask for an email (one
// question, one screen).

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useLanguage, LanguageToggle } from "@/contexts/LanguageContext";

type Stage = "loading" | "tree" | "email" | "confirm" | "declined" | "error";

type Preview = {
  valid: boolean;
  alreadyClaimed: boolean;
  expired: boolean;
  hasEmail: boolean;
  inviterName: string;
  familyName: string;
  targetPerson: { id: string; fullName: string; photoUrl: string | null };
  parents: string[];
  children: string[];
  spouses: string[];
};

// ——— Elder-proof building blocks: big text, ≥56px tap targets, one idea per
// screen, tap-only interactions ———

const bigButtonStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 60,
  padding: "16px 20px",
  borderRadius: 14,
  border: "none",
  background: "#2d5a3d",
  color: "#ffffff",
  fontWeight: 700,
  fontSize: 20,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  ...bigButtonStyle,
  background: "transparent",
  border: "2px solid #9ca3af",
  color: "inherit",
  fontWeight: 600,
};

const bigInputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 56,
  padding: "14px 16px",
  border: "2px solid #9ca3af",
  borderRadius: 14,
  fontSize: 20,
  background: "transparent",
  color: "inherit",
};

function PersonChip({ name, dim }: { name: string; dim?: boolean }) {
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 12,
        border: "1px solid #d1d5db",
        background: dim ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.18)",
        fontSize: 16,
        fontWeight: 600,
        textAlign: "center",
      }}
    >
      {name}
    </div>
  );
}

export default function AcceptInviteClient() {
  const { status: authStatus } = useSession();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const { lang } = useLanguage();
  const vi = lang === "vi";

  const [stage, setStage] = useState<Stage>("loading");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Scribed history (Phase 3a): what family already filled in for this person
  const [scribedNotes, setScribedNotes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setStage("error");
        setMsg(vi ? "Thiếu mã lời mời." : "This invitation link is missing its code.");
        return;
      }
      try {
        const res = await fetch(`/api/invitations/preview?token=${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setStage("error");
          setMsg(vi ? "Lời mời không hợp lệ." : "We couldn't find this invitation.");
          return;
        }

        setPreview(data);
        setConfirmName(data.targetPerson?.fullName ?? "");

        if (data.alreadyClaimed) {
          setStage("error");
          setMsg(
            vi
              ? "Hồ sơ này đã có người nhận. Nếu đó là bạn, hãy đăng nhập."
              : "This profile has already been claimed. If that was you, just sign in."
          );
          return;
        }
        if (data.expired) {
          setStage("error");
          setMsg(
            vi
              ? "Lời mời này đã hết hạn. Hãy nhờ người thân gửi lại lời mời mới."
              : "This invitation has expired. Ask your family member to send a new one."
          );
          return;
        }

        setStage("tree");
      } catch {
        if (!cancelled) {
          setStage("error");
          setMsg(vi ? "Không tải được lời mời." : "We couldn't load this invitation.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function acceptPasswordless(withEmail?: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invitations/accept-passwordless", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email: withEmail || undefined }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.error === "EMAIL_REQUIRED") {
          setStage("email");
          return;
        }
        if (data?.error === "EMAIL_IN_USE") {
          setError(
            vi
              ? "Email này đã có tài khoản. Hãy đăng nhập trước rồi mở lại liên kết."
              : "That email already has an account. Please sign in first, then open this link again."
          );
          return;
        }
        setError(String(data?.error ?? (vi ? "Không thành công." : "Something went wrong.")));
        return;
      }

      const signed = await signIn("login-token", { token: data.loginToken, redirect: false });
      if (!signed?.ok) {
        setError(vi ? "Không đăng nhập được. Hãy thử lại." : "We couldn't sign you in. Please try again.");
        return;
      }

      await loadScribedHistory();
      setStage("confirm");
    } finally {
      setLoading(false);
    }
  }

  // Surface family-scribed details as "confirm or correct" (Phase 3a)
  async function loadScribedHistory() {
    if (!preview) return;
    try {
      const res = await fetch(
        `/api/activity?personId=${encodeURIComponent(preview.targetPerson.id)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const notes: string[] = [];
      for (const item of data.items ?? []) {
        if (item.targetType === "PERSON" && item.action === "UPDATE" && item.fieldLabel && item.newValue) {
          const by = item.toldByPersonName
            ? `${item.actorName} (told by ${item.toldByPersonName})`
            : item.actorName;
          notes.push(`${item.fieldLabel}: "${item.newValue}" — ${vi ? "ghi bởi" : "recorded by"} ${by}`);
        }
        if (notes.length >= 5) break;
      }
      setScribedNotes(notes);
    } catch {
      // non-essential; skip silently
    }
  }

  async function yesThatsMe() {
    setError(null);

    // Already signed in: use the classic accept endpoint with the session
    if (authStatus === "authenticated") {
      setLoading(true);
      try {
        const res = await fetch("/api/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(String(data?.error ?? (vi ? "Không thành công." : "Something went wrong.")));
          return;
        }
        await loadScribedHistory();
        setStage("confirm");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Not signed in: passwordless. Email invites need zero extra questions.
    await acceptPasswordless();
  }

  async function saveNameAndFinish(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const trimmed = confirmName.trim();
      if (preview && trimmed && trimmed !== preview.targetPerson.fullName) {
        await fetch("/api/save-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId: preview.targetPerson.id, fullName: trimmed }),
        }).catch(() => null);
      }
      window.location.href = "/pedigree";
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "32px 20px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
          <span style={{ color: "#2d5a3d" }}>Pedigree</span>
          <span style={{ color: "#4a7c59" }}>Roots</span>
        </div>
        <LanguageToggle />
      </div>

      {stage === "loading" && (
        <p style={{ fontSize: 20, opacity: 0.7 }}>{vi ? "Đang tải lời mời…" : "Loading your invitation…"}</p>
      )}

      {stage === "tree" && preview && (
        <>
          <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.35, marginBottom: 20 }}>
            {vi ? (
              <>
                <span style={{ color: "#2d5a3d" }}>{preview.inviterName}</span> đã thêm bạn vào cây gia đình{" "}
                <span style={{ color: "#2d5a3d" }}>{preview.familyName}</span>
              </>
            ) : (
              <>
                <span style={{ color: "#2d5a3d" }}>{preview.inviterName}</span> added you to the{" "}
                <span style={{ color: "#2d5a3d" }}>{preview.familyName}</span> tree
              </>
            )}
          </h1>

          {/* Your spot in the tree: parents above, you (highlighted) with
              spouse beside, children below. Pure tap-free display. */}
          <div
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 18,
              padding: 18,
              marginBottom: 24,
              display: "grid",
              gap: 14,
            }}
          >
            {preview.parents.length > 0 && (
              <div>
                <div style={{ fontSize: 14, opacity: 0.6, marginBottom: 6 }}>
                  {vi ? "Cha mẹ" : "Parents"}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {preview.parents.map((n) => (
                    <PersonChip key={n} name={n} dim />
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
              <div
                style={{
                  padding: "16px 22px",
                  borderRadius: 16,
                  border: "3px solid #2d5a3d",
                  background: "rgba(45, 90, 61, 0.08)",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: "#4a7c59", fontWeight: 700, marginBottom: 2 }}>
                  {vi ? "Đây là bạn" : "This is you"}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{preview.targetPerson.fullName}</div>
              </div>
              {preview.spouses.map((n) => (
                <PersonChip key={n} name={n} />
              ))}
            </div>

            {preview.children.length > 0 && (
              <div>
                <div style={{ fontSize: 14, opacity: 0.6, marginBottom: 6 }}>
                  {vi ? "Con" : "Children"}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {preview.children.map((n) => (
                    <PersonChip key={n} name={n} dim />
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && <div style={{ color: "#ef4444", fontSize: 17, marginBottom: 14 }}>{error}</div>}

          <div style={{ display: "grid", gap: 12 }}>
            <button onClick={() => void yesThatsMe()} disabled={loading} style={{ ...bigButtonStyle, opacity: loading ? 0.7 : 1 }}>
              {loading
                ? vi ? "Đang xử lý…" : "One moment…"
                : vi ? "Đúng, là tôi" : "Yes, that's me"}
            </button>
            <button
              onClick={() => setStage("declined")}
              disabled={loading}
              style={secondaryButtonStyle}
            >
              {vi ? "Không phải tôi" : "This isn't me"}
            </button>
          </div>

          {authStatus === "unauthenticated" && (
            <p style={{ marginTop: 24, textAlign: "center", fontSize: 16 }}>
              {vi ? "Đã có tài khoản?" : "Already have an account?"}{" "}
              <a
                href={`/sign-in?callbackUrl=${encodeURIComponent(`/accept-invite?token=${token}`)}`}
                style={{ fontWeight: 700, textDecoration: "underline" }}
              >
                {vi ? "Đăng nhập" : "Sign in"}
              </a>
            </p>
          )}
        </>
      )}

      {stage === "email" && (
        <>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>
            {vi ? "Email của bạn là gì?" : "What's your email?"}
          </h1>
          <p style={{ opacity: 0.7, fontSize: 18, lineHeight: 1.5, marginBottom: 24 }}>
            {vi
              ? "Chúng tôi dùng email để bạn đăng nhập lại sau này. Không cần mật khẩu."
              : "We use it so you can sign back in later. No password needed."}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) void acceptPasswordless(email.trim());
            }}
            style={{ display: "grid", gap: 14 }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              style={bigInputStyle}
            />
            {error && <div style={{ color: "#ef4444", fontSize: 17 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ ...bigButtonStyle, opacity: loading ? 0.7 : 1 }}>
              {loading ? (vi ? "Đang xử lý…" : "One moment…") : vi ? "Tiếp tục" : "Continue"}
            </button>
          </form>
        </>
      )}

      {stage === "confirm" && preview && (
        <>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>
            {vi ? "Tên bạn có đúng không?" : "Is your name right?"}
          </h1>
          <p style={{ opacity: 0.7, fontSize: 18, lineHeight: 1.5, marginBottom: 24 }}>
            {vi ? "Bạn có thể sửa lại nếu cần." : "You can fix it if it's not quite right."}
          </p>

          {scribedNotes.length > 0 && (
            <div
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 14,
                padding: 16,
                marginBottom: 20,
                fontSize: 16,
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                {vi
                  ? "Gia đình đã điền giúp bạn một số thông tin — hãy kiểm tra và sửa nếu chưa đúng:"
                  : "Your family already filled in a few things for you — please check them and fix anything that's wrong:"}
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, opacity: 0.85 }}>
                {scribedNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={(e) => void saveNameAndFinish(e)} style={{ display: "grid", gap: 14 }}>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="name"
              style={bigInputStyle}
            />
            {error && <div style={{ color: "#ef4444", fontSize: 17 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{ ...bigButtonStyle, opacity: loading ? 0.7 : 1 }}>
              {loading
                ? vi ? "Đang lưu…" : "Saving…"
                : vi ? "Xem cây gia đình →" : "See the family tree →"}
            </button>
          </form>
        </>
      )}

      {stage === "declined" && (
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>
            {vi ? "Không sao cả" : "No problem"}
          </h1>
          <p style={{ opacity: 0.7, fontSize: 18, lineHeight: 1.5 }}>
            {vi
              ? "Chúng tôi sẽ không làm gì thêm. Bạn có thể đóng trang này."
              : "Nothing else will happen. You can close this page."}
          </p>
        </div>
      )}

      {stage === "error" && (
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>
            {vi ? "Rất tiếc" : "Sorry about that"}
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, marginBottom: 24 }}>{msg}</p>
          <a
            href="/sign-in"
            style={{
              display: "inline-block",
              padding: "16px 24px",
              borderRadius: 14,
              background: "#2d5a3d",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 18,
              textDecoration: "none",
            }}
          >
            {vi ? "Đăng nhập" : "Sign in"}
          </a>
        </div>
      )}
    </main>
  );
}
