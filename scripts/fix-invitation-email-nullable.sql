-- Fix Invitation table to allow null email (for phone-only invites)
ALTER TABLE "Invitation" ALTER COLUMN "email" DROP NOT NULL;
