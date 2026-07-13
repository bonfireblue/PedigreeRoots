import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";
import { prisma } from "@/lib/db";
import { requireMe } from "@/lib/authz";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import { logChanges } from "@/lib/changeLog";

function normalizeFullName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 120) return null;
  return trimmed;
}

async function getOrCreatePrimaryMembership(userId: string) {
  // Check for existing membership
  const existingRows = await sql`
    SELECT "familyGraphId", role 
    FROM "Membership" 
    WHERE "userId" = ${userId} 
    ORDER BY "createdAt" ASC 
    LIMIT 1
  `;

  if (existingRows.length > 0) {
    return {
      familyGraphId: existingRows[0].familyGraphId,
      role: existingRows[0].role,
      created: false,
    };
  }

  // Create new graph and membership
  const graphId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();

  await sql`
    INSERT INTO "FamilyGraph" (id, name, "createdById", "createdAt", "updatedAt")
    VALUES (${graphId}, 'My Family Graph', ${userId}, NOW(), NOW())
  `;

  await sql`
    INSERT INTO "Membership" (id, "userId", "familyGraphId", role, "createdAt", "updatedAt")
    VALUES (${membershipId}, ${userId}, ${graphId}, 'FOUNDER', NOW(), NOW())
  `;

  return {
    familyGraphId: graphId,
    role: "FOUNDER",
    created: true,
  };
}

export async function GET(req: Request) {
  try {
    const lim = rateLimit({
      key: `people_get:${clientKey(req)}`,
      limit: 120,
      windowMs: 60_000,
    });

    if (!lim.ok) {
      return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });
    }

    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const membershipRows = await sql`
      SELECT "familyGraphId", role 
      FROM "Membership" 
      WHERE "userId" = ${me.id} 
      ORDER BY "createdAt" ASC 
      LIMIT 1
    `;

    // Important UX change:
    // A brand new user should see an empty list, not a hard error.
    if (membershipRows.length === 0) {
      return NextResponse.json({
        people: [],
        familyGraphId: null,
        role: null,
      });
    }

    const membership = membershipRows[0];

    const people = await sql`
      SELECT id, "fullName", "createdAt", "isPrivate", "claimedByUserId"
      FROM "Person"
      WHERE "familyGraphId" = ${membership.familyGraphId}
        AND "deletedAt" IS NULL
      ORDER BY "createdAt" ASC
    `;

    return NextResponse.json({
      people: people.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        createdAt: new Date(p.createdAt).toISOString(),
        isPrivate: p.isPrivate,
        claimedByUserId: p.claimedByUserId,
      })),
      familyGraphId: membership.familyGraphId,
      role: membership.role,
    });
  } catch (error) {
    console.error("GET /api/people failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const lim = rateLimit({
      key: `people_post:${clientKey(req)}`,
      limit: 60,
      windowMs: 60_000,
    });

    if (!lim.ok) {
      return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });
    }

    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const fullName = normalizeFullName(parsed.json?.fullName);
    const isPrivate = typeof parsed.json?.isPrivate === "boolean" ? parsed.json.isPrivate : false;
    
    // Extract firstName and lastName from fullName if not provided separately
    const providedFirstName = typeof parsed.json?.firstName === "string" ? parsed.json.firstName.trim() : null;
    const providedLastName = typeof parsed.json?.lastName === "string" ? parsed.json.lastName.trim() : null;
    
    // If firstName/lastName not provided, try to parse from fullName
    let firstName = providedFirstName;
    let lastName = providedLastName;
    
    if (!firstName && !lastName && fullName) {
      const nameParts = fullName.split(" ");
      if (nameParts.length >= 2) {
        firstName = nameParts[0];
        lastName = nameParts.slice(1).join(" ");
      } else {
        firstName = fullName;
        lastName = null;
      }
    }

    if (!fullName) {
      return NextResponse.json({ error: "INVALID_FULL_NAME" }, { status: 400 });
    }

    // Important UX change:
    // If the user has no graph yet, bootstrap one automatically.
    const membership = await getOrCreatePrimaryMembership(me.id);

    // Vouch bootstrap (Bon's decision): when a graph is created via this
    // path, the first person the founder adds is themselves — claim it and
    // mark it verified so the founder can vouch for invitees. Skipped if the
    // user already has a claimed person (claims are one per user).
    let claimForFounder = false;
    if (membership.created) {
      const claimed = await sql`
        SELECT id FROM "Person" WHERE "claimedByUserId" = ${me.id} LIMIT 1
      `;
      claimForFounder = claimed.length === 0;
    }

    const person = await prisma.$transaction(async (tx) => {
      const row = await tx.person.create({
        data: {
          fullName,
          firstName,
          lastName,
          isPrivate,
          createdById: me.id,
          familyGraphId: membership.familyGraphId,
          ...(claimForFounder ? { claimedByUserId: me.id, isVerified: true } : {}),
        },
      });

      await logChanges(tx, [
        {
          familyGraphId: membership.familyGraphId,
          actorUserId: me.id,
          targetPersonId: row.id,
          targetType: "PERSON",
          targetId: row.id,
          action: "CREATE",
          field: null,
          newValue: row.fullName,
        },
      ]);

      return row;
    });

    return NextResponse.json(
      {
        person: {
          id: person.id,
          fullName: person.fullName,
          firstName: person.firstName,
          lastName: person.lastName,
          createdAt: new Date(person.createdAt).toISOString(),
          isPrivate: person.isPrivate,
          claimedByUserId: person.claimedByUserId,
          familyGraphId: person.familyGraphId,
        },
        bootstrappedGraph: membership.created,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/people failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
