// Member info API - Uses raw SQL queries
import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import { requireMe } from "@/lib/authz";
import { applyFieldVisibility, canEditPerson, canViewPerson } from "@/lib/personRules";
import { logPersonUpdate } from "@/lib/changeLog";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `mi_get:${clientKey(req)}`, limit: 120, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    const personRows = await sql`
      SELECT id, "fullName", gender, "birthDate", "deathDate", "isPrivate",
             "isVerified", "claimedByUserId", "createdById", "photoUrl", "familyGraphId", "fieldVisibility"
      FROM "Person"
      WHERE id = ${id} AND "deletedAt" IS NULL
    `;

    if (personRows.length === 0) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const person = personRows[0];

    // Graph-scoping (trust-model invariant #3)
    const membership = await prisma.membership.findUnique({
      where: { userId_familyGraphId: { userId: me.id, familyGraphId: person.familyGraphId } },
      select: { role: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });
    }

    if (
      !canViewPerson(me.id, me.isAdmin, membership.role, {
        isPrivate: Boolean(person.isPrivate),
        createdById: person.createdById,
        claimedByUserId: person.claimedByUserId,
      })
    ) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const canEdit = canEditPerson(me.id, membership.role, {
      createdById: person.createdById,
      claimedByUserId: person.claimedByUserId,
    });

    const canSee = (row: { isPrivate: boolean; createdById: string; claimedByUserId: string | null }) =>
      canViewPerson(me.id, me.isAdmin, membership.role, row);
    const slimRelative = ({ createdById: _omit, ...rest }: Record<string, unknown>) => rest;

    const parentRows = (await sql`
      SELECT p.id, p."fullName", p."isPrivate", p."claimedByUserId", p."createdById"
      FROM "Person" p
      JOIN "ParentChild" pc ON pc."parentId" = p.id
      WHERE pc."childId" = ${id} AND p."deletedAt" IS NULL
    `).filter(canSee).map(slimRelative);

    const childrenRows = (await sql`
      SELECT p.id, p."fullName", p."isPrivate", p."claimedByUserId", p."createdById"
      FROM "Person" p
      JOIN "ParentChild" pc ON pc."childId" = p.id
      WHERE pc."parentId" = ${id} AND p."deletedAt" IS NULL
    `).filter(canSee).map(slimRelative);

    const spouseRows = (await sql`
      SELECT p.id, p."fullName", p."isPrivate", p."claimedByUserId", p."createdById"
      FROM "Person" p
      WHERE p."deletedAt" IS NULL AND (
        p.id IN (SELECT "bId" FROM "Spouse" WHERE "aId" = ${id})
        OR p.id IN (SELECT "aId" FROM "Spouse" WHERE "bId" = ${id})
      )
    `).filter(canSee).map(slimRelative);

    const siblingRows = (await sql`
      SELECT DISTINCT p.id, p."fullName", p."isPrivate", p."claimedByUserId", p."createdById"
      FROM "Person" p
      JOIN "ParentChild" pc ON pc."childId" = p.id
      WHERE pc."parentId" IN (
        SELECT "parentId" FROM "ParentChild" WHERE "childId" = ${id}
      )
      AND p.id != ${id}
      AND p."deletedAt" IS NULL
    `).filter(canSee).map(slimRelative);

    const visiblePerson = applyFieldVisibility(person as Record<string, unknown> & { claimedByUserId?: string | null }, me.id, me.isAdmin) as typeof person;

    return NextResponse.json({
      person: {
        id: person.id,
        fullName: person.fullName,
        gender: person.gender,
        birthDate: visiblePerson.birthDate,
        deathDate: person.deathDate,
        isPrivate: person.isPrivate,
        isVerified: person.isVerified,
        claimedByUserId: person.claimedByUserId,
        photoUrl: person.photoUrl,
      },
      parents: parentRows,
      children: childrenRows,
      spouses: spouseRows,
      siblings: siblingRows,
      canEdit,
      canVouch: person.claimedByUserId && person.claimedByUserId !== me.id && !person.isVerified,
    });
  } catch (error) {
    console.error("GET /api/member-info/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `mi_patch:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;
    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });

    const body = parsed.json;

    const person = await prisma.person.findUnique({ where: { id } });
    if (!person || person.deletedAt) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_familyGraphId: {
          userId: me.id,
          familyGraphId: person.familyGraphId,
        },
      },
      select: { role: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });
    }

    if (!canEditPerson(me.id, membership.role, person)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.fullName !== undefined) updateData.fullName = body.fullName;
    if (body.gender !== undefined) updateData.gender = body.gender ?? null;
    if (body.birthDate !== undefined) updateData.birthDate = body.birthDate ? new Date(body.birthDate) : null;
    if (body.deathDate !== undefined) updateData.deathDate = body.deathDate ? new Date(body.deathDate) : null;
    if (body.isPrivate !== undefined) updateData.isPrivate = body.isPrivate ?? false;
    if (body.photoUrl !== undefined) updateData.photoUrl = body.photoUrl ?? null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "NO_UPDATES" }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.person.update({
        where: { id },
        data: updateData,
      });

      await logPersonUpdate(tx, {
        familyGraphId: person.familyGraphId,
        actorUserId: me.id,
        personId: id,
        before: person as unknown as Record<string, unknown>,
        patch: updateData,
      });

      return row;
    });

    return NextResponse.json({ person: updated });
  } catch (error) {
    console.error("PATCH /api/member-info/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
