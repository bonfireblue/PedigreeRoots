import { sql } from "@/lib/neon-db";
import type { Me } from "@/lib/authz";

export class RelationshipError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export type DeleteImpactWarning = {
  code:
    | "CHILD_WILL_HAVE_NO_PARENTS"
    | "CHILD_WILL_HAVE_ONE_PARENT"
    | "SPOUSE_PAIR_HAS_SHARED_CHILDREN";
  message: string;
};

export function normalizeSpousePair(aId: string, bId: string): [string, string] {
  return aId < bId ? [aId, bId] : [bId, aId];
}

export function assertNonEmptyIds(ids: Array<string | undefined | null>) {
  if (ids.some((v) => !v || !String(v).trim())) {
    throw new RelationshipError("VALIDATION_ERROR", 400);
  }
}

export function assertNotSelf(aId: string, bId: string, code = "INVALID_RELATION_SELF") {
  if (aId === bId) {
    throw new RelationshipError(code, 400);
  }
}

type PersonForRelationship = {
  id: string;
  fullName: string;
  createdById: string;
  familyGraphId: string | null;
};

export async function getTwoPeopleForRelationship(aId: string, bId: string): Promise<{ a: PersonForRelationship; b: PersonForRelationship }> {
  const rows = await sql`
    SELECT id, "fullName", "createdById", "familyGraphId"
    FROM "Person"
    WHERE id IN (${aId}, ${bId}) AND "deletedAt" IS NULL
  `;

  const a = rows.find((r) => r.id === aId) as PersonForRelationship | undefined;
  const b = rows.find((r) => r.id === bId) as PersonForRelationship | undefined;

  if (!a || !b) {
    throw new RelationshipError("NOT_FOUND", 404);
  }

  return { a, b };
}

// Open-editing model: any member of the graph both people belong to may
// create/remove links between them. Callers pass the actor's membership role
// in that graph (null/undefined = not a member). Relationship links never
// touch a claimed person's claimer-locked fields, so claiming does not
// restrict linking. Cross-graph safety is assertSameFamilyGraph's job.
export function assertCanEditRelationship(me: Me, membershipRole: string | null | undefined) {
  const canEdit = me.isAdmin || Boolean(membershipRole);

  if (!canEdit) {
    throw new RelationshipError("FORBIDDEN", 403);
  }
}

// Fetch the actor's membership role in a graph (null if not a member).
export async function getMembershipRole(userId: string, familyGraphId: string): Promise<string | null> {
  const rows = await sql`
    SELECT role FROM "Membership"
    WHERE "userId" = ${userId} AND "familyGraphId" = ${familyGraphId}
    LIMIT 1
  `;
  return rows.length > 0 ? String(rows[0].role) : null;
}

export function assertSameFamilyGraph(
  a: { familyGraphId: string | null },
  b: { familyGraphId: string | null }
) {
  if (!a.familyGraphId || !b.familyGraphId || a.familyGraphId !== b.familyGraphId) {
    throw new RelationshipError("CROSS_GRAPH_RELATIONSHIP_FORBIDDEN", 400);
  }
}

export async function assertNoDuplicateParentChild(parentId: string, childId: string) {
  const existing = await sql`
    SELECT id FROM "ParentChild" WHERE "parentId" = ${parentId} AND "childId" = ${childId}
  `;

  if (existing.length > 0) {
    throw new RelationshipError("RELATIONSHIP_ALREADY_EXISTS", 409);
  }
}

export async function assertNoDuplicateSpouse(aId: string, bId: string) {
  const [xId, yId] = normalizeSpousePair(aId, bId);

  const existing = await sql`
    SELECT id FROM "Spouse" WHERE "aId" = ${xId} AND "bId" = ${yId}
  `;

  if (existing.length > 0) {
    throw new RelationshipError("RELATIONSHIP_ALREADY_EXISTS", 409);
  }
}

export async function assertNoParentChildCycle(parentId: string, childId: string) {
  const rows = await sql`
    WITH RECURSIVE descendants AS (
      SELECT pc."childId" AS id
      FROM "ParentChild" pc
      WHERE pc."parentId" = ${childId}

      UNION

      SELECT pc2."childId" AS id
      FROM "ParentChild" pc2
      INNER JOIN descendants d ON d.id = pc2."parentId"
    )
    SELECT id
    FROM descendants
    WHERE id = ${parentId}
    LIMIT 1
  `;

  if (rows.length > 0) {
    throw new RelationshipError("ANCESTRY_CYCLE_FORBIDDEN", 400);
  }
}

export async function assertChildHasAtMostOneOtherParent(childId: string) {
  const countRows = await sql`
    SELECT COUNT(*)::int as count FROM "ParentChild" WHERE "childId" = ${childId}
  `;

  if (countRows[0].count >= 2) {
    throw new RelationshipError("CHILD_ALREADY_HAS_MAX_PARENTS", 400);
  }
}

export async function assertNoSpouseConflictWithParentChild(aId: string, bId: string) {
  const [xId, yId] = normalizeSpousePair(aId, bId);

  const existingSpouse = await sql`
    SELECT id FROM "Spouse" WHERE "aId" = ${xId} AND "bId" = ${yId}
  `;

  if (existingSpouse.length > 0) {
    throw new RelationshipError("PARENT_CHILD_SPOUSE_CONFLICT", 400);
  }
}

export async function assertNoParentChildConflictWithSpouse(aId: string, bId: string) {
  const existing = await sql`
    SELECT id FROM "ParentChild"
    WHERE ("parentId" = ${aId} AND "childId" = ${bId})
       OR ("parentId" = ${bId} AND "childId" = ${aId})
  `;

  if (existing.length > 0) {
    throw new RelationshipError("SPOUSE_PARENT_CHILD_CONFLICT", 400);
  }
}

export async function assertNoAncestorDescendantSpouse(aId: string, bId: string) {
  const rows = await sql`
    WITH RECURSIVE descendants AS (
      SELECT pc."childId" AS id
      FROM "ParentChild" pc
      WHERE pc."parentId" = ${aId}

      UNION

      SELECT pc2."childId" AS id
      FROM "ParentChild" pc2
      INNER JOIN descendants d ON d.id = pc2."parentId"
    )
    SELECT id
    FROM descendants
    WHERE id = ${bId}
    LIMIT 1
  `;

  if (rows.length > 0) {
    throw new RelationshipError("ANCESTOR_DESCENDANT_SPOUSE_FORBIDDEN", 400);
  }

  const reverseRows = await sql`
    WITH RECURSIVE descendants AS (
      SELECT pc."childId" AS id
      FROM "ParentChild" pc
      WHERE pc."parentId" = ${bId}

      UNION

      SELECT pc2."childId" AS id
      FROM "ParentChild" pc2
      INNER JOIN descendants d ON d.id = pc2."parentId"
    )
    SELECT id
    FROM descendants
    WHERE id = ${aId}
    LIMIT 1
  `;

  if (reverseRows.length > 0) {
    throw new RelationshipError("ANCESTOR_DESCENDANT_SPOUSE_FORBIDDEN", 400);
  }
}

export async function getExactParentChildOrThrow(parentId: string, childId: string) {
  const rows = await sql`
    SELECT id, "parentId", "childId", "createdAt"
    FROM "ParentChild"
    WHERE "parentId" = ${parentId} AND "childId" = ${childId}
  `;

  if (rows.length === 0) {
    throw new RelationshipError("RELATIONSHIP_NOT_FOUND", 404);
  }

  return rows[0];
}

export async function getExactSpouseOrThrow(aId: string, bId: string) {
  const [xId, yId] = normalizeSpousePair(aId, bId);

  const rows = await sql`
    SELECT id, "aId", "bId", "createdAt"
    FROM "Spouse"
    WHERE "aId" = ${xId} AND "bId" = ${yId}
  `;

  if (rows.length === 0) {
    throw new RelationshipError("RELATIONSHIP_NOT_FOUND", 404);
  }

  return rows[0];
}

export async function getParentChildDeleteWarnings(
  parentId: string,
  childId: string
): Promise<DeleteImpactWarning[]> {
  const warnings: DeleteImpactWarning[] = [];

  const countRows = await sql`
    SELECT COUNT(*)::int as count FROM "ParentChild" WHERE "childId" = ${childId}
  `;

  const parentCount = countRows[0].count;
  const remaining = Math.max(0, parentCount - 1);

  if (remaining === 0) {
    warnings.push({
      code: "CHILD_WILL_HAVE_NO_PARENTS",
      message: "Deleting this link will leave the child with 0 recorded parents.",
    });
  } else if (remaining === 1) {
    warnings.push({
      code: "CHILD_WILL_HAVE_ONE_PARENT",
      message: "Deleting this link will leave the child with only 1 recorded parent.",
    });
  }

  return warnings;
}

export async function getSpouseDeleteWarnings(
  aId: string,
  bId: string
): Promise<DeleteImpactWarning[]> {
  const warnings: DeleteImpactWarning[] = [];

  // Get children of aId
  const aChildren = await sql`
    SELECT "childId" FROM "ParentChild" WHERE "parentId" = ${aId}
  `;
  const aChildIds = aChildren.map((r) => r.childId as string);

  if (aChildIds.length > 0) {
    // Count how many are also parented by bId
    const sharedRows = await sql`
      SELECT COUNT(*)::int as count FROM "ParentChild"
      WHERE "parentId" = ${bId} AND "childId" = ANY(${aChildIds})
    `;
    const sharedChildrenCount = sharedRows[0].count;

    if (sharedChildrenCount > 0) {
      warnings.push({
        code: "SPOUSE_PAIR_HAS_SHARED_CHILDREN",
        message: `Deleting this spouse link will split a couple that currently shares ${sharedChildrenCount} child${sharedChildrenCount === 1 ? "" : "ren"} in the graph.`,
      });
    }
  }

  return warnings;
}
