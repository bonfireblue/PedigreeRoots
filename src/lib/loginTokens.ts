import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";

// One-time login tokens back both passwordless flows:
//  - invite acceptance: the accept endpoint returns a token the client
//    immediately exchanges for a NextAuth session
//  - returning login: emailed magic links
// Only the SHA-256 hash is stored; the raw token exists once, in transit.

export const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function generateLoginToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashLoginToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export type LoginTokenRow = {
  usedAt: Date | null;
  expiresAt: Date;
};

// Pure single-use + expiry check, unit-tested separately from the DB.
export function isLoginTokenUsable(row: LoginTokenRow, now: Date = new Date()): boolean {
  if (row.usedAt) return false;
  return row.expiresAt.getTime() > now.getTime();
}

export async function createLoginToken(
  userId: string,
  purpose: "LOGIN" | "INVITE" = "LOGIN"
): Promise<string> {
  const raw = generateLoginToken();

  await prisma.loginToken.create({
    data: {
      tokenHash: hashLoginToken(raw),
      userId,
      purpose,
      expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS),
    },
  });

  return raw;
}

// Atomically consume a token: returns the userId once, null on unknown,
// expired, or already-used tokens. The guarded updateMany makes concurrent
// exchanges race-safe — exactly one caller wins.
export async function consumeLoginToken(rawToken: string): Promise<string | null> {
  if (!rawToken || typeof rawToken !== "string") return null;

  const tokenHash = hashLoginToken(rawToken);
  const now = new Date();

  const row = await prisma.loginToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });

  if (!row || !isLoginTokenUsable(row, now)) return null;

  const claimed = await prisma.loginToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: now },
  });

  if (claimed.count !== 1) return null;

  return row.userId;
}
