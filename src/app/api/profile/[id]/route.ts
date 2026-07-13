import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import { requireMe } from "@/lib/authz";
import { applyFieldVisibility, canEditPerson, canViewPerson } from "@/lib/personRules";
import { logPersonUpdate } from "@/lib/changeLog";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `profile_get:${clientKey(req)}`, limit: 120, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        parents: { include: { parent: true } },
        children: { include: { child: true } },
        spousesA: { include: { b: true } },
        spousesB: { include: { a: true } },
      },
    });

    if (!person || person.deletedAt) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    // Graph-scoping (trust-model invariant #3)
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

    if (!canViewPerson(me.id, me.isAdmin, membership.role, person)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const canSee = (row: { isPrivate: boolean; createdById: string; claimedByUserId: string | null }) =>
      canViewPerson(me.id, me.isAdmin, membership.role, row);

    const parentsList = person.parents.filter((r) => canSee(r.parent)).map((r) => ({
      id: r.parent.id,
      fullName: r.parent.fullName,
      isPrivate: r.parent.isPrivate,
      claimedByUserId: r.parent.claimedByUserId,
    }));

    const childrenList = person.children.filter((r) => canSee(r.child)).map((r) => ({
      id: r.child.id,
      fullName: r.child.fullName,
      isPrivate: r.child.isPrivate,
      claimedByUserId: r.child.claimedByUserId,
    }));

    const spousesList = [
      ...person.spousesA.filter((r) => canSee(r.b)).map((r) => ({
        id: r.b.id,
        fullName: r.b.fullName,
        isPrivate: r.b.isPrivate,
        claimedByUserId: r.b.claimedByUserId,
      })),
      ...person.spousesB.filter((r) => canSee(r.a)).map((r) => ({
        id: r.a.id,
        fullName: r.a.fullName,
        isPrivate: r.a.isPrivate,
        claimedByUserId: r.a.claimedByUserId,
      })),
    ];

    const parentIds = parentsList.map(p => p.id);
    const siblingRels = parentIds.length > 0 ? await prisma.parentChild.findMany({
      where: {
        parentId: { in: parentIds },
        childId: { not: id },
      },
      include: { child: true },
    }) : [];
    
    const siblingsMap = new Map();
    siblingRels.forEach(r => {
      if (!r.child.deletedAt && canSee(r.child)) {
        siblingsMap.set(r.child.id, {
          id: r.child.id,
          fullName: r.child.fullName,
          isPrivate: r.child.isPrivate,
          claimedByUserId: r.child.claimedByUserId,
        });
      }
    });
    const siblingsList = Array.from(siblingsMap.values());

    const visiblePerson = applyFieldVisibility(person as unknown as Record<string, unknown> & { claimedByUserId?: string | null }, me.id, me.isAdmin) as typeof person;

    return NextResponse.json({
      person: {
        id: person.id,
        fullName: person.fullName,
        birthDate: visiblePerson.birthDate,
        deathDate: person.deathDate,
        gender: person.gender,
        isPrivate: person.isPrivate,
        isVerified: person.isVerified,
        claimedByUserId: person.claimedByUserId,
        createdById: person.createdById,
      },
      parents: parentsList,
      children: childrenList,
      spouses: spousesList,
      siblings: siblingsList,
      canVouch: true,
    });
  } catch (error) {
    console.error("GET /api/profile/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `profile_patch:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;
    const parsed = await readJson(req, 20_000);
    if (!parsed.ok) return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });

    const body = parsed.json;

    const existing = await prisma.person.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_familyGraphId: {
          userId: me.id,
          familyGraphId: existing.familyGraphId,
        },
      },
      select: { role: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });
    }

    if (!canEditPerson(me.id, membership.role, existing)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.fullName !== undefined) updateData.fullName = body.fullName;
    if (body.gender !== undefined) updateData.gender = body.gender;
    if (body.birthDate !== undefined) updateData.birthDate = body.birthDate;
    if (body.deathDate !== undefined) updateData.deathDate = body.deathDate;
    if (body.isPrivate !== undefined) updateData.isPrivate = body.isPrivate;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.person.update({
        where: { id },
        data: updateData,
      });

      await logPersonUpdate(tx, {
        familyGraphId: existing.familyGraphId,
        actorUserId: me.id,
        personId: id,
        before: existing as unknown as Record<string, unknown>,
        patch: updateData,
      });

      return row;
    });

    return NextResponse.json({ person: updated });
  } catch (error) {
    console.error("PATCH /api/profile/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
