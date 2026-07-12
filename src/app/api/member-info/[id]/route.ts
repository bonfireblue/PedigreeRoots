// Member info API - Uses raw SQL queries
import { NextResponse } from "next/server";
import { sql } from "@/lib/neon-db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { readJson } from "@/lib/body";
import { requireMe } from "@/lib/authz";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `mi_get:${clientKey(req)}`, limit: 120, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;

    const personRows = await sql`
      SELECT id, "fullName", gender, "birthDate", "deathDate", "isPrivate", 
             "isVerified", "claimedByUserId", "createdById", "photoUrl"
      FROM "Person"
      WHERE id = ${id} AND "deletedAt" IS NULL
    `;

    if (personRows.length === 0) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const person = personRows[0];

    const parentRows = await sql`
      SELECT p.id, p."fullName", p."isPrivate", p."claimedByUserId"
      FROM "Person" p
      JOIN "ParentChild" pc ON pc."parentId" = p.id
      WHERE pc."childId" = ${id} AND p."deletedAt" IS NULL
    `;

    const childrenRows = await sql`
      SELECT p.id, p."fullName", p."isPrivate", p."claimedByUserId"
      FROM "Person" p
      JOIN "ParentChild" pc ON pc."childId" = p.id
      WHERE pc."parentId" = ${id} AND p."deletedAt" IS NULL
    `;

    const spouseRows = await sql`
      SELECT p.id, p."fullName", p."isPrivate", p."claimedByUserId"
      FROM "Person" p
      WHERE p."deletedAt" IS NULL AND (
        p.id IN (SELECT "bId" FROM "Spouse" WHERE "aId" = ${id})
        OR p.id IN (SELECT "aId" FROM "Spouse" WHERE "bId" = ${id})
      )
    `;

    const siblingRows = await sql`
      SELECT DISTINCT p.id, p."fullName", p."isPrivate", p."claimedByUserId"
      FROM "Person" p
      JOIN "ParentChild" pc ON pc."childId" = p.id
      WHERE pc."parentId" IN (
        SELECT "parentId" FROM "ParentChild" WHERE "childId" = ${id}
      )
      AND p.id != ${id}
      AND p."deletedAt" IS NULL
    `;

    return NextResponse.json({
      person: {
        id: person.id,
        fullName: person.fullName,
        gender: person.gender,
        birthDate: person.birthDate,
        deathDate: person.deathDate,
        isPrivate: person.isPrivate,
        isVerified: person.isVerified,
        claimedByUserId: person.claimedByUserId,
        photoUrl: person.photoUrl,
      },
      parents: parentRows,
      children: childrenRows,
      spouses: spouseRows,
      siblings: siblingRows,
      canEdit: person.claimedByUserId === me.id || person.createdById === me.id,
      canVouch: person.claimedByUserId && person.claimedByUserId !== me.id && !person.isVerified,
    });
  } catch (error) {
    console.error("GET /api/member-info/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const lim = rateLimit({ key: `mi_patch:${clientKey(req)}`, limit: 60, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const { id } = await ctx.params;
    const parsed = await readJson(req, 50_000);
    if (!parsed.ok) return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });

    const body = parsed.json;

    const personRows = await sql`
      SELECT id, "claimedByUserId", "createdById"
      FROM "Person"
      WHERE id = ${id} AND "deletedAt" IS NULL
    `;

    if (personRows.length === 0) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const person = personRows[0];

    if (person.claimedByUserId !== me.id && person.createdById !== me.id) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // Build update object with only defined fields
    const hasUpdates = 
      body.fullName !== undefined ||
      body.gender !== undefined ||
      body.birthDate !== undefined ||
      body.deathDate !== undefined ||
      body.isPrivate !== undefined ||
      body.photoUrl !== undefined;

    if (!hasUpdates) {
      return NextResponse.json({ error: "NO_UPDATES" }, { status: 400 });
    }

    // Use individual updates with COALESCE to only update provided fields
    const updated = await sql`
      UPDATE "Person" 
      SET 
        "fullName" = COALESCE(${body.fullName !== undefined ? body.fullName : null}, "fullName"),
        "gender" = CASE WHEN ${body.gender !== undefined} THEN ${body.gender ?? null} ELSE "gender" END,
        "birthDate" = CASE WHEN ${body.birthDate !== undefined} THEN ${body.birthDate || null}::timestamp ELSE "birthDate" END,
        "deathDate" = CASE WHEN ${body.deathDate !== undefined} THEN ${body.deathDate || null}::timestamp ELSE "deathDate" END,
        "isPrivate" = CASE WHEN ${body.isPrivate !== undefined} THEN ${body.isPrivate ?? false} ELSE "isPrivate" END,
        "photoUrl" = CASE WHEN ${body.photoUrl !== undefined} THEN ${body.photoUrl ?? null} ELSE "photoUrl" END,
        "updatedAt" = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    return NextResponse.json({ person: updated[0] });
  } catch (error) {
    console.error("PATCH /api/member-info/[id] error:", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
