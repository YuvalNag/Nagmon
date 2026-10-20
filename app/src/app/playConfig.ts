/**
 * What the map's code needs to know about play without loading the
 * learning core (that loads with the child's play, ./play.ts).
 */

/** Who the player may talk to in M4 (core/world/events.ts `talkTo`). */
export const TALK_TO: ReadonlySet<string> = new Set(["nagmon_cashier"]);

/**
 * A test hook, as `nagmon.map.adaptiveResolution`: a number here seeds
 * the question picker, so a browser test gets the same questions each
 * run, and the question showing can be read (`window.__nagmonQuiz`).
 * Never set on a phone, except by the emulator check.
 */
export const SEED_KEY = "nagmon.quiz.seed";

/** The test seed, if a test set one. */
export function testSeed(): number | null {
  try {
    const v = localStorage.getItem(SEED_KEY);
    return v !== null && /^\d+$/.test(v) ? Number(v) : null;
  } catch {
    return null;
  }
}
