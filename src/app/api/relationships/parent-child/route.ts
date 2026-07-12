import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";
import { requireMe } from "@/lib/authz";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import {
  RelationshipError,
  assertCanEditRelationship,
  assertChildHasAtMostOneOtherParent,
  assertNoDuplicateParentChild,
  assertNoParentChildCycle,
  assertNoSpouseConflictWithParentChild,
  assertNonEmptyIds,
  assertNotSelf,
  assertSameFamilyGraph,
  getExactParentChildOrThrow,
  getParentChildDeleteWarnings,
  getTwoPeopleForRelationship,
} from "@/lib/relationshipRules";

export async function POST(req: Request) {
  try {
    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const rl = rateLimit({
      key: `rel:parent-child:${clientKey(req)}`,
      limit: 60,
      windowMs: 60_000,
    });

    if (!rl.ok) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    }

    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const body = parsed.json;
    const parentId = typeof body?.parentId === "string" ? body.parentId.trim() : "";
    const childId = typeof body?.childId === "string" ? body.childId.trim() : "";

    assertNonEmptyIds([parentId, childId]);
    assertNotSelf(parentId, childId);

    const { a: parent, b: child } = await getTwoPeopleForRelationship(parentId, childId);

    assertCanEditRelationship(me, parent, child);
    assertSameFamilyGraph(parent, child);

    await assertNoDuplicateParentChild(parentId, childId);
    await assertChildHasAtMostOneOtherParent(childId);
    await assertNoSpouseConflictWithParentChild(parentId, childId);
    await assertNoParentChildCycle(parentId, childId);

    const relId = crypto.randomUUID();
    await sql`
      INSERT INTO "ParentChild" (id, "parentId", "childId", "createdAt")
      VALUES (${relId}, ${parentId}, ${childId}, NOW())
    `;

    // Auto-link the child to all the parent's spouses (married couples share children)
    const spouseRows = await sql`
      SELECT "aId" as "spouseId" FROM "Spouse" WHERE "bId" = ${parentId}
      UNION
      SELECT "bId" as "spouseId" FROM "Spouse" WHERE "aId" = ${parentId}
    `;
    
    for (const spouse of spouseRows) {
      // Check if relationship already exists
      const existing = await sql`
        SELECT id FROM "ParentChild" 
        WHERE "parentId" = ${spouse.spouseId} AND "childId" = ${childId}
      `;
      if (existing.length === 0) {
        const spouseRelId = crypto.randomUUID();
        await sql`
          INSERT INTO "ParentChild" (id, "parentId", "childId", "createdAt")
          VALUES (${spouseRelId}, ${spouse.spouseId}, ${childId}, NOW())
        `;
      }
    }

    const rows = await sql`
      SELECT id, "parentId", "childId", "createdAt"
      FROM "ParentChild"
      WHERE id = ${relId}
    `;

    return NextResponse.json({ relationship: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof RelationshipError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("POST /api/relationships/parent-child failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const rl = rateLimit({
      key: `rel:parent-child:delete:${clientKey(req)}`,
      limit: 60,
      windowMs: 60_000,
    });

    if (!rl.ok) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    }

    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const body = parsed.json;
    const parentId = typeof body?.parentId === "string" ? body.parentId.trim() : "";
    const childId = typeof body?.childId === "string" ? body.childId.trim() : "";
    const dryRun = body?.dryRun === true;

    assertNonEmptyIds([parentId, childId]);

    const { a: parent, b: child } = await getTwoPeopleForRelationship(parentId, childId);
    assertCanEditRelationship(me, parent, child);
    assertSameFamilyGraph(parent, child);

    const relationship = await getExactParentChildOrThrow(parentId, childId);
    const warnings = await getParentChildDeleteWarnings(parentId, childId);

    if (dryRun) {
      return NextResponse.json(
        {
          dryRun: true,
          relationship,
          warnings,
        },
        { status: 200 }
      );
    }

    await sql`
      DELETE FROM "ParentChild" WHERE "parentId" = ${parentId} AND "childId" = ${childId}
    `;

    return NextResponse.json(
      {
        deleted: true,
        relationship,
        warnings,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof RelationshipError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("DELETE /api/relationships/parent-child failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
