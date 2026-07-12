import { NextResponse } from "next/server";
import { findPasswordResetToken, markTokenAsUsed, updateUserPassword } from "@/lib/neon-db";
import argon2 from "argon2";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = (body?.token ?? "").toString();
    const password = (body?.password ?? "").toString();

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token and password are required." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    // Find the token
    const resetToken = await findPasswordResetToken(token);

    if (!resetToken) {
      return NextResponse.json(
        { error: "Invalid or expired reset link." },
        { status: 400 }
      );
    }

    // Hash the new password
    const passwordHash = await argon2.hash(password);

    // Update user password and mark token as used
    await updateUserPassword(resetToken.userId, passwordHash);
    await markTokenAsUsed(token);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Failed to reset password." },
      { status: 500 }
    );
  }
}
