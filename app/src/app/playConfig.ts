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

/**
 * Test hooks for the browser tests, as the quiz seed: a map to start on
 * (instead of Hearthrock), and an encounter in every step in the grass.
 * Never set on a phone.
 */
export const START_MAP_KEY = "nagmon.map.start";
export const ENCOUNTER_KEY = "nagmon.encounter.always";

export function testStartMap(): string | undefined {
  try {
    const v = localStorage.getItem(START_MAP_KEY);
    return v && /^[a-z0-9_]+$/.test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function testAlwaysEncounter(): boolean {
  try {
    return localStorage.getItem(ENCOUNTER_KEY) === "1";
  } catch {
    return false;
  }
}
