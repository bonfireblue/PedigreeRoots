import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { requireMe } from "@/lib/authz";
import { canEditPerson } from "@/lib/personRules";
import { logPersonUpdate } from "@/lib/changeLog";

export async function POST(request: Request) {
  const lim = rateLimit({ key: `save_profile:${clientKey(request)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { personId, firstName, lastName, fullName, gender, birthDate, deathDate, grewUpLocation, occupation, proudOf, story, interests, photoUrl, toldByPersonId } = await request.json();

    if (!personId) {
      return NextResponse.json({ error: "Missing personId" }, { status: 400 });
    }

    const existing = await prisma.person.findUnique({ where: { id: personId } });
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

    // Scribe attribution (Phase 3a): "told by Rose, recorded by <actor>".
    // Only meaningful on unclaimed profiles, and the source person must be a
    // real node in the same graph.
    let scribeSourceId: string | null = null;
    if (typeof toldByPersonId === "string" && toldByPersonId.trim() && !existing.claimedByUserId) {
      const source = await prisma.person.findFirst({
        where: { id: toldByPersonId.trim(), familyGraphId: existing.familyGraphId, deletedAt: null },
        select: { id: true },
      });
      if (source) scribeSourceId = source.id;
    }

    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (fullName !== undefined) updateData.fullName = fullName;
    if (gender !== undefined) updateData.gender = gender;
    if (birthDate !== undefined) updateData.birthDate = birthDate ? new Date(birthDate) : null;
    if (deathDate !== undefined) updateData.deathDate = deathDate ? new Date(deathDate) : null;
    if (grewUpLocation !== undefined) updateData.grewUpLocation = grewUpLocation;
    if (occupation !== undefined) updateData.occupation = occupation;
    if (proudOf !== undefined) updateData.proudOf = proudOf;
    if (story !== undefined) updateData.bio = story; // schema uses 'bio'
    if (interests !== undefined) updateData.interests = interests;
    if (photoUrl !== undefined) updateData.photoUrl = photoUrl;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.person.update({
        where: { id: personId },
        data: updateData,
        select: {
          id: true,
          fullName: true,
          gender: true,
          birthDate: true,
        },
      });

      await logPersonUpdate(tx, {
        familyGraphId: existing.familyGraphId,
        actorUserId: me.id,
        personId,
        before: existing as unknown as Record<string, unknown>,
        patch: updateData,
        toldByPersonId: scribeSourceId,
      });

      return row;
    });

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("Save profile error:", error);
    return NextResponse.json({ error: "Failed to save: " + (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
