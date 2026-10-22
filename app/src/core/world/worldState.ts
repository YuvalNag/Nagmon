/**
 * What a child's game keeps between visits, apart from the learner: the
 * coins and the map scripts' variables (the old Tuxemon save's `money`
 * and `game_variables`). Saved as `profiles/<id>/saves/world.json`.
 *
 * Rules kept from the old game (docs/kids/SDD_WORLD.md):
 * - coins are never taken away: the wallet never goes below zero;
 * - a small world reward is capped per person per day by a counter,
 *   `nagmon_daily_<key>` = `<local date>:<count>`, that starts again on a
 *   new day (mods/nagmon/event/conditions/nagmon_daily.py). Testing the
 *   counter never writes anything.
 */

import { boardIsEmpty, type BoardSave, noBoard, parseBoard } from "../game/board";
import { journalIsEmpty, type JournalSave, noJournal, parseJournal } from "../game/journal";
import { mailIsEmpty, type MailSave, noMail, parseMail } from "../game/mail";
import { noPc, parsePc, pcIsEmpty, type PcSave } from "../game/pcBox";
import { type MetSave, parseMet } from "../game/people";
import type { QuestSave } from "../game/questSave";
import { type NpcRecord, parseRecords, recordsToDict } from "./memory";
import { parsePlace, type Place } from "./place";

/**
 * 2: the people of the world (`npcs`, `npc_seed`; docs/app/WORLD_V2.md 5.5).
 * A save of version 1 loads as it is: the people start empty, and the file
 * is written as 2 the next time it is saved.
 */
export const WORLD_SCHEMA_VERSION = 2;

/** One creature of the child: its species (a monsters.json slug), level and the answers it has grown on. */
export interface Creature {
  id: string;
  species: string;
  level: number;
  xp: number;
  /** Friendship, 0 to 5; it never goes down. */
  hearts?: number;
  /** The child's own name for it: kept on the phone, never uploaded or logged. */
  name?: string;
  /**
   * Out of Pep in a battle: fell asleep and needs rest (docs/app/BATTLE_V3.md, decisions). Not lost: it can neither
   * battle nor be used in the field until it is healed, by medicine from the shop or by the nurse at the Rest Center.
   */
  fainted?: boolean;
}

/** Where the child is in the trips (core/game/trips.ts). */
export interface TripSave {
  /** The trip's zones done, by `trip/zone`. */
  done: string[];
  /** Zones the child has been to, by `trip/zone`. */
  visited: string[];
  badges: string[];
  /** The zone the child is in now, `trip/zone`, if they left town. */
  at: string | null;
}

/** What the tutor's lessons have given the child (core/game/lessons.ts). */
export interface LessonSave {
  /** Lessons passed, by lesson id. */
  done: string[];
  /** The last day a repeat of a lesson paid coins, `YYYY-MM-DD`. */
  repeatDay: string | null;
  /** Note charges the child holds (extra uses of lesson notes in a battle). */
  charges: number;
}

/** An egg being warmed: right answers anywhere warm it, and it hatches into a creature of its zone (core/game/eggs.ts). */
export interface Egg {
  id: string;
  /** The encounter table of the zone it was placed in: its creatures are what can hatch. */
  table: string;
  /** Right answers so far, and how many it needs. */
  got: number;
  need: number;
}

export interface WorldData {
  schema_version: number;
  money: number;
  variables: Record<string, string>;
  creatures?: Creature[];
  seen?: string[];
  caught?: string[];
  trips?: TripSave;
  lessons?: LessonSave;
  /** The Bag: how many of each item (only the ones the child has). */
  items?: Record<string, number>;
  /** Where the child stood last (core/world/place.ts). */
  place?: Place;
  /** Eggs being warmed. */
  eggs?: Egg[];
  /**
   * The working objects of the houses (docs/app/WORLD_V2.md 8), each additive and optional: a world with none of
   * them is the file it always was.
   */
  /** The mail box (core/game/mail.ts). */
  mail?: MailSave;
  /** What the child read and the reading stamps (core/game/journal.ts). */
  journal?: JournalSave;
  /** The PC's item box and the starred friends (core/game/pcBox.ts). */
  pc?: PcSave;
  /** The people met (core/game/people.ts). */
  met?: MetSave;
  /** The notice board's accepted postings (core/game/board.ts). */
  board?: BoardSave;
  /** The quests: which are active and where, which are done, the day's board (core/game/quests.ts); ids, days and counters. */
  quests?: QuestSave;
  /** What each person of the world remembers (core/world/memory.ts): ids and numbers, no text. */
  npcs?: Record<string, NpcRecord>;
  /** A random number of this child's world, so the people's days differ between children (not an id). */
  npc_seed?: number;
}

/** A world with no quest done or begun (what `noQuests()` of core/game/questSave.ts makes, as the text it saves as). */
const NO_QUESTS = '{"active":{},"done":{},"week":{"w":0,"n":0},"board":null,"log":[],"vhist":{},"declined":{},"taken":[]}';

export const noTrips = (): TripSave => ({ done: [], visited: [], badges: [], at: null });
export const noLessons = (): LessonSave => ({ done: [], repeatDay: null, charges: 0 });

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function creature(v: unknown): Creature | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const c = v as Record<string, unknown>;
  const level = Number(c["level"]);
  const xp = Number(c["xp"] ?? 0);
  if (typeof c["species"] !== "string" || !c["species"] || !Number.isFinite(level) || level < 1) return null;
  const hearts = Number(c["hearts"] ?? 0);
  const out: Creature = { id: typeof c["id"] === "string" && c["id"] ? c["id"] : "", species: c["species"], level: Math.trunc(level), xp: Number.isFinite(xp) && xp > 0 ? Math.trunc(xp) : 0 };
  if (Number.isFinite(hearts) && hearts > 0) out.hearts = Math.min(5, Math.trunc(hearts));
  if (typeof c["name"] === "string" && c["name"].trim()) out.name = c["name"].trim().slice(0, 16);
  if (c["fainted"] === true) out.fainted = true;
  return out;
}

/** The right answers an egg needs when its save does not say. */
const EGG_DEFAULT_NEED = 10;

function egg(v: unknown): Egg | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const e = v as Record<string, unknown>;
  if (typeof e["id"] !== "string" || !e["id"] || typeof e["table"] !== "string" || !e["table"]) return null;
  const need = Number(e["need"]);
  const got = Number(e["got"]);
  return {
    id: e["id"],
    table: e["table"],
    got: Number.isFinite(got) && got > 0 ? Math.trunc(got) : 0,
    need: Number.isFinite(need) && need >= 1 ? Math.trunc(need) : EGG_DEFAULT_NEED,
  };
}

export class WorldState {
  money = 0;
  readonly variables = new Map<string, string>();
  /** The child's creatures; the first is the partner that answers in battle. */
  creatures: Creature[] = [];
  /** Species met, and species caught (monsters.json slugs). */
  readonly seen = new Set<string>();
  readonly caught = new Set<string>();
  trips: TripSave = noTrips();
  lessons: LessonSave = noLessons();
  /** The Bag: item id to count. Counts are whole numbers above zero. */
  readonly items = new Map<string, number>();
  /** Where the child stood last: a map and a tile. */
  place: Place | null = null;
  /** Eggs being warmed (a few at a time). */
  eggs: Egg[] = [];
  /** The working objects' saves (see {@link WorldData}). */
  mail: MailSave = noMail();
  journal: JournalSave = noJournal();
  pc: PcSave = noPc();
  met: MetSave = {};
  board: BoardSave = noBoard();
  /** Read back unchecked here and checked when the quest engine takes it (core/game/questSave.ts `parseQuests`): the start script does not carry the checker. */
  quests: QuestSave = JSON.parse(NO_QUESTS) as QuestSave;
  /** The people's memory of the child, by the person's slug. */
  npcs = new Map<string, NpcRecord>();
  /** Where this child's town days come from (made once, on the first need). */
  npcSeed: number | null = null;

  /** A saved world.json; anything unreadable starts afresh (no coins are made up). */
  static fromDict(data: unknown): WorldState {
    const w = new WorldState();
    if (typeof data !== "object" || data === null || Array.isArray(data)) return w;
    const d = data as Record<string, unknown>;
    const money = d["money"];
    if (typeof money === "number" && Number.isFinite(money) && money > 0) w.money = Math.trunc(money);
    const vars = d["variables"];
    if (typeof vars === "object" && vars !== null && !Array.isArray(vars)) {
      for (const [k, v] of Object.entries(vars as Record<string, unknown>)) {
        if (typeof v === "string" || typeof v === "number") w.variables.set(k, String(v));
      }
    }
    if (Array.isArray(d["creatures"])) {
      let n = 0;
      for (const raw of d["creatures"]) {
        const c = creature(raw);
        if (c) w.creatures.push({ ...c, id: c.id || `c${++n}` });
      }
    }
    for (const sp of strings(d["seen"])) w.seen.add(sp);
    for (const sp of strings(d["caught"])) w.caught.add(sp);
    const bag = d["items"];
    if (typeof bag === "object" && bag !== null && !Array.isArray(bag)) {
      for (const [id, n] of Object.entries(bag as Record<string, unknown>)) {
        if (typeof n === "number" && Number.isFinite(n) && n >= 1) w.items.set(id, Math.trunc(n));
      }
    }
    w.place = parsePlace(d["place"]);
    if (Array.isArray(d["eggs"])) {
      for (const raw of d["eggs"]) {
        const e = egg(raw);
        if (e) w.eggs.push(e);
      }
    }
    if (d["mail"] !== undefined) w.mail = parseMail(d["mail"]);
    if (d["journal"] !== undefined) w.journal = parseJournal(d["journal"]);
    if (d["pc"] !== undefined) w.pc = parsePc(d["pc"]);
    if (d["met"] !== undefined) w.met = parseMet(d["met"]);
    if (d["board"] !== undefined) w.board = parseBoard(d["board"]);
    if (typeof d["quests"] === "object" && d["quests"] !== null) w.quests = structuredClone(d["quests"]) as QuestSave;
    w.npcs = parseRecords(d["npcs"]);
    const seed = d["npc_seed"];
    if (typeof seed === "number" && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff) w.npcSeed = seed;
    const tr = d["trips"];
    if (typeof tr === "object" && tr !== null && !Array.isArray(tr)) {
      const t = tr as Record<string, unknown>;
      w.trips = { done: strings(t["done"]), visited: strings(t["visited"]), badges: strings(t["badges"]), at: typeof t["at"] === "string" ? t["at"] : null };
    }
    const ls = d["lessons"];
    if (typeof ls === "object" && ls !== null && !Array.isArray(ls)) {
      const l = ls as Record<string, unknown>;
      const charges = Number(l["charges"]);
      w.lessons = {
        done: [...new Set(strings(l["done"]))],
        repeatDay: typeof l["repeatDay"] === "string" && l["repeatDay"] ? l["repeatDay"] : null,
        charges: Number.isFinite(charges) && charges > 0 ? Math.trunc(charges) : 0,
      };
    }
    return w;
  }

  toDict(): WorldData {
    const out: WorldData = {
      schema_version: WORLD_SCHEMA_VERSION,
      money: this.money,
      variables: Object.fromEntries([...this.variables].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    };
    // only what the child has: a world with none of it is the file it always was
    if (this.creatures.length) out.creatures = this.creatures.map((c) => ({ ...c }));
    if (this.seen.size) out.seen = [...this.seen].sort();
    if (this.caught.size) out.caught = [...this.caught].sort();
    if (this.items.size) out.items = Object.fromEntries([...this.items].sort(([a], [b]) => (a < b ? -1 : 1)));
    if (this.place) out.place = { ...this.place };
    if (this.eggs.length) out.eggs = this.eggs.map((e) => ({ ...e }));
    if (!mailIsEmpty(this.mail)) out.mail = structuredClone(this.mail);
    if (!journalIsEmpty(this.journal)) out.journal = structuredClone(this.journal);
    if (!pcIsEmpty(this.pc)) out.pc = structuredClone(this.pc);
    if (Object.keys(this.met).length) out.met = structuredClone(this.met);
    if (!boardIsEmpty(this.board)) out.board = structuredClone(this.board);
    if (JSON.stringify(this.quests) !== NO_QUESTS) out.quests = structuredClone(this.quests);
    if (this.npcs.size) out.npcs = recordsToDict(this.npcs);
    if (this.npcSeed !== null) out.npc_seed = this.npcSeed;
    const t = this.trips;
    if (t.done.length || t.visited.length || t.badges.length || t.at) out.trips = { done: [...t.done], visited: [...t.visited], badges: [...t.badges], at: t.at };
    const l = this.lessons;
    if (l.done.length || l.repeatDay || l.charges) out.lessons = { done: [...l.done], repeatDay: l.repeatDay, charges: l.charges };
    return out;
  }

  /** Adds (or takes) coins; the wallet never goes below zero. Returns the change made. */
  addMoney(amount: number): number {
    const before = this.money;
    this.money = Math.max(0, before + Math.trunc(amount));
    return this.money - before;
  }
}

/** The day as the old game wrote it: the phone's local date, `YYYY-MM-DD`. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const dailyVariable = (key: string) => `nagmon_daily_${key}`;

/** How many times the counter `key` was used on `today`. */
export function countToday(variables: ReadonlyMap<string, string>, key: string, today: string): number {
  const raw = variables.get(dailyVariable(key));
  if (!raw) return 0;
  const at = raw.lastIndexOf(":");
  if (at < 0 || raw.slice(0, at) !== today) return 0;
  const n = Number(raw.slice(at + 1));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Counts one more use of `key` today. */
export function countOneMore(variables: Map<string, string>, key: string, today: string): number {
  const n = countToday(variables, key, today) + 1;
  variables.set(dailyVariable(key), `${today}:${n}`);
  return n;
}
