/**
 * The sky of a day, worked out from the real date (docs/app/WORLD_V2.md
 * section 8, the TV's "Sky today"): the moon's phase, a meteor shower on
 * the real shower dates, a "solar wind" day about one in seven. Nothing
 * here reads the clock or the network: the caller passes the phone's
 * local day (`YYYY-MM-DD`) and the answer is the same everywhere. The
 * weather and time quests of a later slice read the same function.
 */
import { dayNumber, hashOf } from "../game/dayPick";

export const MOON_PHASES = ["new", "waxing_crescent", "first_quarter", "waxing_gibbous", "full", "waning_gibbous", "last_quarter", "waning_crescent"] as const;
export type MoonPhase = (typeof MOON_PHASES)[number];

export interface Moon {
  phase: MoonPhase;
  /** Where in the month, 0 (new) to 1. */
  age: number;
  /** The share of the face that is lit, 0 to 1. */
  lit: number;
}

/** The mean time from one new moon to the next, in days. */
const SYNODIC = 29.530588853;
/** A new moon: 2000-01-06 18:14 UTC, as days since 1970-01-01. */
const NEW_MOON_EPOCH = 10962 + 18.233 / 24;

/** The moon at the local noon of a date. The mean cycle is right to about half a day, enough for eight phases. */
export function moonOn(day: string): Moon {
  const noon = dayNumber(day) + 0.5;
  const cycles = (noon - NEW_MOON_EPOCH) / SYNODIC;
  const age = cycles - Math.floor(cycles);
  const index = Math.floor(age * 8 + 0.5) % 8;
  return { phase: MOON_PHASES[index]!, age, lit: (1 - Math.cos(2 * Math.PI * age)) / 2 };
}

/** Meteor showers on their real dates (month and day, both ends included). */
const SHOWERS: readonly { id: string; from: [number, number]; to: [number, number] }[] = [
  { id: "quadrantids", from: [1, 3], to: [1, 4] },
  { id: "lyrids", from: [4, 21], to: [4, 23] },
  { id: "eta_aquariids", from: [5, 5], to: [5, 6] },
  { id: "perseids", from: [8, 11], to: [8, 13] },
  { id: "orionids", from: [10, 20], to: [10, 22] },
  { id: "leonids", from: [11, 16], to: [11, 18] },
  { id: "geminids", from: [12, 13], to: [12, 15] },
];

export type SkyEvent = "meteor_shower" | "solar_wind" | "clear";

export interface Sky {
  day: string;
  moon: Moon;
  event: SkyEvent;
  /** The shower's id, on a shower day. */
  shower?: string;
}

function showerOn(day: string): string | null {
  const month = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  const at = month * 100 + d;
  return SHOWERS.find((s) => at >= s.from[0] * 100 + s.from[1] && at <= s.to[0] * 100 + s.to[1])?.id ?? null;
}

export function skyOn(day: string): Sky {
  const moon = moonOn(day);
  const shower = showerOn(day);
  if (shower) return { day, moon, event: "meteor_shower", shower };
  // a solar wind day: about one in seven, by a hash of the date
  if (hashOf(`solar-wind:${day}`) % 7 === 0) return { day, moon, event: "solar_wind" };
  return { day, moon, event: "clear" };
}
