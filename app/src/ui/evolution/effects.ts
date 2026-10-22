/**
 * What moves in each beat of the evolution animation (docs/app/BATTLE_V3.md 7.4), as plain data: the layer, the
 * keyframes, the length at normal speed and the easing. Only opacity and transform animate (the compositor runs
 * them); every colour is the subject's, set in CSS. The resting look of each beat is CSS (`[data-beat]` in
 * styles.css), so these only move between two resting looks. Safety (WCAG 2.3.1): no brightness step faster than
 * 300 ms on any layer, whatever the speed; the two pulses of B3 are 1.5 Hz.
 */
import type { BeatId } from "./timeline";

export type Layer = "dim" | "glow" | "ring" | "creature" | "old" | "oldSil" | "new" | "newSil" | "burst" | "card" | "book";

export interface Step {
  layer: Layer;
  keyframes: Keyframe[];
  /** Milliseconds at normal speed. */
  ms: number;
  easing: string;
  /** Delay inside the beat, milliseconds at normal speed. */
  delay?: number;
  /** A fade: it plays in calm mode too (movement does not). */
  fade?: boolean;
}

export const EASE = {
  outCubic: "cubic-bezier(0.215,0.61,0.355,1)",
  inOutSine: "cubic-bezier(0.37,0,0.63,1)",
  backOut: "cubic-bezier(0.34,1.56,0.64,1)",
  outExpo: "cubic-bezier(0.16,1,0.3,1)",
  inCubic: "cubic-bezier(0.55,0.055,0.675,0.19)",
} as const;

/** A step of an opacity change may not be quicker than this (milliseconds). */
export const MIN_FADE_MS = 300;

const T = (s: number, x = 0, y = 0) => `translate(${x}px, ${y}px) scale(${s})`;

/** The steps of one beat of the long version (the lengths are the spec's table; the clock scales them). */
export function stepsOf(beat: BeatId): Step[] {
  switch (beat) {
    case "B0":
      return [{ layer: "dim", keyframes: [{ opacity: 0 }, { opacity: 0.6 }], ms: 400, easing: EASE.outCubic, fade: true }];
    case "B1":
      return [
        { layer: "creature", keyframes: [{ transform: T(1) }, { transform: T(1.3) }], ms: 600, easing: EASE.backOut },
        { layer: "glow", keyframes: [{ opacity: 0 }, { opacity: 0.6 }], ms: 800, easing: EASE.inOutSine, fade: true },
      ];
    case "B2":
      return [
        { layer: "ring", keyframes: [{ opacity: 0, transform: "scale(0.8)" }, { opacity: 0.8, transform: "scale(1.1)" }], ms: 1800, easing: EASE.inOutSine, fade: true },
        // a gentle bob of 4 px, 1.2 s, then still (the resting scale stays 1.3)
        { layer: "creature", keyframes: [{ transform: T(1.3, 0, 0) }, { transform: T(1.3, 0, -4) }, { transform: T(1.3, 0, 0) }], ms: 1200, easing: EASE.inOutSine },
      ];
    case "B3":
      return [
        { layer: "oldSil", keyframes: [{ opacity: 0 }, { opacity: 1 }], ms: 900, easing: EASE.inOutSine, fade: true },
        // two slow pulses, 1.3 to 1.38 (1.5 Hz): never a flash
        { layer: "creature", keyframes: [{ transform: T(1.3) }, { transform: T(1.38) }, { transform: T(1.3) }, { transform: T(1.38) }, { transform: T(1.3) }], ms: 1200, easing: EASE.inOutSine },
      ];
    case "B4":
      return [
        { layer: "oldSil", keyframes: [{ opacity: 1, transform: T(1.38) }, { opacity: 0, transform: T(0.9) }], ms: 700, easing: EASE.inOutSine, fade: true },
        { layer: "newSil", keyframes: [{ opacity: 0, transform: T(0.8) }, { opacity: 1, transform: T(1) }], ms: 700, easing: EASE.inOutSine, fade: true },
        { layer: "ring", keyframes: [{ transform: "rotate(0deg) scale(1.1)" }, { transform: "rotate(360deg) scale(1.1)" }], ms: 1200, easing: EASE.inOutSine },
      ];
    case "B5":
      return [
        { layer: "burst", keyframes: [{ opacity: 0.7, transform: "scale(0)" }, { opacity: 0, transform: "scale(1.8)" }], ms: 800, easing: EASE.outExpo, fade: true },
        { layer: "dim", keyframes: [{ opacity: 0.6 }, { opacity: 0 }], ms: 600, easing: EASE.inOutSine, fade: true },
      ];
    case "B6":
      return [
        { layer: "newSil", keyframes: [{ opacity: 1 }, { opacity: 0 }], ms: 600, easing: EASE.inOutSine, fade: true },
        // a small hop: 1.0, 1.15, 0.95, 1.0 and 16 px up
        { layer: "creature", keyframes: [{ transform: T(1, 0, 0) }, { transform: T(1.15, 0, -16) }, { transform: T(0.95, 0, 0) }, { transform: T(1, 0, 0) }], ms: 650, easing: EASE.backOut },
      ];
    case "B7":
      return [
        { layer: "card", keyframes: [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }], ms: 400, easing: EASE.backOut },
        { layer: "book", keyframes: [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], ms: 1000, easing: EASE.inOutSine, delay: 400 },
      ];
    case "B8":
      return [];
    case "B9":
      return [
        { layer: "card", keyframes: [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(40%)" }], ms: 500, easing: EASE.inOutSine, fade: true },
        { layer: "creature", keyframes: [{ transform: T(1) }, { transform: T(0.4, 0, 40) }], ms: 500, easing: EASE.inOutSine },
      ];
    case "calm":
      // the calm version: one crossfade of the two pictures under a still halo; nothing scales or flies
      return [
        { layer: "old", keyframes: [{ opacity: 1 }, { opacity: 0 }], ms: 1600, easing: EASE.inOutSine, fade: true },
        { layer: "new", keyframes: [{ opacity: 0 }, { opacity: 1 }], ms: 1600, easing: EASE.inOutSine, fade: true },
      ];
  }
}

/**
 * The length a step plays for when its beat runs at `rate` times normal speed: the speed-up applies to movement, but
 * a fade of a layer is never quicker than 300 ms (nothing flashes, even when skipping).
 */
export function lengthAt(step: Step, rate: number): number {
  const ms = step.ms / Math.max(1, rate);
  return step.fade ? Math.max(MIN_FADE_MS, ms) : ms;
}

/** How many pulses a second a beat has at most (the acceptance: no more than two). */
export function pulsesPerSecond(beat: BeatId): number {
  const p = stepsOf(beat).find((s) => s.layer === "creature" && s.keyframes.length > 4);
  if (!p) return 0;
  return ((p.keyframes.length - 1) / 2 / p.ms) * 1000;
}
