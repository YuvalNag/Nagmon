/**
 * The quests as data and as a small saved state (docs/app/WORLD_V2.md 7, slice W3).
 *
 * A quest is `mods/nagmon/quests/<id>.yaml`, checked and shipped by `tools/app/quests.py` as
 * `game/quests.json` (Hebrew only). It has steps (a conversation, a question of the learning
 * engine, a thing to bring, a choice), a reward and a way to repeat. The numbers (the reward
 * scale, the hint and lesser-form thresholds, the weekly repeat discount, the board's gaps) are
 * in the data's `rules`, never in this file.
 *
 * What a child's save keeps (`world.quests`, additive and optional) is ids, days and small
 * counters: which quests are active and at what step, which are done and when, this week's
 * repeatable count, the day's board and a short history of the postings (for the anti-repetition
 * rules). No text, no name. Nothing is timed and nothing is lost.
 *
 * This file is pure: no screens, no clock. The flow that talks to a child is `questFlow.ts`; the
 * board's generator is `boardGen.ts`.
 */
import { mapPlacement, type MapPlacement } from "../world/npcs";
import { dayNumber, weekOf } from "./dayPick";

export type StepKind = "say" | "ask" | "bring" | "choose";
export type Repeat = "once" | "pool" | "weekly" | "daily";
import type { Slot } from "./questSave";
export type { Slot };
export const SLOTS: readonly Slot[] = ["easy", "normal", "learning", "weekly"];
export type Band = "A" | "B" | "C";

export interface Reward {
  coins: number;
  items: { id: string; n: number }[];
  /** Friendship with the giver (the points are the person's own `quest_done` gain). */
  friendship: boolean;
}

export interface Option {
  id: string;
  label: string;
  reply: string;
}

export interface Step {
  kind: StepKind;
  /** The person (or prop) the step is done with. */
  npc: string;
  /** What the journal says to do now. */
  todo: string;
  /** What the person says when the step is done: variants, one is picked. */
  say: string[];
  afterDays: number;
  /** The next step waits for the next talk even if it is with the same person. */
  later: boolean;
  /** Actions of the event interpreter (`set_variable x:y`), run when the step starts and when it is done. */
  enter: string[];
  done: string[];
  reward: Reward | null;
  topic?: string;
  item?: string;
  n?: number;
  wait?: string;
  prompt?: string;
  options?: Option[];
  correct?: string;
  hint?: string;
  /** A choice with no right answer that is not a kindness scene (a colour). */
  free?: boolean;
}

export interface Variant {
  id: string;
  band: Band;
  text: string;
}

export interface QuestDef {
  id: string;
  giver: string;
  /** A prop's name when the giver is a prop (the lost-and-found box). */
  giverName: string;
  type: string;
  emoji: string;
  title: string;
  subject: string | null;
  gradeMin: number;
  offer: { at: string; ask: boolean; lines: string[] };
  board: { slot: Slot; goal: string } | null;
  repeat: { kind: Repeat; cooldownDays: number; variantCooldown: number };
  variants: Variant[];
  steps: Step[];
  reward: Reward;
  unlocks: "board_slot" | null;
  sel: boolean;
}

export interface QuestRules {
  activeMax: number;
  hintAfter: number;
  lesserAfter: number;
  lesserCoinsPct: number;
  repeatFreePerWeek: number;
  repeatCoinsPct: number;
  board: { history: number; giverGap: number; variantCooldown: number; giverWeekMax: number; weakPct: number; weeklyDay: number };
  bands: { A: number; B: number };
  /** A prop's name for a dialog: the kitten, the lost-and-found box. */
  props: Record<string, string>;
  /** Names of places for the journal's "Show me" (maps and spots by id), the map a prop is on, and the line for a person who is away. */
  places: { maps: Record<string, string>; spots: Record<string, string>; propMaps: Record<string, string>; away: string };
  /** The maps' named spots and room (the same `nagmon_placement` the maps carry), so "Show me" can ask the resolver as the map does. */
  placements: Record<string, MapPlacement>;
  /** What the quests say that is not a quest's own (the owl's hint, "another day"). */
  lines: { later: string; hint: string; retry: string; lesser: string; yes: string; no: string; owl: string };
}

export interface QuestData {
  rules: QuestRules;
  quests: Record<string, QuestDef>;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);
const whole = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.trunc(v) : d);

export const DEFAULT_RULES: QuestRules = {
  activeMax: 3,
  hintAfter: 2,
  lesserAfter: 3,
  lesserCoinsPct: 50,
  repeatFreePerWeek: 3,
  repeatCoinsPct: 60,
  board: { history: 18, giverGap: 3, variantCooldown: 5, giverWeekMax: 2, weakPct: 40, weeklyDay: 0 },
  bands: { A: 2, B: 5 },
  props: {},
  places: { maps: {}, spots: {}, propMaps: {}, away: "" },
  placements: {},
  lines: { later: "", hint: "", retry: "", lesser: "", yes: "", no: "", owl: "" },
};

function parseRules(v: unknown): QuestRules {
  const r = obj(v);
  const b = obj(r["board"]);
  const d = DEFAULT_RULES;
  const bands = obj(r["bands"]);
  const lines = obj(r["lines"]);
  const props: Record<string, string> = {};
  for (const [k, n] of Object.entries(obj(r["props"]))) if (typeof n === "string") props[k] = n;
  const pl = obj(r["places"]);
  const names = (v: unknown): Record<string, string> => Object.fromEntries(Object.entries(obj(v)).filter(([, n]) => typeof n === "string")) as Record<string, string>;
  return {
    activeMax: Math.max(1, whole(r["active_max"], d.activeMax)),
    hintAfter: Math.max(1, whole(r["hint_after"], d.hintAfter)),
    lesserAfter: Math.max(1, whole(r["lesser_after"], d.lesserAfter)),
    lesserCoinsPct: Math.min(100, whole(r["lesser_coins_pct"], d.lesserCoinsPct)),
    repeatFreePerWeek: Math.max(1, whole(r["repeat_free_per_week"], d.repeatFreePerWeek)),
    repeatCoinsPct: Math.min(100, whole(r["repeat_coins_pct"], d.repeatCoinsPct)),
    board: {
      history: Math.max(1, whole(b["history"], d.board.history)),
      giverGap: whole(b["giver_gap"], d.board.giverGap),
      variantCooldown: whole(b["variant_cooldown"], d.board.variantCooldown),
      giverWeekMax: Math.max(1, whole(b["giver_week_max"], d.board.giverWeekMax)),
      weakPct: Math.min(100, whole(b["weak_pct"], d.board.weakPct)),
      weeklyDay: Math.min(6, whole(b["weekly_day"], d.board.weeklyDay)),
    },
    bands: { A: whole(bands["A"], d.bands.A), B: whole(bands["B"], d.bands.B) },
    props,
    placements: Object.fromEntries(Object.entries(obj(r["placements"])).flatMap(([m, p]) => { const mp = mapPlacement(p); return mp ? [[m, mp] as const] : []; })),
    places: { maps: names(pl["maps"]), spots: names(pl["spots"]), propMaps: names(pl["prop_maps"]), away: str(pl["away"]) },
    lines: { later: str(lines["later"]), hint: str(lines["hint"]), retry: str(lines["retry"]), lesser: str(lines["lesser"]), yes: str(lines["accept"]), no: str(lines["decline"]), owl: str(lines["owl"]) },
  };
}

function reward(v: unknown): Reward {
  const r = obj(v);
  const items = (Array.isArray(r["items"]) ? r["items"] : []).flatMap((x): { id: string; n: number }[] => {
    const i = obj(x);
    return str(i["id"]) ? [{ id: str(i["id"]), n: Math.max(1, whole(i["n"], 1)) }] : [];
  });
  return { coins: whole(r["coins"]), items, friendship: r["friendship"] === true };
}

const isEmptyReward = (r: Reward): boolean => r.coins === 0 && r.items.length === 0 && !r.friendship;

function step(raw: unknown): Step | null {
  const s = obj(raw);
  const kind = s["kind"];
  if ((kind !== "say" && kind !== "ask" && kind !== "bring" && kind !== "choose") || !str(s["npc"])) return null;
  const out: Step = {
    kind,
    npc: str(s["npc"]),
    todo: str(s["todo"]),
    say: strs(s["say"]),
    afterDays: whole(s["after_days"]),
    later: s["later"] === true,
    enter: strs(s["enter"]),
    done: strs(s["done"]),
    reward: s["reward"] ? reward(s["reward"]) : null,
  };
  if (out.reward && isEmptyReward(out.reward)) out.reward = null;
  if (kind === "ask") {
    if (!str(s["topic"])) return null;
    out.topic = str(s["topic"]);
  } else if (kind === "bring") {
    if (!str(s["item"])) return null;
    out.item = str(s["item"]);
    out.n = Math.max(1, whole(s["n"], 1));
    out.wait = str(s["wait"]);
  } else if (kind === "choose") {
    const options = (Array.isArray(s["options"]) ? s["options"] : []).flatMap((x): Option[] => {
      const o = obj(x);
      return str(o["id"]) && str(o["label"]) ? [{ id: str(o["id"]), label: str(o["label"]), reply: str(o["reply"]) }] : [];
    });
    if (options.length < 2 || !str(s["prompt"])) return null;
    out.prompt = str(s["prompt"]);
    out.options = options;
    if (str(s["correct"])) {
      if (!options.some((o) => o.id === s["correct"])) return null;
      out.correct = str(s["correct"]);
      out.hint = str(s["hint"]);
    } else if (s["free"] === true) out.free = true;
  }
  return out;
}

function quest(id: string, raw: unknown): QuestDef | null {
  const q = obj(raw);
  const steps = (Array.isArray(q["steps"]) ? q["steps"] : []).map(step);
  const offer = obj(q["offer"]);
  const rep = obj(q["repeat"]);
  const board = obj(q["board"]);
  const kind = rep["kind"];
  if (!str(q["giver"]) || !str(q["title"]) || !steps.length || steps.some((s) => s === null) || (kind !== "once" && kind !== "pool" && kind !== "weekly" && kind !== "daily")) return null;
  const slot = board["slot"];
  const variants = (Array.isArray(q["variants"]) ? q["variants"] : []).flatMap((x): Variant[] => {
    const v = obj(x);
    const band = v["band"];
    return str(v["id"]) && str(v["text"]) && (band === "A" || band === "B" || band === "C") ? [{ id: str(v["id"]), band, text: str(v["text"]) }] : [];
  });
  return {
    id,
    giver: str(q["giver"]),
    giverName: str(q["giver_name"]),
    type: str(q["type"]),
    emoji: str(q["emoji"]) || "1f4cc",
    title: str(q["title"]),
    subject: str(q["subject"]) || null,
    gradeMin: whole(q["grade_min"]),
    offer: { at: str(offer["at"]) || str(q["giver"]), ask: offer["ask"] !== false, lines: strs(offer["lines"]) },
    board: str(board["goal"]) && (slot === "easy" || slot === "normal" || slot === "learning" || slot === "weekly") ? { slot, goal: str(board["goal"]) } : null,
    repeat: { kind, cooldownDays: whole(rep["cooldown_days"]), variantCooldown: whole(rep["variant_cooldown"]) },
    variants,
    steps: steps as Step[],
    reward: reward(q["reward"]),
    unlocks: q["unlocks"] === "board_slot" ? "board_slot" : null,
    sel: q["sel"] === true,
  };
}

/** From the parsed game/quests.json; a quest that cannot be read is left out, and a build with none is a game with no quests. */
export function questData(doc: unknown): QuestData {
  const d = obj(doc);
  const quests: Record<string, QuestDef> = {};
  for (const [id, raw] of Object.entries(obj(d["quests"]))) {
    const q = quest(id, raw);
    if (q) quests[id] = q;
  }
  return { rules: parseRules(d["rules"]), quests };
}

import { type ActiveQuest, type Card, type DoneQuest, type LogEntry, type QuestSave, noQuests, parseQuests, questsAreEmpty, VHIST_MAX } from "./questSave";
export { type ActiveQuest, type Card, type DoneQuest, type LogEntry, type QuestSave, noQuests, parseQuests, questsAreEmpty, VHIST_MAX };

// ------------------------------------------------------------------ rules in plain functions

/** A: kindergarten to the first band's last grade; B: to the second's; C: the rest. */
export function bandOf(grade: number, rules: QuestRules): Band {
  return grade <= rules.bands.A ? "A" : grade <= rules.bands.B ? "B" : "C";
}

export interface Ctx {
  today: string;
  grade: number;
}

/** Whether a quest may be offered now: not active, its repeat rule allows it, the child's grade is enough. */
export function isEligible(def: QuestDef, save: QuestSave, ctx: Ctx): boolean {
  if (save.active[def.id]) return false;
  if (ctx.grade < def.gradeMin) return false;
  const d = save.done[def.id];
  if (!d) return true;
  switch (def.repeat.kind) {
    case "once":
      return false;
    case "daily":
      return d.day !== ctx.today;
    case "weekly":
      return weekOf(d.day) !== weekOf(ctx.today);
    case "pool":
      return dayNumber(ctx.today) - dayNumber(d.day) >= Math.max(1, def.repeat.cooldownDays);
  }
}

/** Remembers a variant as used by its quest (the last few are kept). */
export function useVariant(save: QuestSave, quest: string, variant: string): void {
  save.vhist[quest] = [...(save.vhist[quest] ?? []), variant].slice(-VHIST_MAX);
}

/** The variants of `def` not used in its last `variantCooldown` postings (all, when it has no cooldown), for the child's band. */
export function freshVariants(def: QuestDef, save: QuestSave, grade: number, rules: QuestRules): Variant[] {
  if (!def.variants.length) return [];
  const band = bandOf(grade, rules);
  const mine = def.variants.filter((v) => v.band === band);
  const recent = def.repeat.variantCooldown ? (save.vhist[def.id] ?? []).slice(-def.repeat.variantCooldown) : [];
  const fresh = (list: Variant[]) => list.filter((v) => !recent.includes(v.id));
  // the child's band first; when all of those were used lately, any other (the cooldown holds before the band does)
  const inBand = fresh(mine.length ? mine : def.variants);
  return inBand.length ? inBand : fresh(def.variants);
}

export function activeCount(save: QuestSave): number {
  return Object.keys(save.active).length;
}

/** Whether a quest that opens a 4th board slot has been finished. */
export function boardSlotUnlocked(data: QuestData, save: QuestSave): boolean {
  return Object.values(data.quests).some((q) => q.unlocks === "board_slot" && save.done[q.id]);
}

const pct = (coins: number, p: number): number => (coins > 0 ? Math.max(1, Math.floor((coins * p) / 100)) : 0);

/**
 * The coins a finished quest pays, from the rules: the lesser form pays a share, and so does the 4th
 * repeatable quest of a week (items and friendship never change).
 */
export function coinsFor(def: QuestDef, save: QuestSave, today: string, rules: QuestRules, lesser: boolean): number {
  let coins = def.reward.coins;
  if (lesser) coins = pct(coins, rules.lesserCoinsPct);
  if (def.repeat.kind !== "once" && weekCount(save, today) >= rules.repeatFreePerWeek) coins = pct(coins, rules.repeatCoinsPct);
  return coins;
}

/** How many repeatable quests were finished in the week of `today`. */
export function weekCount(save: QuestSave, today: string): number {
  return save.week.w === weekOf(today) ? save.week.n : 0;
}

/** Counts a finished quest in its week if it can come back. */
export function countFinished(save: QuestSave, def: QuestDef, today: string): void {
  if (def.repeat.kind === "once") return;
  const w = weekOf(today);
  save.week = save.week.w === w ? { w, n: save.week.n + 1 } : { w, n: 1 };
}

export function stepCoins(s: Step, lesser: boolean, rules: QuestRules): number {
  const c = s.reward?.coins ?? 0;
  return lesser ? pct(c, rules.lesserCoinsPct) : c;
}

/** Subjects weakest first: the lowest share of right answers (at least `min` answers each), local to the phone and never sent. */
export function weakSubjects(log: readonly { subject: string; correct: boolean }[], n = 2, min = 3): string[] {
  const by = new Map<string, { c: number; t: number }>();
  for (const e of log) {
    const r = by.get(e.subject) ?? { c: 0, t: 0 };
    r.t += 1;
    if (e.correct) r.c += 1;
    by.set(e.subject, r);
  }
  return [...by.entries()]
    .filter(([, r]) => r.t >= min)
    .sort((a, b) => a[1].c / a[1].t - b[1].c / b[1].t || (a[0] < b[0] ? -1 : 1))
    .slice(0, n)
    .map(([s]) => s);
}
