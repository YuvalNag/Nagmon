import { describe, expect, it } from "vitest";
import { INTRO_DONE, finishIntro, introNeeded } from "../../../src/core/game/intro";
import { WorldState } from "../../../src/core/world/worldState";

describe("the intro's end", () => {
  it("is needed until it is done", () => {
    const w = new WorldState();
    expect(introNeeded(w)).toBe(true);
    finishIntro(w, "agnite", 7);
    expect(introNeeded(w)).toBe(false);
  });

  it("gives the chosen creature as the partner and marks the old script's steps as done, so no script plays the intro twice", () => {
    const w = new WorldState();
    finishIntro(w, "kroki", 5);
    expect(w.creatures.map((c) => [c.species, c.level])).toEqual([["kroki", 5]]);
    for (const k of ["nagmon_started", "nagmon_intro_seen", "nagmon_has_starter", "nagmon_gifts", INTRO_DONE]) expect(w.variables.get(k)).toBe("yes");
    expect(w.variables.get("nagmon_starter")).toBe("kroki");
  });

  it("a child who already has a creature is not given another and does not meet the owl's intro again", () => {
    const w = new WorldState();
    finishIntro(w, "kroki", 5);
    finishIntro(w, "agnite", 5);
    expect(w.creatures).toHaveLength(1);
  });
});
