/**
 * The people of the world as data (docs/app/WORLD_V2.md 5.1): one record
 * for each, built from `mods/nagmon/npcs/<slug>.yaml` and its lines file
 * by `tools/app/npcs.py` into `game/npcs.json`, and read here.
 *
 * Only what the game needs while it runs is shipped: the name, the role,
 * the topics a child may tap, the schedule, how friendship grows and the
 * shipped line pools. The persona card (voice, personality, what the
 * person never says) stays in the YAML for the live-line slice (W6).
 */
import { isDir, type Dir } from "./grid";

export type Phase = "morning" | "afternoon" | "evening" | "night";
export const PHASES: readonly Phase[] = ["morning", "afternoon", "evening", "night"];

/** The day part of an hour of the phone's clock: morning 05 to 11, afternoon 12 to 17, evening 18 to 22, night otherwise. */
export function phaseOf(hour: number): Phase {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 23) return "evening";
  return "night";
}

/** A topic chip: a picture and a few words the child taps. */
export interface Topic {
  id: string;
  label: string;
  /** The picture's code in the emoji set (game/emoji/<code>.svg). */
  icon: string;
  /** The friendship level (0 to 3) that opens it. */
  unlock: number;
}

/** When a line may be said: every field that is there must hold. */
export interface LineWhen {
  phase?: Phase[];
  /** 0 (Sunday) to 6. */
  weekday?: number[];
  friendship_min?: number;
  friendship_max?: number;
}

/** One shipped line of a pool (WORLD_V2.md 4.3). */
export interface Line {
  /** Stable: it is what the person's memory keeps, never the text. */
  id: string;
  text: string;
  when?: LineWhen;
  weight: number;
  /** A running gag: shown at most once in 3 visits. */
  gag: boolean;
  /** A tag for the global ring of recent shapes. */
  shape?: string;
}

/** A place: a named spot of a map, or a pool of them. */
export interface Where {
  map: string;
  spot?: string;
  spots?: string[];
}

export interface RuleWhen {
  phase?: Phase[];
  weekday?: number[];
  /** Every `n`th day (the start day is the person's own, from the seed). */
  every?: number;
}

export interface Rule {
  when: RuleWhen;
  /** Null: away (a closed shop). */
  at: Where | null;
}

export interface Appears {
  flag_all?: string[];
  flag_none?: string[];
  /** Friendship of another person at least this. */
  friendship?: { npc: string; min: number };
}

export interface Schedule {
  default: Where | null;
  rules: Rule[];
  roam: { map: string; spots: string[] } | null;
  appears_if?: Appears;
  /** In the world only `stay_days` of every `every_days` days. */
  visit?: { every_days: number; stay_days: number };
  /** Out at night too (the nurse, the owl). */
  night: boolean;
}

export interface Gains {
  first_talk_today: number;
  new_topic: number;
  gift_loved: number;
  gift_liked: number;
  gift_ok: number;
  quest_done: number;
}

export interface NpcDef {
  id: string;
  /** As the speaker's label: "המוכר אבי". */
  name: string;
  role: string;
  age_feel: string;
  sprite: string;
  /** Inside its building or at its post: never roams, never dropped for room. */
  anchor: boolean;
  /** Who stays when a map is full: higher first. */
  priority: number;
  topics: Topic[];
  /** Fact ids (facts.json) the person may hand over on the "fact" topic. */
  facts: string[];
  schedule: Schedule;
  relationship: { levels: number[]; gain: Gains; flags: string[] };
  not_with: string[];
  /** Pools by intent: greet_first, greet_again, idle, farewell, topic:<id>. */
  lines: Record<string, Line[]>;
}

export type NpcTable = Record<string, NpcDef>;

export const DEFAULT_LEVELS = [0, 4, 10, 20];
export const DEFAULT_GAINS: Gains = { first_talk_today: 1, new_topic: 1, gift_loved: 3, gift_liked: 2, gift_ok: 1, quest_done: 3 };

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);

function phases(v: unknown): Phase[] {
  return strs(v).filter((p): p is Phase => (PHASES as readonly string[]).includes(p));
}

function ints(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [];
}

function where(v: unknown): Where | null {
  const o = obj(v);
  if (!o || !str(o["map"])) return null;
  const spots = strs(o["spots"]);
  const spot = str(o["spot"]);
  if (!spot && !spots.length) return null;
  return { map: str(o["map"]), ...(spot ? { spot } : {}), ...(spots.length ? { spots } : {}) };
}

function when(v: unknown): LineWhen | undefined {
  const o = obj(v);
  if (!o) return undefined;
  const w: LineWhen = {};
  const ph = phases(o["phase"]);
  if (ph.length) w.phase = ph;
  const wd = ints(o["weekday"]);
  if (wd.length) w.weekday = wd;
  if (typeof o["friendship_min"] === "number") w.friendship_min = o["friendship_min"];
  if (typeof o["friendship_max"] === "number") w.friendship_max = o["friendship_max"];
  return Object.keys(w).length ? w : undefined;
}

function line(v: unknown): Line | null {
  const o = obj(v);
  if (!o || !str(o["id"]) || !str(o["text"]).trim()) return null;
  const w = when(o["when"]);
  const shape = str(o["shape"]);
  return {
    id: str(o["id"]),
    text: str(o["text"]).trim(),
    ...(w ? { when: w } : {}),
    weight: num(o["weight"], 1) > 0 ? num(o["weight"], 1) : 1,
    gag: o["gag"] === true,
    ...(shape ? { shape } : {}),
  };
}

function schedule(v: unknown): Schedule {
  const o = obj(v) ?? {};
  const rules: Rule[] = [];
  for (const r of Array.isArray(o["rules"]) ? o["rules"] : []) {
    const ro = obj(r);
    if (!ro) continue;
    const w = obj(ro["when"]) ?? {};
    const rw: RuleWhen = {};
    const ph = phases(w["phase"]);
    if (ph.length) rw.phase = ph;
    const wd = ints(w["weekday"]);
    if (wd.length) rw.weekday = wd;
    if (typeof w["every"] === "number" && w["every"] >= 2) rw.every = Math.trunc(w["every"]);
    rules.push({ when: rw, at: ro["at"] === null ? null : where(ro["at"]) });
  }
  const roam = obj(o["roam"]);
  const roamSpots = roam ? strs(roam["spots"]) : [];
  const ap = obj(o["appears_if"]);
  const fr = ap ? obj(ap["friendship"]) : null;
  const visit = obj(o["visit"]);
  const appears: Appears = {};
  if (ap && strs(ap["flag_all"]).length) appears.flag_all = strs(ap["flag_all"]);
  if (ap && strs(ap["flag_none"]).length) appears.flag_none = strs(ap["flag_none"]);
  if (fr && str(fr["npc"])) appears.friendship = { npc: str(fr["npc"]), min: num(fr["min"], 1) };
  return {
    default: where(o["default"]),
    rules,
    roam: roam && str(roam["map"]) && roamSpots.length ? { map: str(roam["map"]), spots: roamSpots } : null,
    ...(Object.keys(appears).length ? { appears_if: appears } : {}),
    ...(visit && num(visit["every_days"], 0) >= 2 && num(visit["stay_days"], 0) >= 1
      ? { visit: { every_days: Math.trunc(num(visit["every_days"], 0)), stay_days: Math.trunc(num(visit["stay_days"], 0)) } }
      : {}),
    night: o["night"] === true,
  };
}

function topic(v: unknown): Topic | null {
  const o = obj(v);
  if (!o || !str(o["id"]) || !str(o["label"])) return null;
  return { id: str(o["id"]), label: str(o["label"]), icon: str(o["icon"]), unlock: Math.min(3, Math.max(0, Math.trunc(num(o["unlock"], 0)))) };
}

function def(id: string, v: unknown): NpcDef | null {
  const o = obj(v);
  if (!o || !str(o["name"]) || !str(o["sprite"])) return null;
  const rel = obj(o["relationship"]) ?? {};
  const gains = obj(rel["gain"]) ?? {};
  const levels = Array.isArray(rel["levels"]) && rel["levels"].length === 4 && rel["levels"].every((n) => typeof n === "number") ? (rel["levels"] as number[]) : DEFAULT_LEVELS;
  const lines: Record<string, Line[]> = {};
  for (const [k, pool] of Object.entries(obj(o["lines"]) ?? {})) {
    const ls = (Array.isArray(pool) ? pool : []).map(line).filter((l): l is Line => l !== null);
    if (ls.length) lines[k] = ls;
  }
  return {
    id,
    name: str(o["name"]),
    role: str(o["role"]),
    age_feel: str(o["age_feel"]),
    sprite: str(o["sprite"]),
    anchor: o["anchor"] === true,
    priority: Math.trunc(num(o["priority"], 0)),
    topics: (Array.isArray(o["topics"]) ? o["topics"] : []).map(topic).filter((t): t is Topic => t !== null).slice(0, 4),
    facts: strs(o["facts"]),
    schedule: schedule(o["schedule"]),
    relationship: {
      levels,
      gain: Object.fromEntries(Object.keys(DEFAULT_GAINS).map((k) => [k, Math.max(0, Math.trunc(num(gains[k], DEFAULT_GAINS[k as keyof Gains])))])) as unknown as Gains,
      flags: strs(rel["flags"]),
    },
    not_with: strs(o["not_with"]),
    lines,
  };
}

/** The people of the build (game/npcs.json); a person with no name or sprite is left out, a missing file is no one. */
export function npcTable(doc: unknown): NpcTable {
  const raw = obj(obj(doc)?.["npcs"]) ?? {};
  const out: NpcTable = {};
  for (const [id, v] of Object.entries(raw)) {
    const d = def(id, v);
    if (d) out[id] = d;
  }
  return out;
}

/** A named spot of a map: where someone stands, and the way they face. */
export interface Spot {
  x: number;
  y: number;
  facing: Dir;
}

/** What a map says about its people: the named spots and how many may be there at once (`nagmon_placement`). */
export interface MapPlacement {
  maxNpcs: number;
  spots: Record<string, Spot>;
}

/** From the map's `nagmon_placement` property (tools/app/maps.py); null when the map places nobody. */
export function mapPlacement(v: unknown): MapPlacement | null {
  const o = obj(v);
  const spotsRaw = o ? obj(o["spots"]) : null;
  if (!o || !spotsRaw) return null;
  const spots: Record<string, Spot> = {};
  for (const [name, s] of Object.entries(spotsRaw)) {
    const a = Array.isArray(s) ? s : [];
    if (!Number.isInteger(a[0]) || !Number.isInteger(a[1])) continue;
    spots[name] = { x: a[0] as number, y: a[1] as number, facing: isDir(a[2]) ? a[2] : "down" };
  }
  return { maxNpcs: Math.max(0, Math.trunc(num(o["max_npcs"], 8))), spots };
}
