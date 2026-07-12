import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMe } from "@/lib/authz";

type GraphRole = "FOUNDER" | "ADMIN" | "TRUSTED" | "MEMBER";

function canViewNode(params: {
  meId: string;
  isAdmin: boolean;
  membershipRole: GraphRole;
  row: {
    isPrivate: boolean;
    createdById: string;
    claimedByUserId: string | null;
  };
}) {
  const { meId, isAdmin, membershipRole, row } = params;

  if (!row.isPrivate) return true;
  if (isAdmin) return true;
  if (row.createdById === meId) return true;
  if (row.claimedByUserId === meId) return true;

  if (
    membershipRole === "FOUNDER" ||
    membershipRole === "ADMIN" ||
    membershipRole === "TRUSTED"
  ) {
    return true;
  }

  return false;
}

function scoreName(fullName: string, query: string) {
  const name = fullName.trim().toLowerCase();
  const q = query.trim().toLowerCase();

  if (name === q) return 3000;
  if (name.startsWith(q)) return 2000;
  if (name.includes(q)) return 1000;

  const words = name.split(/\s+/).filter(Boolean);

  if (words.some((w) => w === q)) return 900;
  if (words.some((w) => w.startsWith(q))) return 800;

  return 0;
}

export async function GET(req: Request) {
  try {
    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const centerId = (searchParams.get("centerId") || "").trim();
    const limit = Math.max(5, Math.min(30, Number(searchParams.get("limit") || "12")));

    if (!q) {
      return NextResponse.json({ results: [] });
    }

    if (!centerId) {
      return NextResponse.json({ error: "MISSING_CENTER_ID" }, { status: 400 });
    }

    const center = await prisma.person.findFirst({
      where: { id: centerId },
      select: { id: true, familyGraphId: true },
    });

    if (!center) {
      return NextResponse.json({ error: "CENTER_NOT_FOUND" }, { status: 404 });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_familyGraphId: {
          userId: me.id,
          familyGraphId: center.familyGraphId,
        },
      },
      select: { id: true, role: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const membershipRole = membership.role as GraphRole;

    const candidates = await prisma.person.findMany({
      where: {
        familyGraphId: center.familyGraphId,
        deletedAt: null,
        fullName: {
          contains: q,
        },
      },
      select: {
        id: true,
        fullName: true,
        isPrivate: true,
        createdAt: true,
        claimedByUserId: true,
        createdById: true,
      },
      take: 60,
    });

    const filtered = candidates
      .filter((row) =>
        canViewNode({
          meId: me.id,
          isAdmin: me.isAdmin,
          membershipRole,
          row,
        })
      )
      .map((row) => ({
        ...row,
        rank: scoreName(row.fullName ?? "", q),
      }))
      .filter((row) => row.rank > 0)
      .sort((a, b) => {
        if (b.rank !== a.rank) return b.rank - a.rank;

        const an = (a.fullName ?? "").toLowerCase();
        const bn = (b.fullName ?? "").toLowerCase();
        if (an !== bn) return an < bn ? -1 : 1;

        return a.id < b.id ? -1 : 1;
      })
      .slice(0, limit);

    return NextResponse.json({
      results: filtered.map((p) => ({
        id: p.id,
        fullName: (p.fullName ?? "").trim() || "Unnamed",
        isPrivate: p.isPrivate,
        createdAt: p.createdAt.toISOString(),
        claimedByUserId: p.claimedByUserId,
      })),
    });
  } catch (error) {
    console.error("GET /api/people/search failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}