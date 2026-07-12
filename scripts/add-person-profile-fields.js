import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function main() {
  console.log("Adding new profile fields to Person table...");

  // Add firstName column
  try {
    await sql`ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "firstName" TEXT`;
    console.log("Added firstName column");
  } catch (e) {
    console.log("firstName column may already exist:", e.message);
  }

  // Add lastName column
  try {
    await sql`ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "lastName" TEXT`;
    console.log("Added lastName column");
  } catch (e) {
    console.log("lastName column may already exist:", e.message);
  }

  // Add grewUpLocation column
  try {
    await sql`ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "grewUpLocation" TEXT`;
    console.log("Added grewUpLocation column");
  } catch (e) {
    console.log("grewUpLocation column may already exist:", e.message);
  }

  // Add currentLocation column
  try {
    await sql`ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "currentLocation" TEXT`;
    console.log("Added currentLocation column");
  } catch (e) {
    console.log("currentLocation column may already exist:", e.message);
  }

  // Add proudOf column
  try {
    await sql`ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "proudOf" TEXT`;
    console.log("Added proudOf column");
  } catch (e) {
    console.log("proudOf column may already exist:", e.message);
  }

  // Add occupation column
  try {
    await sql`ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "occupation" TEXT`;
    console.log("Added occupation column");
  } catch (e) {
    console.log("occupation column may already exist:", e.message);
  }

  // Add interests column
  try {
    await sql`ALTER TABLE "Person" ADD COLUMN IF NOT EXISTS "interests" TEXT`;
    console.log("Added interests column");
  } catch (e) {
    console.log("interests column may already exist:", e.message);
  }

  // Migrate existing fullName to firstName/lastName where possible
  // This splits "First Last" into firstName="First", lastName="Last"
  console.log("Migrating existing fullName values to firstName/lastName...");
  
  const people = await sql`
    SELECT id, "fullName" FROM "Person" 
    WHERE "firstName" IS NULL AND "fullName" IS NOT NULL
  `;

  for (const person of people) {
    const parts = person.fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      const firstName = parts[0];
      const lastName = parts.slice(1).join(" ");
      await sql`
        UPDATE "Person" 
        SET "firstName" = ${firstName}, "lastName" = ${lastName}
        WHERE id = ${person.id}
      `;
    } else if (parts.length === 1) {
      await sql`
        UPDATE "Person" 
        SET "firstName" = ${parts[0]}
        WHERE id = ${person.id}
      `;
    }
  }

  console.log(`Migrated ${people.length} existing records`);
  console.log("Migration complete!");
}

main().catch(console.error);
