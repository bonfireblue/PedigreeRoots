import { describe, expect, it } from "vitest";
import {
  PersonError,
  applyFieldVisibility,
  normalizeFieldVisibility,
} from "@/lib/personRules";
import {
  RelationshipError,
  normalizeParentChildType,
  normalizeRelationshipDate,
  normalizeSpouseStatus,
} from "@/lib/relationshipRules";
import { diffPersonFields } from "@/lib/changeLog";

describe("relationship types (Phase 3c)", () => {
  it("accepts every documented parent-child type", () => {
    for (const t of ["biological", "adopted", "step", "guardian"]) {
      expect(normalizeParentChildType(t)).toBe(t);
    }
  });

  it("null/empty clears the type; undefined means no change", () => {
    expect(normalizeParentChildType(null)).toBeNull();
    expect(normalizeParentChildType("")).toBeNull();
    expect(normalizeParentChildType(undefined)).toBeUndefined();
  });

  it("rejects unknown types", () => {
    expect(() => normalizeParentChildType("cousin")).toThrow(RelationshipError);
  });

  it("accepts every documented spouse status and rejects others", () => {
    for (const s of ["married", "partner", "divorced", "widowed"]) {
      expect(normalizeSpouseStatus(s)).toBe(s);
    }
    expect(() => normalizeSpouseStatus("engaged")).toThrow(RelationshipError);
    expect(normalizeSpouseStatus(undefined)).toBeUndefined();
  });

  it("parses relationship dates and rejects garbage", () => {
    expect(normalizeRelationshipDate("2001-06-15")).toBeInstanceOf(Date);
    expect(normalizeRelationshipDate(null)).toBeNull();
    expect(normalizeRelationshipDate(undefined)).toBeUndefined();
    expect(() => normalizeRelationshipDate("not-a-date")).toThrow(RelationshipError);
  });
});

describe("per-field privacy (Phase 3d)", () => {
  describe("normalizeFieldVisibility", () => {
    it("accepts known fields with valid values, dropping redundant 'family'", () => {
      expect(
        normalizeFieldVisibility({ birthDate: "private", currentLocation: "family" })
      ).toEqual({ birthDate: "private" });
    });

    it("rejects unknown fields", () => {
      expect(() => normalizeFieldVisibility({ fullName: "private" })).toThrow(PersonError);
    });

    it("rejects unknown values", () => {
      expect(() => normalizeFieldVisibility({ birthDate: "hidden" })).toThrow(PersonError);
    });

    it("rejects arrays and non-objects", () => {
      expect(() => normalizeFieldVisibility(["birthDate"])).toThrow(PersonError);
      expect(() => normalizeFieldVisibility("private")).toThrow(PersonError);
    });

    it("undefined = no change, null = clear", () => {
      expect(normalizeFieldVisibility(undefined)).toBeUndefined();
      expect(normalizeFieldVisibility(null)).toBeNull();
    });
  });

  describe("applyFieldVisibility", () => {
    const claimed = {
      fullName: "Rose",
      birthDate: new Date("1948-01-01"),
      currentLocation: "San Jose",
      grewUpLocation: "Hue",
      claimedByUserId: "user-rose",
      fieldVisibility: { birthDate: "private", currentLocation: "private" },
    };

    it("hides private fields from other members", () => {
      const out = applyFieldVisibility(claimed, "user-other", false);
      expect(out.birthDate).toBeNull();
      expect(out.currentLocation).toBeNull();
      expect(out.grewUpLocation).toBe("Hue"); // not marked private
      expect(out.fullName).toBe("Rose"); // never controllable
    });

    it("shows everything to the claimer", () => {
      const out = applyFieldVisibility(claimed, "user-rose", false);
      expect(out.birthDate).toEqual(claimed.birthDate);
      expect(out.currentLocation).toBe("San Jose");
    });

    it("shows everything to admins", () => {
      const out = applyFieldVisibility(claimed, "user-other", true);
      expect(out.birthDate).toEqual(claimed.birthDate);
    });

    it("ignores fieldVisibility on unclaimed persons", () => {
      const unclaimed = { ...claimed, claimedByUserId: null };
      const out = applyFieldVisibility(unclaimed, "user-other", false);
      expect(out.birthDate).toEqual(claimed.birthDate);
      expect(out.currentLocation).toBe("San Jose");
    });

    it("does not mutate the input", () => {
      const before = { ...claimed };
      applyFieldVisibility(claimed, "user-other", false);
      expect(claimed).toEqual(before);
    });
  });
});

describe("scribe attribution round-trip (Phase 3a)", () => {
  it("diffPersonFields output is attribution-agnostic (toldBy rides on the log rows)", () => {
    // The attribution itself is a passthrough column; what matters is that a
    // scribed edit produces the same field diffs as a normal edit.
    const changes = diffPersonFields(
      { grewUpLocation: null },
      { grewUpLocation: "Hue, Vietnam" }
    );
    expect(changes).toEqual([
      { field: "grewUpLocation", oldValue: null, newValue: "Hue, Vietnam" },
    ]);
  });
});

describe("duplicate matching (Phase 3b)", () => {
  // The API uses Prisma's case-insensitive equals; this pins the semantics we
  // rely on: exact name, any casing, no substring matches.
  function matchesCaseInsensitive(a: string, b: string) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  it("matches exact and case-variant names", () => {
    expect(matchesCaseInsensitive("Chau Tat", "chau tat")).toBe(true);
    expect(matchesCaseInsensitive("Chau Tat", "CHAU TAT")).toBe(true);
  });

  it("does not match different or partial names", () => {
    expect(matchesCaseInsensitive("Chau Tat", "Chau")).toBe(false);
    expect(matchesCaseInsensitive("Chau Tat", "Chau Tati")).toBe(false);
  });
});
