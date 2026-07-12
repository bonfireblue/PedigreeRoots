import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { requireMe } from "@/lib/authz";
import {
  FIELD_LABELS,
  decodeActivityCursor,
  encodeActivityCursor,
} from "@/lib/changeLog";

const PAGE_SIZE = 30;

export async function GET(req: Request) {
  const lim = rateLimit({ key: `activity:${clientKey(req)}`, limit: 120, windowMs: 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const url = new URL(req.url);
    const requestedGraphId = url.searchParams.get("graphId");
    const rawCursor = url.searchParams.get("cursor");

    // Resolve the graph: an explicit graphId must be one the user belongs to;
    // otherwise fall back to their primary (oldest) membership.
    let familyGraphId: string | null = null;
    if (requestedGraphId) {
      const membership = await prisma.membership.findUnique({
        where: { userId_familyGraphId: { userId: me.id, familyGraphId: requestedGraphId } },
        select: { familyGraphId: true },
      });
      if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });
      familyGraphId = membership.familyGraphId;
    } else {
      const membership = await prisma.membership.findFirst({
        where: { userId: me.id },
        orderBy: { createdAt: "asc" },
        select: { familyGraphId: true },
      });
      if (!membership) return NextResponse.json({ error: "NO_MEMBERSHIP" }, { status: 403 });
      familyGraphId = membership.familyGraphId;
    }

    const cursor = rawCursor ? decodeActivityCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      return NextResponse.json({ error: "INVALID_CURSOR" }, { status: 400 });
    }

    const rows = await prisma.changeLog.findMany({
      where: {
        familyGraphId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    });

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    // Resolve display names in two batched queries: actors (their claimed
    // person in this graph, falling back to email) and target persons.
    const actorIds = [...new Set(page.map((r) => r.actorUserId))];
    const personIds = [...new Set(page.map((r) => r.targetPersonId).filter((v): v is string => Boolean(v)))];

    const [actorUsers, actorPersons, targetPersons] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true },
      }),
      prisma.person.findMany({
        where: { claimedByUserId: { in: actorIds }, familyGraphId },
        select: { claimedByUserId: true, fullName: true },
      }),
      prisma.person.findMany({
        where: { id: { in: personIds } },
        select: { id: true, fullName: true },
      }),
    ]);

    const actorNameById = new Map<string, string>();
    for (const u of actorUsers) {
      actorNameById.set(u.id, u.email.split("@")[0]);
    }
    for (const p of actorPersons) {
      if (p.claimedByUserId) actorNameById.set(p.claimedByUserId, p.fullName);
    }

    const personNameById = new Map(targetPersons.map((p) => [p.id, p.fullName]));

    const items = page.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      actorUserId: r.actorUserId,
      actorName: actorNameById.get(r.actorUserId) ?? "Someone",
      targetPersonId: r.targetPersonId,
      targetPersonName: r.targetPersonId ? personNameById.get(r.targetPersonId) ?? null : null,
      targetType: r.targetType,
      action: r.action,
      field: r.field,
      fieldLabel: r.field ? FIELD_LABELS[r.field] ?? r.field : null,
      oldValue: r.oldValue,
      newValue: r.newValue,
    }));

    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeActivityCursor(last.createdAt, last.id) : null;

    return NextResponse.json({ items, nextCursor });
  } catch (error) {
    console.error("GET /api/activity failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
