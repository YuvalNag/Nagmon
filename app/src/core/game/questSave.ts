/**
 * What a child's save keeps of the quests (`world.quests`, additive and optional): ids, days and small counters.
 * Kept apart from core/game/quests.ts (the quests' data and rules) so the saved world, which the whole app reads,
 * does not drag the rest of the quest code into the start script.
 */
export type Slot = "easy" | "normal" | "learning" | "weekly";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);
const whole = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : d);

// ------------------------------------------------------------------ the saved state

export interface ActiveQuest {
  /** The step the child is at (0 based). */
  step: number;
  /** The day it was taken, and the day the current step began (`YYYY-MM-DD`). */
  day: string;
  stepDay: string;
  variant?: string;
  /** Wrong answers at the current step; never makes the quest fail. */
  wrong: number;
  /** The step whose `enter` actions have run (-1: none yet). */
  ent: number;
  /** The posting it came from, if it was taken at the board. */
  from?: string;
  /** A step ended in its lesser form: the quest pays the lesser share at its end. */
  lesser?: true;
}

export interface DoneQuest {
  /** The last day it was finished, and how many times. */
  day: string;
  n: number;
}

/** One posting that was on the board, for the anti-repetition rules. */
export interface LogEntry {
  day: string;
  quest: string;
  type: string;
  giver: string;
  variant?: string;
}

export interface Card {
  id: string;
  quest: string;
  slot: Slot;
  variant?: string;
}

export interface QuestSave {
  active: Record<string, ActiveQuest>;
  done: Record<string, DoneQuest>;
  /** Repeatable quests finished in this week (the week is `weekOf` a day). */
  week: { w: number; n: number };
  /** The day's postings, made once and kept so the board is the same all day. */
  board: { day: string; cards: Card[] } | null;
  log: LogEntry[];
  /** The last variants each quest was given (a few ids), so a variant's cooldown holds however old the history is. */
  vhist: Record<string, string[]>;
  /** Offers the child said "not now" to: quest to the day. */
  declined: Record<string, string>;
  /** Board postings already turned into quests (the last ones). */
  taken: string[];
}

/** How many variants of a quest are remembered. */
export const VHIST_MAX = 12;

export const noQuests = (): QuestSave => ({ active: {}, done: {}, week: { w: 0, n: 0 }, board: null, log: [], vhist: {}, declined: {}, taken: [] });

export const questsAreEmpty = (q: QuestSave): boolean =>
  !Object.keys(q.active).length && !Object.keys(q.done).length && q.week.n === 0 && q.board === null && !q.log.length && !Object.keys(q.vhist).length && !Object.keys(q.declined).length && !q.taken.length;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_.:@-]{1,60}$/;
const day = (v: unknown): string | null => (typeof v === "string" && DAY.test(v) ? v : null);

/** A saved `quests` read back with every field checked: a damaged save cannot put a sentence or a name in it. */
export function parseQuests(v: unknown): QuestSave {
  const out = noQuests();
  const o = obj(v);
  const each = (k: string, f: (id: string, x: Obj) => void) => Object.entries(obj(o[k])).forEach(([id, x]) => ID.test(id) && f(id, obj(x)));
  const id = (x: unknown): string | undefined => (typeof x === "string" && ID.test(x) ? x : undefined);
  const SLOT = /^(easy|normal|learning|weekly)$/;
  each("active", (k, a) => {
    const d = day(a["day"]);
    if (!d) return;
    const rec: ActiveQuest = { step: whole(a["step"]), day: d, stepDay: day(a["stepDay"]) ?? d, wrong: Math.min(99, whole(a["wrong"])), ent: typeof a["ent"] === "number" && a["ent"] >= -1 ? Math.min(99, Math.trunc(a["ent"])) : -1 };
    const variant = id(a["variant"]);
    const from = id(a["from"]);
    out.active[k] = { ...rec, ...(variant ? { variant } : {}), ...(from ? { from } : {}), ...(a["lesser"] === true ? { lesser: true as const } : {}) };
  });
  each("done", (k, x) => {
    const d = day(x["day"]);
    if (d) out.done[k] = { day: d, n: Math.max(1, Math.min(9999, whole(x["n"], 1))) };
  });
  const w = obj(o["week"]);
  out.week = { w: whole(w["w"]), n: Math.min(99, whole(w["n"])) };
  const b = obj(o["board"]);
  const bd = day(b["day"]);
  if (bd && Array.isArray(b["cards"])) {
    const cards = b["cards"].flatMap((x): Card[] => {
      const c = obj(x);
      const [cid, quest, variant] = [id(c["id"]), id(c["quest"]), id(c["variant"])];
      return cid && quest && typeof c["slot"] === "string" && SLOT.test(c["slot"]) ? [{ id: cid, quest, slot: c["slot"] as Slot, ...(variant ? { variant } : {}) }] : [];
    });
    out.board = { day: bd, cards };
  }
  out.log = (Array.isArray(o["log"]) ? o["log"] : []).flatMap((x): LogEntry[] => {
    const e = obj(x);
    const [d, quest, type, giver, variant] = [day(e["day"]), id(e["quest"]), id(e["type"]), id(e["giver"]), id(e["variant"])];
    return d && quest && type && giver ? [{ day: d, quest, type, giver, ...(variant ? { variant } : {}) }] : [];
  }).slice(-60);
  each("vhist", (k, _x) => {
    const ids = strs(obj(o["vhist"])[k]).filter((x) => ID.test(x)).slice(-VHIST_MAX);
    if (ids.length) out.vhist[k] = ids;
  });
  each("declined", (k, _x) => {
    const d = day(obj(o["declined"])[k]);
    if (d) out.declined[k] = d;
  });
  out.taken = strs(o["taken"]).filter((x) => ID.test(x)).slice(-40);
  return out;
}
