import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson } from "@/lib/body";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import {
  InvitationError,
  assertNonEmptyToken,
  assertValidEmail,
  getPendingInvitationOrThrow,
} from "@/lib/invitationRules";
import { claimInvitationTx, resolvePasswordlessEmail } from "@/lib/inviteClaim";
import { createLoginToken } from "@/lib/loginTokens";

// Passwordless invite acceptance (Phase 2a): the tokenized invite link IS the
// credential. Creates (or finds) the account with no password, claims the
// person, and returns a one-time login token the client exchanges for a
// NextAuth session via the "login-token" credentials provider.
export async function POST(req: Request) {
  const lim = rateLimit({ key: `accept_pwless:${clientKey(req)}`, limit: 10, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const parsed = await readJson(req);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const token = assertNonEmptyToken(parsed.json?.token);
    const name = typeof parsed.json?.name === "string" ? parsed.json.name : null;
    const rawEmail = typeof parsed.json?.email === "string" ? parsed.json.email.trim() : "";

    let providedEmail: string | null = null;
    if (rawEmail) {
      try {
        providedEmail = assertValidEmail(rawEmail);
      } catch {
        return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
      }
    }

    const invitation = await getPendingInvitationOrThrow(token);

    // Which email does this acceptance bind to?
    //  - email invite: the invite email (possessing the link proves inbox control)
    //  - phone invite: the provided email, but never one that belongs to
    //    another existing account
    const providedOwner = providedEmail
      ? await prisma.user.findUnique({ where: { email: providedEmail }, select: { id: true } })
      : null;

    const resolved = resolvePasswordlessEmail({
      inviteEmail: invitation.email,
      providedEmail,
      providedEmailBelongsToOtherUser: Boolean(providedOwner),
    });

    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    // Find or create the account. No password: the user may add one later.
    let user = await prisma.user.findUnique({
      where: { email: resolved.email },
      select: { id: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: resolved.email,
          phone: invitation.phone ?? null,
          passwordHash: null,
        },
        select: { id: true },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      return claimInvitationTx(tx, { token, userId: user!.id, name });
    });

    // One-time session exchange token (single-use, 15 min)
    const loginToken = await createLoginToken(user.id, "INVITE");

    return NextResponse.json({
      ok: true,
      loginToken,
      claimedPersonId: result.claimedPersonId,
    });
  } catch (error) {
    if (error instanceof InvitationError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("POST /api/invitations/accept-passwordless failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
