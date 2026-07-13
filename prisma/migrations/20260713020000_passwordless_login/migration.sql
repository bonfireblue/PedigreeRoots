-- Phase 2a: passwordless entry.
-- 1) Users may exist without a password (invite-link and magic-link sign-in).
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- 2) One-time login tokens (invite acceptance session exchange + email magic
--    links). Only a SHA-256 hash of the token is stored.
CREATE TABLE "LoginToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'LOGIN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoginToken_tokenHash_key" ON "LoginToken"("tokenHash");
CREATE INDEX "LoginToken_userId_idx" ON "LoginToken"("userId");

ALTER TABLE "LoginToken" ADD CONSTRAINT "LoginToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
