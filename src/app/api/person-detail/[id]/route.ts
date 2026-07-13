// Person detail API - fresh route to bypass build cache
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import { requireMe } from "@/lib/authz";
import { canEditPerson } from "@/lib/personRules";
import { logPersonUpdate } from "@/lib/changeLog";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `pd_get:${clientKey(req)}`, limit: 120, windowMs: 60_000 });
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

    const parentsList = person.parents.map((r) => ({
      id: r.parent.id,
      fullName: r.parent.fullName,
      isPrivate: r.parent.isPrivate,
      claimedByUserId: r.parent.claimedByUserId,
    }));

    const childrenList = person.children.map((r) => ({
      id: r.child.id,
      fullName: r.child.fullName,
      isPrivate: r.child.isPrivate,
      claimedByUserId: r.child.claimedByUserId,
    }));

    const spousesList = [
      ...person.spousesA.map((r) => ({
        id: r.b.id,
        fullName: r.b.fullName,
        isPrivate: r.b.isPrivate,
        claimedByUserId: r.b.claimedByUserId,
      })),
      ...person.spousesB.map((r) => ({
        id: r.a.id,
        fullName: r.a.fullName,
        isPrivate: r.a.isPrivate,
        claimedByUserId: r.a.claimedByUserId,
      })),
    ];

    const parentIds = parentsList.map((p) => p.id);
    let siblingsList: { id: string; fullName: string; isPrivate: boolean; claimedByUserId: string | null }[] = [];
    if (parentIds.length > 0) {
      const siblings = await prisma.person.findMany({
        where: {
          id: { not: id },
          deletedAt: null,
          parents: { some: { parentId: { in: parentIds } } },
        },
        select: { id: true, fullName: true, isPrivate: true, claimedByUserId: true },
      });
      siblingsList = siblings;
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
    const canEdit = membership ? canEditPerson(me.id, membership.role, person) : false;

    return NextResponse.json({
      person: {
        id: person.id,
        fullName: person.fullName,
        gender: person.gender,
        birthDate: person.birthDate,
        deathDate: person.deathDate,
        isPrivate: person.isPrivate,
        isVerified: person.isVerified,
        claimedByUserId: person.claimedByUserId,
        createdById: person.createdById,
      },
      parents: parentsList,
      children: childrenList,
      spouses: spousesList,
      siblings: siblingsList,
      canEdit,
      canVouch: false,
    });
  } catch (error) {
    console.error("GET /api/person-detail/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `pd_patch:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;
    const parsed = await readJson(req, 20_000);
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
    if (body.gender !== undefined) updateData.gender = body.gender || null;
    if (body.birthDate !== undefined) updateData.birthDate = body.birthDate ? new Date(body.birthDate) : null;
    if (body.deathDate !== undefined) updateData.deathDate = body.deathDate ? new Date(body.deathDate) : null;
    if (body.isPrivate !== undefined) updateData.isPrivate = body.isPrivate;

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
    console.error("PATCH /api/person-detail/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
