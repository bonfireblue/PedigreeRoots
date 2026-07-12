"use client";

export function NodeCard({
  p,
  onClick,
  isCenter,
}: {
  p: {
    id: string;
    fullName?: string;
    claimedByUserId?: string | null;
  };
  onClick?: () => void;
  isCenter?: boolean;
}) {
  const claimed = !!p.claimedByUserId;

  return (
    <div
      onClick={onClick}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 12,
        border: isCenter
          ? "2px solid #10b981"
          : "1px solid #e5e7eb",
        background: "#ffffff",
        padding: 10,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          color: "#111827",
          marginBottom: 4,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {p.fullName || "Unnamed"}
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: claimed ? "#16a34a" : "#f97316",
        }}
      >
        {claimed ? "CLAIMED" : "UNCLAIMED"}
      </div>
    </div>
  );
}