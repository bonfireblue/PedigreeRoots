import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";

// Invite preview (Phase 2b: value before forms). No session required — the
// invite token itself is the secret. Returns just enough to render the
// invitee's spot in the tree: their node plus immediate-family names. Nothing
// else in the graph is exposed.
export async function GET(req: Request) {
  const lim = rateLimit({ key: `invite_preview:${clientKey(req)}`, limit: 30, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token")?.trim();
    if (!token) return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });

    const invitation = await prisma.invitation.findUnique({
      where: { token },
      select: {
        status: true,
        expiresAt: true,
        email: true,
        familyGraph: { select: { name: true } },
        inviter: { select: { id: true, email: true } },
        targetPerson: {
          select: {
            id: true,
            fullName: true,
            photoUrl: true,
            claimedByUserId: true,
            parents: { select: { parent: { select: { fullName: true, deletedAt: true } } } },
            children: { select: { child: { select: { fullName: true, deletedAt: true } } } },
            spousesA: { select: { b: { select: { fullName: true, deletedAt: true } } } },
            spousesB: { select: { a: { select: { fullName: true, deletedAt: true } } } },
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 404 });
    }

    const expired =
      invitation.status !== "PENDING" ||
      (invitation.expiresAt ? invitation.expiresAt.getTime() < Date.now() : false);

    // Inviter display name: their claimed person's name, falling back to email
    const inviterPerson = await prisma.person.findFirst({
      where: { claimedByUserId: invitation.inviter.id },
      select: { fullName: true },
    });

    const target = invitation.targetPerson;

    return NextResponse.json({
      valid: !expired && !target.claimedByUserId,
      alreadyClaimed: Boolean(target.claimedByUserId),
      expired,
      hasEmail: Boolean(invitation.email),
      inviterName: inviterPerson?.fullName ?? invitation.inviter.email.split("@")[0],
      familyName: invitation.familyGraph.name ?? "family",
      targetPerson: {
        id: target.id,
        fullName: target.fullName,
        photoUrl: target.photoUrl,
      },
      parents: target.parents.filter((r) => !r.parent.deletedAt).map((r) => r.parent.fullName),
      children: target.children.filter((r) => !r.child.deletedAt).map((r) => r.child.fullName),
      spouses: [
        ...target.spousesA.filter((r) => !r.b.deletedAt).map((r) => r.b.fullName),
        ...target.spousesB.filter((r) => !r.a.deletedAt).map((r) => r.a.fullName),
      ],
    });
  } catch (error) {
    console.error("GET /api/invitations/preview failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
