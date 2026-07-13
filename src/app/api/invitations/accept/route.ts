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
import { logChanges } from "@/lib/changeLog";

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
      const freshInvite = await tx.invitation.findUnique({
        where: { token },
        include: {
          targetPerson: {
            select: {
              id: true,
              claimedByUserId: true,
            },
          },
        },
      });

      if (!freshInvite) {
        throw new InvitationError("INVALID_TOKEN", 404);
      }

      if (freshInvite.status !== "PENDING") {
        throw new InvitationError("INVITE_NOT_PENDING", 400);
      }

      if (freshInvite.expiresAt && freshInvite.expiresAt.getTime() < Date.now()) {
        await tx.invitation.update({
          where: { id: freshInvite.id },
          data: { status: "EXPIRED" },
        });
        throw new InvitationError("INVITE_EXPIRED", 400);
      }

      if (freshInvite.email && me.email && normalizeEmail(freshInvite.email) !== normalizeEmail(me.email)) {
        throw new InvitationError("EMAIL_MISMATCH", 400);
      }

      await tx.membership.upsert({
        where: {
          userId_familyGraphId: {
            userId: me.id,
            familyGraphId: freshInvite.familyGraphId,
          },
        },
        update: {},
        create: {
          userId: me.id,
          familyGraphId: freshInvite.familyGraphId,
          role: "MEMBER",
          invitedByUserId: freshInvite.inviterUserId,
        },
      });

      // Check if this person should be auto-verified (first 10 invitees from graph creator)
      const graph = await tx.familyGraph.findUnique({
        where: { id: freshInvite.familyGraphId },
        select: { createdById: true },
      });

      let shouldAutoVerify = false;
      if (graph && freshInvite.inviterUserId === graph.createdById) {
        // Count how many invites from the creator have been accepted before this one
        const acceptedCount = await tx.invitation.count({
          where: {
            familyGraphId: freshInvite.familyGraphId,
            inviterUserId: graph.createdById,
            status: "ACCEPTED",
          },
        });
        // First 10 invitees are auto-verified
        shouldAutoVerify = acceptedCount < 10;
      }

      const claimResult = await tx.person.updateMany({
        where: {
          id: freshInvite.targetPersonId,
          claimedByUserId: null,
        },
        data: {
          claimedByUserId: me.id,
          isVerified: shouldAutoVerify,
        },
      });

      if (claimResult.count !== 1) {
        await tx.invitation.updateMany({
          where: {
            id: freshInvite.id,
            status: "PENDING",
          },
          data: {
            status: "REVOKED",
          },
        });

        throw new InvitationError("PERSON_ALREADY_CLAIMED", 400);
      }

      const acceptResult = await tx.invitation.updateMany({
        where: {
          id: freshInvite.id,
          status: "PENDING",
        },
        data: {
          status: "ACCEPTED",
          acceptedByUserId: me.id,
          acceptedAt: new Date(),
        },
      });

      if (acceptResult.count !== 1) {
        throw new InvitationError("INVITE_NOT_PENDING", 400);
      }

      await tx.invitation.updateMany({
        where: {
          targetPersonId: freshInvite.targetPersonId,
          status: "PENDING",
          NOT: { id: freshInvite.id },
        },
        data: {
          status: "REVOKED",
        },
      });

      await logChanges(tx, [
        {
          familyGraphId: freshInvite.familyGraphId,
          actorUserId: me.id,
          targetPersonId: freshInvite.targetPersonId,
          targetType: "INVITATION",
          targetId: freshInvite.id,
          action: "UPDATE",
          field: "status",
          oldValue: "PENDING",
          newValue: "ACCEPTED",
        },
        {
          familyGraphId: freshInvite.familyGraphId,
          actorUserId: me.id,
          targetPersonId: freshInvite.targetPersonId,
          targetType: "PERSON",
          targetId: freshInvite.targetPersonId,
          action: "UPDATE",
          field: "claimedByUserId",
          oldValue: null,
          newValue: me.id,
        },
      ]);

      return { claimedPersonId: freshInvite.targetPersonId };
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
