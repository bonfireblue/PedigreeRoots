import { describe, expect, it } from "vitest";
import { canViewPerson } from "@/lib/personRules";

describe("person visibility rules", () => {
  const publicRow = {
    createdById: "creator-1",
    claimedByUserId: null,
    isPrivate: false,
  };

  const privateRow = {
    createdById: "creator-1",
    claimedByUserId: "claimer-1",
    isPrivate: true,
  };

  it("allows anyone in graph membership to view a public person", () => {
    expect(canViewPerson("member-1", false, "MEMBER", publicRow)).toBe(true);
  });

  it("blocks normal member from viewing private person", () => {
    expect(canViewPerson("member-1", false, "MEMBER", privateRow)).toBe(false);
  });

  it("allows creator to view private person", () => {
    expect(canViewPerson("creator-1", false, "MEMBER", privateRow)).toBe(true);
  });

  it("allows claimer to view private person", () => {
    expect(canViewPerson("claimer-1", false, "MEMBER", privateRow)).toBe(true);
  });

  it("allows admin role to view private person", () => {
    expect(canViewPerson("member-1", false, "ADMIN", privateRow)).toBe(true);
  });

  it("allows trusted role to view private person", () => {
    expect(canViewPerson("member-1", false, "TRUSTED", privateRow)).toBe(true);
  });

  it("allows global admin to view private person", () => {
    expect(canViewPerson("member-1", true, "MEMBER", privateRow)).toBe(true);
  });
});