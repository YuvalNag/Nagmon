/**
 * The battle's one-off animations (docs/app/BATTLE_V3.md, section 10): the Web
 * Animations API behind a few small functions. Zero dependencies. `play`
 * returns a Promise so a sequence reads top to bottom; `speed` and `skip`
 * act on everything running ("tap to speed up, tap again to skip"); the calm
 * switch (and the system's reduce-motion) turns movement off: nothing shakes,
 * only fades still play. Without `element.animate` (a very old WebView, the
 * jsdom of the unit tests) every call finishes at once, and the screen
 * still shows the right state.
 */

let calmOn = false;
let rate = 1;
const running = new Set<Animation>();

/** The calm-effects switch of the child (the parents' setting and the system's reduce-motion). */
export function setCalm(on: boolean): void {
  calmOn = on;
}

export const isCalm = (): boolean => calmOn;

export interface PlayOptions {
  /** Milliseconds (at normal speed). */
  ms: number;
  easing?: string;
  delay?: number;
  /** A fade or a colour change: it plays even in calm mode (only movement is switched off). */
  fade?: boolean;
}

/** Plays keyframes on an element; resolves when they finish (at once when there is nothing to play). */
export function play(el: Element | null | undefined, keyframes: Keyframe[], o: PlayOptions): Promise<void> {
  if (!el || typeof (el as HTMLElement).animate !== "function" || (calmOn && !o.fade)) return Promise.resolve();
  let a: Animation;
  try {
    a = (el as HTMLElement).animate(keyframes, { duration: o.ms, easing: o.easing ?? "ease-out", delay: o.delay ?? 0, fill: "none" });
  } catch {
    return Promise.resolve();
  }
  a.playbackRate = rate;
  running.add(a);
  const done = () => {
    running.delete(a);
  };
  return a.finished.then(done, done);
}

/** Runs the steps one after the other. */
export async function seq(steps: (() => Promise<void>)[]): Promise<void> {
  for (const s of steps) await s();
}

/** Everything now playing, and what plays next, goes this much faster (1 is normal). */
export function speed(r: number): void {
  rate = Math.max(0.1, r);
  for (const a of running) a.playbackRate = rate;
}

/** Back to normal speed for the next sequence. */
export function reset(): void {
  speed(1);
}

/** Jumps everything playing to its end. */
export function skip(): void {
  for (const a of [...running]) {
    try {
      a.finish();
    } catch {
      /* already finished */
    }
  }
  running.clear();
}

/** How many animations are playing (the tests read it). */
export const playing = (): number => running.size;

/** A small sideways shake (at most 6 px, 200 ms, once): the creature that was hit. */
export function shake(el: Element | null | undefined, px = 5): Promise<void> {
  const d = Math.min(6, px);
  return play(el, [{ transform: "translateX(0)" }, { transform: `translateX(${-d}px)` }, { transform: `translateX(${d}px)` }, { transform: `translateX(${-d / 2}px)` }, { transform: "translateX(0)" }], { ms: 200, easing: "ease-in-out" });
}

/** A soft dip and back (one pulse, never faster than 300 ms, so never a flash in the WCAG sense): a hit lands. */
export function flash(el: Element | null | undefined): Promise<void> {
  return play(el, [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], { ms: 320, easing: "ease-in-out", fade: true });
}

/** A step toward the other creature and back: an attack. `dir` is -1 toward the start edge, 1 toward the end edge. */
export function lunge(el: Element | null | undefined, dir: 1 | -1, px = 40): Promise<void> {
  return play(el, [{ transform: "translateX(0)" }, { transform: `translateX(${dir * px}px)`, offset: 0.4 }, { transform: "translateX(0)" }], { ms: 420, easing: "ease-in-out" });
}
