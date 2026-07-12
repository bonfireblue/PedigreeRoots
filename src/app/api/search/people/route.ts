import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireMe } from "@/lib/authz";

export async function GET(req: Request) {
  const me = await requireMe();
  if (!me) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const url = new URL(req.url);
  const qRaw = url.searchParams.get("q") ?? "";
  const q = qRaw.trim();

  if (q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  const visibilityFilter = me.isAdmin
    ? {}
    : {
        OR: [{ createdById: me.id }, { isPrivate: false }],
      };

  const results = await prisma.person.findMany({
    where: {
      AND: [
        visibilityFilter,
        {
          fullName: {
            startsWith: q
          },
        },
      ],
    },
    select: {
      id: true,
      fullName: true,
      isPrivate: true,
      createdAt: true,
    },
    orderBy: { fullName: "asc" },
    take: 10,
  });

  return NextResponse.json({ results });
}
