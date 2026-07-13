import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";
import { prisma } from "@/lib/db";
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
  getMembershipRole,
  getParentChildDeleteWarnings,
  getTwoPeopleForRelationship,
} from "@/lib/relationshipRules";
import { logChanges, type ChangeLogEntry } from "@/lib/changeLog";

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

    assertSameFamilyGraph(parent, child);
    const membershipRole = await getMembershipRole(me.id, parent.familyGraphId!);
    assertCanEditRelationship(me, membershipRole);

    await assertNoDuplicateParentChild(parentId, childId);
    await assertChildHasAtMostOneOtherParent(childId);
    await assertNoSpouseConflictWithParentChild(parentId, childId);
    await assertNoParentChildCycle(parentId, childId);

    // Auto-link the child to all the parent's spouses (married couples share children)
    const spouseRows = await sql`
      SELECT p.id as "spouseId", p."fullName" as "spouseName"
      FROM "Person" p
      WHERE p."deletedAt" IS NULL AND p.id IN (
        SELECT "aId" FROM "Spouse" WHERE "bId" = ${parentId}
        UNION
        SELECT "bId" FROM "Spouse" WHERE "aId" = ${parentId}
      )
    `;

    const relationship = await prisma.$transaction(async (tx) => {
      const rel = await tx.parentChild.create({
        data: { parentId, childId },
      });

      const entries: ChangeLogEntry[] = [
        {
          familyGraphId: parent.familyGraphId!,
          actorUserId: me.id,
          targetPersonId: childId,
          targetType: "PARENT_CHILD",
          targetId: rel.id,
          action: "CREATE",
          field: "parent",
          newValue: parent.fullName,
        },
      ];

      for (const spouse of spouseRows) {
        const existing = await tx.parentChild.findUnique({
          where: { parentId_childId: { parentId: spouse.spouseId, childId } },
        });
        if (!existing) {
          const spouseRel = await tx.parentChild.create({
            data: { parentId: spouse.spouseId, childId },
          });
          entries.push({
            familyGraphId: parent.familyGraphId!,
            actorUserId: me.id,
            targetPersonId: childId,
            targetType: "PARENT_CHILD",
            targetId: spouseRel.id,
            action: "CREATE",
            field: "parent",
            newValue: String(spouse.spouseName),
          });
        }
      }

      await logChanges(tx, entries);
      return rel;
    });

    return NextResponse.json({ relationship }, { status: 201 });
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
    assertSameFamilyGraph(parent, child);
    const membershipRole = await getMembershipRole(me.id, parent.familyGraphId!);
    assertCanEditRelationship(me, membershipRole);

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

    await prisma.$transaction(async (tx) => {
      await tx.parentChild.delete({
        where: { parentId_childId: { parentId, childId } },
      });

      await logChanges(tx, [
        {
          familyGraphId: parent.familyGraphId!,
          actorUserId: me.id,
          targetPersonId: childId,
          targetType: "PARENT_CHILD",
          targetId: String(relationship.id),
          action: "DELETE",
          field: "parent",
          oldValue: parent.fullName,
        },
      ]);
    });

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
