import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { requireMe } from "@/lib/authz";

// Duplicate warning support (Phase 3b): case-insensitive exact name match
// within the caller's graph. Non-blocking by design — the client shows
// "Use existing / Create anyway"; creation is never prevented here.
export async function GET(req: Request) {
  const lim = rateLimit({ key: `people_dupes:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const url = new URL(req.url);
    const name = url.searchParams.get("name")?.trim();
    if (!name) return NextResponse.json({ matches: [] });

    const membership = await prisma.membership.findFirst({
      where: { userId: me.id },
      orderBy: { createdAt: "asc" },
      select: { familyGraphId: true },
    });
    if (!membership) return NextResponse.json({ matches: [] });

    const matches = await prisma.person.findMany({
      where: {
        familyGraphId: membership.familyGraphId,
        deletedAt: null,
        fullName: { equals: name, mode: "insensitive" },
      },
      select: {
        id: true,
        fullName: true,
        photoUrl: true,
        birthDate: true,
        claimedByUserId: true,
      },
      take: 5,
    });

    return NextResponse.json({
      matches: matches.map((m) => ({
        id: m.id,
        fullName: m.fullName,
        photoUrl: m.photoUrl,
        birthYear: m.birthDate ? m.birthDate.getUTCFullYear() : null,
        claimed: Boolean(m.claimedByUserId),
      })),
    });
  } catch (error) {
    console.error("GET /api/people/duplicates failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
