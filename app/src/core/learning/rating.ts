/**
 * Elo in logit scale (SDD_LEARNING section 4), a port of `rating.py`.
 *
 * `P(correct) = g + (1 - g) * sigmoid(theta - b)` where `g` is the
 * guessing rate. Response time only adds a bonus weight to *correct*
 * answers when the learner's timer is on; slowness is never penalized.
 */
import type { Question } from "./model";

/** k_max, k_min, n_half. */
export const LEARNER_K: readonly [number, number, number] = [0.6, 0.12, 12.0];
export const ITEM_K: readonly [number, number, number] = [0.4, 0.05, 20.0];
export const THETA_INIT_PER_GRADE = 0.8;
export const THETA_INIT_CLIP = 2.4;
export const SPEED_BONUS = 0.5;

/** Deadlines (seconds) for an 11-year-old; used only for the speed bonus. */
export const BASE_DEADLINE_S: Readonly<Record<string, number>> = {
  choice: 20.0,
  true_false: 12.0,
  number: 25.0,
  order: 30.0,
  letters: 30.0,
  tap_figure: 15.0,
};

export function sigmoid(x: number): number {
  if (x >= 0) return 1.0 / (1.0 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1.0 + e);
}

export function logit(p: number): number {
  const q = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  return Math.log(q / (1 - q));
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** Chance of answering correctly by guessing. */
export function guessRate(kind: string, nChoices: number): number {
  if (kind === "true_false") return 0.5;
  if ((kind === "choice" || kind === "tap_figure") && nChoices >= 2) return 1.0 / nChoices;
  if (kind === "order" && nChoices >= 2) return 1.0 / factorial(nChoices);
  return 0.0;
}

export function questionGuess(q: Question): number {
  return guessRate(q.kind, q.choices.length);
}

export function pCorrect(theta: number, b: number, guess = 0.0): number {
  return guess + (1.0 - guess) * sigmoid(theta - b);
}

/** Dynamic K: high while the estimate is new, lower as data accrues. */
export function kFactor(n: number, kMax: number, kMin: number, nHalf: number): number {
  return kMin + (kMax - kMin) / (1.0 + Math.max(n, 0) / nHalf);
}

export function ageFactor(age: number | null | undefined): number {
  if (age === null || age === undefined) return 1.3;
  return Math.min(2.0, Math.max(1.0, 1.0 + 0.15 * (11 - age)));
}

export function deadlineS(kind: string, age: number | null | undefined): number {
  return (BASE_DEADLINE_S[kind] ?? 20.0) * ageFactor(age);
}

export function initialTheta(learnerGrade: number | null | undefined, skillGrade: number): number {
  if (learnerGrade === null || learnerGrade === undefined) return 0.0;
  const raw = THETA_INIT_PER_GRADE * (learnerGrade - skillGrade);
  return Math.max(-THETA_INIT_CLIP, Math.min(THETA_INIT_CLIP, raw));
}

export interface RatingUpdate {
  readonly theta: number;
  readonly b: number;
  readonly expected: number;
  readonly weight: number;
}

export interface EloOptions {
  guess?: number;
  nLearner?: number;
  nItem?: number;
  elapsedS?: number | null;
  deadlineS?: number | null;
  timer?: boolean;
  weight?: number;
}

/**
 * One Elo step for learner `theta` and item `b`. `weight` is 0.5 for
 * "I don't know" and for correct-with-hint. With `timer` on, a fast
 * *correct* answer moves up to 1.5x more.
 */
export function eloUpdate(theta: number, b: number, correct: boolean, opts: EloOptions = {}): RatingUpdate {
  const guess = opts.guess ?? 0.0;
  const expected = pCorrect(theta, b, guess);
  const score = correct ? 1.0 : 0.0;
  let w = opts.weight ?? 1.0;
  const elapsed = opts.elapsedS;
  const deadline = opts.deadlineS;
  if (opts.timer && correct && elapsed !== null && elapsed !== undefined && deadline && deadline > 0) {
    w *= 1.0 + SPEED_BONUS * Math.max(0.0, 1.0 - elapsed / deadline);
  }
  const kTheta = kFactor(opts.nLearner ?? 0, ...LEARNER_K) * w;
  const kB = kFactor(opts.nItem ?? 0, ...ITEM_K) * w;
  const delta = score - expected;
  return { theta: theta + kTheta * delta, b: b - kB * delta, expected, weight: w };
}
