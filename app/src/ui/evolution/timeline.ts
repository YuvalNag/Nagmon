/**
 * The evolution animation as a plan of beats and a clock (docs/app/BATTLE_V3.md 7.4). No React and no DOM: the
 * scene reads the beats as the clock starts them. The lengths come from the rules file (`evolution.animation`,
 * seconds): the long version (10.6), the short one the parent can choose (6), the calm crossfade (1.6), and the
 * speed of a skip (3). A tap after 1.4 s speeds the rest up and the evolution is never lost by skipping: the scene
 * has changed the creature's species before the first beat. The name card (B7) is always read at normal speed.
 */
import type { Timer } from "../battle/pace";

export type BeatId = "B0" | "B1" | "B2" | "B3" | "B4" | "B5" | "B6" | "B7" | "B8" | "B9" | "calm";
export type Mode = "long" | "short" | "calm";

export interface Beat {
  id: BeatId;
  /** Milliseconds at normal speed. */
  ms: number;
}

export interface Anim {
  long_s: number;
  short_s: number;
  calm_s: number;
  skip_rate: number;
}

/** The spec's table, in milliseconds: B0 ready, B1 step into the light, B2 gathering, B3 glow, B4 change, B5 burst, B6 reveal, B7 name and stats, B8 celebrate, B9 settle. */
const SPEC: readonly Beat[] = [
  { id: "B0", ms: 400 },
  { id: "B1", ms: 1000 },
  { id: "B2", ms: 1800 },
  { id: "B3", ms: 1200 },
  { id: "B4", ms: 1200 },
  { id: "B5", ms: 800 },
  { id: "B6", ms: 1200 },
  { id: "B7", ms: 1400 },
  { id: "B8", ms: 1000 },
  { id: "B9", ms: 600 },
];
const SPEC_TOTAL = SPEC.reduce((n, b) => n + b.ms, 0);

/** What a beat's steps are written for (the long version, milliseconds): the scene scales them by the plan's length over this. */
export const specMs = (id: BeatId): number => SPEC.find((b) => b.id === id)?.ms ?? (id === "calm" ? 1600 : 1000);

/** A tap this long into the plan (milliseconds) speeds the rest up: before that it is ignored. */
export const SKIP_AFTER_MS = 1400;

/** The beat that holds the name and the numbers: the child reads it, so a skip does not speed it up. */
const READ: BeatId = "B7";

const total = (plan: readonly Beat[]) => plan.reduce((n, b) => n + b.ms, 0);

/** The rounding left over goes to the last beat that is not the name card: the plan adds up to exactly `ms`. */
function fit(plan: Beat[], ms: number): Beat[] {
  const last = plan.reduce((at, b, i) => (b.id !== READ ? i : at), 0);
  const diff = ms - total(plan);
  return plan.map((b, i) => (i === last ? { ...b, ms: b.ms + diff } : b));
}

/** The beats of a version, with the lengths adding up to the rules' seconds. */
export function planFor(mode: Mode, anim: Anim): Beat[] {
  if (mode === "long") {
    const k = (anim.long_s * 1000) / SPEC_TOTAL;
    return fit(
      SPEC.map((b) => ({ id: b.id, ms: Math.round(b.ms * k) })),
      Math.round(anim.long_s * 1000),
    );
  }
  if (mode === "short") {
    // B2 halved and B8 dropped; the others are squeezed so the whole is the short length, the name card kept whole
    const halved = SPEC.filter((b) => b.id !== "B8").map((b) => (b.id === "B2" ? { ...b, ms: b.ms / 2 } : b));
    const keep = halved.find((b) => b.id === READ)!.ms;
    const rest = total(halved) - keep;
    const k = (anim.short_s * 1000 - keep) / rest;
    return fit(
      halved.map((b) => (b.id === READ ? b : { id: b.id, ms: Math.round(b.ms * k) })),
      Math.round(anim.short_s * 1000),
    );
  }
  // calm effects: one crossfade with a static halo in place of B1 to B6, then the name card and the settle
  return [
    { id: "B0", ms: 400 },
    { id: "calm", ms: Math.round(anim.calm_s * 1000) },
    { id: "B7", ms: 1400 },
    { id: "B9", ms: 600 },
  ];
}

export interface ClockEvents {
  /** A beat starts; `at` is the index in the plan and `ms` its length at normal speed. */
  beat: (b: Beat, at: number) => void;
  done: () => void;
  /** The speed changed (a skip). */
  rate?: (r: number) => void;
}

/**
 * Runs a plan: starts each beat as the last one ends. `tap()` after 1.4 s of the plan turns the rest to the skip
 * rate (the name card aside); a tap earlier, or a second tap, changes nothing.
 */
export class EvolutionClock {
  private at = -1;
  private rate = 1;
  private fast = false;
  private id: unknown = null;
  private startedAt = 0;
  /** Plan milliseconds of the current beat that have already played. */
  private played = 0;
  private elapsedBefore = 0;
  private over = false;

  constructor(
    private readonly plan: readonly Beat[],
    private readonly timer: Timer,
    private readonly skipRate: number,
    private readonly on: ClockEvents,
  ) {}

  get speed(): number {
    return this.rate;
  }

  get finished(): boolean {
    return this.over;
  }

  /** Milliseconds of the plan that have played (at normal speed). */
  elapsed(): number {
    if (this.at < 0) return 0;
    return this.elapsedBefore + this.played + (this.over ? 0 : (this.timer.now() - this.startedAt) * this.rate);
  }

  start(): void {
    this.next();
  }

  /** The beat is read at normal speed even after a skip. */
  private rateFor(i: number): number {
    return this.fast && this.plan[i]?.id !== READ ? this.skipRate : 1;
  }

  private next(): void {
    if (this.over) return;
    if (this.at >= 0) this.elapsedBefore += this.plan[this.at]!.ms;
    this.at++;
    if (this.at >= this.plan.length) {
      this.over = true;
      this.on.done();
      return;
    }
    this.played = 0;
    this.rate = this.rateFor(this.at);
    this.on.beat(this.plan[this.at]!, this.at);
    this.schedule();
  }

  private schedule(): void {
    const b = this.plan[this.at]!;
    this.startedAt = this.timer.now();
    this.id = this.timer.set(() => this.next(), Math.max(0, (b.ms - this.played) / this.rate));
  }

  /** The child taps: true when this tap sped the rest up. */
  tap(): boolean {
    if (this.over || this.fast || this.at < 0 || this.elapsed() < SKIP_AFTER_MS) return false;
    this.fast = true;
    this.played += (this.timer.now() - this.startedAt) * this.rate;
    this.timer.clear(this.id);
    const before = this.rate;
    this.rate = this.rateFor(this.at);
    if (this.rate !== before) this.on.rate?.(this.rate);
    this.schedule();
    return true;
  }

  /** The scene went away: nothing more happens. */
  stop(): void {
    this.over = true;
    this.timer.clear(this.id);
  }
}

/** The ease of a counting number (out-cubic). */
export const easeOut = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** The number shown `t` of the way from `from` to `to` (whole numbers). */
export const countAt = (from: number, to: number, t: number): number => Math.round(from + (to - from) * easeOut(t));

/** At most this many number changes a second (one soft tick for each): the count moves in steps this far apart. */
export const MAX_TICKS_PER_S = 10;
