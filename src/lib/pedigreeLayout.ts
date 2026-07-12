// src/lib/pedigreeLayout.ts

export type TreeApiNode = {
  id: string;
  fullName?: string;
  claimedByUserId?: string | null;
  isPrivate?: boolean;
  createdAt?: string;
  bio?: string | null;
  location?: string | null;
  birthDate?: string | null;
  deathDate?: string | null;
  photoUrl?: string | null;
};

export type TreeApiEdgePC = { parentId: string; childId: string };
export type TreeApiEdgeSp = { aId: string; bId: string };

export type TreeApiData = {
  centerId: string;
  depth?: number;
  limit?: number;
  nodes: TreeApiNode[];
  edges: {
    parentChild: TreeApiEdgePC[];
    spouse: TreeApiEdgeSp[];
  };
};

// Backward-compat alias for older tests/imports
export type TreeApiResponse = TreeApiData;

export type LayoutOptions = {
  nodeW: number;
  nodeH: number;
  hGap: number;
  vGap: number;
  maxDepthUp: number;
  maxDepthDown: number;
  maxNodes: number;
};

export type PositionedNode = {
  id: string;
  x: number;
  y: number;
  gen: number;
  kind: "person";
};

export type RoutedEdge = {
  kind: "spouse" | "parentChild";
  pathD: string;
  fromId?: string;
  toId?: string;
  unionId?: string;
};

export type LayoutResult = {
  centerId: string;
  nodes: PositionedNode[];
  edges: RoutedEdge[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

type Union = {
  id: string;
  aId: string;
  bId: string;
  gen: number;
  childIds: string[];
};

type Block = {
  id: string;
  gen: number;
  personIds: string[]; // 1 or 2
  childBlockIds: string[];
};

export function layoutPedigree(params: { data: TreeApiData; options: LayoutOptions }): LayoutResult {
  const { data, options } = params;
  const centerId = data.centerId;

  const nodeW = options.nodeW;
  const nodeH = options.nodeH;
  const hGap = options.hGap;
  const vGap = options.vGap;

  const pc = Array.isArray(data.edges?.parentChild) ? data.edges.parentChild : [];
  const sp = Array.isArray(data.edges?.spouse) ? data.edges.spouse : [];

  // --------------------------------------------------
  // A) Index nodes
  // --------------------------------------------------
  const nodeById = new Map<string, TreeApiNode>();
  for (const n of data.nodes ?? []) {
    if (n?.id) nodeById.set(n.id, n);
  }

  if (!nodeById.has(centerId)) {
    return {
      centerId,
      nodes: [],
      edges: [],
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
  }

  const parentsByChild = new Map<string, Set<string>>();
  const childrenByParent = new Map<string, Set<string>>();
  const spousesById = new Map<string, Set<string>>();

  function ensureSet(map: Map<string, Set<string>>, key: string) {
    let set = map.get(key);
    if (!set) {
      set = new Set<string>();
      map.set(key, set);
    }
    return set;
  }

  for (const e of pc) {
    if (!e?.parentId || !e?.childId) continue;
    if (!nodeById.has(e.parentId) || !nodeById.has(e.childId)) continue;
    if (e.parentId === e.childId) continue;

    ensureSet(parentsByChild, e.childId).add(e.parentId);
    ensureSet(childrenByParent, e.parentId).add(e.childId);
  }

  for (const e of sp) {
    if (!e?.aId || !e?.bId) continue;
    if (!nodeById.has(e.aId) || !nodeById.has(e.bId)) continue;
    if (e.aId === e.bId) continue;

    ensureSet(spousesById, e.aId).add(e.bId);
    ensureSet(spousesById, e.bId).add(e.aId);
  }

  function arr<T>(set: Set<T> | undefined): T[] {
    return set ? Array.from(set) : [];
  }

  function unionKey(a: string, b: string) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function personSortKey(id: string) {
    const n = nodeById.get(id);
    const birth = n?.birthDate ?? "";
    const created = n?.createdAt ?? "";
    const name = (n?.fullName ?? "").toLowerCase();
    return { birth, created, name, id };
  }

 function comparePersonIds(a: string, b: string): number {
  const ka = personSortKey(a);
  const kb = personSortKey(b);

  if (ka.birth !== kb.birth) return ka.birth < kb.birth ? -1 : 1;
  if (ka.created !== kb.created) return ka.created < kb.created ? -1 : 1;
  if (ka.name !== kb.name) return ka.name < kb.name ? -1 : 1;
  if (ka.id !== kb.id) return ka.id < kb.id ? -1 : 1;
  return 0;
}

  function stableSortPersonIds(ids: string[]) {
    return ids.slice().sort(comparePersonIds);
  }

  function compareUnionKeys(a: string, b: string) {
    const [a1, a2] = a.split("|");
    const [b1, b2] = b.split("|");

    const aBest = stableSortPersonIds([a1, a2])[0];
    const bBest = stableSortPersonIds([b1, b2])[0];

    const c1 = comparePersonIds(aBest, bBest);
    if (c1 !== 0) return c1;

    const aOther = aBest === a1 ? a2 : a1;
    const bOther = bBest === b1 ? b2 : b1;
    return comparePersonIds(aOther, bOther);
  }

  function blockOwnWidth(personIds: string[]) {
    return personIds.length === 2 ? nodeW * 2 + hGap : nodeW;
  }

  // --------------------------------------------------
  // B) Bloodline traversal first, then visible spouses
  // --------------------------------------------------
  const genById = new Map<string, number>();
  const distById = new Map<string, number>();

  genById.set(centerId, 0);
  distById.set(centerId, 0);

  const q: string[] = [centerId];

  while (q.length > 0 && genById.size < options.maxNodes) {
    const cur = q.shift()!;
    const curGen = genById.get(cur)!;
    const curDist = distById.get(cur)!;

    if (curGen > -options.maxDepthUp) {
      for (const p of arr(parentsByChild.get(cur))) {
        if (genById.has(p)) continue;
        genById.set(p, curGen - 1);
        distById.set(p, curDist + 1);
        q.push(p);
      }
    }

    if (curGen < options.maxDepthDown) {
      for (const c of arr(childrenByParent.get(cur))) {
        if (genById.has(c)) continue;
        genById.set(c, curGen + 1);
        distById.set(c, curDist + 1);
        q.push(c);
      }
    }
  }

  const include = new Set<string>(Array.from(genById.keys()));

  // Add spouses at same generation, but do not expand into spouse ancestry
  for (const id of Array.from(include)) {
    const g = genById.get(id)!;
    const baseDist = distById.get(id) ?? 0;

    for (const mate of arr(spousesById.get(id))) {
      if (include.size >= options.maxNodes) break;
      include.add(mate);

      if (!genById.has(mate)) genById.set(mate, g);
      if (!distById.has(mate)) distById.set(mate, baseDist + 1);
    }
  }

  // --------------------------------------------------
  // C) Build unions
  // --------------------------------------------------
  const unionByKey = new Map<string, Union>();

  for (const e of sp) {
    if (!e?.aId || !e?.bId) continue;
    if (!include.has(e.aId) || !include.has(e.bId)) continue;

    const ga = genById.get(e.aId);
    const gb = genById.get(e.bId);

    if (typeof ga !== "number" || typeof gb !== "number") continue;
    if (ga !== gb) continue;

    const key = unionKey(e.aId, e.bId);
    if (!unionByKey.has(key)) {
      const [aId, bId] = stableSortPersonIds([e.aId, e.bId]);
      unionByKey.set(key, {
        id: key,
        aId,
        bId,
        gen: ga,
        childIds: [],
      });
    }
  }

  function visibleUnionKeysForParent(parentId: string): string[] {
    const keys: string[] = [];

    for (const mate of arr(spousesById.get(parentId))) {
      if (!include.has(mate)) continue;
      const key = unionKey(parentId, mate);
      if (unionByKey.has(key)) keys.push(key);
    }

    return keys.sort(compareUnionKeys);
  }

  // --------------------------------------------------
  // D) Assign children to unions carefully
  // --------------------------------------------------
  const unionForChild = new Map<string, string>();

  for (const u of unionByKey.values()) {
    u.childIds = [];
  }

  for (const childId of include) {
    const visibleParents = stableSortPersonIds(
      arr(parentsByChild.get(childId)).filter((pid) => include.has(pid))
    );

    if (visibleParents.length === 0) continue;

    let matchedUnion: string | null = null;

    // Best case: two visible parents that are actually a visible union
    if (visibleParents.length >= 2) {
      for (let i = 0; i < visibleParents.length; i++) {
        for (let j = i + 1; j < visibleParents.length; j++) {
          const key = unionKey(visibleParents[i], visibleParents[j]);
          if (unionByKey.has(key)) {
            matchedUnion = key;
            break;
          }
        }
        if (matchedUnion) break;
      }
    }

    // Fallback only when there is exactly one visible parent and exactly one visible union
    // for that parent. This is intentionally conservative.
    if (!matchedUnion && visibleParents.length === 1) {
      const onlyParent = visibleParents[0];
      const parentUnionKeys = visibleUnionKeysForParent(onlyParent);

      if (parentUnionKeys.length === 1) {
        matchedUnion = parentUnionKeys[0];
      }
    }

    if (!matchedUnion) continue;

    unionForChild.set(childId, matchedUnion);
    unionByKey.get(matchedUnion)!.childIds.push(childId);
  }

  for (const u of unionByKey.values()) {
    u.childIds = stableSortPersonIds(Array.from(new Set(u.childIds)));
  }

  // --------------------------------------------------
  // E) Build blocks
  //
  // Important rule:
  // A person can appear in only one rendered block.
  // To avoid broken layouts for multi-spouse people, only pair a person into
  // a 2-person block if both people appear in exactly one visible union.
  // Everyone else renders as a single block, and spouse edges still connect them.
  // --------------------------------------------------
  const blocks = new Map<string, Block>();
  const personToBlockId = new Map<string, string>();

  const visibleUnionCountByPerson = new Map<string, number>();
  for (const id of include) visibleUnionCountByPerson.set(id, visibleUnionKeysForParent(id).length);

  const pairableUnions = Array.from(unionByKey.values()).filter((u) => {
    const ac = visibleUnionCountByPerson.get(u.aId) ?? 0;
    const bc = visibleUnionCountByPerson.get(u.bId) ?? 0;
    return ac === 1 && bc === 1;
  });

  pairableUnions.sort((a, b) => {
    if (a.gen !== b.gen) return a.gen - b.gen;

    const da = Math.min(distById.get(a.aId) ?? 1e9, distById.get(a.bId) ?? 1e9);
    const db = Math.min(distById.get(b.aId) ?? 1e9, distById.get(b.bId) ?? 1e9);
    if (da !== db) return da - db;

    const childDiff = b.childIds.length - a.childIds.length;
    if (childDiff !== 0) return childDiff;

    return compareUnionKeys(a.id, b.id);
  });

  const paired = new Set<string>();

  for (const u of pairableUnions) {
    if (paired.has(u.aId) || paired.has(u.bId)) continue;

    const pair = stableSortPersonIds([u.aId, u.bId]);
    const blockId = `block:union:${u.id}`;

    blocks.set(blockId, {
      id: blockId,
      gen: u.gen,
      personIds: pair,
      childBlockIds: [],
    });

    personToBlockId.set(pair[0], blockId);
    personToBlockId.set(pair[1], blockId);

    paired.add(pair[0]);
    paired.add(pair[1]);
  }

  for (const id of stableSortPersonIds(Array.from(include))) {
    if (personToBlockId.has(id)) continue;

    const blockId = `block:person:${id}`;
    blocks.set(blockId, {
      id: blockId,
      gen: genById.get(id) ?? 0,
      personIds: [id],
      childBlockIds: [],
    });

    personToBlockId.set(id, blockId);
  }

  // --------------------------------------------------
  // F) Connect parent blocks to child blocks
  // --------------------------------------------------
  const incomingParentCount = new Map<string, number>();

  function addChildBlock(parentBlockId: string, childBlockId: string) {
    if (parentBlockId === childBlockId) return;

    const parentBlock = blocks.get(parentBlockId);
    const childBlock = blocks.get(childBlockId);
    if (!parentBlock || !childBlock) return;

    if (childBlock.gen <= parentBlock.gen) return;

    if (!parentBlock.childBlockIds.includes(childBlockId)) {
      parentBlock.childBlockIds.push(childBlockId);
      incomingParentCount.set(childBlockId, (incomingParentCount.get(childBlockId) ?? 0) + 1);
    }
  }

  // Add union-based children first
  for (const u of unionByKey.values()) {
    const aBlockId = personToBlockId.get(u.aId);
    const bBlockId = personToBlockId.get(u.bId);

    // If both are the same block, use that.
    // If they are different single blocks (multi-spouse case), anchor children to the
    // more central/closer parent block for tree layout purposes, while edge routing
    // still uses the true union.
    let parentBlockId: string | undefined;

    if (aBlockId && bBlockId && aBlockId === bBlockId) {
      parentBlockId = aBlockId;
    } else if (aBlockId && bBlockId) {
      const da = distById.get(u.aId) ?? 1e9;
      const db = distById.get(u.bId) ?? 1e9;
      parentBlockId = da <= db ? aBlockId : bBlockId;
    } else {
      parentBlockId = aBlockId ?? bBlockId;
    }

    if (!parentBlockId) continue;

    for (const childId of u.childIds) {
      const childBlockId = personToBlockId.get(childId);
      if (!childBlockId) continue;
      addChildBlock(parentBlockId, childBlockId);
    }
  }

  // Add single-parent fallbacks for children not assigned to a union
  for (const e of pc) {
    if (!e?.parentId || !e?.childId) continue;
    if (!include.has(e.parentId) || !include.has(e.childId)) continue;
    if (unionForChild.has(e.childId)) continue;

    const parentBlockId = personToBlockId.get(e.parentId);
    const childBlockId = personToBlockId.get(e.childId);
    if (!parentBlockId || !childBlockId) continue;

    addChildBlock(parentBlockId, childBlockId);
  }

  // Stable child block ordering
  for (const block of blocks.values()) {
    const seen = new Set<string>();
    block.childBlockIds = block.childBlockIds.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    block.childBlockIds.sort((a, b) => {
      const ab = blocks.get(a);
      const bb = blocks.get(b);
      if (!ab || !bb) return a < b ? -1 : 1;

      const aLead = stableSortPersonIds(ab.personIds)[0];
      const bLead = stableSortPersonIds(bb.personIds)[0];
      return comparePersonIds(aLead, bLead);
    });
  }

  // --------------------------------------------------
  // G) Top-down layout
  // --------------------------------------------------
  const blockCenterX = new Map<string, number>();
  const subtreeWidth = new Map<string, number>();

  function computeSubtreeWidth(blockId: string): number {
    const cached = subtreeWidth.get(blockId);
    if (typeof cached === "number") return cached;

    const block = blocks.get(blockId)!;
    const own = blockOwnWidth(block.personIds);

    if (block.childBlockIds.length === 0) {
      subtreeWidth.set(blockId, own);
      return own;
    }

    const childWidths = block.childBlockIds.map((cid) => {
      const childSubtree = computeSubtreeWidth(cid);
      const childOwn = blockOwnWidth(blocks.get(cid)!.personIds);
      return Math.max(childSubtree, childOwn);
    });

    const totalChildren =
      childWidths.reduce((sum, w) => sum + w, 0) + hGap * Math.max(0, childWidths.length - 1);

    const width = Math.max(own, totalChildren);
    subtreeWidth.set(blockId, width);
    return width;
  }

  const rootBlockIds = Array.from(blocks.values())
    .filter((b) => (incomingParentCount.get(b.id) ?? 0) === 0)
    .sort((a, b) => {
      // keep upper generations above lower
      if (a.gen !== b.gen) return a.gen - b.gen;

      // keep tree containing center close to middle later via forest centering,
      // but sort deterministic here
      const da = Math.min(...a.personIds.map((id) => distById.get(id) ?? 1e9));
      const db = Math.min(...b.personIds.map((id) => distById.get(id) ?? 1e9));
      if (da !== db) return da - db;

      const aLead = stableSortPersonIds(a.personIds)[0];
      const bLead = stableSortPersonIds(b.personIds)[0];
      return comparePersonIds(aLead, bLead);
    })
    .map((b) => b.id);

  for (const rootId of rootBlockIds) {
    computeSubtreeWidth(rootId);
  }

  function layoutBlock(blockId: string, centerX: number) {
    blockCenterX.set(blockId, centerX);

    const block = blocks.get(blockId)!;
    if (block.childBlockIds.length === 0) return;

    const childWidths = block.childBlockIds.map((cid) => {
      const childSubtree = subtreeWidth.get(cid) ?? computeSubtreeWidth(cid);
      const childOwn = blockOwnWidth(blocks.get(cid)!.personIds);
      return Math.max(childSubtree, childOwn);
    });

    const totalChildren =
      childWidths.reduce((sum, w) => sum + w, 0) + hGap * Math.max(0, childWidths.length - 1);

    let left = centerX - totalChildren / 2;

    for (let i = 0; i < block.childBlockIds.length; i++) {
      const childId = block.childBlockIds[i];
      const w = childWidths[i];
      const childCenter = left + w / 2;

      layoutBlock(childId, childCenter);
      left += w + hGap;
    }
  }

  const forestWidth =
    rootBlockIds.reduce((sum, id) => sum + (subtreeWidth.get(id) ?? 0), 0) +
    hGap * Math.max(0, rootBlockIds.length - 1);

  let forestLeft = -forestWidth / 2;

  for (const rootId of rootBlockIds) {
    const w = subtreeWidth.get(rootId) ?? blockOwnWidth(blocks.get(rootId)!.personIds);
    layoutBlock(rootId, forestLeft + w / 2);
    forestLeft += w + hGap;
  }

  // --------------------------------------------------
  // H) Convert block centers to node positions
  // --------------------------------------------------
  const nodeX = new Map<string, number>();

  for (const block of blocks.values()) {
    const cx = blockCenterX.get(block.id) ?? 0;
    const width = blockOwnWidth(block.personIds);
    const left = cx - width / 2;

    if (block.personIds.length === 2) {
      const [aId, bId] = stableSortPersonIds(block.personIds);
      nodeX.set(aId, left);
      nodeX.set(bId, left + nodeW + hGap);
    } else {
      nodeX.set(block.personIds[0], cx - nodeW / 2);
    }
  }

  // Center on selected/root person
  const centerNodeX = nodeX.get(centerId);
  if (typeof centerNodeX === "number") {
    const rootMid = centerNodeX + nodeW / 2;
    for (const [id, value] of nodeX.entries()) {
      nodeX.set(id, value - rootMid);
    }
  }

  // --------------------------------------------------
  // I) Build positioned nodes
  // --------------------------------------------------
  const positioned: PositionedNode[] = [];

  for (const id of stableSortPersonIds(Array.from(include))) {
    const x = nodeX.get(id);
    const gen = genById.get(id);

    if (typeof x !== "number" || typeof gen !== "number") continue;

    positioned.push({
      id,
      x,
      y: gen * (nodeH + vGap),
      gen,
      kind: "person",
    });
  }

  const posById = new Map<string, PositionedNode>();
  for (const p of positioned) posById.set(p.id, p);

  const posCenterX = (id: string) => (posById.get(id)?.x ?? 0) + nodeW / 2;
  const posTopY = (id: string) => posById.get(id)?.y ?? 0;
  const posMidY = (id: string) => (posById.get(id)?.y ?? 0) + nodeH / 2;

  // --------------------------------------------------
  // J) Edge routing
  // --------------------------------------------------
  const edgesOut: RoutedEdge[] = [];

  // Spouse edges
  for (const u of Array.from(unionByKey.values()).sort((a, b) => compareUnionKeys(a.id, b.id))) {
    const a = posById.get(u.aId);
    const b = posById.get(u.bId);
    if (!a || !b) continue;
    if (a.gen !== b.gen) continue;

    const x1 = posCenterX(u.aId);
    const x2 = posCenterX(u.bId);
    const y = a.y + nodeH / 2;

    edgesOut.push({
      kind: "spouse",
      unionId: u.id,
      fromId: u.aId,
      toId: u.bId,
      pathD: `M ${Math.min(x1, x2)} ${y} L ${Math.max(x1, x2)} ${y}`,
    });
  }

  // Union -> child edges
  for (const u of unionByKey.values()) {
    const a = posById.get(u.aId);
    const b = posById.get(u.bId);
    if (!a || !b) continue;
    if (a.gen !== b.gen) continue;

    const children = u.childIds
      .map((id) => posById.get(id))
      .filter((v): v is PositionedNode => Boolean(v))
      .filter((v) => v.gen === a.gen + 1)
      .sort((k1, k2) => k1.x - k2.x);

    if (children.length === 0) continue;

    const ux = (posCenterX(u.aId) + posCenterX(u.bId)) / 2;
    const uy = posMidY(u.aId);

    const childTopMin = Math.min(...children.map((k) => k.y));
    const sibY = Math.max(uy + 24, childTopMin - Math.max(20, vGap * 0.35));

    // Vertical drop from union midpoint
    edgesOut.push({
      kind: "parentChild",
      unionId: u.id,
      pathD: `M ${ux} ${uy} L ${ux} ${sibY}`,
    });

    if (children.length === 1) {
      const onlyKid = children[0];
      const kx = onlyKid.x + nodeW / 2;
      const kt = onlyKid.y;

      edgesOut.push({
        kind: "parentChild",
        unionId: u.id,
        fromId: u.aId,
        toId: onlyKid.id,
        pathD: `M ${ux} ${sibY} L ${kx} ${sibY} L ${kx} ${kt}`,
      });
    } else {
      const leftChildCenter = children[0].x + nodeW / 2;
      const rightChildCenter = children[children.length - 1].x + nodeW / 2;

      edgesOut.push({
        kind: "parentChild",
        unionId: u.id,
        pathD: `M ${leftChildCenter} ${sibY} L ${rightChildCenter} ${sibY}`,
      });

      for (const child of children) {
        const kx = child.x + nodeW / 2;
        const kt = child.y;

        edgesOut.push({
          kind: "parentChild",
          unionId: u.id,
          fromId: u.aId,
          toId: child.id,
          pathD: `M ${kx} ${sibY} L ${kx} ${kt}`,
        });
      }
    }
  }

  // Single-parent fallback edges
  for (const e of pc) {
    if (!e?.parentId || !e?.childId) continue;
    if (!include.has(e.parentId) || !include.has(e.childId)) continue;
    if (unionForChild.has(e.childId)) continue;

    const p = posById.get(e.parentId);
    const c = posById.get(e.childId);
    if (!p || !c) continue;
    if (c.gen !== p.gen + 1) continue;

    const px = posCenterX(e.parentId);
    const py = posMidY(e.parentId);
    const cy = posTopY(e.childId);
    const jY = Math.max(py + 20, cy - Math.max(20, vGap * 0.35));

    edgesOut.push({
      kind: "parentChild",
      fromId: e.parentId,
      toId: e.childId,
      pathD: `M ${px} ${py} L ${px} ${jY} L ${px} ${cy}`,
    });
  }

  // --------------------------------------------------
  // K) Bounds
  // --------------------------------------------------
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of positioned) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + nodeW);
    maxY = Math.max(maxY, n.y + nodeH);
  }

  if (!isFinite(minX)) minX = 0;
  if (!isFinite(minY)) minY = 0;
  if (!isFinite(maxX)) maxX = 0;
  if (!isFinite(maxY)) maxY = 0;

  return {
    centerId,
    nodes: positioned,
    edges: edgesOut,
    bounds: { minX, minY, maxX, maxY },
  };
}