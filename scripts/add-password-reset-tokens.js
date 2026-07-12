import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function runMigration() {
  console.log('Creating PasswordResetToken table...');
  
  // Create the table
  await sql`
    CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
      "id" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "usedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
    )
  `;
  console.log('Table created.');

  // Create unique index on token
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key" 
    ON "PasswordResetToken"("token")
  `;
  console.log('Unique index on token created.');

  // Create index on userId
  await sql`
    CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" 
    ON "PasswordResetToken"("userId")
  `;
  console.log('Index on userId created.');

  // Create index on token for lookups
  await sql`
    CREATE INDEX IF NOT EXISTS "PasswordResetToken_token_idx" 
    ON "PasswordResetToken"("token")
  `;
  console.log('Index on token created.');

  // Add foreign key constraint
  await sql`
    DO $$ BEGIN
      ALTER TABLE "PasswordResetToken" 
      ADD CONSTRAINT "PasswordResetToken_userId_fkey" 
      FOREIGN KEY ("userId") REFERENCES "User"("id") 
      ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$
  `;
  console.log('Foreign key constraint added.');

  console.log('Migration completed successfully!');
}

runMigration().catch(console.error);
