/**
 * "Show me" (docs/app/WORLD_V2.md 7.3): where the person of a quest's current step is, now. The answer is the
 * resolver's own (core/world/resolver.ts `whereIs`, R8: the pin is where the resolver puts the person right now),
 * never a guess of the journal's, so a child who walks there finds them. A prop (the kitten, the lost-and-found
 * box) is on the map the rules name. The resolver is asked with the map's own room, so a roamer who was moved to
 * another spot (the first was taken) is found where they stand, not where they would have liked to. A person who is away (a shop closed at night) has no pin.
 */
import { holds, type Placement, type WorldEvent } from "../world/mapData";
import { isDir } from "../world/grid";
import type { NpcTable, Phase } from "../world/npcs";
import { resolve, whereIs } from "../world/resolver";
import type { QuestRules } from "./quests";

export interface Pin {
  map: string;
  /** The named spot, when the person stands at one; null for a prop (it is on the map, at its tile). */
  spot: string | null;
}

export interface WhereCtx {
  npcs: NpcTable;
  rules: QuestRules;
  day: string;
  phase: Phase;
  seed: number;
  flags: (name: string) => boolean;
  friendship: (slug: string) => number;
}

/** The pin for a person or prop right now, or null when they are away. */
export function pinOf(slug: string, c: WhereCtx): Pin | null {
  const def = c.npcs[slug];
  if (def) {
    const at = whereIs(def, { day: c.day, phase: c.phase, seed: c.seed, flags: c.flags, friendship: c.friendship });
    if (!at) return null;
    const placement = c.rules.placements[at.map];
    if (!placement) return { map: at.map, spot: at.spot };
    // as the map itself places the people, with its room: a roamer whose spot was taken stands on another one,
    // and one the map has no room for is not there today
    const placed = resolve({ map: at.map, placement, npcs: c.npcs, day: c.day, phase: c.phase, seed: c.seed, flags: c.flags, friendship: c.friendship }).find((p) => p.slug === slug);
    return placed ? { map: at.map, spot: placed.spot } : null;
  }
  const map = c.rules.places.propMaps[slug];
  return map ? { map, spot: null } : null;
}

/** The pin in words: "in town, near the fountain"; the away line when there is none. */
export function pinText(pin: Pin | null, rules: QuestRules): string {
  if (!pin) return rules.places.away;
  const map = rules.places.maps[pin.map] ?? "";
  const spot = pin.spot ? (rules.places.spots[pin.spot] ?? "") : "";
  return [map, spot].filter(Boolean).join(", ");
}

/**
 * The props the map's own `create_npc` events make while `variables` are what they are: the kitten that waits on
 * Route 1 while a quest says `asked`, the wallet until it is dealt with. The map is read once and cached, so the
 * props that depend on what the child has done are asked for again at every entry (the people of the world
 * are placed the same way). One that is made already (`have`) is not made twice.
 */
export function propsNow(events: readonly WorldEvent[], variables: ReadonlyMap<string, string>, have: ReadonlySet<string> = new Set()): Placement[] {
  const characters = new Set(have);
  const out: Placement[] = [];
  for (const e of events) {
    const creates = e.actions.filter((a) => a.type === "create_npc");
    if (!creates.length || !e.conditions.every((c) => holds(c, { variables, characters }))) continue;
    for (const c of creates) {
      if (characters.has(c.args[0]!)) continue;
      const face = e.actions.find((a) => a.type === "char_face" && a.args[0] === c.args[0])?.args[1];
      out.push({ slug: c.args[0]!, x: Number(c.args[1]), y: Number(c.args[2]), facing: isDir(face) ? face : "down" });
      characters.add(c.args[0]!);
    }
  }
  return out;
}
