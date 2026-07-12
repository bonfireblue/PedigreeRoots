import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";
import { requireMe } from "@/lib/authz";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import {
  RelationshipError,
  assertCanEditRelationship,
  assertNoAncestorDescendantSpouse,
  assertNoDuplicateSpouse,
  assertNoParentChildConflictWithSpouse,
  assertNonEmptyIds,
  assertNotSelf,
  assertSameFamilyGraph,
  getExactSpouseOrThrow,
  getSpouseDeleteWarnings,
  getTwoPeopleForRelationship,
  normalizeSpousePair,
} from "@/lib/relationshipRules";

export async function POST(req: Request) {
  try {
    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const rl = rateLimit({
      key: `rel:spouse:${clientKey(req)}`,
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
    const aId = typeof body?.aId === "string" ? body.aId.trim() : "";
    const bId = typeof body?.bId === "string" ? body.bId.trim() : "";

    assertNonEmptyIds([aId, bId]);
    assertNotSelf(aId, bId);

    const { a, b } = await getTwoPeopleForRelationship(aId, bId);

    assertCanEditRelationship(me, a, b);
    assertSameFamilyGraph(a, b);

    await assertNoDuplicateSpouse(aId, bId);
    await assertNoParentChildConflictWithSpouse(aId, bId);
    await assertNoAncestorDescendantSpouse(aId, bId);

    const [xId, yId] = normalizeSpousePair(aId, bId);

    const relId = crypto.randomUUID();
    await sql`
      INSERT INTO "Spouse" (id, "aId", "bId", "createdAt")
      VALUES (${relId}, ${xId}, ${yId}, NOW())
    `;

    // Auto-link each spouse's children to the other spouse (married couples share children)
    // Get children of person A and link them to person B
    const childrenOfA = await sql`
      SELECT "childId" FROM "ParentChild" WHERE "parentId" = ${aId}
    `;
    for (const child of childrenOfA) {
      const existingB = await sql`
        SELECT id FROM "ParentChild" WHERE "parentId" = ${bId} AND "childId" = ${child.childId}
      `;
      if (existingB.length === 0) {
        const childRelId = crypto.randomUUID();
        await sql`
          INSERT INTO "ParentChild" (id, "parentId", "childId", "createdAt")
          VALUES (${childRelId}, ${bId}, ${child.childId}, NOW())
        `;
      }
    }

    // Get children of person B and link them to person A
    const childrenOfB = await sql`
      SELECT "childId" FROM "ParentChild" WHERE "parentId" = ${bId}
    `;
    for (const child of childrenOfB) {
      const existingA = await sql`
        SELECT id FROM "ParentChild" WHERE "parentId" = ${aId} AND "childId" = ${child.childId}
      `;
      if (existingA.length === 0) {
        const childRelId = crypto.randomUUID();
        await sql`
          INSERT INTO "ParentChild" (id, "parentId", "childId", "createdAt")
          VALUES (${childRelId}, ${aId}, ${child.childId}, NOW())
        `;
      }
    }

    const rows = await sql`
      SELECT id, "aId", "bId", "createdAt"
      FROM "Spouse"
      WHERE id = ${relId}
    `;

    return NextResponse.json({ relationship: rows[0] }, { status: 201 });
  } catch (error) {
    if (error instanceof RelationshipError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("POST /api/relationships/spouse failed", error);
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
      key: `rel:spouse:delete:${clientKey(req)}`,
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
    const aId = typeof body?.aId === "string" ? body.aId.trim() : "";
    const bId = typeof body?.bId === "string" ? body.bId.trim() : "";
    const dryRun = body?.dryRun === true;

    assertNonEmptyIds([aId, bId]);

    const { a, b } = await getTwoPeopleForRelationship(aId, bId);
    assertCanEditRelationship(me, a, b);
    assertSameFamilyGraph(a, b);

    const relationship = await getExactSpouseOrThrow(aId, bId);
    const warnings = await getSpouseDeleteWarnings(relationship.aId, relationship.bId);

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
      DELETE FROM "Spouse" WHERE "aId" = ${relationship.aId} AND "bId" = ${relationship.bId}
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

    console.error("DELETE /api/relationships/spouse failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
