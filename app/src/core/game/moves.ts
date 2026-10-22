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

/** The tiers a card of the grid can show: every tier but the Finale (its own slot) and the fallback. */
const CARD_TIERS = new Set(["E", "N", "S", "C", "K", "Q", "U"]);
export const isCard = (m: Move): boolean => CARD_TIERS.has(m.tier);
/** A move that takes Fog (a hit), not a utility. */
export const isHit = (m: Move): boolean => m.power !== null && m.hits === 1 && m.tier !== "W";
/** A hit a coverage slot may use: a plain attack. */
const isPlain = (m: Move): boolean => isHit(m) && (m.tier === "E" || m.tier === "N");

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
 * The cards of a species at a level (3.3): its own equipped moves of the data (up to four, in the data's order; the
 * placeholder Little Wiggle slots are left out), then, for a real choice on the wheel until Move Cards exist (lessons,
 * chests and the shop), a normal move two places on and an easy one four places on, from other subjects, to fill what
 * is empty. The Little Wiggle only when nothing else is left. The Finale has its own slot (`finaleOf`).
 */
export function cardMoves(data: BattleData, slug: string, level: number, subject: string): Move[] {
  const sp = data.species[slug];
  const out: Move[] = [];
  const add = (m: Move | undefined) => {
    if (m && isCard(m) && m.unlock_level <= Math.max(level, 1) && !out.some((x) => x.id === m.id) && out.length < 4) out.push(m);
  };
  if (sp) {
    for (const id of equippedAt(sp.equipped, level)) add(data.movesById[id]);
    for (const row of sp.learnset) if (row.level <= level && out.length < 2) add(data.movesById[row.move]);
  }
  const wheel = data.rules.wheel;
  const first = (s: string | undefined, tier: string) => data.moves.filter((m) => m.subject === s && m.tier === tier && isPlain(m) && m.unlock_level <= level).sort((a, b) => a.unlock_level - b.unlock_level)[0];
  add(first(WHEEL_STEP(wheel, subject, 2), "N"));
  add(first(WHEEL_STEP(wheel, subject, 4), "E"));
  if (out.length === 0) out.push(data.movesById[WIGGLE]!);
  return out;
}

/** The Finale of a species when its creature has reached the level; null before. */
export function finaleOf(data: BattleData, slug: string, level: number): Move | null {
  const id = data.species[slug]?.finale;
  const m = id ? data.movesById[id] : undefined;
  return m && m.tier === "F" && m.unlock_level <= level ? m : null;
}

/** Every move a creature knows at a level, by the data's learnset (the Book and the move lab read it). */
export function knownMoves(data: BattleData, slug: string, level: number): Move[] {
  const sp = data.species[slug];
  return (sp?.learnset ?? []).filter((r) => r.level <= level).map((r) => data.movesById[r.move]!).filter(Boolean);
}
