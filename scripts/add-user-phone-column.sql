-- Add phone column to User table for phone-based authentication
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Create index for phone lookups
CREATE INDEX IF NOT EXISTS "User_phone_idx" ON "User" ("phone");
