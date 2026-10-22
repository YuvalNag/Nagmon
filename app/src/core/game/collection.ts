/**
 * The child's creatures: catching, growing and the bestiary
 * (docs/app/TRIPS.md §7.3). Pure functions over the world's save.
 *
 * - The first creature is the partner: it answers in battle.
 * - A correct answer is one point of growth (a super answer, two). A
 *   level takes 6 + the level points (the rules file's curve).
 * - Growth never evolves a creature: evolution has gates and the child
 *   chooses when (core/game/evolution.ts, BATTLE_V3 7.1).
 */
import type { Creature, WorldState } from "../world/worldState";

export const MAX_LEVEL = 50;
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

/** The growth curve: points to the next level are `base + perLevel * level` (the data's `growth.need_base` and `need_per_level`). */
export interface GrowthCurve {
  base: number;
  perLevel: number;
}
export const DEFAULT_GROWTH: Readonly<GrowthCurve> = { base: 6, perLevel: 1 };
let curve: GrowthCurve = { ...DEFAULT_GROWTH };

/**
 * Sets the curve from the rules file when the game's data loads (a nonsense rule changes nothing). The first
 * curve (3 + level/2) was about twice as fast: a parent saw levels 9 to 12 within minutes. Levels already earned
 * are kept; only the next ones cost what the curve says (BATTLE_V3 5.4).
 */
export function configureGrowth(rules: { need_base?: unknown; need_per_level?: unknown }): void {
  const ok = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 50;
  if (ok(rules.need_base) && ok(rules.need_per_level)) curve = { base: rules.need_base, perLevel: rules.need_per_level };
}

/** Growth points a creature of this level needs for the next level (6 + level, unless the data says otherwise). */
export function needFor(level: number): number {
  return curve.base + curve.perLevel * level;
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
}

/** Gives growth points to a creature: levels up. It never evolves (that is the child's choice, core/game/evolution.ts). */
export function giveXp(world: WorldState, id: string, points: number): Growth {
  const c = world.creatures.find((x) => x.id === id);
  if (!c) return { leveled: false, level: 0 };
  let leveled = false;
  c.xp += Math.max(0, Math.trunc(points));
  while (c.level < MAX_LEVEL && c.xp >= needFor(c.level)) {
    c.xp -= needFor(c.level);
    c.level++;
    leveled = true;
  }
  if (c.level >= MAX_LEVEL) c.xp = 0;
  return { leveled, level: c.level };
}

export function bestiary(world: WorldState, all: readonly string[]): { seen: number; caught: number; total: number } {
  return { seen: all.filter((s) => world.seen.has(s)).length, caught: all.filter((s) => world.caught.has(s)).length, total: all.length };
}
