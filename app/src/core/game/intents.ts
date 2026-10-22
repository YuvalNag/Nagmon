/**
 * What the enemy does (docs/app/BATTLE_V3.md, 4.3), from the data
 * (game/intents.json): the nine intents and the five temperaments' weights.
 * An intent is drawn at the end of each round, shown over the creature, and
 * never changes (unless the enemy is staggered or put to sleep, and loses it).
 */
import type { BattleData, Intent, IntentId } from "../data/battleTypes";

export type { IntentId };
export type Temperament = "shy" | "playful" | "grumpy" | "sleepy" | "proud";

export const isTemperament = (s: unknown): s is Temperament => typeof s === "string" && ["shy", "playful", "grumpy", "sleepy", "proud"].includes(s);

/** The intents that put a status on the child. */
export const STATUS_INTENTS: readonly IntentId[] = ["drowsy_mist", "dizzy_swirl", "sticky_mud"];
export const INTENT_IDS: readonly IntentId[] = ["fog_puff", "big_puff", "thicken", "giggle", "drowsy_mist", "dizzy_swirl", "sticky_mud", "cheer_up", "silly_dance"];

export type Weights = Partial<Record<IntentId, number>>;

/** A temperament's weights, straight from the data (they add up to 100). */
export function weightsOf(data: BattleData, temperament: string): Weights {
  const t = data.temperaments[temperament] ?? data.temperaments["playful"]!;
  return { ...t.weights };
}

const get = (data: BattleData, id: string): Intent => data.intentsById[id]!;
/** A Puff's MP: 50 for a wild creature, 40 for a boss. */
export const puffPower = (data: BattleData, boss: boolean): number => (boss ? (get(data, "fog_puff").boss_power ?? 40) : (get(data, "fog_puff").power ?? 50));
/** A Big Puff's MP (the windup's release). */
export const bigPuffPower = (data: BattleData): number => get(data, "big_puff").power ?? 60;
/** The level a wild creature must have to use a Big Puff. */
export const bigPuffMinLevel = (data: BattleData): number => get(data, "big_puff").wild_min_level ?? 8;
/** A Giggle gives back this share of the maximum Fog, at most once in this many rounds. */
export const giggleShare = (data: BattleData): number => get(data, "giggle").fog_share ?? 0.05;
export const giggleEvery = (data: BattleData): number => get(data, "giggle").every_rounds ?? 3;
/** A Puff of more than this share of the partner's maximum Pep is "big". */
export const BIG_PUFF = 0.15;

export interface IntentState {
  /** The last thing the enemy did was a big hit (never two in a row without a Silly turn). */
  lastWasBigPuff: boolean;
  /** Rounds since the last Giggle (a large number if never). */
  sinceGiggle: number;
  /** The enemy's Fog is full (a Giggle would give nothing). */
  fogFull: boolean;
  /** The Puff that would come is big. */
  puffIsBig: boolean;
  /** The last intent put a status on the child (never two in a row). */
  lastWasStatus?: boolean;
  /** The enemy's level (a wild creature does not use a Big Puff before level 8). */
  level?: number;
  /** The age band A turns Drowsy Mist into a Silly Dance. */
  bandA?: boolean;
  /** The child already has a major status (Drowsy or Dizzy), or is slow. */
  childMajor?: boolean;
  childSlow?: boolean;
  /** The enemy already has a shield, or its Power is at the top stage. */
  shielded?: boolean;
  powerMax?: boolean;
  /** A Big Puff is already charging. */
  windup?: boolean;
  /** The enemy is a boss: it may Big Puff at any level. */
  boss?: boolean;
  bigMinLevel?: number;
}

/**
 * Draws the next intent. `r` is in [0, 1). The rules of 4.3: a Giggle at most once every three rounds (and only if
 * there is fog to give back); after a big hit the child gets a Silly turn; never two statuses on the child in a row;
 * no Big Puff before level 8 for a wild creature. A draw that is not allowed becomes a Fog Puff (when the intent was
 * an extra) or a Silly Dance, the breather.
 */
export function drawIntent(r: number, w: Weights, s: IntentState, every = 3): IntentId {
  const ids = INTENT_IDS.filter((id) => (w[id] ?? 0) > 0);
  const total = ids.reduce((n, id) => n + (w[id] ?? 0), 0) || 1;
  let x = r * total;
  let pick: IntentId = ids[ids.length - 1] ?? "silly_dance";
  for (const id of ids) {
    x -= w[id] ?? 0;
    if (x < 0) {
      pick = id;
      break;
    }
  }
  const quiet: IntentId = "silly_dance";
  if (pick === "big_puff" && (s.windup || s.lastWasBigPuff || (!s.boss && (s.level ?? 99) < (s.bigMinLevel ?? 8)))) pick = s.windup || s.lastWasBigPuff ? quiet : "fog_puff";
  if (pick === "giggle" && (s.sinceGiggle < every || s.fogFull)) pick = quiet;
  if (pick === "fog_puff" && s.lastWasBigPuff && s.puffIsBig) pick = quiet;
  if (pick === "thicken" && s.shielded) pick = "fog_puff";
  if (pick === "cheer_up" && s.powerMax) pick = "fog_puff";
  if (STATUS_INTENTS.includes(pick)) {
    if (s.lastWasStatus) pick = quiet;
    else if (pick === "drowsy_mist" && s.bandA) pick = quiet;
    else if ((pick === "drowsy_mist" || pick === "dizzy_swirl") && s.childMajor) pick = quiet;
    else if (pick === "sticky_mud" && s.childSlow) pick = quiet;
  }
  return pick;
}
