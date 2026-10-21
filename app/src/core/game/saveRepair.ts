/**
 * Old saves: a creature saved by an older build may be a species that is
 * no longer in the game (it has no name text and no picture). On loading,
 * such a creature becomes the base creature of the same family when that
 * can be told from its id (the longest shared start, four letters or
 * more), else it is dropped. A child left with no creature gets a default
 * starter, so the partner always exists once the intro was done.
 */
import { INTRO_DONE } from "./intro";
import { addCreature } from "./collection";
import type { MonsterTable } from "./monsters";
import type { WorldState } from "../world/worldState";

export interface Repair {
  /** [old species, new species] pairs. */
  replaced: [string, string][];
  /** Old species ids that were dropped. */
  dropped: string[];
  /** The default starter given, if any. */
  starter: string | null;
}

const MIN_SHARED = 4;

const shared = (a: string, b: string): number => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

/** The basic creature (with a picture) at the root of a species' family. */
function baseOf(slug: string, monsters: MonsterTable): string | null {
  let at = slug;
  for (let guard = 0; guard < 6; guard++) {
    const parent = Object.values(monsters).find((m) => m.evolutions.some((e) => e.monster_slug === at));
    if (!parent) break;
    at = parent.slug;
  }
  return monsters[at]?.hasSprite ? at : null;
}

function mapSpecies(old: string, monsters: MonsterTable): string | null {
  let best: string | null = null;
  let bestLen = MIN_SHARED - 1;
  for (const slug of Object.keys(monsters).sort()) {
    const n = shared(old, slug);
    if (n > bestLen) {
      best = slug;
      bestLen = n;
    }
  }
  return best ? baseOf(best, monsters) : null;
}

/** The default starter: the first basic creature that has a picture and can grow. */
function defaultStarter(monsters: MonsterTable): string | null {
  return (
    Object.values(monsters)
      .filter((m) => m.stage === "basic" && m.hasSprite && m.evolutions.length > 0)
      .map((m) => m.slug)
      .sort()[0] ?? null
  );
}

export function repairSave(world: WorldState, monsters: MonsterTable): Repair {
  const out: Repair = { replaced: [], dropped: [], starter: null };
  const known = (s: string) => monsters[s] !== undefined;
  const hadCreatures = world.creatures.length > 0;
  const level = Math.max(3, ...world.creatures.filter((c) => !known(c.species)).map((c) => c.level));
  const kept = [];
  for (const c of world.creatures) {
    if (known(c.species)) {
      kept.push(c);
      continue;
    }
    const to = mapSpecies(c.species, monsters);
    if (to) {
      out.replaced.push([c.species, to]);
      kept.push({ ...c, species: to });
    } else out.dropped.push(c.species);
  }
  world.creatures = kept;
  for (const set of [world.seen, world.caught]) {
    for (const s of [...set]) {
      if (known(s)) continue;
      set.delete(s);
      const to = mapSpecies(s, monsters);
      if (to) set.add(to);
    }
  }
  if (hadCreatures && world.creatures.length === 0 && world.variables.get(INTRO_DONE) === "yes") {
    const starter = defaultStarter(monsters);
    if (starter) {
      addCreature(world, starter, level);
      world.variables.set("nagmon_starter", starter);
      out.starter = starter;
    }
  }
  return out;
}
