"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type ActivityItem = {
  id: string;
  createdAt: string;
  actorName: string;
  targetPersonId: string | null;
  targetPersonName: string | null;
  targetType: string;
  action: string;
  field: string | null;
  fieldLabel: string | null;
  oldValue: string | null;
  newValue: string | null;
};

function describe(item: ActivityItem): string {
  const person = item.targetPersonName ?? "a person";

  if (item.targetType === "PERSON") {
    if (item.action === "CREATE") return `added ${person} to the tree`;
    if (item.action === "DELETE") return `removed ${item.oldValue ?? person} from the tree`;
    if (item.action === "RESTORE") return `restored ${person}`;
    if (item.field === "claimedByUserId") return `claimed the profile of ${person}`;
    if (item.fieldLabel) {
      return `updated ${person}'s ${item.fieldLabel}`;
    }
    return `updated ${person}`;
  }

  if (item.targetType === "PARENT_CHILD") {
    if (item.action === "CREATE") return `linked ${item.newValue ?? "someone"} as a parent of ${person}`;
    return `removed ${item.oldValue ?? "a parent"} as a parent of ${person}`;
  }

  if (item.targetType === "SPOUSE") {
    if (item.action === "CREATE") return `linked ${item.newValue ?? "someone"} as spouse of ${person}`;
    return `removed the spouse link between ${person} and ${item.oldValue ?? "someone"}`;
  }

  if (item.targetType === "INVITATION") {
    if (item.action === "CREATE") return `invited someone to claim ${person}`;
    if (item.newValue === "ACCEPTED") return `accepted the invitation to claim ${person}`;
    return `updated an invitation for ${person}`;
  }

  if (item.targetType === "VOUCH") {
    return `vouched for ${person}`;
  }

  return `changed something about ${person}`;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string | null) => {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const res = await fetch(`/api/activity${qs}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `FAILED_${res.status}`);
    return data as { items: ActivityItem[]; nextCursor: string | null };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await load();
        if (cancelled) return;
        setItems(data.items);
        setNextCursor(data.nextCursor);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load activity");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await load(nextCursor);
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f6f8f6", padding: 16 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            background: "#ffffff",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
            padding: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>
            <span style={{ color: "#2d5a3d" }}>Family</span>
            <span style={{ color: "#4a7c59" }}> Activity</span>
          </div>
          <Link
            href="/pedigree"
            style={{
              borderRadius: 12,
              border: "1px solid #d1d5db",
              padding: "10px 14px",
              background: "#ffffff",
              color: "#111827",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            ← Back to tree
          </Link>
        </div>

        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            background: "#ffffff",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
            padding: 8,
          }}
        >
          {loading ? (
            <div style={{ padding: 24 }}>Loading activity…</div>
          ) : error ? (
            <div style={{ padding: 24, color: "#991b1b" }}>{error}</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 24, color: "#64748b" }}>
              No activity yet. Changes anyone makes to the tree will show up here.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((item) => (
                <li
                  key={item.id}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #f1f5f9",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "baseline",
                  }}
                >
                  <div style={{ fontSize: 15, color: "#111827" }}>
                    <strong>{item.actorName}</strong> {describe(item)}
                    {item.field && item.oldValue !== null && item.newValue !== null &&
                     item.targetType === "PERSON" && item.field !== "claimedByUserId" ? (
                      <div style={{ marginTop: 2, fontSize: 13, color: "#64748b" }}>
                        {item.oldValue ? `"${item.oldValue}" → ` : ""}
                        {item.newValue ? `"${item.newValue}"` : "(cleared)"}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
                    {formatWhen(item.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {nextCursor ? (
            <div style={{ padding: 12, textAlign: "center" }}>
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                style={{
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  padding: "10px 18px",
                  background: "#ffffff",
                  color: "#111827",
                  fontWeight: 600,
                  cursor: loadingMore ? "default" : "pointer",
                }}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
