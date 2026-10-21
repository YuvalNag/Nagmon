/**
 * The trip engine (docs/app/TRIPS.md): a trip is a chapter of the game, a
 * teacher's magic vehicle that takes the child to a few zones of one
 * subject. The first trip is the solar system (moon, sun, rocky planets,
 * giants, outer); a new trip is content only, no new code.
 *
 * The trip's file is `mods/nagmon/trips/<id>.yaml`, built to
 * `game/trips/<id>.json` (tools/app/trips.py). Its shape, as this loader
 * reads it (names in brackets are accepted too; anything else is ignored):
 *
 *     id: solar
 *     title_he: מערכת השמש            [title, name_he, name]
 *     subject: science                 # the trip's subject; starters and questions follow it
 *     vehicle: {name_he: ...}          # Mila's vehicle
 *     master:                          # the test at the end
 *       monster: jovigale               # the master's creature (any species of the table)
 *       level: 14
 *       badge: astronomer              # the badge's id
 *       badge_title_he: מבחן האסטרונומית
 *     zones:                           # in order
 *       - id: moon
 *         title_he: הירח
 *         map: space_moon              # game/maps/<map>.json; a zone whose map is not built is "coming soon"
 *         start: {x: 4, y: 9}          # where the vehicle lands
 *         unlock_level: 0              # the child's best creature's level   [min_level, level]
 *         requires: [moon]             # zones that must be done first       [after, needs]
 *         cost: 10                     # coins the vehicle takes             [price, fare]
 *         monsters: [slug, ...]        # the zone's creatures (the bestiary)
 *         catch: 2                     # how many must be caught (default: half of them)
 *         done_variable: moon_done     # the mission: a variable the zone's scripts set to "yes"
 *                                      # a zone is done when it has all it asks for:
 *                                      # the mission AND the catches
 *
 * Nothing here needs the file: with none, there is no trip and the game
 * goes on in town.
 */
import type { WorldState } from "../world/worldState";
import { MAX_LEVEL } from "./collection";

export const ASTRONOMER_BADGE = "astronomer";
export const DEFAULT_COST = 10;
/** The trip files the game looks for under `game/trips/`. */
export const TRIP_FILES: readonly string[] = ["solar"];

export interface Zone {
  id: string;
  title: string;
  /** The map's name, or null when the file does not say. */
  map: string | null;
  start: { x: number; y: number } | null;
  unlockLevel: number;
  requires: string[];
  cost: number;
  monsters: string[];
  catchNeeded: number;
  doneVariable: string | null;
  /** The zone's map is in the build. */
  ready: boolean;
}

export interface Trip {
  id: string;
  title: string;
  subject: string;
  vehicle: string;
  master: { monster: string | null; level: number; badge: string; badgeTitle: string };
  zones: Zone[];
}

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (...vs: unknown[]): string | null => {
  for (const v of vs) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
};
const num = (...vs: unknown[]): number | null => {
  for (const v of vs) if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
};
const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function monsterSlugs(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((m) => (typeof m === "string" ? [m] : isDict(m) ? [str(m["monster"], m["slug"], m["species"])].filter((x): x is string => x !== null) : []));
}

function zoneOf(raw: unknown, i: number): Zone | null {
  if (!isDict(raw)) return null;
  const id = str(raw["id"], raw["slug"], raw["key"]) ?? `zone${i + 1}`;
  const s = raw["start"];
  const sx = isDict(s) ? num(s["x"]) : num(raw["start_x"]);
  const sy = isDict(s) ? num(s["y"]) : num(raw["start_y"]);
  const monsters = monsterSlugs(raw["monsters"]);
  const need = num(raw["catch"], raw["catch_needed"], raw["need"]);
  return {
    id,
    title: str(raw["title_he"], raw["name_he"], raw["title"], raw["name"]) ?? id,
    map: str(raw["map"], raw["map_slug"]),
    start: sx !== null && sy !== null ? { x: Math.trunc(sx), y: Math.trunc(sy) } : null,
    unlockLevel: Math.max(0, Math.trunc(num(raw["unlock_level"], raw["min_level"], raw["level"], raw["requires_level"]) ?? 0)),
    requires: strings(raw["requires"] ?? raw["after"] ?? raw["needs"]),
    cost: Math.max(0, Math.trunc(num(raw["cost"], raw["price"], raw["fare"]) ?? DEFAULT_COST)),
    monsters,
    catchNeeded: Math.max(1, Math.min(Math.max(1, monsters.length), Math.trunc(need ?? Math.ceil(monsters.length / 2)))),
    doneVariable: str(raw["done_variable"], raw["done_flag"]),
    // the file alone does not know the build: loadTrips sets it
    ready: true,
  };
}

/** A trip from its parsed file; null when it is not one (no id, no zones). */
export function parseTrip(doc: unknown): Trip | null {
  if (!isDict(doc)) return null;
  const id = str(doc["id"], doc["slug"], doc["name"]);
  if (!id || !Array.isArray(doc["zones"])) return null;
  const zones = doc["zones"].map(zoneOf).filter((z): z is Zone => z !== null);
  if (!zones.length) return null;
  const master = isDict(doc["master"]) ? doc["master"] : {};
  const vehicle = isDict(doc["vehicle"]) ? doc["vehicle"] : {};
  return {
    id,
    title: str(doc["title_he"], doc["name_he"], doc["title"], doc["name"]) ?? id,
    subject: str(doc["subject"]) ?? "science",
    vehicle: str(vehicle["name_he"], vehicle["name"], typeof doc["vehicle"] === "string" ? doc["vehicle"] : null) ?? "המעבורת של מילה",
    master: {
      monster: str(master["monster"], master["species"]),
      level: Math.max(2, Math.min(MAX_LEVEL, Math.trunc(num(master["level"]) ?? 12))),
      badge: str(master["badge"], doc["badge"]) ?? ASTRONOMER_BADGE,
      badgeTitle: str(master["badge_title_he"], master["title_he"], doc["badge_title_he"]) ?? "מבחן האסטרונומית",
    },
    zones,
  };
}

/**
 * The trips of the build: each file read if it is there (a missing or
 * unreadable one is no trip), and each zone's map checked to be in the
 * build (`mapExists`).
 */
export async function loadTrips(
  fetchJson: (path: string) => Promise<unknown>,
  mapExists: (map: string) => Promise<boolean>,
  files: readonly string[] = TRIP_FILES,
): Promise<Trip[]> {
  const out: Trip[] = [];
  for (const f of files) {
    let doc: unknown;
    try {
      doc = await fetchJson(`trips/${f}.json`);
    } catch {
      continue;
    }
    const trip = parseTrip(doc);
    if (!trip) continue;
    for (const z of trip.zones) {
      z.ready = z.map !== null && (await mapExists(z.map).catch(() => false));
    }
    out.push(trip);
  }
  return out;
}

/** The zones a child can be taken to: their map is in the build. */
export function availableZones(trip: Trip): Zone[] {
  return trip.zones.filter((z) => z.ready);
}

/** The trip and zone a map belongs to. */
export function tripFor(trips: readonly Trip[], map: string): { trip: Trip; zone: Zone } | null {
  for (const trip of trips) {
    const zone = trip.zones.find((z) => z.map === map);
    if (zone) return { trip, zone };
  }
  return null;
}

/** The highest level among the child's creatures. */
export function bestLevel(world: WorldState): number {
  return world.creatures.reduce((n, c) => Math.max(n, c.level), 0);
}

const key = (trip: Trip, zone: Zone) => `${trip.id}/${zone.id}`;

export type ZoneState = { state: "open" } | { state: "done" } | { state: "locked"; needLevel: number; needZones: string[] };

export function zoneState(trip: Trip, zone: Zone, world: WorldState): ZoneState {
  if (world.trips.done.includes(key(trip, zone))) return { state: "done" };
  const needZones = zone.requires.filter((id) => !world.trips.done.includes(`${trip.id}/${id}`));
  const needLevel = bestLevel(world) >= zone.unlockLevel ? 0 : zone.unlockLevel;
  return needZones.length || needLevel ? { state: "locked", needLevel, needZones } : { state: "open" };
}

export interface Progress {
  /** Zones that became done now, `trip/zone`. */
  zonesDone: string[];
  /** Trips whose test is ready now (all zones done, no badge yet). */
  masterReady: string[];
}

/** Marks the zones that are done by now. Says what is new, once. */
export function refreshProgress(world: WorldState, trips: readonly Trip[]): Progress {
  const zonesDone: string[] = [];
  const masterReady: string[] = [];
  for (const trip of trips) {
    for (const z of trip.zones) {
      const k = key(trip, z);
      if (world.trips.done.includes(k)) continue;
      const caught = z.monsters.filter((m) => world.caught.has(m)).length;
      const empty = z.monsters.length === 0 && z.doneVariable === null;
      // what a zone asks for is all of what it has: its mission (the done variable) AND its catches
      const caughtEnough = z.monsters.length === 0 || caught >= z.catchNeeded;
      const missionDone = z.doneVariable === null || world.variables.get(z.doneVariable) === "yes";
      const done = empty ? world.trips.visited.includes(k) : caughtEnough && missionDone;
      if (done) {
        world.trips.done.push(k);
        zonesDone.push(k);
      }
    }
    const allDone = trip.zones.every((z) => world.trips.done.includes(key(trip, z)));
    if (allDone && !world.trips.badges.includes(`${trip.id}/${trip.master.badge}`)) masterReady.push(trip.id);
  }
  // ready now, said only when it is new: a test that was ready before is not news
  return { zonesDone, masterReady };
}

/** The trip's progress, 0 to 100: zones done, creatures caught and the badge, counted together. */
export function progressPercent(world: WorldState, trip: Trip): number {
  const done = new Set(world.trips.done);
  const zones = trip.zones.filter((z) => done.has(key(trip, z))).length;
  const species = [...new Set(trip.zones.flatMap((z) => z.monsters))];
  const caught = species.filter((s) => world.caught.has(s)).length;
  const badge = world.trips.badges.includes(`${trip.id}/${trip.master.badge}`) ? 1 : 0;
  const total = trip.zones.length + species.length + 1;
  return Math.round((100 * (zones + caught + badge)) / total);
}

export type TravelResult =
  | { ok: true; paid: number }
  | { ok: false; reason: "locked" | "soon" }
  | { ok: false; reason: "coins"; missing: number };

/**
 * Mila's vehicle takes the child to a zone for its coins (and home for
 * nothing). Nothing is taken unless the way is open and the child can pay.
 */
export function travelTo(world: WorldState, trip: Trip, zone: Zone): TravelResult {
  if (!zone.ready) return { ok: false, reason: "soon" };
  if (zoneState(trip, zone, world).state === "locked") return { ok: false, reason: "locked" };
  if (world.money < zone.cost) return { ok: false, reason: "coins", missing: zone.cost - world.money };
  world.addMoney(-zone.cost);
  const k = key(trip, zone);
  if (!world.trips.visited.includes(k)) world.trips.visited.push(k);
  world.trips.at = k;
  return { ok: true, paid: zone.cost };
}
