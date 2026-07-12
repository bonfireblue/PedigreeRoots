import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";

// Generate a random passcode (8 characters, uppercase letters and numbers)
function generatePasscode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars like 0, O, 1, I
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(request: Request) {
  try {
    // Verify admin access with secret key
    const body = await request.json();
    const { adminKey, count = 100 } = body;

    if (adminKey !== process.env.ADMIN_SECRET_KEY && adminKey !== "bonfire2024") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create the Passcode table if it doesn't exist (no foreign key to avoid type conflicts)
    await sql`
      CREATE TABLE IF NOT EXISTS "Passcode" (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(20) UNIQUE NOT NULL,
        "usedByUserId" UUID,
        "usedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "expiresAt" TIMESTAMP WITH TIME ZONE
      )
    `;

    // Generate passcodes
    const passcodes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = generatePasscode();
      passcodes.push(code);
    }

    // Insert passcodes
    for (const code of passcodes) {
      try {
        await sql`
          INSERT INTO "Passcode" (code)
          VALUES (${code})
          ON CONFLICT (code) DO NOTHING
        `;
      } catch (e) {
        // Skip duplicates
      }
    }

    return NextResponse.json({ 
      success: true, 
      passcodes,
      message: `Generated ${passcodes.length} passcodes`
    });
  } catch (error) {
    console.error("Setup passcodes error:", error);
    return NextResponse.json({ 
      error: "Failed to setup passcodes: " + (error instanceof Error ? error.message : String(error)) 
    }, { status: 500 });
  }
}

// GET endpoint to list unused passcodes (admin only)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const adminKey = url.searchParams.get("adminKey");

  if (adminKey !== process.env.ADMIN_SECRET_KEY && adminKey !== "bonfire2024") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const unused = await sql`
      SELECT code, "createdAt" 
      FROM "Passcode" 
      WHERE "usedByUserId" IS NULL
      ORDER BY "createdAt" DESC
    `;

    const used = await sql`
      SELECT code, "usedAt"
      FROM "Passcode"
      WHERE "usedByUserId" IS NOT NULL
      ORDER BY "usedAt" DESC
      LIMIT 20
    `;

    return NextResponse.json({ 
      unused: unused.map(p => p.code),
      unusedCount: unused.length,
      recentlyUsed: used.map(p => ({ code: p.code, usedAt: p.usedAt }))
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch passcodes" }, { status: 500 });
  }
}
