import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readJson } from "@/lib/body";
import { rateLimit, clientKey } from "@/lib/rateLimit";
import { createLoginToken } from "@/lib/loginTokens";
import { sendMagicLinkEmail } from "@/lib/email";

// Returning passwordless login (Phase 2a): email a one-time sign-in link.
// The response is identical whether or not the account exists — no user
// enumeration.
export async function POST(req: Request) {
  // Two limits: per client (burst) and effectively per email via the same
  // window — magic links are cheap to request and land in real inboxes.
  const lim = rateLimit({ key: `magic_link:${clientKey(req)}`, limit: 5, windowMs: 15 * 60_000 });
  if (!lim.ok) return NextResponse.json({ error: "RATE_LIMIT" }, { status: 429 });

  try {
    const parsed = await readJson(req, 5_000);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const email = typeof parsed.json?.email === "string" ? parsed.json.email.trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
    }

    const emailLim = rateLimit({ key: `magic_link_email:${email}`, limit: 3, windowMs: 15 * 60_000 });
    if (!emailLim.ok) return NextResponse.json({ ok: true }); // same shape as success

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (user) {
      const token = await createLoginToken(user.id, "LOGIN");
      const magicUrl = `${process.env.NEXTAUTH_URL}/auth/magic?token=${token}`;

      try {
        await sendMagicLinkEmail({ to: email, magicUrl });
      } catch (e) {
        console.error("magic-link email send failed", e);
        // Still return ok — do not leak which addresses have accounts
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/auth/magic-link failed", error);
    return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
  }
}
