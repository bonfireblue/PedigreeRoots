"use client";
// TreeView component - March 17 2026 v4
import type { PersonGraph, Person } from "@/lib/treeMap";

interface Props {
  graph: PersonGraph | null | undefined;
  onSelectPerson?: (id: string) => void;
  onInvite?: (person: Person) => void;
  canInvite?: boolean;
}

export function TreeView({ graph, onSelectPerson, onInvite, canInvite }: Props) {
  // PersonGraph has person (center) + parents, children, spouses, siblings arrays
  // Combine all people into a single list for display
  const allPeople: Person[] = graph ? [
    graph.person,
    ...graph.parents,
    ...graph.children,
    ...graph.spouses,
    ...graph.siblings,
  ] : [];

  // Remove duplicates by id
  const uniquePeople = allPeople.filter((person, index, self) => 
    index === self.findIndex((p) => p.id === person.id)
  );
  
  if (uniquePeople.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>
        No family members yet. Add someone to get started.
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {uniquePeople.map((person) => (
          <div
            key={person.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectPerson?.(person.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectPerson?.(person.id);
              }
            }}
            style={{
              padding: 16,
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              background: "#fff",
              cursor: "pointer",
              minWidth: 150,
            }}
          >
            <div style={{ fontWeight: 600 }}>{person.fullName || "Unnamed"}</div>
            {canInvite && onInvite && !person.claimedByUserId && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onInvite(person);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onInvite(person);
                  }
                }}
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  padding: "4px 8px",
                  fontSize: 12,
                  background: "#f1f5f9",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Invite
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
