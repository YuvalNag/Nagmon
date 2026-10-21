/**
 * The moves (docs/app/BATTLE_V3.md, section 3), read from the data
 * (game/moves.json and species_battle.json, via core/data/battleTypes.ts).
 * S1 plays the moves that are a hit with a question: the plain attacks,
 * chain starters and finishers (as plain hits), stretch and quick moves.
 * Utility moves, Finales, Marks and statuses are S2, so they are not put
 * on the cards (a card must never be a beat that does nothing).
 */
import type { BattleData, Move } from "../data/battleTypes";

export type { Move };
export const WIGGLE = "little_wiggle";

/** The tiers whose cast is a hit in S1. */
const HITS = new Set(["E", "N", "S", "C", "K", "Q"]);
export const isHit = (m: Move): boolean => HITS.has(m.tier) && m.power !== null && m.hits === 1;

/** What a card shows: the flames (1 to 4), by tier. */
export const flames = (tier: string): number => ({ E: 1, N: 2, S: 3, F: 4, C: 1, K: 3, Q: 1, U: 1, W: 1 })[tier] ?? 1;

/** The equipped list of a creature at a level: the highest level of the data's `equipped` table that is not above it. */
function equippedAt(equipped: Record<string, string[]>, level: number): string[] {
  const keys = Object.keys(equipped)
    .map(Number)
    .filter((k) => k <= level)
    .sort((a, b) => b - a);
  return equipped[String(keys[0] ?? 1)] ?? [];
}

const WHEEL_STEP = (wheel: string[], subject: string, by: number): string | undefined => {
  const at = wheel.indexOf(subject);
  return at < 0 ? undefined : wheel[(at + by) % wheel.length];
};

/**
 * The cards of a species at a level: its own equipped moves that S1 can play (up to four, in the data's order),
 * then known home hits to fill, then, for a real choice on the wheel before lesson cards (S2), a normal move two
 * places on and an easy one four places on, from other subjects. The Little Wiggle only when nothing else is left.
 */
export function cardMoves(data: BattleData, slug: string, level: number, subject: string): Move[] {
  const sp = data.species[slug];
  const out: Move[] = [];
  const add = (m: Move | undefined) => {
    if (m && isHit(m) && !out.some((x) => x.id === m.id) && out.length < 4) out.push(m);
  };
  if (sp) {
    for (const id of equippedAt(sp.equipped, level)) add(data.movesById[id]);
    for (const row of sp.learnset) if (row.level <= level) add(data.movesById[row.move]);
  }
  const wheel = data.rules.wheel;
  const first = (s: string | undefined, tier: string) => data.moves.filter((m) => m.subject === s && m.tier === tier && m.unlock_level <= level).sort((a, b) => a.unlock_level - b.unlock_level)[0];
  add(first(WHEEL_STEP(wheel, subject, 2), "N"));
  add(first(WHEEL_STEP(wheel, subject, 4), "E"));
  if (out.length === 0) out.push(data.movesById[WIGGLE]!);
  return out;
}
