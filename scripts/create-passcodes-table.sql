-- Create passcodes table for admin sign-up access
CREATE TABLE IF NOT EXISTS "Passcode" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(12) UNIQUE NOT NULL,
  "usedAt" TIMESTAMP,
  "usedByUserId" UUID REFERENCES "User"(id),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "expiresAt" TIMESTAMP
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_passcode_code ON "Passcode"(code);
