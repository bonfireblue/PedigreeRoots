import { describe, expect, it } from "vitest";
import {
  CHANGE_VALUE_MAX_LEN,
  decodeActivityCursor,
  diffPersonFields,
  encodeActivityCursor,
  serializeValue,
} from "@/lib/changeLog";
import { canVouchDespiteBeingInviter } from "@/lib/invitationRules";

describe("changeLog helpers", () => {
  describe("serializeValue", () => {
    it("passes strings through", () => {
      expect(serializeValue("hello")).toBe("hello");
    });

    it("returns null for null/undefined", () => {
      expect(serializeValue(null)).toBeNull();
      expect(serializeValue(undefined)).toBeNull();
    });

    it("serializes dates as ISO strings", () => {
      expect(serializeValue(new Date("2020-01-02T00:00:00.000Z"))).toBe("2020-01-02T00:00:00.000Z");
    });

    it("serializes booleans and numbers as JSON", () => {
      expect(serializeValue(true)).toBe("true");
      expect(serializeValue(42)).toBe("42");
    });

    it("truncates long values at 500 chars", () => {
      const long = "x".repeat(2000);
      expect(serializeValue(long)).toHaveLength(CHANGE_VALUE_MAX_LEN);
    });
  });

  describe("diffPersonFields", () => {
    const before = {
      fullName: "Chau Tat",
      bio: null,
      birthDate: new Date("1950-06-01T00:00:00.000Z"),
      isPrivate: false,
    };

    it("returns one row per changed field, ignoring unchanged fields", () => {
      const changes = diffPersonFields(before, {
        fullName: "Chau Edit",
        bio: "A story",
        isPrivate: false, // unchanged
      });

      expect(changes).toHaveLength(2);
      expect(changes).toContainEqual({
        field: "fullName",
        oldValue: "Chau Tat",
        newValue: "Chau Edit",
      });
      expect(changes).toContainEqual({
        field: "bio",
        oldValue: null,
        newValue: "A story",
      });
    });

    it("treats equal dates as unchanged even across Date instances", () => {
      const changes = diffPersonFields(before, {
        birthDate: new Date("1950-06-01T00:00:00.000Z"),
      });
      expect(changes).toHaveLength(0);
    });

    it("records date changes with ISO values", () => {
      const changes = diffPersonFields(before, {
        birthDate: new Date("1951-01-01T00:00:00.000Z"),
      });
      expect(changes).toEqual([
        {
          field: "birthDate",
          oldValue: "1950-06-01T00:00:00.000Z",
          newValue: "1951-01-01T00:00:00.000Z",
        },
      ]);
    });

    it("records clearing a field", () => {
      const changes = diffPersonFields(before, { birthDate: null });
      expect(changes).toEqual([
        {
          field: "birthDate",
          oldValue: "1950-06-01T00:00:00.000Z",
          newValue: null,
        },
      ]);
    });

    it("truncates long values", () => {
      const changes = diffPersonFields(before, { bio: "y".repeat(9999) });
      expect(changes[0].newValue).toHaveLength(CHANGE_VALUE_MAX_LEN);
    });
  });

  describe("activity cursor (feed pagination)", () => {
    it("round-trips createdAt + id", () => {
      const createdAt = new Date("2026-07-13T12:34:56.789Z");
      const cursor = encodeActivityCursor(createdAt, "row-42");
      const decoded = decodeActivityCursor(cursor);

      expect(decoded).not.toBeNull();
      expect(decoded!.createdAt.getTime()).toBe(createdAt.getTime());
      expect(decoded!.id).toBe("row-42");
    });

    it("round-trips ids containing colons", () => {
      const createdAt = new Date();
      const decoded = decodeActivityCursor(encodeActivityCursor(createdAt, "a:b:c"));
      expect(decoded!.id).toBe("a:b:c");
    });

    it("rejects garbage cursors", () => {
      expect(decodeActivityCursor("not-a-cursor")).toBeNull();
      expect(decodeActivityCursor("")).toBeNull();
      expect(decodeActivityCursor(Buffer.from("nonsense", "utf8").toString("base64url"))).toBeNull();
    });
  });
});

describe("vouch bootstrap rule (Phase 1d)", () => {
  it("founders may vouch for their own invitees", () => {
    expect(canVouchDespiteBeingInviter("FOUNDER")).toBe(true);
  });

  it("members, trusted, and admins may not vouch for their own invitees", () => {
    expect(canVouchDespiteBeingInviter("MEMBER")).toBe(false);
    expect(canVouchDespiteBeingInviter("TRUSTED")).toBe(false);
    expect(canVouchDespiteBeingInviter("ADMIN")).toBe(false);
  });
});
