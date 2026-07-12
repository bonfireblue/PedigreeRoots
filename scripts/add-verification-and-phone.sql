-- Add isVerified field to Person table
ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false;

-- Add phone field to Invitation table  
ALTER TABLE "Invitation" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Make email nullable (invitations can now be email OR phone)
ALTER TABLE "Invitation" ALTER COLUMN "email" DROP NOT NULL;

-- Add index for phone lookups
CREATE INDEX IF NOT EXISTS "Invitation_phone_idx" ON "Invitation"("phone");

-- Auto-verify existing claimed persons (they claimed their own node)
UPDATE "Person" SET "isVerified" = true WHERE "claimedByUserId" IS NOT NULL;
