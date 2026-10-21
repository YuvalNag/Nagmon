/**
 * The child's creatures: catching, growing and the bestiary
 * (docs/app/TRIPS.md §7.3). Pure functions over the world's save.
 *
 * - The first creature is the partner: it answers in battle.
 * - A correct answer is one point of growth (a super answer, two). A
 *   level takes a few points, a little more for each level.
 * - A creature evolves when its species says, a third of the way: the old
 *   game's level 24 is level 8 here, because a child plays minutes a day.
 *   It only evolves into a creature that has a picture.
 */
import type { Creature, WorldState } from "../world/worldState";

export const MAX_LEVEL = 50;
export const MIN_EVOLVE = 6;
/** The friends that go along: the first four creatures; the rest wait in the Meadow. */
export const PARTY_SIZE = 4;

/** What the game needs to know about one species (from db/monsters.json). */
export interface MonsterInfo {
  slug: string;
  types: readonly string[];
  stage: string;
  evolutions: readonly { at_level: number; monster_slug: string }[];
  hasSprite: boolean;
}

/**
 * Growth points a creature of this level needs for the next level: 6 + level
 * (docs/app/BATTLE_V3.md 5.4). The first curve (3 + level/2) was about twice
 * as fast: a parent saw levels 9 to 12 within minutes. Levels already earned
 * are kept; only the next ones cost more.
 */
export function needFor(level: number): number {
  return 6 + level;
}

/** The level at which a species that evolves "at level N" does, here. */
export function evolveLevel(atLevel: number): number {
  return Math.max(MIN_EVOLVE, Math.round(atLevel / 3));
}

export function markSeen(world: WorldState, species: string): void {
  world.seen.add(species);
}

export function partner(world: WorldState): Creature | null {
  return world.creatures[0] ?? null;
}

/** A new creature for the child (seen and caught too). */
export function addCreature(world: WorldState, species: string, level: number): Creature {
  let n = world.creatures.length + 1;
  const ids = new Set(world.creatures.map((c) => c.id));
  while (ids.has(`c${n}`)) n++;
  const c: Creature = { id: `c${n}`, species, level: Math.max(1, Math.min(MAX_LEVEL, Math.trunc(level))), xp: 0 };
  world.creatures.push(c);
  world.seen.add(species);
  world.caught.add(species);
  return c;
}

export interface Growth {
  leveled: boolean;
  level: number;
  evolvedTo: string | null;
}

/** Gives growth points to a creature: levels up, and evolves when it is time. */
export function giveXp(world: WorldState, id: string, points: number, monsters: Readonly<Record<string, MonsterInfo>>): Growth {
  const c = world.creatures.find((x) => x.id === id);
  if (!c) return { leveled: false, level: 0, evolvedTo: null };
  let leveled = false;
  let evolvedTo: string | null = null;
  c.xp += Math.max(0, Math.trunc(points));
  while (c.level < MAX_LEVEL && c.xp >= needFor(c.level)) {
    c.xp -= needFor(c.level);
    c.level++;
    leveled = true;
    const next = monsters[c.species]?.evolutions[0];
    if (next && c.level >= evolveLevel(next.at_level) && monsters[next.monster_slug]?.hasSprite) {
      c.species = next.monster_slug;
      evolvedTo = next.monster_slug;
      world.seen.add(next.monster_slug);
      world.caught.add(next.monster_slug);
    }
  }
  if (c.level >= MAX_LEVEL) c.xp = 0;
  return { leveled, level: c.level, evolvedTo };
}

export function bestiary(world: WorldState, all: readonly string[]): { seen: number; caught: number; total: number } {
  return { seen: all.filter((s) => world.seen.has(s)).length, caught: all.filter((s) => world.caught.has(s)).length, total: all.length };
}
