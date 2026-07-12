import { describe, expect, it } from "vitest";
import {
  PersonError,
  assertBirthBeforeDeath,
  canDeletePerson,
  canEditPerson,
  canViewPerson,
  normalizeBio,
  normalizeFullName,
  normalizeLocation,
  normalizeOptionalDate,
  normalizePhotoUrl,
} from "@/lib/personRules";

describe("personRules", () => {
  describe("normalizeFullName", () => {
    it("accepts a valid trimmed name", () => {
      expect(normalizeFullName("  Bon Huynh  ")).toBe("Bon Huynh");
    });

    it("rejects an empty name", () => {
      expect(() => normalizeFullName("   ")).toThrow(PersonError);
    });
  });

  describe("normalizeOptionalDate", () => {
    it("accepts a valid date string", () => {
      const value = normalizeOptionalDate("2020-01-01", "INVALID_BIRTH_DATE");
      expect(value).toBeInstanceOf(Date);
    });

    it("returns null for empty string", () => {
      expect(normalizeOptionalDate("", "INVALID_BIRTH_DATE")).toBeNull();
    });

    it("rejects an invalid date", () => {
      expect(() => normalizeOptionalDate("not-a-date", "INVALID_BIRTH_DATE")).toThrow(PersonError);
    });
  });

  describe("normalizePhotoUrl", () => {
    it("accepts https URLs", () => {
      expect(normalizePhotoUrl("https://example.com/a.jpg")).toBe("https://example.com/a.jpg");
    });

    it("rejects invalid URLs", () => {
      expect(() => normalizePhotoUrl("notaurl")).toThrow(PersonError);
    });

    it("rejects non-http protocols", () => {
      expect(() => normalizePhotoUrl("ftp://example.com/a.jpg")).toThrow(PersonError);
    });
  });

  describe("assertBirthBeforeDeath", () => {
    it("allows birth before death", () => {
      expect(() =>
        assertBirthBeforeDeath(new Date("2000-01-01"), new Date("2020-01-01"))
      ).not.toThrow();
    });

    it("rejects birth after death", () => {
      expect(() =>
        assertBirthBeforeDeath(new Date("2025-01-01"), new Date("2020-01-01"))
      ).toThrow(PersonError);
    });
  });

  describe("canViewPerson", () => {
    const row = {
      createdById: "creator-1",
      claimedByUserId: "claimer-1",
      isPrivate: true,
    };

    it("allows admin", () => {
      expect(canViewPerson("someone", true, "MEMBER", row)).toBe(true);
    });

    it("allows creator", () => {
      expect(canViewPerson("creator-1", false, "MEMBER", row)).toBe(true);
    });

    it("allows claimer", () => {
      expect(canViewPerson("claimer-1", false, "MEMBER", row)).toBe(true);
    });

    it("allows trusted role", () => {
      expect(canViewPerson("someone", false, "TRUSTED", row)).toBe(true);
    });

    it("blocks normal member on private person", () => {
      expect(canViewPerson("someone", false, "MEMBER", row)).toBe(false);
    });
  });

  describe("canEditPerson (open-editing model)", () => {
    it("allows claimer to edit claimed node", () => {
      expect(
        canEditPerson("claimer-1", "MEMBER", {
          createdById: "creator-1",
          claimedByUserId: "claimer-1",
        })
      ).toBe(true);
    });

    it("blocks creator from editing someone else's claimed node", () => {
      expect(
        canEditPerson("creator-1", "ADMIN", {
          createdById: "creator-1",
          claimedByUserId: "claimer-1",
        })
      ).toBe(false);
    });

    it("blocks any non-claimer member from editing a claimed node", () => {
      expect(
        canEditPerson("someone-else", "MEMBER", {
          createdById: "creator-1",
          claimedByUserId: "claimer-1",
        })
      ).toBe(false);
    });

    it("allows any member to edit a stranger's unclaimed node", () => {
      expect(
        canEditPerson("someone-else", "MEMBER", {
          createdById: "creator-1",
          claimedByUserId: null,
        })
      ).toBe(true);
    });

    it("allows creator to edit own unclaimed node", () => {
      expect(
        canEditPerson("creator-1", "MEMBER", {
          createdById: "creator-1",
          claimedByUserId: null,
        })
      ).toBe(true);
    });

    it("allows verified role to edit unclaimed node", () => {
      expect(
        canEditPerson("admin-1", "ADMIN", {
          createdById: "creator-1",
          claimedByUserId: null,
        })
      ).toBe(true);
    });

    it("blocks a non-member (no membership role) from editing", () => {
      expect(
        canEditPerson("outsider", "", {
          createdById: "creator-1",
          claimedByUserId: null,
        })
      ).toBe(false);
    });
  });

  describe("canDeletePerson", () => {
    it("allows any member to delete an unclaimed node", () => {
      expect(
        canDeletePerson("someone-else", "MEMBER", {
          createdById: "creator-1",
          claimedByUserId: null,
        })
      ).toBe(true);
    });

    it("blocks deleting a claimed node for everyone", () => {
      expect(
        canDeletePerson("claimer-1", "ADMIN", {
          createdById: "creator-1",
          claimedByUserId: "claimer-1",
        })
      ).toBe(false);
    });

    it("blocks non-members", () => {
      expect(
        canDeletePerson("outsider", "", {
          createdById: "creator-1",
          claimedByUserId: null,
        })
      ).toBe(false);
    });
  });

  describe("simple optional field normalization", () => {
    it("normalizes bio", () => {
      expect(normalizeBio("  hello world  ")).toBe("hello world");
    });

    it("normalizes blank bio to null", () => {
      expect(normalizeBio("   ")).toBeNull();
    });

    it("normalizes location", () => {
      expect(normalizeLocation("  San Mateo  ")).toBe("San Mateo");
    });
  });
});