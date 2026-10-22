/**
 * The statuses of a battle (docs/app/BATTLE_V3.md, sections 4.1, 4.2 and 4.4) as plain state on one fighter (the
 * enemy, or the child's partner). Pure: nothing here knows a screen, an engine or a random number. A status that
 * is put on in round `n` for `R` rounds is `until = n + R`: it is there for the rest of round n and the R rounds
 * after it, and goes at the end of round `until`.
 */
import type { StatName, StatusId } from "../data/battleTypes";

/** Where a status is a "major" one: only one of the group at a time (a new one replaces the old). */
export type Major = "drowsy" | "dizzy";
/** Statuses a boss shrugs off for a while after one lands. */
export type Lockable = "drowsy" | "dizzy" | "slow";

export interface Stage {
  stage: number;
  until: number;
}

export interface Fighter {
  /** Drowsy: actions the enemy will skip; on our side, `until` is the turn the Yawn ends. */
  drowsy: { actions: number; until: number; from?: number } | null;
  dizzy: { until: number; from?: number } | null;
  slow: { until: number } | null;
  shield: { amount: number; until: number } | null;
  regen: { share: number; until: number } | null;
  sniffly: { until: number } | null;
  stages: Record<StatName, Stage>;
  /** The next right answer is Brilliant (ours). */
  focus: boolean;
  /** Attacks that are still halved (Giggly). */
  giggly: number;
  /** The next enemy attack is softened and part of it returned (ours). */
  mirror: { soften: number; ret: number; until: number } | null;
  marks: { subject: string; until: number }[];
  /** A boss is immune to a major kind until this turn. */
  immune: Partial<Record<Lockable, number>>;
}

export const newFighter = (): Fighter => ({
  drowsy: null,
  dizzy: null,
  slow: null,
  shield: null,
  regen: null,
  sniffly: null,
  stages: { power: { stage: 0, until: 0 }, guard: { stage: 0, until: 0 }, speed: { stage: 0, until: 0 } },
  focus: false,
  giggly: 0,
  mirror: null,
  marks: [],
  immune: {},
});

/** Stat stages (4.2): +1 x1.25, +2 x1.5, +3 x1.75; -1 x0.8, -2 x0.67, -3 x0.57. */
export function stageMult(stage: number): number {
  return stage >= 0 ? 1 + 0.25 * stage : 1 / (1 + 0.25 * -stage);
}

export const MAX_STAGE = 3;

/** Moves a stat by `by` stages (clamped to +-3) for `rounds`; returns the stage now (0 when it did not move). */
export function shiftStage(f: Fighter, stat: StatName, by: number, turn: number, rounds: number): number {
  const s = f.stages[stat];
  const live = s.until >= turn ? s.stage : 0;
  const next = Math.max(-MAX_STAGE, Math.min(MAX_STAGE, live + by));
  f.stages[stat] = { stage: next, until: turn + rounds };
  return next;
}

/** The stage of a stat during round `turn`. */
export const stageOf = (f: Fighter, stat: StatName, turn: number): number => (f.stages[stat].until >= turn ? f.stages[stat].stage : 0);

/** The multiplier of a stat during round `turn`. */
export const statMult = (f: Fighter, stat: StatName, turn: number): number => stageMult(stageOf(f, stat, turn));

export const isSlow = (f: Fighter, turn: number): boolean => !!f.slow && f.slow.until >= turn;
export const isDizzy = (f: Fighter, turn: number): boolean => !!f.dizzy && f.dizzy.until >= turn && (f.dizzy.from ?? 0) <= turn;
export const isDrowsy = (f: Fighter, turn: number): boolean => !!f.drowsy && (f.drowsy.actions > 0 || (f.drowsy.until >= turn && (f.drowsy.from ?? 0) <= turn));
export const shieldLeft = (f: Fighter, turn: number): number => (f.shield && f.shield.until >= turn ? f.shield.amount : 0);
export const isImmune = (f: Fighter, kind: Lockable, turn: number): boolean => (f.immune[kind] ?? 0) >= turn;

/** A major status (Drowsy or Dizzy) is on it now. */
export const hasMajor = (f: Fighter, _turn?: number): boolean => !!f.dizzy || !!f.drowsy;

/** The shield takes what it can of a hit; returns what is left of the hit. */
export function absorb(f: Fighter, hit: number, turn: number): { left: number; taken: number } {
  const have = shieldLeft(f, turn);
  if (!have || !f.shield) return { left: hit, taken: 0 };
  const taken = Math.min(have, hit);
  f.shield.amount -= taken;
  if (f.shield.amount <= 0) f.shield = null;
  return { left: hit - taken, taken };
}

/** A chain Mark (3.4): at most two, a third replaces the oldest. */
export function addMark(f: Fighter, subject: string, turn: number, rounds: number): void {
  f.marks = [...f.marks.filter((m) => m.until >= turn), { subject, until: turn + rounds }].slice(-2);
}

/** The finisher's multiplier (3.4): x1.5 for a Mark, x1.75 when it is the finisher's own subject, x2.0 for two different ones. */
export function markBonus(f: Fighter, subject: string, turn: number, mult: { per_mark: number; same_subject: number; two_different: number }): number {
  const marks = f.marks.filter((m) => m.until >= turn);
  if (marks.length === 0) return 1;
  if (new Set(marks.map((m) => m.subject)).size >= 2) return mult.two_different;
  return marks.some((m) => m.subject === subject) ? mult.same_subject : mult.per_mark;
}

/** What is on a fighter, for the badges beside its bar (the status icons of 4.1). */
export interface Badge {
  id: StatusId;
  /** Stat of a Boost or Weaken; the subject of a Mark. */
  variant?: string;
  /** 1 to 3 arrows of a stage; the number of Marks of this subject. */
  n?: number;
  /** Rounds still to go (null when it is used up instead of timed). */
  left: number | null;
  /** A boss shrugs this kind off for now (the small lock). */
  locked?: boolean;
}

export function badges(f: Fighter, turn: number, opts: { windup?: boolean; calm?: boolean; dozing?: boolean } = {}): Badge[] {
  const out: Badge[] = [];
  const left = (until: number) => Math.max(0, until - turn);
  if (f.drowsy && (f.drowsy.actions > 0 || f.drowsy.until >= turn)) out.push({ id: "drowsy", left: f.drowsy.actions > 0 ? null : left(f.drowsy.until) });
  if (f.dizzy && f.dizzy.until >= turn) out.push({ id: "dizzy", left: left(f.dizzy.until) });
  if (isSlow(f, turn)) out.push({ id: "slow", left: left(f.slow!.until) });
  if (shieldLeft(f, turn)) out.push({ id: "shield", left: left(f.shield!.until) });
  if (f.regen && f.regen.until >= turn) out.push({ id: "regen", left: left(f.regen.until) });
  for (const stat of ["power", "guard", "speed"] as StatName[]) {
    const st = stageOf(f, stat, turn);
    if (st > 0) out.push({ id: "boost", variant: stat, n: st, left: left(f.stages[stat].until) });
    if (st < 0) out.push({ id: "weaken", variant: stat, n: -st, left: left(f.stages[stat].until) });
  }
  if (f.focus) out.push({ id: "focus", left: null });
  if (f.giggly > 0) out.push({ id: "giggly", left: null });
  for (const m of f.marks) if (m.until >= turn) out.push({ id: "mark", variant: m.subject, left: left(m.until) });
  if (f.sniffly && f.sniffly.until >= turn) out.push({ id: "sniffly", left: left(f.sniffly.until) });
  if (opts.windup) out.push({ id: "windup", left: 1 });
  if (opts.calm) out.push({ id: "calm", left: null });
  if (opts.dozing) out.push({ id: "dozing", left: null });
  return out;
}

/** The end of round `turn`: what has run out goes. */
export function expire(f: Fighter, turn: number): void {
  if (f.drowsy && f.drowsy.actions <= 0 && f.drowsy.until <= turn) f.drowsy = null;
  if (f.dizzy && f.dizzy.until <= turn) f.dizzy = null;
  if (f.slow && f.slow.until <= turn) f.slow = null;
  if (f.shield && f.shield.until <= turn) f.shield = null;
  if (f.regen && f.regen.until <= turn) f.regen = null;
  if (f.sniffly && f.sniffly.until <= turn) f.sniffly = null;
  if (f.mirror && f.mirror.until <= turn) f.mirror = null;
  f.marks = f.marks.filter((m) => m.until > turn);
  for (const k of ["power", "guard", "speed"] as StatName[]) if (f.stages[k].until <= turn) f.stages[k] = { stage: 0, until: 0 };
}

/** Cleanse (Fresh Air, Alphabet Soup): all the bad statuses, or the first one (a major first). Returns how many went. */
export function cleanse(f: Fighter, scope: "all" | "one", turn: number): number {
  let n = 0;
  const steps: (() => boolean)[] = [
    () => (f.drowsy ? ((f.drowsy = null), true) : false),
    () => (f.dizzy ? ((f.dizzy = null), true) : false),
    () => (f.slow ? ((f.slow = null), true) : false),
    () => (f.sniffly ? ((f.sniffly = null), true) : false),
    () => {
      let any = false;
      for (const k of ["power", "guard", "speed"] as StatName[]) if (stageOf(f, k, turn) < 0) ((f.stages[k] = { stage: 0, until: 0 }), (any = true));
      return any;
    },
  ];
  for (const s of steps) {
    if (s()) n++;
    if (scope === "one" && n > 0) break;
  }
  return n;
}
