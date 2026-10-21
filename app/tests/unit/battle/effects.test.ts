import { describe, expect, it } from "vitest";
import { LIMITS, pickOptions, planFor } from "../../../src/ui/battle/effects";

describe("the effects plan", () => {
  it("a right answer: the attack, stars, a number, the wild creature hit, a short hit-stop", () => {
    const p = planFor(true, false);
    expect(p).toMatchObject({ attack: true, number: true, wildHit: true, oops: false, calm: false });
    expect(p.stars).toBeGreaterThanOrEqual(6);
    expect(p.stars).toBeLessThanOrEqual(LIMITS.maxParticles);
    expect(p.hitStopMs).toBeGreaterThan(0);
    expect(p.hitStopMs).toBeLessThanOrEqual(100);
  });

  it("a wrong answer is a funny oops: no attack, no number, no hit, no stars, no shake", () => {
    const p = planFor(false, false);
    expect(p).toMatchObject({ oops: true, attack: false, number: false, wildHit: false, stars: 0, shakePx: 0, shakeMs: 0 });
  });

  it("never flashes, and the shake stays inside the limits", () => {
    for (const correct of [true, false]) {
      for (const calm of [true, false]) {
        const p = planFor(correct, calm);
        expect(p.flashesPerSecond).toBe(0);
        expect(p.flashesPerSecond).toBeLessThanOrEqual(LIMITS.maxFlashesPerSecond);
        expect(p.shakePx).toBeLessThanOrEqual(LIMITS.maxShakePx);
        expect(p.shakeMs).toBeLessThanOrEqual(LIMITS.maxShakeMs);
        expect(p.stars).toBeLessThanOrEqual(LIMITS.maxParticles);
      }
    }
  });

  it("calm effects: no attack flight, no shake, no hit-stop, one static star; the result still shows", () => {
    const right = planFor(true, true);
    expect(right).toMatchObject({ calm: true, attack: false, stars: 1, shakePx: 0, shakeMs: 0, hitStopMs: 0, wildHit: false, number: true });
    const wrong = planFor(false, true);
    expect(wrong).toMatchObject({ calm: true, oops: true, stars: 0, shakePx: 0 });
  });
});

describe("the floating answers", () => {
  const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));

  it("show all of up to four, in their own order", () => {
    expect(pickOptions(cards(3), "1").map((c) => c.id)).toEqual(["0", "1", "2"]);
    expect(pickOptions(cards(4), "3").map((c) => c.id)).toEqual(["0", "1", "2", "3"]);
  });

  it("with more, show four, always with the right one", () => {
    const six = pickOptions(cards(6), "5");
    expect(six).toHaveLength(4);
    expect(six.map((c) => c.id)).toContain("5");
    expect(six.map((c) => c.id)).toEqual(["0", "1", "2", "5"]);
    expect(pickOptions(cards(6), "0").map((c) => c.id)).toEqual(["0", "1", "2", "3"]);
    // an answer that is not among them: the first four
    expect(pickOptions(cards(6), "x")).toHaveLength(4);
  });
});
