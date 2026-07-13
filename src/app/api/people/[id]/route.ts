import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import { requireMe } from "@/lib/authz";
import {
  PersonError,
  applyFieldVisibility,
  buildPersonPatch,
  canDeletePerson,
  canEditPerson,
  canViewPerson,
  normalizeFieldVisibility,
} from "@/lib/personRules";
import { logChanges, logPersonUpdate } from "@/lib/changeLog";

type Ctx = {
  params: Promise<{ id: string }>;
};

type PersonRow = {
  id: string;
  fullName: string;
  gender: string | null;
  createdAt: Date;
  isPrivate: boolean;
  isVerified: boolean;
  bio: string | null;
  location: string | null;
  birthDate: Date | null;
  deathDate: Date | null;
  photoUrl: string | null;
  createdById: string;
  claimedByUserId: string | null;
  familyGraphId: string;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  purgeAfter: Date | null;
};

type ParentRelRow = { parent: PersonRow };
type ChildRelRow = { child: PersonRow };
type SpouseARow = { b: PersonRow };
type SpouseBRow = { a: PersonRow };

function slim(p: PersonRow) {
  return {
    id: p.id,
    fullName: p.fullName,
    createdAt: p.createdAt.toISOString(),
    isPrivate: p.isPrivate,
    claimedByUserId: p.claimedByUserId,
  };
}

async function getMembershipOr403(userId: string, familyGraphId: string) {
  return prisma.membership.findUnique({
    where: {
      userId_familyGraphId: {
        userId,
        familyGraphId,
      },
    },
    select: { role: true },
  });
}

export async function GET(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_id:${clientKey(req)}`, limit: 120, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  const me = await requireMe();
  if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;

  const found = await prisma.person.findUnique({
    where: { id },
    include: {
      parents: {
        include: {
          parent: true,
        },
      },
      children: {
        include: {
          child: true,
        },
      },
      spousesA: {
        include: {
          b: true,
        },
      },
      spousesB: {
        include: {
          a: true,
        },
      },
    },
  });

  if (!found || found.deletedAt) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const person = found as unknown as PersonRow & {
    parents: ParentRelRow[];
    children: ChildRelRow[];
    spousesA: SpouseARow[];
    spousesB: SpouseBRow[];
  };

  const membership = await getMembershipOr403(me.id, person.familyGraphId);
  if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });

  if (!canViewPerson(me.id, me.isAdmin, membership.role, person)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parents = person.parents
    .filter((row) => !row.parent.deletedAt)
    .filter((row) => canViewPerson(me.id, me.isAdmin, membership.role, row.parent))
    .map((row) => ({ ...slim(row.parent), relationshipType: (row as any).type ?? null }));

  const children = person.children
    .filter((row) => !row.child.deletedAt)
    .filter((row) => canViewPerson(me.id, me.isAdmin, membership.role, row.child))
    .map((row) => ({ ...slim(row.child), relationshipType: (row as any).type ?? null }));

  const spouses = [
    ...person.spousesA.map((row) => ({ p: row.b, rel: row as any })),
    ...person.spousesB.map((row) => ({ p: row.a, rel: row as any })),
  ]
    .filter(({ p }) => !p.deletedAt)
    .filter(({ p }) => canViewPerson(me.id, me.isAdmin, membership.role, p))
    .map(({ p, rel }) => ({
      ...slim(p),
      relationshipStatus: rel.status ?? null,
      relationshipStartDate: rel.startDate ?? null,
      relationshipEndDate: rel.endDate ?? null,
    }));

  // Get siblings (people who share at least one parent)
  const parentIds = person.parents.map((row) => row.parent.id);
  let siblings: ReturnType<typeof slim>[] = [];
  if (parentIds.length > 0) {
    const siblingRows = await prisma.parentChild.findMany({
      where: {
        parentId: { in: parentIds },
        childId: { not: person.id },
      },
      include: { child: true },
    });
    const seen = new Set<string>();
    siblings = siblingRows
      .map((row) => row.child as unknown as PersonRow)
      .filter((p) => !p.deletedAt)
      .filter((p) => canViewPerson(me.id, me.isAdmin, membership.role, p))
      .filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .map(slim);
  }

  // Per-field privacy (Phase 3d): hide claimer-marked private fields from
  // everyone but the claimer and admins
  const visiblePerson = applyFieldVisibility(
    person as unknown as Record<string, unknown> & { claimedByUserId?: string | null },
    me.id,
    me.isAdmin
  ) as unknown as typeof person;

  return NextResponse.json({
    person: {
      id: person.id,
      fullName: person.fullName,
      firstName: (person as any).firstName ?? null,
      lastName: (person as any).lastName ?? null,
      gender: (person as PersonRow).gender,
      bio: person.bio,
      location: visiblePerson.location,
      birthDate: visiblePerson.birthDate ? visiblePerson.birthDate.toISOString() : null,
      deathDate: person.deathDate ? person.deathDate.toISOString() : null,
      grewUpLocation: (visiblePerson as any).grewUpLocation ?? null,
      currentLocation: (visiblePerson as any).currentLocation ?? null,
      occupation: (person as any).occupation ?? null,
      proudOf: (person as any).proudOf ?? null,
      story: (person as any).story ?? null,
      interests: (person as any).interests ?? null,
      photoUrl: person.photoUrl,
      isPrivate: person.isPrivate,
      isVerified: (person as PersonRow).isVerified,
      createdAt: person.createdAt.toISOString(),
      claimedByUserId: person.claimedByUserId,
      // Claimer sees (and can edit) their privacy settings; others don't
      fieldVisibility: person.claimedByUserId === me.id ? (person as any).fieldVisibility ?? null : null,
      deletedAt: person.deletedAt ? person.deletedAt.toISOString() : null,
      purgeAfter: person.purgeAfter ? person.purgeAfter.toISOString() : null,
    },
    parents,
    children,
    spouses,
    siblings,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_patch:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const existing = await prisma.person.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const membership = await getMembershipOr403(me.id, existing.familyGraphId);
    if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });

    if (!canEditPerson(me.id, membership.role, existing)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // Per-field privacy (Phase 3d): only the claimer may change visibility
    const fieldVisibility = normalizeFieldVisibility(parsed.json?.fieldVisibility);
    if (fieldVisibility !== undefined && existing.claimedByUserId !== me.id) {
      return NextResponse.json({ error: "FIELD_VISIBILITY_CLAIMER_ONLY" }, { status: 403 });
    }

    let data: Record<string, unknown>;
    try {
      data = buildPersonPatch(parsed.json);
    } catch (e) {
      // A visibility-only PATCH has no profile fields — that's fine
      if (e instanceof PersonError && e.code === "NO_VALID_FIELDS" && fieldVisibility !== undefined) {
        data = {};
      } else {
        throw e;
      }
    }
    if (fieldVisibility !== undefined) {
      data.fieldVisibility = fieldVisibility;
    }

    // Scribe attribution (Phase 3a) — unclaimed profiles only, source must be
    // a live person in the same graph
    let scribeSourceId: string | null = null;
    const rawToldBy = parsed.json?.toldByPersonId;
    if (typeof rawToldBy === "string" && rawToldBy.trim() && !existing.claimedByUserId) {
      const source = await prisma.person.findFirst({
        where: { id: rawToldBy.trim(), familyGraphId: existing.familyGraphId, deletedAt: null },
        select: { id: true },
      });
      if (source) scribeSourceId = source.id;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.person.update({
        where: { id },
        data,
      });

      await logPersonUpdate(tx, {
        familyGraphId: existing.familyGraphId,
        actorUserId: me.id,
        personId: id,
        before: existing as unknown as Record<string, unknown>,
        patch: data,
        toldByPersonId: scribeSourceId,
      });

      return row;
    });

    return NextResponse.json({
      person: {
        id: updated.id,
        fullName: updated.fullName,
        gender: updated.gender,
        bio: updated.bio,
        location: updated.location,
        birthDate: updated.birthDate ? updated.birthDate.toISOString() : null,
        deathDate: updated.deathDate ? updated.deathDate.toISOString() : null,
        photoUrl: updated.photoUrl,
        isPrivate: updated.isPrivate,
        isVerified: updated.isVerified,
        createdAt: updated.createdAt.toISOString(),
        claimedByUserId: updated.claimedByUserId,
        deletedAt: updated.deletedAt ? updated.deletedAt.toISOString() : null,
        purgeAfter: updated.purgeAfter ? updated.purgeAfter.toISOString() : null,
      },
    });
  } catch (error) {
    if (error instanceof PersonError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("PATCH /api/people/[id] failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `people_delete:${clientKey(req)}`, limit: 30, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    const existing = await prisma.person.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        createdById: true,
        claimedByUserId: true,
        familyGraphId: true,
        deletedAt: true,
      },
    });

    if (!existing || existing.deletedAt) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const membership = await getMembershipOr403(me.id, existing.familyGraphId);
    if (!membership && !me.isAdmin) {
      return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });
    }

    // Cannot delete a claimed person (someone who has accepted their profile)
    if (existing.claimedByUserId) {
      return NextResponse.json({ error: "CANNOT_DELETE_CLAIMED_PERSON" }, { status: 403 });
    }

    // Any member of the graph may soft-delete an unclaimed person
    if (!me.isAdmin && !canDeletePerson(me.id, membership?.role ?? "", existing)) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // Soft delete: set deletedAt and deletedByUserId
    await prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          deletedByUserId: me.id,
          purgeAfter: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        },
      });

      await logChanges(tx, [
        {
          familyGraphId: existing.familyGraphId,
          actorUserId: me.id,
          targetPersonId: id,
          targetType: "PERSON",
          targetId: id,
          action: "DELETE",
          field: null,
          oldValue: existing.fullName,
          newValue: null,
        },
      ]);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/people/[id] failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
