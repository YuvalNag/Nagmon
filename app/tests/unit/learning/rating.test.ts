// @vitest-environment node
/** R1-R7: Elo in logit scale (test_learning_rating.py). */
import { describe, expect, it } from "vitest";
import { PyRandom } from "../../../src/core/learning/random";
import { eloUpdate, guessRate, initialTheta, kFactor, pCorrect, sigmoid } from "../../../src/core/learning/rating";

function simulate(trueTheta: number, seed: number, n = 300): number {
  const rng = new PyRandom(seed);
  let theta = 0.0;
  const offsets = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const item = rng.randrange(400);
    const bTrue = rng.uniform(-2, 2);
    const b = bTrue + (offsets.get(item) ?? 0.0);
    const guess = i % 2 ? 0.25 : 0.0;
    const correct = rng.random() < pCorrect(trueTheta, bTrue, guess);
    const upd = eloUpdate(theta, b, correct, { guess, nLearner: i });
    theta = upd.theta;
    offsets.set(item, upd.b - bTrue);
  }
  return theta;
}

describe("rating", () => {
  it("r1 p_correct with guess", () => {
    expect(pCorrect(0.0, 0.0, 0.25)).toBeCloseTo(0.625, 12);
    expect(pCorrect(1.0, 0.0)).toBeCloseTo(sigmoid(1.0), 12);
    expect(guessRate("choice", 4)).toBeCloseTo(0.25, 12);
    expect(guessRate("true_false", 2)).toBeCloseTo(0.5, 12);
    expect(guessRate("number", 0)).toBe(0.0);
    expect(guessRate("order", 3)).toBeCloseTo(1 / 6, 12);
  });

  it("r2 k factor decreasing", () => {
    const ks: number[] = [];
    for (let n = 0; n < 300; n += 10) ks.push(kFactor(n, 0.6, 0.12, 12));
    for (let i = 1; i < ks.length; i++) expect(ks[i - 1]!).toBeGreaterThan(ks[i]!);
    expect(ks[0]).toBeCloseTo(0.6, 12);
    expect(Math.min(...ks)).toBeGreaterThanOrEqual(0.12);
  });

  it("r3 direction", () => {
    const up = eloUpdate(0.0, 0.0, true);
    const down = eloUpdate(0.0, 0.0, false);
    expect(up.theta).toBeGreaterThan(0);
    expect(down.theta).toBeLessThan(0);
    expect(up.b).toBeLessThan(0);
    expect(down.b).toBeGreaterThan(0);
    expect(up.theta).toBeCloseTo(-down.theta, 12);
  });

  it("r4 speed only bonus when timer on", () => {
    const fast = eloUpdate(0, 0, true, { elapsedS: 1, deadlineS: 20, timer: true });
    const slow = eloUpdate(0, 0, true, { elapsedS: 19, deadlineS: 20, timer: true });
    expect(fast.theta).toBeGreaterThan(slow.theta);
    expect(slow.theta).toBeGreaterThan(0);
    const fastW = eloUpdate(0, 0, false, { elapsedS: 1, deadlineS: 20, timer: true });
    const slowW = eloUpdate(0, 0, false, { elapsedS: 19, deadlineS: 20, timer: true });
    expect(fastW.theta).toBeCloseTo(slowW.theta, 12);
    const offFast = eloUpdate(0, 0, true, { elapsedS: 1, deadlineS: 20 });
    const offSlow = eloUpdate(0, 0, true, { elapsedS: 19, deadlineS: 20 });
    expect(offFast.theta).toBeCloseTo(offSlow.theta, 12);
    // Very slow correct never lowers the rating.
    const verySlow = eloUpdate(2.0, 0.0, true, { elapsedS: 999, deadlineS: 20, timer: true });
    expect(verySlow.theta).toBeGreaterThanOrEqual(2.0);
  });

  it("r5 half weight", () => {
    const full = eloUpdate(0, 0, false);
    const half = eloUpdate(0, 0, false, { weight: 0.5 });
    expect(half.theta).toBeCloseTo(full.theta / 2, 12);
  });

  it.each([-1.0, 0.0, 1.5])("r6 convergence to theta*=%d", (trueTheta) => {
    let est = 0;
    for (let s = 0; s < 5; s++) est += simulate(trueTheta, s);
    est /= 5;
    expect(Math.abs(est - trueTheta)).toBeLessThan(0.6);
  });

  it("r7 initial theta", () => {
    expect(initialTheta(3, 3)).toBe(0.0);
    expect(initialTheta(5, 3)).toBeCloseTo(1.6, 12);
    expect(initialTheta(0, 9)).toBeCloseTo(-2.4, 12);
    expect(initialTheta(9, 0)).toBeCloseTo(2.4, 12);
    expect(Number.isFinite(initialTheta(null, 2))).toBe(true);
  });
});
