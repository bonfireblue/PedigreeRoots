import { describe, expect, it } from "vitest";
import {
  InvitationError,
  assertNonEmptyToken,
  assertValidEmail,
  isVerifiedRole,
  normalizeEmail,
} from "@/lib/invitationRules";

describe("invitationRules basic unit logic", () => {
  describe("normalizeEmail", () => {
    it("lowercases and trims email", () => {
      expect(normalizeEmail("  Bon@Example.COM  ")).toBe("bon@example.com");
    });
  });

  describe("assertValidEmail", () => {
    it("accepts a valid email", () => {
      expect(assertValidEmail("test@example.com")).toBe("test@example.com");
    });

    it("normalizes valid email", () => {
      expect(assertValidEmail("  Test@Example.com ")).toBe("test@example.com");
    });

    it("rejects invalid email", () => {
      expect(() => assertValidEmail("not-an-email")).toThrow(InvitationError);
    });
  });

  describe("assertNonEmptyToken", () => {
    it("accepts a non-empty token", () => {
      expect(assertNonEmptyToken("abc123")).toBe("abc123");
    });

    it("trims token", () => {
      expect(assertNonEmptyToken("  abc123  ")).toBe("abc123");
    });

    it("rejects empty token", () => {
      expect(() => assertNonEmptyToken("   ")).toThrow(InvitationError);
    });

    it("rejects missing token", () => {
      expect(() => assertNonEmptyToken(undefined)).toThrow(InvitationError);
    });
  });

  describe("isVerifiedRole", () => {
    it("accepts FOUNDER", () => {
      expect(isVerifiedRole("FOUNDER")).toBe(true);
    });

    it("accepts ADMIN", () => {
      expect(isVerifiedRole("ADMIN")).toBe(true);
    });

    it("accepts TRUSTED", () => {
      expect(isVerifiedRole("TRUSTED")).toBe(true);
    });

    it("rejects MEMBER", () => {
      expect(isVerifiedRole("MEMBER")).toBe(false);
    });
  });
});