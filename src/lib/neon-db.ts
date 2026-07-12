import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

// Safe SQL template tag polyfill to bridge Vercel v0 Postgres logic to Prisma SQLite
export const sql = async (strings: TemplateStringsArray, ...values: any[]): Promise<any[]> => {
  const newStrings: string[] = [];
  
  for (let i = 0; i < strings.length; i++) {
    let s = strings[i];
    // Convert Postgres syntaxes to SQLite locally
    s = s.replace(/NOW\(\)/g, "CURRENT_TIMESTAMP");
    // Remove Postgres typecasting (e.g., ::"UserRole", ::date, ::int) which fails in SQLite
    s = s.replace(/::"\w+"/g, "");
    s = s.replace(/::\w+/g, "");
    
    // SQLite boolean mapping (true -> 1, false -> 0) might be needed implicitly but Prisma queryRaw handles it
    newStrings.push(s);
  }

  // Pass it directly nicely into Prisma's SQL tagged template interface
  const query = new Prisma.Sql(newStrings, values);
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

export async function createUser(email: string | null, passwordHash: string, role: string = "USER", phone: string | null = null) {
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
