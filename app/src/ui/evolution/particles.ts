/**
 * The little lights of the evolution (docs/app/BATTLE_V3.md 7.4): motes that spiral in, ribbon sparks, a burst of
 * stars, hearts. Plain DOM spans animated with the Web Animations API (no canvas: the counts are 6 to 24 and only
 * opacity and transform move), laid out here as data so the numbers can be tested. Deterministic: the same index
 * is the same light. Calm effects have none.
 */
import type { BeatId } from "./timeline";

export type Kind = "mote" | "spark" | "star" | "heart";

export interface Particle {
  kind: Kind;
  glyph: string;
  /** Milliseconds inside the beat. */
  delay: number;
  ms: number;
  /** Points of the path from the centre of the creature, in px (the first is where it starts); opacity and scale go with `fade`. */
  path: { x: number; y: number }[];
  size: number;
  /** "subject" takes the subject's colour, "white" is white. */
  tone: "subject" | "white";
}

/** The size of the area the lights travel (the screen), in px. */
export interface Area {
  w: number;
  h: number;
}

/** A pseudo-random number in [0, 1) from an index (a small hash: the lights are the same every time). */
const unit = (i: number, salt: number): number => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** B2: 16 motes spiral in from the edges (a logarithmic spiral), 1.2 to 1.6 s each, 60 ms apart. */
function motes(a: Area): Particle[] {
  return Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2 + unit(i, 1);
    const r0 = Math.hypot(a.w, a.h) * 0.45;
    const path = Array.from({ length: 6 }, (_, k) => {
      const f = k / 5;
      const r = r0 * (1 - f) ** 1.6;
      const turn = angle + f * 2.2;
      return { x: Math.cos(turn) * r, y: Math.sin(turn) * r * 0.7 };
    });
    return { kind: "mote", glyph: "✦", delay: i * 60, ms: 1200 + Math.round(unit(i, 2) * 400), path, size: 10 + Math.round(unit(i, 3) * 6), tone: i % 3 === 0 ? "white" : "subject" };
  });
}

/** B4: 12 ribbon sparks along a circle around the creature. */
function sparks(): Particle[] {
  return Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const path = [0, 0.5, 1].map((f) => ({ x: Math.cos(a + f * Math.PI) * 70, y: Math.sin(a + f * Math.PI) * 52 }));
    return { kind: "spark", glyph: "✧", delay: i * 50, ms: 700, path, size: 14, tone: "white" };
  });
}

/** B5: 24 stars fly out, 220 to 420 px/s for 900 ms, with a little gravity (120 px/s2): alpha and scale go to 0. */
function stars(n: number, kind: Kind = "star"): Particle[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + unit(i, 4) * 0.4;
    const v = 220 + unit(i, 5) * 200;
    const life = 0.9;
    const end = { x: Math.cos(a) * v * life, y: Math.sin(a) * v * life + 0.5 * 120 * life * life };
    const mid = { x: end.x * 0.5, y: Math.sin(a) * v * life * 0.5 + 0.5 * 120 * (life / 2) ** 2 };
    return { kind, glyph: kind === "heart" ? "♥" : i % 2 ? "★" : "✦", delay: 0, ms: Math.round(life * 1000), path: [{ x: 0, y: 0 }, mid, end], size: 12 + Math.round(unit(i, 6) * 8), tone: i % 3 === 0 ? "white" : "subject" };
  });
}

/** B8: 8 hearts and stars float up for 1.2 s. */
function floaters(): Particle[] {
  return Array.from({ length: 8 }, (_, i) => {
    const x = (i - 3.5) * 34;
    return { kind: i % 2 ? "heart" : "star", glyph: i % 2 ? "♥" : "★", delay: i * 70, ms: 1200, path: [{ x, y: 20 }, { x: x + (i % 2 ? 10 : -10), y: -40 }, { x, y: -110 }], size: 16 + (i % 3) * 3, tone: i % 2 ? "white" : "subject" };
  });
}

/** The lights of a beat. */
export function particlesOf(beat: BeatId, a: Area): Particle[] {
  switch (beat) {
    case "B0":
      // 6 gold motes rise from the card or the button
      return Array.from({ length: 6 }, (_, i) => ({ kind: "mote" as const, glyph: "✦", delay: i * 40, ms: 700, path: [{ x: (i - 2.5) * 16, y: 40 }, { x: (i - 2.5) * 20, y: -20 }, { x: (i - 2.5) * 22, y: -70 }], size: 12, tone: "white" as const }));
    case "B2":
      return motes(a);
    case "B3":
      // the motes keep arriving, slower
      return motes(a).slice(0, 5).map((p, i) => ({ ...p, delay: i * 200, ms: p.ms + 500 }));
    case "B4":
      return sparks();
    case "B5":
      return stars(24);
    case "B6":
      return stars(6);
    case "B8":
      return floaters();
    default:
      return [];
  }
}
