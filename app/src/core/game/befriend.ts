/**
 * Befriending, slice S3 of docs/app/BATTLE_V3.md (section 8): a try that can
 * fail, with the classic catch-rate shape. Pure functions and small tables
 * only; `Battle` calls them (the Bag, the world and the log are its business).
 *
 *   hpFactor = (3 Fmax - 2 Fnow) / (3 Fmax)         1/3 at full Fog, 1 at 0
 *   levelMod = clamp(1.2 - 0.02 (L - 5), 0.7, 1.2)  small creatures are friendlier
 *   a = min(247, rate * hpFactor * levelMod * tool * treat * status * gift * curious) + pity
 *   p = min(0.97, a / 255)                          q = p^(1/3) for each of three shakes
 *
 * What the parent decided (2026-10-22) and how it is built here:
 * - Befriending can fail, with this logic, in every age band.
 * - Pity (a bonus after each failed try, for the rest of the fight) stays in
 *   every band, with the spec's milder numbers (45 / 30 / 25).
 * - Mercy (the try that always succeeds: the 3rd in band A) stays ONLY for
 *   ages 5 to 7 (band A). Bands B and C have pity but no guarantee: a unlucky
 *   child can fail four times and the tools are the price, which is what
 *   "can fail" means. The data's `befriend_mercy_try` of 4 for B and C is
 *   therefore not used (see {@link mercyTry}).
 * - Nets are given back after a failed try with the band's `net_return`
 *   (1.0 in band A, else 0.5); cards and treats are always used up.
 */
import type { Band, BattleData, BattleRules } from "../data/battleTypes";
import type { Economy, Item } from "./items";

/** The most the base number can reach before pity, and the most a chance can be (8.2). */
export const MAX_A = 247;
export const MAX_P = 0.97;
/** The scale the base number is read on. */
export const A_SCALE = 255;

export type ChanceWord = "low" | "fair" | "good" | "great";
export const WORDS: readonly ChanceWord[] = ["low", "fair", "good", "great"];

/** The numbers of 8.2 for one band, from the data. */
export interface BefriendRules {
  levelBase: number;
  levelPer: number;
  levelFrom: number;
  levelMin: number;
  levelMax: number;
  shakes: number;
  lowBelow: number;
  fairBelow: number;
  goodBelow: number;
  giftMult: number;
  favouriteBonus: number;
  /** Status name to its multiplier (Drowsy 2, Calm 2, Dizzy 1.5, Slow 1.3, Giggly 1.25, Shield and Windup 0.8). */
  status: Record<string, number>;
  /** The pity added to `a` after each failed try. */
  pity: number;
  /** The try that always succeeds, or null: band A only. */
  mercy: number | null;
  /** The chance a failed net comes back. */
  netReturn: number;
  /** Curious gift: the creature is a little easier. */
  curious: number;
}

const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Mercy is for band A only (the parent's decision): the 3rd try. Null for the other bands. */
export function mercyTry(band: Band, dataTry: number): number | null {
  return band === "A" ? Math.max(2, dataTry) : null;
}

export function befriendRules(data: BattleData, band: Band): BefriendRules {
  const r: BattleRules = data.rules;
  const b = (r.befriend ?? {}) as Record<string, unknown>;
  const lm = (b["level_mod"] ?? {}) as Record<string, unknown>;
  const words = (b["chance_words"] ?? {}) as Record<string, unknown>;
  const st = (b["status_bonus"] ?? {}) as Record<string, unknown>;
  const status: Record<string, number> = {};
  for (const [k, v] of Object.entries(st)) status[k] = num(v, 1);
  const band_ = r.bands[band];
  return {
    levelBase: num(lm["base"], 1.2),
    levelPer: num(lm["per_level"], 0.02),
    levelFrom: num(lm["from_level"], 5),
    levelMin: num(lm["min"], 0.7),
    levelMax: num(lm["max"], 1.2),
    shakes: Math.max(1, Math.trunc(num(b["shakes"], 3))),
    lowBelow: num(words["low_below"], 0.25),
    fairBelow: num(words["fair_below"], 0.5),
    goodBelow: num(words["good_below"], 0.8),
    giftMult: num(b["gift_question_mult"], 1.5),
    favouriteBonus: num(b["favourite_treat_bonus"], 0.3),
    status,
    pity: band_.befriend_pity,
    mercy: mercyTry(band, band_.befriend_mercy_try),
    netReturn: band_.net_return,
    curious: 1.15,
  };
}

/** 1/3 at full Fog, 1 at no Fog. */
export function hpFactor(fogNow: number, fogMax: number): number {
  const max = Math.max(1, fogMax);
  const now = Math.min(max, Math.max(0, fogNow));
  return (3 * max - 2 * now) / (3 * max);
}

export function levelMod(level: number, r: BefriendRules): number {
  return Math.min(r.levelMax, Math.max(r.levelMin, r.levelBase - r.levelPer * (level - r.levelFrom)));
}

/** Only the largest of the creature's statuses counts (no stacking): none is 1; Shield alone is 0.8. */
export function statusMult(statuses: readonly string[], r: BefriendRules): number {
  const known = statuses.map((s) => r.status[s]).filter((v): v is number => typeof v === "number");
  return known.length === 0 ? 1 : Math.max(...known);
}

export interface ChanceInput {
  /** The species' base rate (200, 150, 100 and the family values). */
  rate: number;
  fogNow: number;
  fogMax: number;
  level: number;
  /** The tool's multiplier on this creature (a card for another subject is 1). */
  tool: number;
  /** The treat's multiplier, with the favourite's bonus (1: none). */
  treat: number;
  /** The creature's statuses now ("calm" at Fog 0, "drowsy", "dizzy" ...). */
  statuses: readonly string[];
  /** A right Gift question was answered. */
  gift: boolean;
  /** The creature has the Curious gift. */
  curious: boolean;
  /** Failed tries so far in this fight. */
  failed: number;
  /** The Star Net: the first shake never fails. */
  firstSafe: boolean;
  /** 1-based number of the try about to be made (for Mercy). */
  tryNo: number;
}

export interface Chance {
  /** The base number before pity, capped at {@link MAX_A}. */
  a: number;
  /** The chance of the whole try, 0 to 1 (1 when Mercy makes it sure). */
  p: number;
  word: ChanceWord;
  /** Mercy: this try cannot fail. */
  mercy: boolean;
}

export function wordOf(p: number, r: Pick<BefriendRules, "lowBelow" | "fairBelow" | "goodBelow">): ChanceWord {
  return p < r.lowBelow ? "low" : p < r.fairBelow ? "fair" : p < r.goodBelow ? "good" : "great";
}

/** The chance of one try (8.2). Pity grows with failed tries; Mercy (band A) makes the 3rd try sure. */
export function chanceOf(i: ChanceInput, r: BefriendRules): Chance {
  const raw = i.rate * hpFactor(i.fogNow, i.fogMax) * levelMod(i.level, r) * i.tool * i.treat * statusMult(i.statuses, r) * (i.gift ? r.giftMult : 1) * (i.curious ? r.curious : 1);
  const a = Math.min(MAX_A, raw);
  const pity = i.failed * r.pity;
  let p = Math.min(MAX_P, (a + pity) / A_SCALE);
  // the Star Net's free first shake: only two checks are left to pass (still never above the cap)
  if (i.firstSafe) p = Math.min(MAX_P, p ** (2 / 3));
  const mercy = r.mercy !== null && i.tryNo >= r.mercy;
  if (mercy) return { a, p: 1, word: "great", mercy: true };
  return { a, p, word: wordOf(p, r), mercy: false };
}

/** The word one step up (the child sees it move after a failed try). */
export function nextWord(w: ChanceWord): ChanceWord {
  return WORDS[Math.min(WORDS.length - 1, WORDS.indexOf(w) + 1)]!;
}

/** Each of the shake checks passes with q = p^(1/shakes), so all of them pass with p. */
export function shakeChance(p: number, checks: number): number {
  return p <= 0 ? 0 : p >= 1 ? 1 : p ** (1 / checks);
}

export interface ThrowResult {
  ok: boolean;
  /** Shakes the child sees: 3 for a success, else the number of the shake where it failed (1 to 3). */
  shakes: number;
  /** The shake that failed (1-based), or null. */
  failedAt: number | null;
}

/**
 * The three shake checks in order. With `firstSafe` the first never fails and the other two share the chance, so the
 * whole try still succeeds with `p`. A sure try (Mercy) passes every check.
 */
export function rollShakes(p: number, rng: () => number, shakes = 3, firstSafe = false): ThrowResult {
  const checks = firstSafe ? shakes - 1 : shakes;
  const q = shakeChance(p, checks);
  for (let k = 1; k <= shakes; k++) {
    if (firstSafe && k === 1) continue;
    if (rng() >= q) return { ok: false, shakes: k, failedAt: k };
  }
  return { ok: true, shakes, failedAt: null };
}

// ---------------------------------------------------------------- the bag

export interface Tool {
  item: Item;
  /** What it multiplies on THIS creature (a card of another subject or zone is 1). */
  mult: number;
  /** It matches this creature (a net always does). */
  applies: boolean;
  /** A net (and the Star Net) comes back after a failed try; a card does not. */
  net: boolean;
  /** Auto never picks it: not for sale (the Star Net), the child must tap it. */
  rare: boolean;
  count: number;
}

export interface Treat {
  item: Item;
  mult: number;
  /** The species likes it: +0.3 to its multiplier. */
  liked: boolean;
  count: number;
}

export const isNet = (i: Item): boolean => i.kind === "net" || i.id.endsWith("_net");

/** The three treats the species could like: a stable pick from its id (there is no taste field in the data yet). */
export function likedTreat(species: string, treats: readonly string[]): string | null {
  if (treats.length === 0) return null;
  let h = 7;
  for (const ch of species) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [...treats].sort()[h % treats.length]!;
}

/** Every snack that works as a treat, in the table's order. */
export function treatIds(eco: Economy): string[] {
  return eco.order.filter((id) => eco.items[id]!.kind === "snack" && eco.items[id]!.treatMult > 1);
}

export interface Target {
  species: string;
  subject: string;
  zone: string;
}

export function toolFor(item: Item, target: Target, count: number): Tool {
  const scope = item.scope;
  const applies = scope === "subject" ? item.scopeId === target.subject : scope === "zone" ? item.scopeId === target.zone : true;
  return { item, mult: applies ? item.toolMult : 1, applies, net: isNet(item), rare: !item.forSale, count };
}

/** The nets and cards in the Bag, in the table's order. */
export function toolsIn(eco: Economy, have: (id: string) => number, target: Target): Tool[] {
  return eco.order
    .map((id) => eco.items[id]!)
    .filter((i) => (i.kind === "net" || i.kind === "befriend_tool") && have(i.id) > 0)
    .map((i) => toolFor(i, target, have(i.id)));
}

export function treatsIn(eco: Economy, have: (id: string) => number, species: string, r: BefriendRules): Treat[] {
  const ids = treatIds(eco);
  const liked = likedTreat(species, ids);
  return ids
    .filter((id) => have(id) > 0)
    .map((id) => {
      const item = eco.items[id]!;
      const isLiked = id === liked;
      return { item, liked: isLiked, mult: item.treatMult + (isLiked ? r.favouriteBonus : 0), count: have(id) };
    });
}

/**
 * Auto (8.3): the best tool that matches and is not rare (the Star Net and the like need an explicit tap), and a
 * treat only when the creature likes one the child owns (nothing is spent on a guess).
 */
export function autoPick(tools: readonly Tool[], treats: readonly Treat[]): { tool: string | null; treat: string | null } {
  const best = tools.filter((t) => !t.rare && t.applies).sort((a, b) => b.mult - a.mult)[0];
  const liked = treats.find((t) => t.liked);
  return { tool: best?.item.id ?? null, treat: liked?.item.id ?? null };
}
