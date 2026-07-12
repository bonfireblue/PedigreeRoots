import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log("Adding updatedAt column to FamilyGraph table...");
  
  try {
    // Check if column exists
    const columnCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'FamilyGraph' AND column_name = 'updatedAt'
    `;
    
    if (columnCheck.length === 0) {
      // Add the column
      await sql`
        ALTER TABLE "FamilyGraph" 
        ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
      `;
      console.log("Successfully added updatedAt column to FamilyGraph");
    } else {
      console.log("updatedAt column already exists");
    }
    
    // Also check Person table
    const personColumnCheck = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Person' AND column_name = 'updatedAt'
    `;
    
    if (personColumnCheck.length === 0) {
      await sql`
        ALTER TABLE "Person" 
        ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
      `;
      console.log("Successfully added updatedAt column to Person");
    } else {
      console.log("updatedAt column already exists on Person");
    }
    
    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrate();
