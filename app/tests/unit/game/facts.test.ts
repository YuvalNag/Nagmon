import { describe, expect, it } from "vitest";
import { factIds, facts, factsOf, SUBJECTS } from "../../../src/core/game/facts";
import { gameJson } from "./helpers";

describe("the fact base", () => {
  it("reads a fact with its picture, its subject and its line; one with a line missing is left out", () => {
    const f = facts({
      facts: {
        a: { emoji: "1f989", subject: "science", text_he: " שלום " },
        b: { emoji: "1f989", subject: "math", text_he: "" },
        c: { subject: "math", text_he: "x" },
        d: { emoji: "1f4a7", text_he: "בלי נושא" },
      },
    });
    expect(Object.keys(f)).toEqual(["a", "d"]);
    expect(f["a"]).toEqual({ emoji: "1f989", text: "שלום", subject: "science" });
    // an old fact with no subject belongs to science, as the first six did
    expect(f["d"]!.subject).toBe("science");
  });

  it("the shipped base has at least 60 facts, every subject, each at most 70 characters", () => {
    const all = facts(gameJson("facts.json"));
    expect(factIds(all).length).toBeGreaterThanOrEqual(60);
    for (const s of SUBJECTS) expect(factsOf(all, s).length, s).toBeGreaterThanOrEqual(5);
    for (const [id, f] of Object.entries(all)) expect(f.text.length, id).toBeLessThanOrEqual(70);
  });

  it("lists the ids in a stable order (sorted by id), so a day's pick never changes with the file order", () => {
    const f = facts({ facts: { z: { emoji: "1", subject: "math", text_he: "z" }, a: { emoji: "1", subject: "math", text_he: "a" } } });
    expect(factIds(f)).toEqual(["a", "z"]);
  });
});
