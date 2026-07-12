import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";
import { requireMe } from "@/lib/authz";
import { rateLimit, clientKey } from "@/lib/rateLimit";

type NodeRow = {
  id: string;
  fullName: string;
  isPrivate: boolean;
  createdById: string;
  createdAt: string;
  bio: string | null;
  location: string | null;
  grewUpLocation: string | null;
  birthDate: string | null;
  deathDate: string | null;
  photoUrl: string | null;
  occupation: string | null;
  proudOf: string | null;
  interests: string | null;
  claimedByUserId: string | null;
  familyGraphId: string;
};

type GraphRole = "FOUNDER" | "ADMIN" | "TRUSTED" | "MEMBER";
type DiscoverKind = "blood" | "spouse";

function canViewNode(params: {
  meId: string;
  isAdmin: boolean;
  membershipRole: GraphRole;
  row: {
    isPrivate: boolean;
    createdById: string;
    claimedByUserId: string | null;
  };
}) {
  const { meId, isAdmin, membershipRole, row } = params;

  if (!row.isPrivate) return true;
  if (isAdmin) return true;
  if (row.createdById === meId) return true;
  if (row.claimedByUserId === meId) return true;

  if (
    membershipRole === "FOUNDER" ||
    membershipRole === "ADMIN" ||
    membershipRole === "TRUSTED"
  ) {
    return true;
  }

  return false;
}

function dedupe<T extends string>(items: T[]) {
  return Array.from(new Set(items));
}

export async function GET(req: Request) {
  try {
    const lim = rateLimit({
      key: `tree:${clientKey(req)}`,
      limit: 120,
      windowMs: 60_000,
    });

    if (!lim.ok) {
      return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });
    }

    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const centerId = (searchParams.get("centerId") || "").trim();
    const depth = Math.max(1, Math.min(4, Number(searchParams.get("depth") || "2")));
    const limit = Math.max(50, Math.min(1500, Number(searchParams.get("limit") || "800")));

    if (!centerId) {
      return NextResponse.json({ error: "MISSING_CENTER_ID" }, { status: 400 });
    }

    const centerRows = await sql`
      SELECT id, "fullName", "isPrivate", "createdById", "createdAt", bio, location, 
             "birthDate", "deathDate", "photoUrl", "claimedByUserId", "familyGraphId"
      FROM "Person"
      WHERE id = ${centerId} AND "deletedAt" IS NULL
    `;

    if (centerRows.length === 0) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const center = centerRows[0] as NodeRow;

    const membershipRows = await sql`
      SELECT id, role, "familyGraphId"
      FROM "Membership"
      WHERE "userId" = ${me.id} AND "familyGraphId" = ${center.familyGraphId}
    `;

    if (membershipRows.length === 0) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const membership = membershipRows[0];
    const membershipRole = membership.role as GraphRole;

    if (
      !canViewNode({
        meId: me.id,
        isAdmin: me.isAdmin,
        membershipRole,
        row: center,
      })
    ) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const familyGraphId = center.familyGraphId;

    const visited = new Set<string>();
    const frontier: string[] = [centerId];
    const kindById = new Map<string, DiscoverKind>();

    visited.add(centerId);
    kindById.set(centerId, "blood");

    for (let d = 0; d < depth; d++) {
      if (visited.size >= limit) break;

      const batch = frontier.splice(0, frontier.length);
      if (batch.length === 0) break;

      const bloodBatch = batch.filter((id) => kindById.get(id) !== "spouse");

      let parentRows: Record<string, unknown>[] = [];
      let childRows: Record<string, unknown>[] = [];

      if (bloodBatch.length > 0) {
        parentRows = await sql`
          SELECT "parentId" FROM "ParentChild" WHERE "childId" = ANY(${bloodBatch})
        `;

        childRows = await sql`
          SELECT "childId" FROM "ParentChild" WHERE "parentId" = ANY(${bloodBatch})
        `;
      }

      const spouseRowsA = await sql`
        SELECT "bId" FROM "Spouse" WHERE "aId" = ANY(${batch})
      `;

      const spouseRowsB = await sql`
        SELECT "aId" FROM "Spouse" WHERE "bId" = ANY(${batch})
      `;

      const bloodCandidateIds = dedupe([
        ...parentRows.map((r) => r.parentId as string),
        ...childRows.map((r) => r.childId as string),
      ]);

      const spouseCandidateIds = dedupe([
        ...spouseRowsA.map((r) => r.bId as string),
        ...spouseRowsB.map((r) => r.aId as string),
      ]);

      const candidateIds = dedupe([...bloodCandidateIds, ...spouseCandidateIds]).filter(
        (id) => !visited.has(id)
      );

      if (candidateIds.length === 0) continue;

      const remaining = Math.max(0, limit - visited.size);
      const cappedCandidateIds = candidateIds.slice(0, remaining);

      const candidateRows = await sql`
        SELECT id, "fullName", "isPrivate", "createdById", "createdAt", bio, location,
               "grewUpLocation", "birthDate", "deathDate", "photoUrl", occupation,
               "proudOf", interests, "claimedByUserId", "familyGraphId"
        FROM "Person"
        WHERE id = ANY(${cappedCandidateIds})
          AND "familyGraphId" = ${familyGraphId}
          AND "deletedAt" IS NULL
      ` as NodeRow[];

      for (const row of candidateRows) {
        if (visited.size >= limit) break;
        if (visited.has(row.id)) continue;

        const visible = canViewNode({
          meId: me.id,
          isAdmin: me.isAdmin,
          membershipRole,
          row,
        });

        if (!visible) continue;

        const discoveredViaBlood = bloodCandidateIds.includes(row.id);
        const prev = kindById.get(row.id);

        const discoveredAs: DiscoverKind =
          prev === "blood" || discoveredViaBlood ? "blood" : "spouse";

        visited.add(row.id);
        kindById.set(row.id, discoveredAs);
        frontier.push(row.id);
      }
    }

    const visitedArray = Array.from(visited);
    const nodesAll = await sql`
      SELECT id, "fullName", "isPrivate", "createdById", "createdAt", bio, location,
             "grewUpLocation", "birthDate", "deathDate", "photoUrl", occupation,
             "proudOf", interests, "claimedByUserId", "familyGraphId"
      FROM "Person"
      WHERE id = ANY(${visitedArray})
        AND "familyGraphId" = ${familyGraphId}
        AND "deletedAt" IS NULL
    ` as NodeRow[];

    const nodes = nodesAll.filter((row) =>
      canViewNode({
        meId: me.id,
        isAdmin: me.isAdmin,
        membershipRole,
        row,
      })
    );

    const visibleIds = nodes.map((n) => n.id);

    const parentChildEdges = await sql`
      SELECT "parentId", "childId"
      FROM "ParentChild"
      WHERE "parentId" = ANY(${visibleIds}) AND "childId" = ANY(${visibleIds})
    `;

    const spouseEdges = await sql`
      SELECT "aId", "bId"
      FROM "Spouse"
      WHERE "aId" = ANY(${visibleIds}) AND "bId" = ANY(${visibleIds})
    `;

    return NextResponse.json({
      centerId,
      depth,
      limit,
      nodes: nodes.map((n) => ({
        id: n.id,
        fullName: n.fullName,
        isPrivate: n.isPrivate,
        createdAt: n.createdAt,
        bio: n.bio,
        location: n.location,
        grewUpLocation: n.grewUpLocation,
        birthDate: n.birthDate,
        deathDate: n.deathDate,
        photoUrl: n.photoUrl,
        occupation: n.occupation,
        proudOf: n.proudOf,
        interests: n.interests,
        claimedByUserId: n.claimedByUserId,
      })),
      edges: {
        parentChild: parentChildEdges,
        spouse: spouseEdges,
      },
    });
  } catch (error) {
    console.error("GET /api/tree failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
