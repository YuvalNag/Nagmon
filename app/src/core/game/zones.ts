/**
 * The bestiary by zone (docs/app/FEATURES.md 4.11): each trip zone, then
 * each map's encounter table, with how many of its creatures were seen
 * and caught. A creature is in the first zone that lists it; one that no
 * zone lists goes to "other places", so the Book is the whole closed set.
 */
import type { EncounterTables } from "./encounters";
import type { MonsterTable } from "./monsters";
import type { Trip } from "./trips";

export interface BookZone {
  id: string;
  title: string;
  species: string[];
  seen: number;
  caught: number;
}

export const OTHER_ZONE = "other";

export function bestiaryZones(o: {
  trips: readonly Trip[];
  encounters: EncounterTables;
  monsters: MonsterTable;
  seen: ReadonlySet<string>;
  caught: ReadonlySet<string>;
  /** Titles of the encounter tables (by table name); "other" is the rest. */
  titles: Readonly<Record<string, string>>;
}): BookZone[] {
  const shown = new Set(Object.values(o.monsters).filter((m) => m.hasSprite).map((m) => m.slug));
  const taken = new Set<string>();
  const out: BookZone[] = [];
  const add = (id: string, title: string, list: readonly string[]) => {
    const species = [...new Set(list)].filter((s) => shown.has(s) && !taken.has(s));
    if (!species.length) return;
    for (const s of species) taken.add(s);
    out.push({
      id,
      title,
      species,
      seen: species.filter((s) => o.seen.has(s) || o.caught.has(s)).length,
      caught: species.filter((s) => o.caught.has(s)).length,
    });
  };
  for (const trip of o.trips) for (const z of trip.zones) add(`${trip.id}/${z.id}`, z.title, z.monsters);
  for (const [table, entries] of Object.entries(o.encounters)) add(table, o.titles[table] ?? o.titles[OTHER_ZONE] ?? table, entries.map((e) => e.monster));
  add(OTHER_ZONE, o.titles[OTHER_ZONE] ?? OTHER_ZONE, [...shown]);
  return out;
}
