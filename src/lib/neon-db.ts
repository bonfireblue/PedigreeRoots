import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// SQL template tag executing raw Postgres through the shared Prisma client.
// (Named neon-db for historical reasons; the connection itself is whatever
// DATABASE_URL points at — Neon in production.)
export const sql = async (strings: TemplateStringsArray, ...values: any[]): Promise<any[]> => {
  const query = new Prisma.Sql([...strings], values);
  return await prisma.$queryRaw(query) as any;
};

// User operations
export async function findUserByEmail(email: string) {
  return await prisma.user.findUnique({ where: { email } });
}

export async function findUserById(id: string) {
  return await prisma.user.findUnique({ where: { id } });
}

export async function findUserByPhone(phone: string) {
  return await prisma.user.findUnique({ where: { phone } });
}

// email is required: the User.email column is NOT NULL in production
export async function createUser(email: string, passwordHash: string, role: string = "USER", phone: string | null = null) {
  return await prisma.user.create({
    data: {
      email,
      phone,
      passwordHash,
      role: role as any
    }
  });
}

// Password reset token operations
export async function createPasswordResetToken(userId: string, token: string, expiresAt: Date) {
  return await prisma.passwordResetToken.create({
    data: {
      userId,
      token,
      expiresAt
    }
  });
}

export async function findPasswordResetToken(token: string) {
  const result = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: {
      user: true
    }
  });
  
  if (result && !result.usedAt && result.expiresAt > new Date()) {
    return { ...result, userEmail: result.user.email };
  }
  return null;
}

export async function markTokenAsUsed(token: string) {
  await prisma.passwordResetToken.update({
    where: { token },
    data: { usedAt: new Date() }
  });
}

export async function updateUserPassword(userId: string, passwordHash: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash }
  });
}
