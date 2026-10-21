import { describe, expect, it } from "vitest";
import {
  ASSISTS_PER_BATTLE,
  bandOf,
  BURST_QUESTIONS,
  burstAnswer,
  burstLive,
  burstHit,
  charge,
  comboOf,
  FOG_FLOOR,
  freeDamage,
  legalBeats,
  METER_SIZE,
  newBurst,
  QUIZ_CAP,
  QUIZ_TARGET,
  questionHit,
} from "../../../src/core/game/battleBeats";

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

describe("the charge meter", () => {
  it("a right answer fills one pip, up to the size", () => {
    expect(charge(0, 3, true)).toBe(1);
    expect(charge(2, 3, true)).toBe(3);
    expect(charge(3, 3, true)).toBe(3);
  });

  it("a wrong answer neither fills nor empties it", () => {
    for (const m of [0, 1, 3]) expect(charge(m, 3, false)).toBe(m);
  });

  it("the youngest fill 2 pips, the others 3, so a meter plus a burst fits in the question cap", () => {
    expect([bandOf(5), bandOf(7), bandOf(8), bandOf(10), bandOf(11), bandOf(14)]).toEqual(["A", "A", "B", "B", "C", "C"]);
    expect(METER_SIZE).toEqual({ A: 2, B: 3, C: 3 });
  });
});

describe("a Special burst", () => {
  it("is three questions, each right one landing a hit", () => {
    const b = newBurst();
    expect(BURST_QUESTIONS).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(burstLive(b)).toBe(true);
      burstAnswer(b, true);
    }
    expect(comboOf(b)).toBe(3);
    expect(burstLive(b)).toBe(false);
    expect(b.broken).toBe(false);
  });

  it("a wrong answer ends the combo: the burst is over, the hits already landed stay", () => {
    const b = newBurst();
    burstAnswer(b, true);
    burstAnswer(b, false);
    expect(burstLive(b)).toBe(false);
    expect(b.broken).toBe(true);
    expect(comboOf(b)).toBe(1);
    burstAnswer(b, true);
    expect(comboOf(b)).toBe(1);
  });

  it("each hit takes a third of the fog left at the start: three hits calm it", () => {
    expect(burstHit(30)).toBe(10);
    expect(burstHit(8)).toBe(3);
    expect(burstHit(1)).toBe(1);
    expect(3 * burstHit(8)).toBeGreaterThanOrEqual(8);
  });
});

describe("the questions of a battle, by age", () => {
  it("3, 4 and 5 fog questions for ages 5 to 7, 8 to 10 and 11 to 14", () => {
    expect([QUIZ_TARGET.A, QUIZ_TARGET.B, QUIZ_TARGET.C]).toEqual([3, 4, 5]);
    expect(QUIZ_TARGET[bandOf(6)]).toBe(3);
    expect(QUIZ_TARGET[bandOf(9)]).toBe(4);
    expect(QUIZ_TARGET[bandOf(12)]).toBe(5);
  });

  it("with hard caps of 5, 7 and 8 including the wrong ones", () => {
    expect([QUIZ_CAP.A, QUIZ_CAP.B, QUIZ_CAP.C]).toEqual([5, 7, 8]);
    for (const b of ["A", "B", "C"] as const) expect(QUIZ_CAP[b]).toBeGreaterThan(QUIZ_TARGET[b]);
  });

  it("a meter plus the burst fits in every cap (Special can be reached)", () => {
    for (const b of ["A", "B", "C"] as const) expect(METER_SIZE[b] + BURST_QUESTIONS).toBeLessThanOrEqual(QUIZ_CAP[b]);
  });

  it("a right answer takes the half of the fog that free beats cannot, shared over the target", () => {
    expect(questionHit(14, 36, 3)).toBe(6);
    expect(questionHit(14, 36, 4)).toBe(5);
    expect(questionHit(14, 36, 5)).toBe(4);
    expect(questionHit(3, 36, 3)).toBe(3);
    expect(questionHit(0, 36, 3)).toBe(1);
  });

  it("so the target in right answers is enough once free beats took their half", () => {
    for (const b of ["A", "B", "C"] as const) {
      for (const maxHp of [24, 36, 60, 72]) {
        const hit = questionHit(99, maxHp, QUIZ_TARGET[b]);
        expect(hit * QUIZ_TARGET[b]).toBeGreaterThanOrEqual(Math.floor(maxHp / 2));
      }
    }
  });
});
