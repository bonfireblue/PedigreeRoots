import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { requireMe } from "@/lib/authz";
import {
  PersonError,
  assertBirthBeforeDeath,
  canEditPerson,
  normalizeBio,
  normalizeFirstName,
  normalizeFullName,
  normalizeGender,
  normalizeGrewUpLocation,
  normalizeInterests,
  normalizeLastName,
  normalizeOccupation,
  normalizeOptionalDate,
  normalizePhotoUrl,
  normalizeProudOf,
} from "@/lib/personRules";
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

    // Same validation as /api/people/[id] PATCH, keeping this route's field
    // mapping (story -> bio) intact
    const updateData: Record<string, unknown> = {};
    try {
      const vFirstName = normalizeFirstName(firstName);
      const vLastName = normalizeLastName(lastName);
      const vFullName = normalizeFullName(fullName);
      const vGender = normalizeGender(gender);
      const vBirthDate = normalizeOptionalDate(birthDate, "INVALID_BIRTH_DATE");
      const vDeathDate = normalizeOptionalDate(deathDate, "INVALID_DEATH_DATE");
      const vGrewUp = normalizeGrewUpLocation(grewUpLocation);
      const vOccupation = normalizeOccupation(occupation);
      const vProudOf = normalizeProudOf(proudOf);
      const vStory = normalizeBio(story);
      const vInterests = normalizeInterests(interests);
      const vPhotoUrl = normalizePhotoUrl(photoUrl);

      assertBirthBeforeDeath(vBirthDate ?? undefined, vDeathDate ?? undefined);

      if (vFirstName !== undefined) updateData.firstName = vFirstName;
      if (vLastName !== undefined) updateData.lastName = vLastName;
      if (vFullName !== undefined) updateData.fullName = vFullName;
      if (vGender !== undefined) updateData.gender = vGender;
      if (vBirthDate !== undefined) updateData.birthDate = vBirthDate;
      if (vDeathDate !== undefined) updateData.deathDate = vDeathDate;
      if (vGrewUp !== undefined) updateData.grewUpLocation = vGrewUp;
      if (vOccupation !== undefined) updateData.occupation = vOccupation;
      if (vProudOf !== undefined) updateData.proudOf = vProudOf;
      if (vStory !== undefined) updateData.bio = vStory; // schema uses 'bio'
      if (vInterests !== undefined) updateData.interests = vInterests;
      if (vPhotoUrl !== undefined) updateData.photoUrl = vPhotoUrl;
    } catch (e) {
      if (e instanceof PersonError) {
        return NextResponse.json({ error: e.code }, { status: e.status });
      }
      throw e;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "NO_VALID_FIELDS" }, { status: 400 });
    }

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
