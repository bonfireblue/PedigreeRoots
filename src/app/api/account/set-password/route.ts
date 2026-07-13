import { NextResponse } from "next/server";
import argon2 from "argon2";
import { prisma } from "@/lib/db";
import { readJson } from "@/lib/body";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { requireMe } from "@/lib/authz";

// Optional password for passwordless accounts (Phase 2a). Never prompted
// during onboarding; offered in settings for people who want it.
export async function POST(req: Request) {
  const lim = rateLimit({ key: `set_password:${clientKey(req)}`, limit: 5, windowMs: 15 * 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const me = await requireMe();
    if (!me) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

    const parsed = await readJson(req, 5_000);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const password = typeof parsed.json?.password === "string" ? parsed.json.password : "";
    if (password.length < 8) {
      return NextResponse.json({ error: "WEAK_PASSWORD" }, { status: 400 });
    }

    const passwordHash = await argon2.hash(password);
    await prisma.user.update({
      where: { id: me.id },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/account/set-password failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
