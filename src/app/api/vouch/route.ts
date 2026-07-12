import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJson } from "@/lib/body";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
      where: { email: session.user.email.toLowerCase() },
      select: { id: true },
    });

    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const parsed = await readJson(req);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const targetPersonId =
      typeof parsed.json?.personId === "string" ? parsed.json.personId.trim() : "";

    if (!targetPersonId) {
      return NextResponse.json({ error: "MISSING_PERSON_ID" }, { status: 400 });
    }

    // Get voucher's membership and claimed person
    const membership = await prisma.membership.findFirst({
      where: { userId: me.id },
      select: { familyGraphId: true, role: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });
    }

    // Get the voucher's own claimed person to check if they're verified
    const voucherPerson = await prisma.person.findFirst({
      where: {
        claimedByUserId: me.id,
        familyGraphId: membership.familyGraphId,
      },
      select: { id: true, isVerified: true },
    });

    if (!voucherPerson || !voucherPerson.isVerified) {
      return NextResponse.json({ error: "VOUCHER_NOT_VERIFIED" }, { status: 403 });
    }

    // Get the target person
    const targetPerson = await prisma.person.findFirst({
      where: {
        id: targetPersonId,
        familyGraphId: membership.familyGraphId,
      },
      select: {
        id: true,
        isVerified: true,
        claimedByUserId: true,
      },
    });

    if (!targetPerson) {
      return NextResponse.json({ error: "PERSON_NOT_FOUND" }, { status: 404 });
    }

    if (!targetPerson.claimedByUserId) {
      return NextResponse.json({ error: "PERSON_NOT_CLAIMED" }, { status: 400 });
    }

    const targetUserId = targetPerson.claimedByUserId;

    if (targetPerson.isVerified) {
      return NextResponse.json({ error: "ALREADY_VERIFIED" }, { status: 400 });
    }

    // Check if the voucher was the original inviter - they cannot vouch for their own invitees
    const wasInviter = await prisma.invitation.findFirst({
      where: {
        targetPersonId: targetPersonId,
        inviterUserId: me.id,
        status: "ACCEPTED",
      },
      select: { id: true },
    });

    if (wasInviter) {
      return NextResponse.json({ error: "CANNOT_VOUCH_OWN_INVITEE" }, { status: 403 });
    }

    // Create vouch record and verify the person
    await prisma.$transaction(async (tx) => {
      // Create vouch record - Vouch links users, not persons
      // vouchedUserId is the user who owns the target person
      await tx.vouch.create({
        data: {
          vouchedByUserId: me.id,
          vouchedUserId: targetUserId,
          familyGraphId: membership.familyGraphId,
        },
      });

      // Mark person as verified
      await tx.person.update({
        where: { id: targetPersonId },
        data: { isVerified: true },
      });
    });

    return NextResponse.json({ ok: true, verifiedPersonId: targetPersonId });
  } catch (error) {
    console.error("POST /api/vouch failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
