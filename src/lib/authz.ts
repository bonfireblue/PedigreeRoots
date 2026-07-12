import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/neon-db";

export type Me = {
  id: string;
  email: string;
  isAdmin: boolean;
};

export async function requireMe(): Promise<Me | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;

  const users = await sql`SELECT id, email, role FROM "User" WHERE email = ${email} LIMIT 1`;
  if (users.length === 0) return null;

  const user = users[0] as { id: string; email: string; role: string };
  const isAdmin = user.role === "ADMIN";

  return { id: user.id, email: user.email, isAdmin };
}
