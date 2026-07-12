import { describe, expect, it } from "vitest";
import {
  RelationshipError,
  assertNonEmptyIds,
  assertNotSelf,
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