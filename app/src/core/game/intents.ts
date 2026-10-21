/**
 * What the enemy does (docs/app/BATTLE_V3.md, 4.3): an intent is drawn
 * at the end of each round, shown over the creature, and never changes.
 * S1 has the three that need no status: Fog Puff, Giggle and Silly Dance
 * (the others come with the statuses in S2). A temperament's weights are
 * the spec's, over these three.
 */

export type IntentId = "puff" | "giggle" | "silly";
export type Temperament = "shy" | "playful" | "grumpy" | "sleepy" | "proud";

/**
 * The spec's weights (4.3) over the three intents S1 has. The intents S1 does not have are folded in by what they
 * do: Big Puff, Dizzy Swirl and Sticky Mud are the enemy attacking, so they count as a Puff; Thicken, Cheer Up and
 * Drowsy Mist are the enemy busy with itself, so they count as a Silly Dance. (Grumpy: Puff 50 + Big Puff 20 + Mud 15
 * = 85, Cheer 15 = Silly; and so on.) The tests hold the sums to the spec's table.
 */
export const WEIGHTS: Readonly<Record<Temperament, Readonly<Record<IntentId, number>>>> = {
  shy: { puff: 30, giggle: 20, silly: 50 },
  playful: { puff: 55, giggle: 0, silly: 45 },
  grumpy: { puff: 85, giggle: 0, silly: 15 },
  sleepy: { puff: 30, giggle: 15, silly: 55 },
  proud: { puff: 60, giggle: 0, silly: 40 },
};

export const TEMPERAMENTS = Object.keys(WEIGHTS) as Temperament[];
export const isTemperament = (s: unknown): s is Temperament => typeof s === "string" && s in WEIGHTS;

/** A Giggle gives back this share of the maximum Fog, at most once in this many rounds. */
export const GIGGLE_SHARE = 0.05;
export const GIGGLE_EVERY = 3;
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
 * Draws the next intent. `r` is a random number in [0, 1). The rules of
 * 4.3: a Giggle at most once every three rounds (and only if there is fog
 * to give back); and after a big Puff the child gets a Silly turn rather
 * than another big one. A draw that is not allowed becomes a Silly Dance,
 * the breather.
 */
export function drawIntent(r: number, temperament: Temperament, s: IntentState): IntentId {
  const w = WEIGHTS[temperament];
  const total = w.puff + w.giggle + w.silly;
  const x = r * total;
  let pick: IntentId = x < w.puff ? "puff" : x < w.puff + w.giggle ? "giggle" : "silly";
  if (pick === "giggle" && (s.sinceGiggle < GIGGLE_EVERY || s.fogFull)) pick = "silly";
  if (pick === "puff" && s.lastWasBigPuff && s.puffIsBig) pick = "silly";
  return pick;
}
