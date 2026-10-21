import { describe, expect, it } from "vitest";
import { ASSISTS_PER_BATTLE, FOG_FLOOR, freeDamage, legalBeats } from "../../../src/core/game/battleBeats";

const base = { fighting: true, lastWasQuestion: false, meterFull: false, assistsLeft: ASSISTS_PER_BATTLE };

describe("which beats a child may pick", () => {
  it("at the start all three cards are open", () => {
    expect(legalBeats(base)).toEqual({ move: true, power: true, assist: true, special: false });
  });

  it("never two question beats in a row: after a question the Power-up rests, and the free cards stay", () => {
    expect(legalBeats({ ...base, lastWasQuestion: true })).toEqual({ move: true, power: false, assist: true, special: false });
  });

  it("a full meter swaps Move for Special, but only on a free beat (no question right before)", () => {
    expect(legalBeats({ ...base, meterFull: true })).toEqual({ move: false, power: true, assist: true, special: true });
    expect(legalBeats({ ...base, meterFull: true, lastWasQuestion: true })).toEqual({ move: true, power: false, assist: true, special: false });
  });

  it("the friend assist is limited: none left, none offered", () => {
    expect(legalBeats({ ...base, assistsLeft: 0 }).assist).toBe(false);
  });

  it("there is always something to pick while fighting (never stuck)", () => {
    for (const lastWasQuestion of [false, true])
      for (const meterFull of [false, true])
        for (const assistsLeft of [0, 1, 2]) {
          const l = legalBeats({ ...base, lastWasQuestion, meterFull, assistsLeft });
          expect(l.move || l.power || l.special).toBe(true);
        }
  });

  it("when the fight is over nothing is open", () => {
    expect(legalBeats({ ...base, fighting: false })).toEqual({ move: false, power: false, assist: false, special: false });
  });
});

describe("a free beat's damage", () => {
  it("is about a third of a right answer", () => {
    expect(freeDamage(36, 36, 14)).toBe(5);
    expect(freeDamage(36, 36, 2)).toBe(1);
  });

  it("can only take the fog down to 50%, never below", () => {
    expect(FOG_FLOOR).toBe(0.5);
    expect(freeDamage(20, 36, 14)).toBe(2);
    expect(freeDamage(18, 36, 14)).toBe(0);
    expect(freeDamage(5, 36, 14)).toBe(0);
  });

  it("an odd fog rounds the floor up: the fog stays at or above half", () => {
    expect(freeDamage(19, 37, 30)).toBe(0);
    expect(freeDamage(20, 37, 30)).toBe(1);
  });
});
