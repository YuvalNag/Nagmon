/**
 * The battle's effects, decided here and drawn in CSS (src/styles.css,
 * "the battle's effects"): what moves for a right or a wrong answer, and
 * the limits that keep it kind (docs/app/BATTLE.md 4.6, 4.8).
 */

/** The hard limits. The tests hold the plan to them. */
export const LIMITS = {
  /** Particles on screen at once. */
  maxParticles: 24,
  /** Screen shake: at most once for an answer, this far and this long. */
  maxShakePx: 6,
  maxShakeMs: 200,
  /** WCAG 2.3.1: never more than three flashes in one second. */
  maxFlashesPerSecond: 3,
  /** The pause on impact. */
  hitStopMs: 80,
} as const;

export interface FxPlan {
  /** Calm effects: nothing flies or wobbles; the result shows as fades. */
  calm: boolean;
  /** The partner's attack: it lunges and a bolt of leaves and stars flies to the creature. */
  attack: boolean;
  /** Stars that burst on impact (one static star when calm). */
  stars: number;
  /** The floating damage number. */
  number: boolean;
  /** The wild creature wobbles as it is hit. */
  wildHit: boolean;
  /** The harmless "oops": the partner trips, the wild creature smirks and wobbles. */
  oops: boolean;
  hitStopMs: number;
  shakePx: number;
  shakeMs: number;
  /** Flashes a second: none, ever. */
  flashesPerSecond: number;
}

/** A wrong answer still takes a little fog (BATTLE_V3: x0.35): `weak` is that number, shown without a hit. */
export function planFor(correct: boolean, calm: boolean, weak = 0): FxPlan {
  const base = { calm, number: correct || weak > 0, flashesPerSecond: 0, shakePx: 0, shakeMs: 0, hitStopMs: 0 };
  if (calm) return { ...base, attack: false, stars: correct ? 1 : 0, wildHit: false, oops: !correct };
  return {
    ...base,
    attack: correct,
    stars: correct ? 10 : 0,
    wildHit: correct,
    oops: !correct,
    hitStopMs: correct ? LIMITS.hitStopMs : 0,
    shakePx: correct ? 5 : 0,
    shakeMs: correct ? 180 : 0,
  };
}

/** A free beat (a Move, the friend's assist): a small hit, no question behind it. */
export function planForFree(damage: number, calm: boolean): FxPlan {
  const hit = damage > 0;
  const base = { calm, number: hit, flashesPerSecond: 0, shakePx: 0, shakeMs: 0, hitStopMs: 0, oops: false };
  if (calm) return { ...base, attack: false, stars: hit ? 1 : 0, wildHit: false };
  return { ...base, attack: hit, stars: hit ? 4 : 0, wildHit: hit };
}

export { MAX_FLOATING, MAX_SHOWN } from "./presentation";

/** A choice, as far as picking the floating answers needs it. */
export interface Pickable {
  id: string;
}

/**
 * The answers that float around the creature: at most `max`, always
 * with the right one, in their own order. (Questions with more choices
 * show the right one and the first others.)
 */
export function pickOptions<T extends Pickable>(choices: readonly T[], answerId: string, max = 4): T[] {
  if (choices.length <= max) return [...choices];
  const right = choices.findIndex((c) => c.id === answerId);
  const keep = new Set<number>();
  if (right >= 0) keep.add(right);
  for (let i = 0; keep.size < max && i < choices.length; i++) keep.add(i);
  return choices.filter((_, i) => keep.has(i));
}
