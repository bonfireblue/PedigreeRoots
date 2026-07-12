import { describe, expect, it } from "vitest";
import {
  RelationshipError,
  assertCanEditRelationship,
  assertNonEmptyIds,
  assertNotSelf,
  assertSameFamilyGraph,
  normalizeSpousePair,
} from "@/lib/relationshipRules";

describe("relationshipRules basic unit logic", () => {
  describe("normalizeSpousePair", () => {
    it("keeps sorted order when already sorted", () => {
      expect(normalizeSpousePair("a", "b")).toEqual(["a", "b"]);
    });

    it("normalizes reverse order", () => {
      expect(normalizeSpousePair("b", "a")).toEqual(["a", "b"]);
    });
  });

  describe("assertNonEmptyIds", () => {
    it("accepts non-empty ids", () => {
      expect(() => assertNonEmptyIds(["p1", "p2"])).not.toThrow();
    });

    it("rejects empty ids", () => {
      expect(() => assertNonEmptyIds(["p1", ""])).toThrow(RelationshipError);
    });

    it("rejects null or undefined ids", () => {
      expect(() => assertNonEmptyIds(["p1", null])).toThrow(RelationshipError);
      expect(() => assertNonEmptyIds(["p1", undefined])).toThrow(RelationshipError);
    });
  });

  describe("assertCanEditRelationship (open-editing model)", () => {
    const member = { id: "user-1", email: "u1@example.com", isAdmin: false };
    const admin = { id: "admin-1", email: "admin@example.com", isAdmin: true };

    it("allows any member of the graph, regardless of who created the people", () => {
      expect(() => assertCanEditRelationship(member, "MEMBER")).not.toThrow();
    });

    it("allows founders and trusted members", () => {
      expect(() => assertCanEditRelationship(member, "FOUNDER")).not.toThrow();
      expect(() => assertCanEditRelationship(member, "TRUSTED")).not.toThrow();
    });

    it("blocks non-members", () => {
      expect(() => assertCanEditRelationship(member, null)).toThrow(RelationshipError);
      try {
        assertCanEditRelationship(member, null);
      } catch (error) {
        expect((error as RelationshipError).status).toBe(403);
      }
    });

    it("allows global admins even without membership", () => {
      expect(() => assertCanEditRelationship(admin, null)).not.toThrow();
    });
  });

  describe("assertSameFamilyGraph (cross-graph links stay blocked)", () => {
    it("allows two people in the same graph", () => {
      expect(() =>
        assertSameFamilyGraph({ familyGraphId: "g1" }, { familyGraphId: "g1" })
      ).not.toThrow();
    });

    it("blocks people in different graphs", () => {
      expect(() =>
        assertSameFamilyGraph({ familyGraphId: "g1" }, { familyGraphId: "g2" })
      ).toThrow(RelationshipError);
    });

    it("blocks people without a graph", () => {
      expect(() =>
        assertSameFamilyGraph({ familyGraphId: null }, { familyGraphId: "g2" })
      ).toThrow(RelationshipError);
    });
  });

  describe("assertNotSelf", () => {
    it("accepts different ids", () => {
      expect(() => assertNotSelf("parent-1", "child-1")).not.toThrow();
    });

    it("rejects same ids", () => {
      expect(() => assertNotSelf("same-id", "same-id")).toThrow(RelationshipError);
    });

    it("uses the provided error code", () => {
      try {
        assertNotSelf("same-id", "same-id", "CUSTOM_SELF_ERROR");
        throw new Error("expected function to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(RelationshipError);
        expect((error as RelationshipError).code).toBe("CUSTOM_SELF_ERROR");
      }
    });
  });
});