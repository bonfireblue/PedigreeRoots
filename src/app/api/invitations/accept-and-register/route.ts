import { NextResponse } from "next/server";
import argon2 from "argon2";
import { prisma } from "@/lib/db";
import { sql } from "@/lib/neon-db";
import { readJson } from "@/lib/body";
import {
  InvitationError,
  assertNonEmptyToken,
  assertValidEmail,
  assertValidPhone,
  getPendingInvitationOrThrow,
  normalizeEmail,
  normalizePhone,
} from "@/lib/invitationRules";

export async function POST(req: Request) {
  try {
    const parsed = await readJson(req);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const token = assertNonEmptyToken(parsed.json?.token);
    const rawEmail = parsed.json?.email;
    const rawPhone = parsed.json?.phone;
    const password = parsed.json?.password;
    const name = parsed.json?.name;

    // Must have at least email or phone
    if (!rawEmail && !rawPhone) {
      return NextResponse.json({ error: "EMAIL_OR_PHONE_REQUIRED" }, { status: 400 });
    }

    // Validate and normalize email if provided
    let email: string | null = null;
    if (rawEmail) {
      try {
        email = assertValidEmail(rawEmail);
      } catch {
        return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
      }
    }

    // Validate and normalize phone if provided
    let phone: string | null = null;
    if (rawPhone) {
      try {
        phone = assertValidPhone(rawPhone);
        phone = normalizePhone(phone);
      } catch {
        return NextResponse.json({ error: "INVALID_PHONE" }, { status: 400 });
      }
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }

    const invitation = await getPendingInvitationOrThrow(token);

    // Check for existing user with same email or phone
    if (email) {
      const existingByEmail = await prisma.user.findFirst({
        where: { email },
        select: { id: true },
      });
      if (existingByEmail) {
        return NextResponse.json({ error: "USER_ALREADY_EXISTS" }, { status: 400 });
      }
    }

    if (phone) {
      const existingByPhone = await sql`SELECT id FROM "User" WHERE phone = ${phone} LIMIT 1`;
      if (existingByPhone.length > 0) {
        return NextResponse.json({ error: "PHONE_ALREADY_EXISTS" }, { status: 400 });
      }
    }

    const passwordHash = await argon2.hash(password);

    // Use raw SQL to create user with phone field (bypasses Prisma cached schema)
    const userId = crypto.randomUUID();
    await sql`
      INSERT INTO "User" (id, email, phone, "passwordHash", role, "createdAt")
      VALUES (${userId}, ${email}, ${phone}, ${passwordHash}, 'USER', NOW())
    `;

    // Now use Prisma for the rest of the transaction
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

      await tx.membership.upsert({
        where: {
          userId_familyGraphId: {
            userId: userId,
            familyGraphId: freshInvite.familyGraphId,
          },
        },
        update: {},
        create: {
          userId: userId,
          familyGraphId: freshInvite.familyGraphId,
          role: "MEMBER",
          invitedByUserId: freshInvite.inviterUserId,
        },
      });

      const claimResult = await tx.person.updateMany({
        where: {
          id: freshInvite.targetPersonId,
          claimedByUserId: null,
        },
        data: {
          claimedByUserId: userId,
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

      // Update name if provided
      if (name) {
        // Parse name into first and last
        const nameParts = name.trim().split(/\s+/);
        const lastName = nameParts.length > 1 ? nameParts.pop() : null;
        const firstName = nameParts.length > 0 ? nameParts.join(" ") : null;
        
        await tx.person.update({
          where: { id: freshInvite.targetPersonId },
          data: { 
            fullName: name,
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

      return { claimedPersonId: freshInvite.targetPersonId };
    });

    return NextResponse.json({
      ok: true,
      userEmail: email,
      userPhone: phone,
      claimedPersonId: result.claimedPersonId,
    });
  } catch (error) {
    if (error instanceof InvitationError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    console.error("POST /api/invitations/accept-and-register failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
