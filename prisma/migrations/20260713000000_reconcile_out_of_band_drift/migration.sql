-- Reconcile schema drift: these changes were applied to production out-of-band
-- via ad-hoc scripts (scripts/*.js, scripts/*.sql) instead of prisma migrate.
-- Every statement is idempotent (IF NOT EXISTS / DROP NOT NULL / guarded DO
-- blocks), so this migration is a no-op on production and produces the same
-- schema on a fresh database. Column definitions mirror the introspected
-- production schema (prisma db pull, 2026-07-13), which is authoritative where
-- it differs from the original scripts.

-- User: phone sign-in support (scripts/add-user-phone-column.sql)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_phone_key" ON "User"("phone");

-- Person: profile fields (scripts/add-person-profile-fields.js and successors)
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "grewUpLocation" TEXT;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "currentLocation" TEXT;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "proudOf" TEXT;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "occupation" TEXT;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "interests" TEXT;
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "story" TEXT;

-- Person: verification flag (scripts/add-verification-and-phone.sql; nullable in production)
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN DEFAULT false;

-- Invitation: phone invites + optional email (scripts/add-verification-and-phone.sql,
-- scripts/fix-invitation-email-nullable.sql)
ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Invitation" ALTER COLUMN "email" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "Invitation_phone_idx" ON "Invitation"("phone");

-- updatedAt columns (scripts/add-updated-at-column.js, scripts/add-membership-updated-at.js)
ALTER TABLE "FamilyGraph" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Membership" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- PasswordResetToken (scripts/add-password-reset-tokens.sql)
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" ON "PasswordResetToken"("token");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

DO $$ BEGIN
    ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Passcode: sign-up gate (scripts/create-passcodes-table.sql; production shape
-- per introspection: VARCHAR(8) code, no expiresAt, no FK on usedByUserId)
CREATE TABLE IF NOT EXISTS "Passcode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(8) NOT NULL,
    "usedByUserId" UUID,
    "usedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Passcode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Passcode_code_key" ON "Passcode"("code");
