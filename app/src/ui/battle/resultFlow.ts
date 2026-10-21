/**
 * What the battle shows around one answer, as a small state machine
 * (no React, no clock of its own: the caller passes `now`).
 *
 *   asking --answered--> result --(time, a tap, or "why?" then a tap)--> done
 *
 * The result plays in the arena at the moment of the answer; the line
 * under it (the message box) stays about 1.5 s and closes by itself.
 * "Why?" holds it open to read the explanation; a tap anywhere skips
 * the wait, but not in the first moments (a double tap on the answer
 * must not close the line it just opened).
 */

/** How long the line stays: a right answer; a wrong one also names the right answer, so a little longer. */
export const RIGHT_MS = 1500;
export const WRONG_MS = 2200;
/** A tap this soon after the result began is the answer's own: it skips nothing. */
export const SKIP_GUARD_MS = 300;

export type Flow =
  | { k: "asking" }
  | { k: "result"; correct: boolean; at: number; holdMs: number; why: boolean }
  | { k: "done" };

export const asking = (): Flow => ({ k: "asking" });

export function answered(correct: boolean, now: number): Flow {
  return { k: "result", correct, at: now, holdMs: correct ? RIGHT_MS : WRONG_MS, why: false };
}

/** The "why?" chip: the explanation shows, and the line waits for a tap. */
export function openWhy(f: Flow): Flow {
  return f.k === "result" ? { ...f, why: true } : f;
}

/** A tap anywhere: skips the wait (after the guard). */
export function tapped(f: Flow, now: number): Flow {
  if (f.k !== "result" || now - f.at < SKIP_GUARD_MS) return f;
  return { k: "done" };
}

/** Time passes: the line closes by itself unless "why?" holds it. */
export function ticked(f: Flow, now: number): Flow {
  if (f.k !== "result" || f.why || now - f.at < f.holdMs) return f;
  return { k: "done" };
}

/** Milliseconds until the line closes by itself; null when it does not (no result, or held by "why?"). */
export function remainingMs(f: Flow, now: number): number | null {
  if (f.k !== "result" || f.why) return null;
  return Math.max(0, f.holdMs - (now - f.at));
}
