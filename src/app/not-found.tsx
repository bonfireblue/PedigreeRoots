import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 72, fontWeight: 700, margin: 0, color: "#111" }}>
        404
      </h1>
      <p style={{ fontSize: 18, color: "#666", marginTop: 8, marginBottom: 24 }}>
        Page not found
      </p>
      <Link
        href="/sign-in"
        style={{
          padding: "12px 24px",
          background: "#111",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Go to Sign In
      </Link>
    </main>
  );
}
