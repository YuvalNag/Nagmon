import { describe, expect, it } from "vitest";
import { ageFromProfile } from "../../../src/core/family/age";

describe("a child's age (nagmon/runtime.py age_from_profile)", () => {
  const now = new Date(2026, 9, 20);
  it("comes from the birth year, at least 3", () => {
    expect(ageFromProfile({ birthYear: 2018, grade: 2 }, now)).toBe(8);
    expect(ageFromProfile({ birthYear: 2026, grade: 0 }, now)).toBe(3);
  });
  it("or from the grade: kindergarten is 5, grade N is N + 6", () => {
    expect(ageFromProfile({ birthYear: null, grade: 0 }, now)).toBe(5);
    expect(ageFromProfile({ birthYear: null, grade: 1 }, now)).toBe(7);
    expect(ageFromProfile({ birthYear: null, grade: 4 }, now)).toBe(10);
  });
});
