import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJson } from "@/lib/body";
import {
  InvitationError,
  assertNonEmptyToken,
  getPendingInvitationOrThrow,
  normalizeEmail,
} from "@/lib/invitationRules";
import { claimInvitationTx } from "@/lib/inviteClaim";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
      where: { email: session.user.email.toLowerCase() },
      select: { id: true, email: true },
    });

    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const parsed = await readJson(req);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const token = assertNonEmptyToken(parsed.json?.token);
    const invitation = await getPendingInvitationOrThrow(token);

    // Check if the logged-in user's email matches the invitation email
    // Phone-based invites can be accepted by any logged-in user (they verify via SMS link)
    if (invitation.email && me.email && normalizeEmail(invitation.email) !== normalizeEmail(me.email)) {
      return NextResponse.json({ error: "EMAIL_MISMATCH" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      return claimInvitationTx(tx, { token, userId: me.id });
    });

    return NextResponse.json({ ok: true, claimedPersonId: result.claimedPersonId });
  } catch (error) {
    if (error instanceof InvitationError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("POST /api/invitations/accept failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
