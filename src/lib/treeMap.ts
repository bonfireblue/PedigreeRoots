// src/lib/treeMap.ts

export type Person = {
  id: string;
  fullName: string;
  createdAt: string;
  isPrivate: boolean;
  claimedByUserId?: string | null;
};

export type PersonGraph = {
  person: Person & {
    bio?: string | null;
    location?: string | null;
    birthDate?: string | null;
    deathDate?: string | null;
    photoUrl?: string | null;
  };
  parents: Person[];
  children: Person[];
  spouses: Person[];
  siblings: Person[];
  grandchildren: Person[];
  niecesNephews: Person[];
};

export type TreeApiNode = {
  id: string;
  fullName?: string;
  isPrivate?: boolean;
  createdAt?: string;
  bio?: string | null;
  location?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  photoUrl?: string | null;
  claimedByUserId?: string | null;
};

export type TreeApiEdgePC = { parentId: string; childId: string };
export type TreeApiEdgeSp = { aId: string; bId: string };

export type TreeApiResponse = {
  centerId: string;
  depth?: number;
  limit?: number;
  nodes: TreeApiNode[];
  edges: {
    parentChild: TreeApiEdgePC[];
    spouse: TreeApiEdgeSp[];
  };
};

function safePerson(n: TreeApiNode): PersonGraph["person"] {
  return {
    id: n.id,
    fullName: (n.fullName ?? "").trim() || "Unnamed",
    isPrivate: n.isPrivate ?? false,
    createdAt: n.createdAt ?? new Date().toISOString(),
    claimedByUserId: n.claimedByUserId ?? null,
    bio: n.bio ?? null,
    location: n.location ?? null,
    birthDate: n.birthDate ?? null,
    deathDate: n.deathDate ?? null,
    photoUrl: n.photoUrl ?? null,
  };
}

function basicPerson(n: TreeApiNode): Person {
  return {
    id: n.id,
    fullName: (n.fullName ?? "").trim() || "Unnamed",
    isPrivate: n.isPrivate ?? false,
    createdAt: n.createdAt ?? new Date().toISOString(),
    claimedByUserId: n.claimedByUserId ?? null,
  };
}

function uniq(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

function pick(map: Map<string, TreeApiNode>, ids: string[]): Person[] {
  return uniq(ids)
    .map((id) => map.get(id))
    .filter((n): n is TreeApiNode => Boolean(n))
    .map(basicPerson);
}

function sortPeople(people: Person[]): Person[] {
  return people.slice().sort((a, b) => {
    const an = a.fullName.toLowerCase();
    const bn = b.fullName.toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;

    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

// Single normalized mapper for /api/tree -> PersonGraph
export function toPersonGraph(raw: unknown): PersonGraph {
  const data = raw as Partial<TreeApiResponse> | null | undefined;

  if (!data?.centerId) {
    throw new Error("TREE_MAP_MISSING_CENTER_ID");
  }

  const centerId = data.centerId;
  const nodes: TreeApiNode[] = Array.isArray(data.nodes) ? data.nodes : [];
  const pc: TreeApiEdgePC[] = Array.isArray(data.edges?.parentChild) ? data.edges.parentChild : [];
  const sp: TreeApiEdgeSp[] = Array.isArray(data.edges?.spouse) ? data.edges.spouse : [];

  const map = new Map<string, TreeApiNode>();
  for (const n of nodes) {
    if (n?.id) map.set(n.id, n);
  }

  const centerNode = map.get(centerId);
  if (!centerNode) {
    throw new Error("TREE_MAP_CENTER_NODE_NOT_FOUND");
  }

  const parentIds = uniq(pc.filter((e) => e.childId === centerId).map((e) => e.parentId));
  const childIds = uniq(pc.filter((e) => e.parentId === centerId).map((e) => e.childId));

  const spouseIds = uniq(
    sp
      .filter((e) => e.aId === centerId || e.bId === centerId)
      .map((e) => (e.aId === centerId ? e.bId : e.aId))
  );

  const siblingIds = uniq(
    pc
      .filter((e) => parentIds.includes(e.parentId))
      .map((e) => e.childId)
      .filter((id) => id !== centerId)
  );

  const grandchildIds = uniq(
    pc
      .filter((e) => childIds.includes(e.parentId))
      .map((e) => e.childId)
      .filter((id) => id !== centerId)
  );

  const niecesNephewsIds = uniq(
    pc
      .filter((e) => siblingIds.includes(e.parentId))
      .map((e) => e.childId)
      .filter((id) => id !== centerId)
  );

  return {
    person: safePerson(centerNode),
    parents: sortPeople(pick(map, parentIds)),
    children: sortPeople(pick(map, childIds)),
    spouses: sortPeople(pick(map, spouseIds)),
    siblings: sortPeople(pick(map, siblingIds)),
    grandchildren: sortPeople(pick(map, grandchildIds)),
    niecesNephews: sortPeople(pick(map, niecesNephewsIds)),
  };
}