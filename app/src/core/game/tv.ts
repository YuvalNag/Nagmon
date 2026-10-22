/**
 * The TV (docs/app/WORLD_V2.md 8): three channels, each shown for 25
 * seconds, switched by a tap, never started by itself. Sky today (the
 * moon and the sky's event, core/world/sky.ts), Town news (three
 * headlines) and Creature of the day (one species with a picture and a
 * fact; it is slightly more common in the grass that day: a hint, never
 * a prize).
 *
 * THE CONTRACT with the NPC slice: the news is a {@link NewsSource}, a
 * function from the day to three headlines. W2 ships a static one from
 * the TV's definition; W1's resolver ("who is where today") replaces it
 * and the screen does not change.
 */
import { pickDistinct } from "./dayPick";
import type { MonsterTable } from "./monsters";

export const CHANNELS = ["sky", "news", "creature"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_SECONDS = 25;
export const HEADLINES = 3;
/** How much more often the creature of the day is met in the grass. */
export const CREATURE_BOOST = 1.25;

export type NewsSource = (day: string) => string[];

export interface TvData {
  news: string[];
  /** A species and one true line about it. */
  creatures: Record<string, string>;
}

export function tvData(def: Record<string, unknown>): TvData {
  const news = (Array.isArray(def["news"]) ? def["news"] : []).flatMap((x) => (typeof x === "string" && x.trim() ? [x.trim()] : []));
  const creatures: Record<string, string> = {};
  const raw = (typeof def["creatures"] === "object" && def["creatures"] !== null ? def["creatures"] : {}) as Record<string, unknown>;
  for (const [species, text] of Object.entries(raw)) if (typeof text === "string" && text.trim()) creatures[species] = text.trim();
  return { news, creatures };
}

/** The static news: three different headlines chosen by the day. */
export const staticNews =
  (data: TvData): NewsSource =>
  (day) =>
    pickDistinct(data.news, HEADLINES, `news:${day}`);

export interface CreatureOfDay {
  species: string;
  fact: string;
}

/** The creature of the day: one species that has a picture and a line, chosen by the day (null when none can be). */
export function creatureOfDay(data: TvData, monsters: MonsterTable, day: string): CreatureOfDay | null {
  const ids = Object.keys(data.creatures)
    .filter((s) => monsters[s]?.hasSprite)
    .sort();
  const species = pickDistinct(ids, 1, `creature:${day}`)[0];
  return species ? { species, fact: data.creatures[species]! } : null;
}
