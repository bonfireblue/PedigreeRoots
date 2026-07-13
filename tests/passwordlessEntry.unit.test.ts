import { describe, expect, it } from "vitest";
import {
  LOGIN_TOKEN_TTL_MS,
  generateLoginToken,
  hashLoginToken,
  isLoginTokenUsable,
} from "@/lib/loginTokens";
import { resolvePasswordlessEmail } from "@/lib/inviteClaim";

describe("login tokens (Phase 2a)", () => {
  it("generates 64-char hex tokens, unique per call", () => {
    const a = generateLoginToken();
    const b = generateLoginToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically and never stores the raw token shape", () => {
    const raw = generateLoginToken();
    const h1 = hashLoginToken(raw);
    const h2 = hashLoginToken(raw);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(raw);
    expect(h1).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  describe("single-use + expiry (isLoginTokenUsable)", () => {
    const now = new Date("2026-07-13T12:00:00Z");

    it("accepts an unused, unexpired token", () => {
      expect(
        isLoginTokenUsable(
          { usedAt: null, expiresAt: new Date(now.getTime() + 60_000) },
          now
        )
      ).toBe(true);
    });

    it("rejects a used token (single-use)", () => {
      expect(
        isLoginTokenUsable(
          { usedAt: new Date(now.getTime() - 1000), expiresAt: new Date(now.getTime() + 60_000) },
          now
        )
      ).toBe(false);
    });

    it("rejects an expired token", () => {
      expect(
        isLoginTokenUsable(
          { usedAt: null, expiresAt: new Date(now.getTime() - 1) },
          now
        )
      ).toBe(false);
    });

    it("rejects a token exactly at expiry", () => {
      expect(isLoginTokenUsable({ usedAt: null, expiresAt: now }, now)).toBe(false);
    });
  });

  it("TTL is 15 minutes", () => {
    expect(LOGIN_TOKEN_TTL_MS).toBe(15 * 60 * 1000);
  });
});

describe("passwordless email binding (resolvePasswordlessEmail)", () => {
  it("email invites bind to the invite email, ignoring any provided email", () => {
    const result = resolvePasswordlessEmail({
      inviteEmail: "Elder@Example.com",
      providedEmail: "attacker@evil.com",
      providedEmailBelongsToOtherUser: true,
    });
    expect(result).toEqual({ ok: true, email: "elder@example.com" });
  });

  it("phone-only invites require an email", () => {
    const result = resolvePasswordlessEmail({
      inviteEmail: null,
      providedEmail: null,
      providedEmailBelongsToOtherUser: false,
    });
    expect(result).toEqual({ ok: false, error: "EMAIL_REQUIRED" });
  });

  it("phone-only invites accept a fresh email", () => {
    const result = resolvePasswordlessEmail({
      inviteEmail: null,
      providedEmail: "  Rose@Example.com ",
      providedEmailBelongsToOtherUser: false,
    });
    expect(result).toEqual({ ok: true, email: "rose@example.com" });
  });

  it("phone-only invites refuse an email that belongs to an existing account (no hijack)", () => {
    const result = resolvePasswordlessEmail({
      inviteEmail: null,
      providedEmail: "existing@example.com",
      providedEmailBelongsToOtherUser: true,
    });
    expect(result).toEqual({ ok: false, error: "EMAIL_IN_USE" });
  });
});
