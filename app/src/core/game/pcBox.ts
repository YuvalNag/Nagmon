/**
 * The PC's storage (docs/app/WORLD_V2.md 8): the Meadow shown as named
 * boxes that can be sorted (by zone, by subject, newest) with a star
 * "favourite", and an item box that holds as many more of an item as the
 * Bag does. Nothing can be released, sold or deleted. Moving a friend
 * between the party and a box is `swapWithMeadow` (core/game/rest.ts).
 *
 * Saved (additive, optional): `pc = {box: {item: n}, fav: [creature ids]}`.
 */
import type { SubjectMap } from "../learning/quiz_flow";
import type { Creature, WorldState } from "../world/worldState";
import { countOf, type Economy, give, take } from "./items";
import type { MonsterTable } from "./monsters";
import type { EncounterTables } from "./encounters";
import { meadow } from "./rest";

export const BOX_SIZE = 8;

export interface PcSave {
  box: Record<string, number>;
  fav: string[];
}

export const noPc = (): PcSave => ({ box: {}, fav: [] });
export const pcIsEmpty = (p: PcSave): boolean => !Object.keys(p.box).length && !p.fav.length;

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function parsePc(v: unknown): PcSave {
  const out = noPc();
  const r = rec(v);
  for (const [id, n] of Object.entries(rec(r["box"]))) if (typeof n === "number" && Number.isFinite(n) && n >= 1) out.box[id] = Math.trunc(n);
  out.fav = [...new Set((Array.isArray(r["fav"]) ? r["fav"] : []).filter((x): x is string => typeof x === "string" && x !== ""))];
  return out;
}

export const inBox = (world: WorldState, id: string): number => world.pc.box[id] ?? 0;

/** Puts up to `n` of an item from the Bag into the item box (the box holds as many as the Bag's stack). Returns how many went. */
export function deposit(world: WorldState, eco: Economy, id: string, n: number): number {
  if (!eco.items[id] || n < 1) return 0;
  const moved = Math.max(0, Math.min(Math.trunc(n), countOf(world, id), eco.stack - inBox(world, id)));
  if (moved < 1 || !take(world, id, moved)) return 0;
  world.pc.box[id] = inBox(world, id) + moved;
  return moved;
}

/** Takes up to `n` of an item out of the box into the Bag (as many as fit). Returns how many came out. */
export function withdraw(world: WorldState, eco: Economy, id: string, n: number): number {
  if (!eco.items[id] || n < 1) return 0;
  const want = Math.max(0, Math.min(Math.trunc(n), inBox(world, id)));
  const got = give(world, eco, id, want);
  if (got > 0) {
    const left = inBox(world, id) - got;
    if (left > 0) world.pc.box[id] = left;
    else delete world.pc.box[id];
  }
  return got;
}

/** The items the child has in the Bag or the box, in the table's order. */
export const storedItems = (world: WorldState, eco: Economy): string[] => eco.order.filter((id) => countOf(world, id) > 0 || inBox(world, id) > 0);

export const isFav = (world: WorldState, id: string): boolean => world.pc.fav.includes(id);

/** Stars or un-stars a friend; false for an unknown friend. */
export function toggleFav(world: WorldState, id: string): boolean {
  if (!world.creatures.some((c) => c.id === id)) return false;
  const at = world.pc.fav.indexOf(id);
  if (at >= 0) world.pc.fav.splice(at, 1);
  else world.pc.fav.push(id);
  return true;
}

export type SortMode = "zone" | "subject" | "newest";

export interface SortContext {
  monsters: MonsterTable;
  encounters: EncounterTables;
  subjects: Pick<SubjectMap, "subjectFor">;
}

/** The first zone (encounter table) a species lives in, as its place in the tables' order; none comes last. */
function zoneRank(species: string, enc: EncounterTables): number {
  const at = Object.keys(enc).findIndex((t) => enc[t]!.some((e) => e.monster === species));
  return at < 0 ? Number.MAX_SAFE_INTEGER : at;
}

/**
 * The Meadow in the order asked, favourites first. This is a view: the
 * order of `world.creatures` (and so the party) does not change.
 */
export function sortedMeadow(world: WorldState, mode: SortMode, ctx: SortContext): Creature[] {
  const list = meadow(world).map((c, i) => ({ c, i }));
  const key = (c: Creature): string | number => {
    if (mode === "zone") return zoneRank(c.species, ctx.encounters);
    if (mode === "subject") return ctx.subjects.subjectFor(ctx.monsters[c.species]?.types ?? [], null, c.species);
    return 0;
  };
  list.sort((a, b) => {
    const fa = isFav(world, a.c.id) ? 0 : 1;
    const fb = isFav(world, b.c.id) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    if (mode === "newest") return b.i - a.i;
    const ka = key(a.c);
    const kb = key(b.c);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.i - b.i;
  });
  return list.map((x) => x.c);
}

/** The Meadow in boxes of {@link BOX_SIZE}: "box 1", "box 2"... (at least one box, even when empty). */
export function boxesOf<T>(list: readonly T[], size = BOX_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out.length ? out : [[]];
}
