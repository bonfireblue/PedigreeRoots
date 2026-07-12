import { NextResponse } from "next/server";
import { findUserByEmail, createPasswordResetToken, sql } from "@/lib/neon-db";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = (body?.email ?? "").toString().trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    const user = await findUserByEmail(email);

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    // Generate a secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Invalidate any existing tokens for this user
    await sql`UPDATE "PasswordResetToken" SET "usedAt" = NOW() WHERE "userId" = ${user.id} AND "usedAt" IS NULL`;

    // Create new token
    await createPasswordResetToken(user.id, token, expiresAt);

    const resetUrl = `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/reset-password?token=${token}`;

    // Send password reset email
    try {
      await sendPasswordResetEmail({
        to: email,
        resetUrl,
      });
    } catch (emailError) {
      console.error("Failed to send password reset email:", emailError);
      // Still return success to prevent email enumeration
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Failed to process request." },
      { status: 500 }
    );
  }
}
