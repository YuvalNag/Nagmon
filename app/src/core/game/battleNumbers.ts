/**
 * The numbers of the battle (docs/app/BATTLE_V3.md, sections 2.3, 5.1, 5.2,
 * 5.3, 5.8): stats, Fog, the damage formula, the subject wheel, the age
 * bands. Pure functions; nothing here knows a screen or an engine.
 */

/** A: 5 to 7, B: 8 to 10, C: 11 and up. */
export type Band = "A" | "B" | "C";

export function bandOf(age: number): Band {
  return age <= 7 ? "A" : age <= 10 ? "B" : "C";
}

/** Floors with a hair of slack, so 12 x 6 does not become 71.99999 (5.1 is written in whole numbers). */
const floor = (x: number): number => Math.floor(x + 1e-9);

// ---- stats (5.1) ----

/** The four base numbers of a species, about 8 to 13: Pep, Power, Guard, Speed. */
export interface Bases {
  bp: number;
  bw: number;
  bg: number;
  bs: number;
}

export const DEFAULT_BASES: Bases = { bp: 10, bw: 10, bg: 10, bs: 10 };

/** Evolution stage multiplies the bases. */
export const STAGE_MULT: Readonly<Record<string, number>> = { basic: 1.0, stage1: 1.2, stage2: 1.45 };

export interface Stats {
  pep: number;
  power: number;
  guard: number;
  speed: number;
}

export function statsOf(bases: Bases, level: number, stage = "basic"): Stats {
  const m = STAGE_MULT[stage] ?? 1;
  return {
    pep: floor((bases.bp * m * (level + 10)) / 4),
    power: floor((bases.bw * m * (level + 8)) / 4),
    guard: floor((bases.bg * m * (level + 8)) / 4),
    speed: floor((bases.bs * m * (level + 8)) / 4),
  };
}

/** Fog is a pacing number, not a stat: it depends on level, kind of fight and age, never on the species. */
export type FightKind = "wild" | "keeper" | "guardian" | "master";
export const FOG_KIND: Readonly<Record<FightKind, number>> = { wild: 2.0, keeper: 1.4, guardian: 3.6, master: 4.2 };
export const FOG_BAND: Readonly<Record<Band, number>> = { A: 0.8, B: 1.0, C: 0.9 };
/** The parent's Length knob (S5 will show it; the numbers are here). */
export const FOG_LENGTH = { short: 0.75, normal: 1.0, long: 1.3 } as const;

/**
 * S1 had a stopgap pacing of 0.75 because it had no Finale and no stretch moves. S2 has both, so the stopgap is gone
 * (1.0). What is left is the tuning that the seeded simulation asks for (tests/unit/game/battleSim.test.ts, the real
 * `Battle` class, answers at the tier table's chances): the spec's Fog (kind 2.0) gives about 10.8 questions in band B,
 * where the spec's own simulation had 8.2, because a real card list has fewer Sparkle hits than the spec's player (who
 * met a weak enemy half of the time). `FOG_TUNE` brings the wild fight back to 6 to 9 questions (and the master's test to 15 to 18: 0.7 for both, the master having no script yet); the data and the
 * spec's table (`fogOf`) are untouched, so the Length knob and the Fog tests still read the spec's numbers.
 */
export const S1_PACING = 1.0;
export const FOG_TUNE: Readonly<Record<FightKind, number>> = { wild: 0.7, keeper: 1.0, guardian: 1.0, master: 0.7 };

/** Fog from the data's own multipliers (battle_rules.json: the kind's and the band's). */
export function fogFrom(level: number, kind: number, band: number, length = 1.0): number {
  return Math.max(1, floor(floor((10 * (level + 10)) / 4) * kind * band * length));
}

export function fogOf(level: number, kind: FightKind, band: Band, length = 1.0): number {
  return Math.max(1, floor(floor((10 * (level + 10)) / 4) * FOG_KIND[kind] * FOG_BAND[band] * length));
}

// ---- age bands (5.8) ----

/** How hard the enemy hits, by band (and the parent's Strength knob, 0.7 / 1 / 1.3). */
export const GENTLE: Readonly<Record<Band, number>> = { A: 0.55, B: 0.9, C: 1.15 };
/** Expected chance of a right answer by tier (E / N / S) and band. */
export const RIGHT_CHANCE: Readonly<Record<Band, Readonly<Record<"E" | "N" | "S", number>>>> = {
  A: { E: 0.9, N: 0.8, S: 0.65 },
  B: { E: 0.85, N: 0.72, S: 0.55 },
  C: { E: 0.8, N: 0.68, S: 0.5 },
};
/** The most questions of one wild fight (wrong ones too); at it the creature calms by itself. */
export const QUESTION_CAP: Readonly<Record<Band, number>> = { A: 10, B: 13, C: 11 };
/** Wild level shift by band. */
export const LEVEL_SHIFT: Readonly<Record<Band, number>> = { A: -1, B: 0, C: 1 };

// ---- the damage formula (5.2) ----

export const BONUS_CAP = 2.5;
export const HOME_BONUS = 1.25;
export const MIX_BONUS = 1.1;
export const BRILLIANT_BONUS = 1.5;
/** A wrong answer still moves the fog a little. */
export const WRONG_QUALITY = 0.35;
/** The roll is 0.92 to 1.00. */
export const ROLL_MIN = 0.92;

export const MP = { E: 40, N: 60, S: 85, starter: 35, finisher: 65, finale: 70, wiggle: 25, puff: 50, puffBoss: 40, bigPuff: 60 } as const;

export interface DamageInput {
  /** The attacker's level. */
  level: number;
  /** The move's power. */
  mp: number;
  power: number;
  guard: number;
  /** The move is of the attacker's own subject (x1.25). */
  home?: boolean;
  /** The wheel's multiplier (1.5 / 0.67 / 1). */
  wheel?: number;
  /** A finisher's Mark bonus. */
  mark?: number;
  /** A Finale's chain step (x1.0, 1.15, 1.3). */
  chain?: number;
  brilliant?: boolean;
  /** The subject differs from the last move's. */
  mix?: boolean;
  /** Right (true) or wrong (false) answer; an enemy's attack is "right". */
  right: boolean;
  /** 0.92 to 1.00. */
  roll: number;
  /** The enemy's gentle factor (band and Strength knob), applied last. */
  gentle?: number;
}

/** The raw number before bonuses: ((0.4 L + 2) MP (Power / Guard)) / 50 + 2. */
export function rawDamage(level: number, mp: number, power: number, guard: number): number {
  return ((0.4 * level + 2) * mp * (power / Math.max(1, guard))) / 50 + 2;
}

export function damageOf(d: DamageInput): number {
  const raw = rawDamage(d.level, d.mp, d.power, d.guard);
  const home = d.home ? HOME_BONUS : 1;
  const wheel = d.wheel ?? 1;
  // a wrong answer keeps only Home and the wheel (weak, but not silly)
  const bonus = Math.min(BONUS_CAP, d.right ? home * wheel * (d.mark ?? 1) * (d.chain ?? 1) * (d.brilliant ? BRILLIANT_BONUS : 1) * (d.mix ? MIX_BONUS : 1) : home * wheel);
  const quality = d.right ? 1 : WRONG_QUALITY;
  return Math.max(1, floor(raw * bonus * quality * d.roll * (d.gentle ?? 1)));
}

// ---- the subject wheel (2.3) ----

/** Math beats Logic beats Geometry beats Science beats English beats Hebrew beats Math. */
export const WHEEL: readonly string[] = ["math", "logic", "geometry", "science", "english", "hebrew"];

export const SPARKLE = 1.5;
/** The Sparkly gift (3.5). */
export const SPARKLY = 1.65;
export const STURDY = 0.67;

export type WheelHit = "sparkle" | "sturdy" | null;

/**
 * A move's subject against the enemy's: the next one on the wheel is a
 * Sparkle (x1.5), the one before it is Sturdy (x0.67), anything else is
 * plain. A species may add weak subjects of its own (data): a Sparkle too.
 */
export function wheelHit(move: string, enemy: string, extraWeak: readonly string[] = []): WheelHit {
  if (extraWeak.includes(move)) return "sparkle";
  const m = WHEEL.indexOf(move);
  const e = WHEEL.indexOf(enemy);
  if (m < 0 || e < 0) return null;
  if (e === (m + 1) % WHEEL.length) return "sparkle";
  if (e === (m + WHEEL.length - 1) % WHEEL.length) return "sturdy";
  return null;
}

export const wheelMult = (hit: WheelHit): number => (hit === "sparkle" ? SPARKLE : hit === "sturdy" ? STURDY : 1);

/** Every subject whose moves are a Sparkle against this enemy: the wheel's one, then the species' own. */
export function weakSubjects(enemy: string, extraWeak: readonly string[] = []): string[] {
  const out = new Set<string>();
  const e = WHEEL.indexOf(enemy);
  if (e >= 0) out.add(WHEEL[(e + WHEEL.length - 1) % WHEEL.length]!);
  for (const s of extraWeak) out.add(s);
  return [...out];
}

// ---- rewards (5.4) ----

/** A wild win pays 5 + level coins; a Brilliant hit adds 1 (at most 5 a fight). */
export const winCoins = (level: number): number => 5 + level;
export const BRILLIANT_COIN_MAX = 5;
/** Growth points: a wild win +3, befriending +2 (the per-answer point stays 1). */
export const WIN_POINTS = 3;
export const CATCH_POINTS = 2;
/** Results stars (6.5): Steady (nobody fainted) and Bright (two Brilliant hits) pay 2 coins each. */
export const STAR_COINS = 2;
