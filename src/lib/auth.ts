import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { findUserByEmail, findUserById, findUserByPhone } from "@/lib/neon-db";
import { prisma } from "@/lib/db";
import { consumeLoginToken } from "@/lib/loginTokens";
import argon2 from "argon2";

// Check if input looks like a phone number (digits only, 10-15 chars)
function isPhoneNumber(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email or Phone", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        const input = credentials?.email?.trim() ?? "";
        const password = credentials?.password ?? "";
        if (!input || !password) return null;

        let user;
        
        // Check if input is a phone number or email
        if (isPhoneNumber(input)) {
          // Normalize phone number to just digits with + prefix
          const phoneDigits = input.replace(/\D/g, "");
          user = await findUserByPhone(`+${phoneDigits}`);
        } else {
          // Treat as email
          const email = input.toLowerCase();
          user = await findUserByEmail(email);
        }
        
        if (!user) return null;

        // OAuth users won't have a password hash
        if (!user.passwordHash) return null;

        const ok = await argon2.verify(user.passwordHash, password);
        if (!ok) return null;

        return { id: user.id, email: user.email ?? user.phone };
      }
    }),
    // Passwordless session exchange (Phase 2a): a one-time LoginToken —
    // minted by invite acceptance or an emailed magic link — becomes a
    // session. Tokens are single-use and expire in 15 minutes.
    CredentialsProvider({
      id: "login-token",
      name: "LoginToken",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        const raw = credentials?.token?.trim();
        if (!raw) return null;

        const userId = await consumeLoginToken(raw);
        if (!userId) return null;

        const user = await findUserById(userId);
        if (!user) return null;

        return { id: user.id, email: user.email ?? user.phone };
      }
    })
  ],

  callbacks: {
    async signIn({ user, account }) {
      // Handle OAuth sign-in (Google)
      if (account?.provider === "google" && user.email) {
        const email = user.email.toLowerCase();
        const existingUser = await findUserByEmail(email);
        
        if (!existingUser) {
          // Create user for OAuth
          await prisma.user.create({
            data: {
              email: email,
              passwordHash: "",
            }
          });
        }
        return true;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        // Get the user ID from DB for OAuth users
        if (account?.provider === "google" && user.email) {
          const dbUser = await findUserByEmail(user.email.toLowerCase());
          if (dbUser) {
            token.sub = dbUser.id;
          }
        } else {
          token.sub = user.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },

  session: { strategy: "jwt" as const },

  pages: { signIn: "/sign-in" },

  secret: process.env.NEXTAUTH_SECRET,

  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "none" as const,
        path: "/",
        secure: true,
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        sameSite: "none" as const,
        path: "/",
        secure: true,
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "none" as const,
        path: "/",
        secure: true,
      },
    },
  },
};
