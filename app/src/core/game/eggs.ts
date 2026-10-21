/**
 * Eggs (docs/app/FEATURES.md 5.3): a mystery egg from the Bag is placed
 * in a nest (`place_egg`) and warmed by right answers anywhere, one step
 * for each. It hatches into a creature of the zone where it was placed:
 * the zone's own list, never the whole game, and not a dice roll (the
 * same egg gives the same friend), preferring one the child does not
 * have yet. Nothing is ever lost: an egg that cannot be placed stays in
 * the Bag, and an egg of a zone with no creatures keeps warming.
 */
import type { Egg, WorldState } from "../world/worldState";
import { addCreature } from "./collection";
import { type Economy, take, countOf } from "./items";
import { EGG_ITEM } from "./loot";

/** Right answers an egg needs. */
export const EGG_NEED = 10;
/** Eggs warming at a time. */
export const MAX_EGGS = 2;

export interface PoolEntry {
  species: string;
  /** The level it hatches at. */
  level: number;
}

/** The creatures of a zone (an encounter table), for hatching. */
export type Pools = (table: string) => PoolEntry[];

export type Placed = { ok: true } | { ok: false; reason: "none" | "full" };

const SEQ = "nagmon_egg_seq";

/** Takes an egg from the Bag and starts warming it for `table`'s zone. */
export function placeEgg(world: WorldState, _eco: Economy, table: string): Placed {
  if (countOf(world, EGG_ITEM) < 1) return { ok: false, reason: "none" };
  if (world.eggs.length >= MAX_EGGS) return { ok: false, reason: "full" };
  take(world, EGG_ITEM);
  const n = (Number(world.variables.get(SEQ)) || 0) + 1;
  world.variables.set(SEQ, String(n));
  world.eggs.push({ id: `e${n}`, table, got: 0, need: EGG_NEED });
  return { ok: true };
}

export interface Hatched {
  eggId: string;
  species: string;
  level: number;
}

const hash = (s: string): number => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function hatchFor(world: WorldState, egg: Egg, pool: readonly PoolEntry[]): PoolEntry | null {
  const unique = [...new Map(pool.map((e) => [e.species, e])).values()];
  if (!unique.length) return null;
  const fresh = unique.filter((e) => !world.caught.has(e.species));
  const list = fresh.length ? fresh : unique;
  return list[hash(egg.id) % list.length]!;
}

/** A right answer: every egg warms one step; the ones that are ready hatch. Returns what hatched. */
export function warmEggs(world: WorldState, pools: Pools): Hatched[] {
  const out: Hatched[] = [];
  for (const egg of [...world.eggs]) {
    egg.got = Math.min(egg.need, egg.got + 1);
    if (egg.got < egg.need) continue;
    const chosen = hatchFor(world, egg, pools(egg.table));
    if (!chosen) continue;
    world.eggs.splice(world.eggs.indexOf(egg), 1);
    addCreature(world, chosen.species, Math.max(2, chosen.level));
    out.push({ eggId: egg.id, species: chosen.species, level: Math.max(2, chosen.level) });
  }
  return out;
}
