"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function MagicSignIn() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<"working" | "error">("working");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      if (!token) {
        setState("error");
        return;
      }
      const result = await signIn("login-token", { token, redirect: false });
      if (result?.ok) {
        window.location.href = "/pedigree";
      } else {
        setState("error");
      }
    })();
  }, [token]);

  return (
    <main
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "40px 24px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, marginBottom: 24 }}>
        <span style={{ color: "#2d5a3d" }}>Pedigree</span>
        <span style={{ color: "#4a7c59" }}>Roots</span>
      </div>

      {state === "working" ? (
        <>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Signing you in…</h1>
          <p style={{ opacity: 0.7, fontSize: 18 }}>One moment please.</p>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
            This link didn&apos;t work
          </h1>
          <p style={{ opacity: 0.7, fontSize: 18, lineHeight: 1.6, marginBottom: 28 }}>
            Sign-in links work once and expire after 15 minutes. You can request a new one.
          </p>
          <a
            href="/sign-in"
            style={{
              display: "inline-block",
              padding: "16px 24px",
              borderRadius: 12,
              background: "#2d5a3d",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 18,
              textDecoration: "none",
              minHeight: 44,
            }}
          >
            Get a new sign-in link
          </a>
        </>
      )}
    </main>
  );
}

export default function MagicPage() {
  return (
    <Suspense fallback={null}>
      <MagicSignIn />
    </Suspense>
  );
}
