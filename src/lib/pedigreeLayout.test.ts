import { layoutPedigree, type TreeApiResponse } from "./pedigreeLayout";

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`ASSERT_FAIL: ${msg}`);
}

export function devTestPedigreeLayout() {
  const A = "grandpa";
  const B = "grandma";
  const P = "parent";
  const AU = "aunt";
  const S1 = "spouse1";
  const S2 = "spouse2";
  const C1 = "child1";
  const C2 = "child2";
  const C3 = "child3";

  const data: TreeApiResponse = {
    centerId: P,
    nodes: [
      { id: A, fullName: "Grandpa" },
      { id: B, fullName: "Grandma" },
      { id: P, fullName: "Parent" },
      { id: AU, fullName: "Aunt" },
      { id: S1, fullName: "Spouse 1" },
      { id: S2, fullName: "Spouse 2" },
      { id: C1, fullName: "Child 1" },
      { id: C2, fullName: "Child 2" },
      { id: C3, fullName: "Child 3" },
    ],
    edges: {
      parentChild: [
        { parentId: A, childId: P },
        { parentId: B, childId: P },
        { parentId: A, childId: AU },
        { parentId: B, childId: AU },

        { parentId: P, childId: C1 },
        { parentId: S1, childId: C1 },

        { parentId: P, childId: C2 },
        { parentId: S1, childId: C2 },

        { parentId: P, childId: C3 },
        { parentId: S2, childId: C3 },
      ],
      spouse: [
        { aId: A, bId: B },
        { aId: P, bId: S1 },
        { aId: P, bId: S2 },
      ],
    },
  };

  const res = layoutPedigree({
    data,
    options: { nodeW: 140, nodeH: 70, hGap: 40, vGap: 80, maxDepthUp: 2, maxDepthDown: 2, maxNodes: 2000 },
  });

  const byId = new Map(res.nodes.map((n) => [n.id, n]));
  assert(byId.has(P), "center exists");
  assert(byId.get(P)!.gen === 0, "center gen=0");
  assert(byId.get(A)!.gen === -1, "grandpa gen=-1");
  assert(byId.get(C1)!.gen === 1, "child gen=+1");

  // Ensure spouse adjacency (same gen)
  assert(byId.get(P)!.gen === byId.get(S1)!.gen, "spouse1 same gen");
  assert(byId.get(P)!.gen === byId.get(S2)!.gen, "spouse2 same gen");

  // Ensure no duplicate positioned nodes
  assert(byId.size === res.nodes.length, "no duplicates");

  console.log("devTestPedigreeLayout OK", { nodeCount: res.nodes.length, edgeCount: res.edges.length });
}