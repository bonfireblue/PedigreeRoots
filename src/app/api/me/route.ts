import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/neon-db";

function isVerifiedRole(role: string) {
  return role === "FOUNDER" || role === "TRUSTED" || role === "ADMIN";
}

async function computeCanInvite(params: { meId: string; familyGraphId: string; role: string }) {
  const { meId, familyGraphId, role } = params;

  if (isVerifiedRole(role)) return true;

  const graphRows = await sql`
    SELECT "createdById" FROM "FamilyGraph" WHERE id = ${familyGraphId}
  `;
  if (graphRows.length === 0) return false;

  const graph = graphRows[0];
  if (graph.createdById === meId) return true;

  const firstTenAccepted = await sql`
    SELECT "acceptedByUserId" FROM "Invitation"
    WHERE "familyGraphId" = ${familyGraphId}
      AND "inviterUserId" = ${graph.createdById}
      AND status = 'ACCEPTED'
      AND "acceptedByUserId" IS NOT NULL
    ORDER BY "acceptedAt" ASC
    LIMIT 10
  `;

  return firstTenAccepted.some((r) => r.acceptedByUserId === meId);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const meRows = await sql`
    SELECT id, email FROM "User" WHERE email = ${session.user.email}
  `;
  if (meRows.length === 0) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const me = meRows[0];

  const membershipRows = await sql`
    SELECT "familyGraphId", role FROM "Membership"
    WHERE "userId" = ${me.id}
    ORDER BY "createdAt" ASC
    LIMIT 1
  `;
  if (membershipRows.length === 0) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });

  const membership = membershipRows[0];

  const canInvite = await computeCanInvite({
    meId: me.id,
    familyGraphId: membership.familyGraphId,
    role: membership.role,
  });

  // Get the person claimed by this user (if any)
  const claimedPersonRows = await sql`
    SELECT id FROM "Person"
    WHERE "claimedByUserId" = ${me.id}
      AND "familyGraphId" = ${membership.familyGraphId}
    LIMIT 1
  `;
  const claimedPersonId = claimedPersonRows.length > 0 ? claimedPersonRows[0].id : null;

  return NextResponse.json({
    user: { id: me.id, email: me.email },
    membership,
    canInvite,
    claimedPersonId,
  });
}
