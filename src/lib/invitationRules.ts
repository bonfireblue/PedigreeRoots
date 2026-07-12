import { prisma } from "@/lib/db";

export class InvitationError extends Error {
  code: string;
  status: number;

  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function normalizeEmail(email: string) {
  return String(email).trim().toLowerCase();
}

export function assertValidEmail(email: string) {
  const value = normalizeEmail(email);
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (!ok) {
    throw new InvitationError("INVALID_EMAIL", 400);
  }
  return value;
}

export function normalizePhone(phone: string) {
  // Remove all non-digit characters except leading +
  return String(phone).trim().replace(/[^\d+]/g, "");
}

export function assertValidPhone(phone: string) {
  const value = normalizePhone(phone);
  // Must have at least 10 digits (US minimum) and at most 15 (ITU max)
  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    throw new InvitationError("INVALID_PHONE", 400);
  }
  return value;
}

export function assertNonEmptyToken(token: unknown) {
  if (!token || typeof token !== "string" || !token.trim()) {
    throw new InvitationError("MISSING_TOKEN", 400);
  }
  return token.trim();
}

export function isVerifiedRole(role: string) {
  return role === "FOUNDER" || role === "TRUSTED" || role === "ADMIN";
}

export async function computeCanInvite(params: {
  meId: string;
  familyGraphId: string;
  role: string;
}) {
  const { meId, familyGraphId, role } = params;

  if (isVerifiedRole(role)) return true;

  const graph = await prisma.familyGraph.findUnique({
    where: { id: familyGraphId },
    select: { createdById: true },
  });

  if (!graph) return false;
  if (graph.createdById === meId) return true;

  const firstTenAccepted = await prisma.invitation.findMany({
    where: {
      familyGraphId,
      inviterUserId: graph.createdById,
      status: "ACCEPTED",
      acceptedByUserId: { not: null },
    },
    orderBy: { acceptedAt: "asc" },
    take: 10,
    select: { acceptedByUserId: true },
  });

  return firstTenAccepted.some((r) => r.acceptedByUserId === meId);
}

export async function assertInviteTargetIsValid(params: {
  familyGraphId: string;
  targetPersonId: string;
}) {
  const person = await prisma.person.findFirst({
    where: {
      id: params.targetPersonId,
      familyGraphId: params.familyGraphId,
    },
    select: {
      id: true,
      claimedByUserId: true,
    },
  });

  if (!person) {
    throw new InvitationError("INVALID_PERSON", 404);
  }

  if (person.claimedByUserId) {
    throw new InvitationError("ALREADY_CLAIMED", 400);
  }

  return person;
}

export async function assertNoDuplicateActiveInvite(params: {
  familyGraphId: string;
  targetPersonId: string;
  email?: string | null;
  phone?: string | null;
}) {
  // Allow multiple invites to the same person - they can be sent to different emails/phones
  // When one invite is accepted, all other pending invites for that person are automatically revoked
  // So we no longer block resending invites - users can send as many as they want
  // The only restriction is that the person must not already be claimed
  
  const person = await prisma.person.findUnique({
    where: { id: params.targetPersonId },
    select: { claimedByUserId: true },
  });
  
  if (person?.claimedByUserId) {
    throw new InvitationError("PERSON_ALREADY_CLAIMED", 400);
  }
}

export async function expireInvitationIfNeeded(invitationId: string, expiresAt: Date | null) {
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: "EXPIRED" },
    });
    throw new InvitationError("INVITE_EXPIRED", 400);
  }
}

export async function getPendingInvitationOrThrow(token: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      targetPerson: {
        select: {
          id: true,
          claimedByUserId: true,
          familyGraphId: true,
        },
      },
    },
  });

  if (!invitation) {
    throw new InvitationError("INVALID_TOKEN", 404);
  }

  if (invitation.status !== "PENDING") {
    throw new InvitationError("INVITE_NOT_PENDING", 400);
  }

  await expireInvitationIfNeeded(invitation.id, invitation.expiresAt);

  return invitation;
}
