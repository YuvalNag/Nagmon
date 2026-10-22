/**
 * Meeting wild creatures on the map (docs/app/TRIPS.md; the old
 * `random_encounter` event): a step inside an encounter area of the map
 * may meet one of that area's table (db/encounters.json). A few quiet
 * steps follow every meeting. The meeting is gentle: a battle is a
 * question, never a danger.
 */
import { type EncounterArea, inBox, type WorldMap } from "../world/mapData";
import { MAX_LEVEL } from "./collection";
import type { MonsterTable } from "./monsters";

export interface TableEntry {
  monster: string;
  rate: number;
  levels: [number, number];
  /** Only by day (true), only by night (false), or always (null). */
  daytime: boolean | null;
}

export type EncounterTables = Record<string, TableEntry[]>;

/** From the parsed db/encounters.json. */
export function encounterTables(doc: unknown): EncounterTables {
  const out: EncounterTables = {};
  if (typeof doc !== "object" || doc === null) return out;
  for (const [slug, raw] of Object.entries(doc as Record<string, unknown>)) {
    const list = (raw as { monsters?: unknown } | null)?.monsters;
    if (!Array.isArray(list)) continue;
    out[slug] = list.flatMap((e: Record<string, unknown>) => {
      const range = e["level_range"] as unknown;
      const lo = Array.isArray(range) ? Number(range[0]) : NaN;
      const hi = Array.isArray(range) ? Number(range[1] ?? range[0]) : NaN;
      if (typeof e["monster"] !== "string" || !Number.isFinite(lo) || !Number.isFinite(hi)) return [];
      const vars = Array.isArray(e["variables"]) ? (e["variables"] as { key?: string; value?: string }[]) : [];
      const day = vars.find((v) => v.key === "daytime")?.value;
      return [{ monster: e["monster"], rate: Math.max(0, Number(e["encounter_rate"] ?? 1)) || 1, levels: [lo, hi] as [number, number], daytime: day === "true" ? true : day === "false" ? false : null }];
    });
  }
  return out;
}

export interface Wild {
  species: string;
  level: number;
  table: string;
}

/**
 * A wild creature's level: its table's range, brought near the partner's (two below to three above). `shift` is the
 * age band's (docs/app/BATTLE_V3.md 5.5: ages 5-7 one level lower, 8-10 none, 11-14 one higher): it moves that window.
 */
export function wildLevel(range: readonly [number, number], partner: number, random: () => number, shift = 0): number {
  const [lo, hi] = range;
  const picked = lo + Math.floor(random() * (hi - lo + 1));
  const near = partner + shift;
  return Math.max(2, Math.min(MAX_LEVEL, Math.max(near - 2, Math.min(near + 3, picked))));
}

export interface EncountersOptions {
  tables: EncounterTables;
  monsters: MonsterTable;
  random?: () => number;
  daytime?: () => boolean;
  /** Steps in an area after a meeting before the next one may come. */
  cooldownSteps?: number;
  /** A browser test's hook: every step in an area meets one. */
  always?: boolean;
  /**
   * The creature of the day (the TV): its weight in the table is multiplied by `factor` (1.25), so it is met a
   * little more often. A hint, never a prize: it changes what is met, not whether anything is.
   */
  boost?: () => { species: string; factor: number } | null;
}

export const DEFAULT_COOLDOWN = 6;

export class Encounters {
  private since = 0;
  private readonly random: () => number;

  constructor(private readonly o: EncountersOptions) {
    this.random = o.random ?? Math.random;
  }

  private area(map: WorldMap, x: number, y: number): EncounterArea | undefined {
    return map.encounters.find((a) => inBox(a.box, x, y));
  }

  /** The hero stepped onto (x, y): a creature meets them, or null. */
  step(map: WorldMap, x: number, y: number, partnerLevel: number, shift = 0): Wild | null {
    const area = this.area(map, x, y);
    if (!area) return null;
    this.since++;
    if (!this.o.always && this.since < (this.o.cooldownSteps ?? DEFAULT_COOLDOWN)) return null;
    if (!this.o.always && this.random() >= Math.min(50, area.rate) / 100) return null;
    const day = (this.o.daytime ?? (() => true))();
    const pool = (this.o.tables[area.table] ?? []).filter((e) => this.o.monsters[e.monster]?.hasSprite && (e.daytime === null || e.daytime === day));
    if (!pool.length) return null;
    const boost = this.o.boost?.() ?? null;
    const weight = (e: TableEntry) => (boost && e.monster === boost.species ? e.rate * boost.factor : e.rate);
    let pick = this.random() * pool.reduce((n, e) => n + weight(e), 0);
    let chosen = pool[pool.length - 1]!;
    for (const e of pool) {
      pick -= weight(e);
      if (pick < 0) {
        chosen = e;
        break;
      }
    }
    this.since = 0;
    return { species: chosen.monster, level: wildLevel(chosen.levels, partnerLevel, this.random, shift), table: area.table };
  }

  /** Quiet steps again (a map was entered, a battle was left). */
  reset(): void {
    this.since = 0;
  }
}
