import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log("Adding updatedAt column to Membership table...");
  
  try {
    // Check if column exists
    const checkResult = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Membership' AND column_name = 'updatedAt'
    `;
    
    if (checkResult.length === 0) {
      await sql`
        ALTER TABLE "Membership" 
        ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      `;
      console.log("Added updatedAt column to Membership table");
    } else {
      console.log("updatedAt column already exists on Membership table");
    }
    
    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
