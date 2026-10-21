/**
 * What the enemy does (docs/app/BATTLE_V3.md, 4.3), from the data
 * (game/intents.json). An intent is drawn at the end of each round, shown
 * over the creature, and never changes. S1 plays three: Fog Puff, Giggle and
 * Silly Dance. The others are folded in by what they do: the enemy attacking
 * (Big Puff, Dizzy Swirl, Sticky Mud) counts as a Puff, the enemy busy with
 * itself (Thicken, Cheer Up, Drowsy Mist) as a Silly Dance, so a temperament's
 * weights keep the spec's sums.
 */
import type { BattleData, Intent } from "../data/battleTypes";

export type IntentId = "puff" | "giggle" | "silly";
export type Temperament = "shy" | "playful" | "grumpy" | "sleepy" | "proud";

const FOLD: Record<string, IntentId> = {
  fog_puff: "puff",
  big_puff: "puff",
  dizzy_swirl: "puff",
  sticky_mud: "puff",
  giggle: "giggle",
  silly_dance: "silly",
  thicken: "silly",
  cheer_up: "silly",
  drowsy_mist: "silly",
};

export const isTemperament = (s: unknown): s is Temperament => typeof s === "string" && ["shy", "playful", "grumpy", "sleepy", "proud"].includes(s);

export type Weights = Record<IntentId, number>;

/** A temperament's weights folded onto S1's three intents (they still add up to 100). */
export function weightsOf(data: BattleData, temperament: string): Weights {
  const w: Weights = { puff: 0, giggle: 0, silly: 0 };
  const t = data.temperaments[temperament] ?? data.temperaments["playful"]!;
  for (const [id, n] of Object.entries(t.weights)) w[FOLD[id] ?? "silly"] += n ?? 0;
  return w;
}

const get = (data: BattleData, id: string): Intent => data.intentsById[id]!;
/** A Puff's MP: 50 for a wild creature, 40 for a boss. */
export const puffPower = (data: BattleData, boss: boolean): number => (boss ? (get(data, "fog_puff").boss_power ?? 40) : (get(data, "fog_puff").power ?? 50));
/** A Giggle gives back this share of the maximum Fog, at most once in this many rounds. */
export const giggleShare = (data: BattleData): number => get(data, "giggle").fog_share ?? 0.05;
export const giggleEvery = (data: BattleData): number => get(data, "giggle").every_rounds ?? 3;
/** A Puff of more than this share of the partner's maximum Pep is "big". */
export const BIG_PUFF = 0.15;

export interface IntentState {
  /** The last thing the enemy did was a big Puff (never two in a row without a Silly turn). */
  lastWasBigPuff: boolean;
  /** Rounds since the last Giggle (a large number if never). */
  sinceGiggle: number;
  /** The enemy's Fog is full (a Giggle would give nothing). */
  fogFull: boolean;
  /** The Puff that would come is big. */
  puffIsBig: boolean;
}

/**
 * Draws the next intent. `r` is in [0, 1). A Giggle at most once every three rounds (and only if there is fog to give
 * back); after a big Puff the child gets a Silly turn. A draw that is not allowed becomes a Silly Dance, the breather.
 */
export function drawIntent(r: number, w: Weights, s: IntentState, every = 3): IntentId {
  const total = w.puff + w.giggle + w.silly;
  const x = r * total;
  let pick: IntentId = x < w.puff ? "puff" : x < w.puff + w.giggle ? "giggle" : "silly";
  if (pick === "giggle" && (s.sinceGiggle < every || s.fogFull)) pick = "silly";
  if (pick === "puff" && s.lastWasBigPuff && s.puffIsBig) pick = "silly";
  return pick;
}
