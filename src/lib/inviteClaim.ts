import type { Prisma } from "@prisma/client";
import { InvitationError } from "@/lib/invitationRules";
import { logChanges } from "@/lib/changeLog";

// Shared invite-claim transaction body used by every acceptance path
// (logged-in accept, register-and-accept, passwordless accept). Verifies the
// invite is still pending/valid, joins the user to the graph as MEMBER,
// claims the target person (auto-verifying the graph creator's first 10
// invitees), marks the invite accepted, revokes competing invites, and writes
// the audit rows. Throws InvitationError on any failure.
export async function claimInvitationTx(
  tx: Prisma.TransactionClient,
  params: { token: string; userId: string; name?: string | null }
): Promise<{ claimedPersonId: string; familyGraphId: string }> {
  const { token, userId, name } = params;

  const freshInvite = await tx.invitation.findUnique({
    where: { token },
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

  await tx.membership.upsert({
    where: {
      userId_familyGraphId: {
        userId,
        familyGraphId: freshInvite.familyGraphId,
      },
    },
    update: {},
    create: {
      userId,
      familyGraphId: freshInvite.familyGraphId,
      role: "MEMBER",
      invitedByUserId: freshInvite.inviterUserId,
    },
  });

  // Auto-verify the graph creator's first 10 accepted invitees
  const graph = await tx.familyGraph.findUnique({
    where: { id: freshInvite.familyGraphId },
    select: { createdById: true },
  });

  let shouldAutoVerify = false;
  if (graph && freshInvite.inviterUserId === graph.createdById) {
    const acceptedCount = await tx.invitation.count({
      where: {
        familyGraphId: freshInvite.familyGraphId,
        inviterUserId: graph.createdById,
        status: "ACCEPTED",
      },
    });
    shouldAutoVerify = acceptedCount < 10;
  }

  const claimResult = await tx.person.updateMany({
    where: {
      id: freshInvite.targetPersonId,
      claimedByUserId: null,
    },
    data: {
      claimedByUserId: userId,
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

  // Optional: the invitee corrects their name during acceptance
  if (name && name.trim()) {
    const trimmed = name.trim();
    const nameParts = trimmed.split(/\s+/);
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null;
    const firstName =
      nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : nameParts[0] ?? null;

    await tx.person.update({
      where: { id: freshInvite.targetPersonId },
      data: {
        fullName: trimmed,
        firstName,
        lastName,
      },
    });
  }

  const acceptResult = await tx.invitation.updateMany({
    where: {
      id: freshInvite.id,
      status: "PENDING",
    },
    data: {
      status: "ACCEPTED",
      acceptedByUserId: userId,
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
      actorUserId: userId,
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
      actorUserId: userId,
      targetPersonId: freshInvite.targetPersonId,
      targetType: "PERSON",
      targetId: freshInvite.targetPersonId,
      action: "UPDATE",
      field: "claimedByUserId",
      oldValue: null,
      newValue: userId,
    },
  ]);

  return {
    claimedPersonId: freshInvite.targetPersonId,
    familyGraphId: freshInvite.familyGraphId,
  };
}

// Passwordless account binding rule: which email may a passwordless
// acceptance attach to? Pure so it can be unit-tested.
//  - Email invites prove inbox control of the invite email — that email wins.
//  - Phone-only invites must supply an email; it may NOT belong to an
//    existing account (that would let an invite bearer hijack it).
export function resolvePasswordlessEmail(params: {
  inviteEmail: string | null;
  providedEmail: string | null;
  providedEmailBelongsToOtherUser: boolean;
}): { ok: true; email: string } | { ok: false; error: "EMAIL_REQUIRED" | "EMAIL_IN_USE" } {
  const inviteEmail = params.inviteEmail?.trim().toLowerCase() || null;
  const providedEmail = params.providedEmail?.trim().toLowerCase() || null;

  if (inviteEmail) {
    return { ok: true, email: inviteEmail };
  }

  if (!providedEmail) {
    return { ok: false, error: "EMAIL_REQUIRED" };
  }

  if (params.providedEmailBelongsToOtherUser) {
    return { ok: false, error: "EMAIL_IN_USE" };
  }

  return { ok: true, email: providedEmail };
}
