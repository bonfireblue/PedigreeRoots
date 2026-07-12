import { describe, expect, it } from "vitest";
import { toPersonGraph } from "@/lib/treeMap";

describe("treeMap", () => {
  it("builds parents, children, spouses, siblings, grandchildren, and nieces/nephews", () => {
    const graph = toPersonGraph({
      centerId: "c",
      nodes: [
        { id: "p1", fullName: "Parent 1", createdAt: "2024-01-01T00:00:00.000Z", isPrivate: false },
        { id: "p2", fullName: "Parent 2", createdAt: "2024-01-01T00:00:00.000Z", isPrivate: false },
        { id: "c", fullName: "Center", createdAt: "2024-01-01T00:00:00.000Z", isPrivate: false },
        { id: "s", fullName: "Sibling", createdAt: "2024-01-01T00:00:00.000Z", isPrivate: false },
        { id: "sp", fullName: "Spouse", createdAt: "2024-01-01T00:00:00.000Z", isPrivate: false },
        { id: "ch", fullName: "Child", createdAt: "2024-01-01T00:00:00.000Z", isPrivate: false },
        { id: "gc", fullName: "Grandchild", createdAt: "2024-01-01T00:00:00.000Z", isPrivate: false },
        { id: "nn", fullName: "Niece", createdAt: "2024-01-01T00:00:00.000Z", isPrivate: false },
      ],
      edges: {
        parentChild: [
          { parentId: "p1", childId: "c" },
          { parentId: "p2", childId: "c" },
          { parentId: "p1", childId: "s" },
          { parentId: "p2", childId: "s" },
          { parentId: "c", childId: "ch" },
          { parentId: "ch", childId: "gc" },
          { parentId: "s", childId: "nn" },
        ],
        spouse: [{ aId: "c", bId: "sp" }],
      },
    });

    expect(graph.person.id).toBe("c");
    expect(graph.parents.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(graph.siblings.map((p) => p.id)).toEqual(["s"]);
    expect(graph.spouses.map((p) => p.id)).toEqual(["sp"]);
    expect(graph.children.map((p) => p.id)).toEqual(["ch"]);
    expect(graph.grandchildren.map((p) => p.id)).toEqual(["gc"]);
    expect(graph.niecesNephews.map((p) => p.id)).toEqual(["nn"]);
  });

  it("throws if centerId is missing", () => {
    expect(() => toPersonGraph({ nodes: [], edges: { parentChild: [], spouse: [] } }))
      .toThrow("TREE_MAP_MISSING_CENTER_ID");
  });

  it("throws if center node is not present", () => {
    expect(() =>
      toPersonGraph({
        centerId: "missing",
        nodes: [],
        edges: { parentChild: [], spouse: [] },
      })
    ).toThrow("TREE_MAP_CENTER_NODE_NOT_FOUND");
  });

  it("deduplicates duplicate relationships", () => {
    const graph = toPersonGraph({
      centerId: "c",
      nodes: [
        { id: "p1", fullName: "Parent 1", createdAt: "2024-01-01T00:00:00.000Z", isPrivate: false },
        { id: "c", fullName: "Center", createdAt: "2024-01-01T00:00:00.000Z", isPrivate: false },
        { id: "sp", fullName: "Spouse", createdAt: "2024-01-01T00:00:00.000Z", isPrivate: false },
      ],
      edges: {
        parentChild: [
          { parentId: "p1", childId: "c" },
          { parentId: "p1", childId: "c" },
        ],
        spouse: [
          { aId: "c", bId: "sp" },
          { aId: "sp", bId: "c" },
        ],
      },
    });

    expect(graph.parents).toHaveLength(1);
    expect(graph.spouses).toHaveLength(1);
  });
});