import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";
import { prisma } from "@/lib/db";
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
  getMembershipRole,
  getSpouseDeleteWarnings,
  getTwoPeopleForRelationship,
  normalizeRelationshipDate,
  normalizeSpousePair,
  normalizeSpouseStatus,
} from "@/lib/relationshipRules";
import { logChanges, type ChangeLogEntry } from "@/lib/changeLog";

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
    const status = normalizeSpouseStatus(body?.status) ?? null;
    const startDate = normalizeRelationshipDate(body?.startDate) ?? null;
    const endDate = normalizeRelationshipDate(body?.endDate) ?? null;

    assertNonEmptyIds([aId, bId]);
    assertNotSelf(aId, bId);

    const { a, b } = await getTwoPeopleForRelationship(aId, bId);

    assertSameFamilyGraph(a, b);
    const membershipRole = await getMembershipRole(me.id, a.familyGraphId!);
    assertCanEditRelationship(me, membershipRole);

    await assertNoDuplicateSpouse(aId, bId);
    await assertNoParentChildConflictWithSpouse(aId, bId);
    await assertNoAncestorDescendantSpouse(aId, bId);

    const [xId, yId] = normalizeSpousePair(aId, bId);

    const relationship = await prisma.$transaction(async (tx) => {
      const rel = await tx.spouse.create({
        data: { aId: xId, bId: yId, status, startDate, endDate },
      });

      const entries: ChangeLogEntry[] = [
        {
          familyGraphId: a.familyGraphId!,
          actorUserId: me.id,
          targetPersonId: aId,
          targetType: "SPOUSE",
          targetId: rel.id,
          action: "CREATE",
          field: "spouse",
          newValue: b.fullName,
        },
      ];

      // Auto-link each spouse's children to the other spouse (married couples share children)
      const linkChildren = async (fromId: string, toId: string, toName: string) => {
        const children = await tx.parentChild.findMany({
          where: { parentId: fromId },
          select: { childId: true },
        });
        for (const child of children) {
          const existing = await tx.parentChild.findUnique({
            where: { parentId_childId: { parentId: toId, childId: child.childId } },
          });
          if (!existing) {
            const childRel = await tx.parentChild.create({
              data: { parentId: toId, childId: child.childId },
            });
            entries.push({
              familyGraphId: a.familyGraphId!,
              actorUserId: me.id,
              targetPersonId: child.childId,
              targetType: "PARENT_CHILD",
              targetId: childRel.id,
              action: "CREATE",
              field: "parent",
              newValue: toName,
            });
          }
        }
      };

      await linkChildren(aId, bId, b.fullName);
      await linkChildren(bId, aId, a.fullName);

      await logChanges(tx, entries);
      return rel;
    });

    return NextResponse.json({ relationship }, { status: 201 });
  } catch (error) {
    if (error instanceof RelationshipError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("POST /api/relationships/spouse failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

// Set/clear status and dates on an existing spouse link (Phase 3c)
export async function PATCH(req: Request) {
  try {
    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const rl = rateLimit({
      key: `rel:spouse:patch:${clientKey(req)}`,
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
    const status = normalizeSpouseStatus(body?.status);
    const startDate = normalizeRelationshipDate(body?.startDate);
    const endDate = normalizeRelationshipDate(body?.endDate);

    assertNonEmptyIds([aId, bId]);
    if (status === undefined && startDate === undefined && endDate === undefined) {
      return NextResponse.json({ error: "NO_UPDATES" }, { status: 400 });
    }

    const { a, b } = await getTwoPeopleForRelationship(aId, bId);
    assertSameFamilyGraph(a, b);
    const membershipRole = await getMembershipRole(me.id, a.familyGraphId!);
    assertCanEditRelationship(me, membershipRole);

    const relationship = await getExactSpouseOrThrow(aId, bId);

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (startDate !== undefined) data.startDate = startDate;
    if (endDate !== undefined) data.endDate = endDate;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.spouse.update({
        where: { aId_bId: { aId: relationship.aId, bId: relationship.bId } },
        data,
      });

      await logChanges(tx, [
        {
          familyGraphId: a.familyGraphId!,
          actorUserId: me.id,
          targetPersonId: aId,
          targetType: "SPOUSE",
          targetId: String(relationship.id),
          action: "UPDATE",
          field: "status",
          oldValue: (relationship as { status?: string | null }).status ?? null,
          newValue: status !== undefined ? status : (relationship as { status?: string | null }).status ?? null,
        },
      ]);

      return row;
    });

    return NextResponse.json({ relationship: updated });
  } catch (error) {
    if (error instanceof RelationshipError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("PATCH /api/relationships/spouse failed", error);
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
    assertSameFamilyGraph(a, b);
    const membershipRole = await getMembershipRole(me.id, a.familyGraphId!);
    assertCanEditRelationship(me, membershipRole);

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

    await prisma.$transaction(async (tx) => {
      await tx.spouse.delete({
        where: { aId_bId: { aId: relationship.aId, bId: relationship.bId } },
      });

      await logChanges(tx, [
        {
          familyGraphId: a.familyGraphId!,
          actorUserId: me.id,
          targetPersonId: String(relationship.aId),
          targetType: "SPOUSE",
          targetId: String(relationship.id),
          action: "DELETE",
          field: "spouse",
          oldValue: relationship.aId === aId ? b.fullName : a.fullName,
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

    console.error("DELETE /api/relationships/spouse failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
