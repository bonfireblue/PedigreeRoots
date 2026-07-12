import { NextResponse } from "next/server";
import argon2 from "argon2";
import { findUserByEmail, createUser, sql } from "@/lib/neon-db";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const email = (body?.email ?? "").toString().trim().toLowerCase();
    const password = (body?.password ?? "").toString();
    const name = (body?.name ?? "").toString().trim();
    const passcode = (body?.passcode ?? "").toString().trim().toUpperCase();

    if (!passcode) {
      return NextResponse.json(
        { error: "Passcode is required to create an account." },
        { status: 400 }
      );
    }

    // Validate passcode exists and hasn't been used
    const passcodeRows = await sql`
      SELECT id, code, "usedByUserId" 
      FROM "Passcode" 
      WHERE code = ${passcode}
    `;

    if (passcodeRows.length === 0) {
      return NextResponse.json(
        { error: "Invalid passcode. Please check and try again." },
        { status: 400 }
      );
    }

    if (passcodeRows[0].usedByUserId) {
      return NextResponse.json(
        { error: "This passcode has already been used." },
        { status: 400 }
      );
    }

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "Email is already in use." },
        { status: 409 }
      );
    }

    const passwordHash = await argon2.hash(password);
    const newUser = await createUser(email, passwordHash, "USER");

    // Mark the passcode as used
    await sql`
      UPDATE "Passcode" 
      SET "usedByUserId" = ${newUser.id}, "usedAt" = NOW()
      WHERE code = ${passcode}
    `;

    // Create a family graph for this user
    const graphId = crypto.randomUUID();
    await sql`
      INSERT INTO "FamilyGraph" (id, name, "createdById", "createdAt", "updatedAt")
      VALUES (${graphId}, 'My Family', ${newUser.id}, NOW(), NOW())
    `;

    // Create membership with FOUNDER role
    const membershipId = crypto.randomUUID();
    await sql`
      INSERT INTO "Membership" (id, "userId", "familyGraphId", role, "createdAt", "updatedAt")
      VALUES (${membershipId}, ${newUser.id}, ${graphId}, 'FOUNDER', NOW(), NOW())
    `;

    // Create a person node for this user (automatically claimed and verified)
    const personId = crypto.randomUUID();
    const fullName = name || email.split("@")[0]; // Use name or email prefix as fallback
    await sql`
      INSERT INTO "Person" (
        id, "fullName", "familyGraphId", "createdById", "claimedByUserId", 
        "isVerified", "isPrivate", "createdAt", "updatedAt"
      )
      VALUES (
        ${personId}, ${fullName}, ${graphId}, ${newUser.id}, ${newUser.id},
        true, false, NOW(), NOW()
      )
    `;

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Registration error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Registration failed: ${errorMessage}` }, { status: 500 });
  }
}
