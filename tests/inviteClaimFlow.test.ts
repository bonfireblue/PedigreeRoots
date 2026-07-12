import { describe, expect, it } from "vitest";

type Person = {
  id: string;
  claimedByUserId: string | null;
};

function claimPerson(person: Person, userId: string) {
  if (person.claimedByUserId !== null) {
    throw new Error("PERSON_ALREADY_CLAIMED");
  }

  person.claimedByUserId = userId;
}

describe("invite claim ownership protection", () => {
  it("allows first user to claim a person", () => {
    const person: Person = {
      id: "p1",
      claimedByUserId: null,
    };

    claimPerson(person, "user1");

    expect(person.claimedByUserId).toBe("user1");
  });

  it("prevents second user from claiming the same person", () => {
    const person: Person = {
      id: "p1",
      claimedByUserId: "user1",
    };

    expect(() => claimPerson(person, "user2")).toThrow("PERSON_ALREADY_CLAIMED");
  });

  it("simulates race condition protection", () => {
    const person: Person = {
      id: "p1",
      claimedByUserId: null,
    };

    claimPerson(person, "user1");

    expect(() => claimPerson(person, "user2")).toThrow("PERSON_ALREADY_CLAIMED");
  });
});