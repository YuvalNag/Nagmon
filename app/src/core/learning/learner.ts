/**
 * Per-learner state with JSON (de)serialization (SDD_LEARNING s.8, s.10),
 * a port of `learner.py`, including the v0 -> v1 migration.
 */
import { initialTheta } from "./rating";
import { type Card, LeitnerDeck } from "./srs";

export const SCHEMA_VERSION = 1;
export const LOG_MAX = 5000;
export const RECENT_MAX = 20;
export const ITEMS_MAX = 4000;

/** Python truthiness for settings values. */
export function truthy(x: unknown): boolean {
  if (x === null || x === undefined || x === false || x === 0 || x === "") return false;
  if (Array.isArray(x)) return x.length > 0;
  if (typeof x === "object") return Object.keys(x as object).length > 0;
  return true;
}

export class SkillStats {
  theta: number;
  n: number;
  correct: number;
  last: number;
  /** 1/0, newest last, at most RECENT_MAX. */
  recent: number[];
  misconceptions: Record<string, number>;

  constructor(init: Partial<SkillStatsData> = {}) {
    this.theta = init.theta ?? 0;
    this.n = init.n ?? 0;
    this.correct = init.correct ?? 0;
    this.last = init.last ?? 0;
    this.recent = [...(init.recent ?? [])];
    this.misconceptions = { ...(init.misconceptions ?? {}) };
  }

  push(correct: boolean): void {
    this.recent.push(correct ? 1 : 0);
    if (this.recent.length > RECENT_MAX) this.recent.splice(0, this.recent.length - RECENT_MAX);
  }

  /** Accuracy over the last `window` answers, or null before the first. */
  recentAccuracy(window = 10): number | null {
    const tail = this.recent.slice(-window);
    return tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : null;
  }

  toDict(): SkillStatsData {
    return {
      theta: this.theta,
      n: this.n,
      correct: this.correct,
      last: this.last,
      recent: [...this.recent],
      misconceptions: { ...this.misconceptions },
    };
  }
}

export interface SkillStatsData {
  theta: number;
  n: number;
  correct: number;
  last: number;
  recent: number[];
  misconceptions: Record<string, number>;
}

export interface ItemStats {
  b_offset: number;
  n: number;
  last: number;
}

export interface LogEntry {
  ts: number;
  skill: string;
  item: string;
  subject: string;
  correct: boolean;
  quality: string;
  elapsed: number;
  context: string;
  mis: string | null;
  hint: boolean;
  /** "I don't know". */
  dk: boolean;
  /** Answer to a worked example. */
  worked: boolean;
}

/** A log entry with the dataclass defaults. */
export function makeLogEntry(
  e: Pick<LogEntry, "ts" | "skill" | "item" | "subject" | "correct" | "quality" | "elapsed"> & Partial<LogEntry>,
): LogEntry {
  return { context: "battle", mis: null, hint: false, dk: false, worked: false, ...e };
}

/** Compact form: the default-valued flags are dropped. */
export function logEntryToDict(e: LogEntry): Record<string, unknown> {
  const d: Record<string, unknown> = { ...e };
  for (const key of ["mis", "hint", "dk", "worked"]) if (!d[key]) delete d[key];
  return d;
}

const LOG_FIELDS = ["ts", "skill", "item", "subject", "correct", "quality", "elapsed", "context", "mis", "hint", "dk", "worked"];

export function logEntryFromDict(d: Readonly<Record<string, unknown>>): LogEntry {
  const picked: Record<string, unknown> = {};
  for (const k of LOG_FIELDS) if (k in d) picked[k] = d[k];
  return makeLogEntry(picked as Parameters<typeof makeLogEntry>[0]);
}

function defaultTargets(age: number | null, grade: number): [number, number] {
  let young = age !== null && age <= 7;
  if (age === null) young = grade <= 1;
  return [young ? 0.875 : 0.8, 0.9];
}

export interface LearnerInit {
  learner_id?: string;
  name?: string;
  grade?: number;
  age?: number | null;
  settings?: Record<string, unknown>;
}

export class LearnerState {
  learner_id: string;
  name: string;
  grade: number;
  age: number | null;
  settings: Record<string, unknown>;
  skills = new Map<string, SkillStats>();
  items = new Map<string, ItemStats>();
  srs = new LeitnerDeck();
  mastered = new Map<string, number>();
  stars = new Map<string, number>();
  log: LogEntry[] = [];
  words = new Map<string, number>();
  worked_examples = new Set<string>();
  coins_total = 0;
  answers_total = 0;
  correct_total = 0;
  time_total_s = 0;

  constructor(init: LearnerInit = {}) {
    this.learner_id = init.learner_id ?? "";
    this.name = init.name ?? "";
    this.grade = init.grade ?? 0;
    this.age = init.age ?? null;
    this.settings = { ...(init.settings ?? {}) };
  }

  // -- settings with age-derived defaults ---------------------------------
  get timerOn(): boolean {
    if ("timer" in this.settings) return truthy(this.settings["timer"]);
    if (this.age !== null) return this.age >= 9;
    return this.grade >= 4;
  }

  get targetFrontier(): number {
    const value = this.settings["target_frontier"];
    if (value === null || value === undefined) return defaultTargets(this.age, this.grade)[0];
    return Number(value);
  }

  get targetReview(): number {
    const value = this.settings["target_review"];
    if (value === null || value === undefined) return defaultTargets(this.age, this.grade)[1];
    return Number(value);
  }

  get workedExamplesOn(): boolean {
    return truthy(this.settings["worked_examples"] ?? true);
  }

  get enabledSubjects(): readonly string[] | null {
    const subjects = this.settings["subjects"];
    return truthy(subjects) ? [...(subjects as string[])] : null;
  }

  get focus(): readonly string[] {
    const f = this.settings["focus"];
    return truthy(f) ? [...(f as string[])] : [];
  }

  // -- accessors ------------------------------------------------------------
  /** The skill's stats, created with the initial theta for its grade. */
  skill(skillId: string, skillGrade: number | null = null): SkillStats {
    let st = this.skills.get(skillId);
    if (st === undefined) {
      const g = skillGrade === null ? this.grade : skillGrade;
      st = new SkillStats({ theta: initialTheta(this.grade, g) });
      this.skills.set(skillId, st);
    }
    return st;
  }

  item(itemId: string): ItemStats {
    let it = this.items.get(itemId);
    if (it === undefined) {
      it = { b_offset: 0, n: 0, last: 0 };
      this.items.set(itemId, it);
    }
    return it;
  }

  /** Keep the `limit` most recently seen items (LRU). */
  pruneItems(limit = ITEMS_MAX): void {
    if (this.items.size <= limit) return;
    const keep = [...this.items.entries()].sort((a, b) => a[1].last - b[1].last);
    this.items = new Map(keep.slice(keep.length - limit));
  }

  logAnswer(entry: LogEntry): void {
    this.log.push(entry);
    if (this.log.length > LOG_MAX) this.log.splice(0, this.log.length - LOG_MAX);
  }

  // -- serialization --------------------------------------------------------
  toDict(): LearnerData {
    return {
      schema_version: SCHEMA_VERSION,
      learner_id: this.learner_id,
      name: this.name,
      grade: this.grade,
      age: this.age,
      settings: { ...this.settings },
      skills: Object.fromEntries([...this.skills].map(([k, v]) => [k, v.toDict()])),
      items: Object.fromEntries([...this.items].map(([k, v]) => [k, { ...v }])),
      srs: this.srs.toDict(),
      mastered: Object.fromEntries(this.mastered),
      stars: Object.fromEntries(this.stars),
      log: this.log.map(logEntryToDict),
      words: Object.fromEntries(this.words),
      worked_examples: [...this.worked_examples].sort(),
      coins_total: this.coins_total,
      answers_total: this.answers_total,
      correct_total: this.correct_total,
      time_total_s: this.time_total_s,
    };
  }

  /** Load a saved dict (any supported schema version; v0 is migrated). */
  static fromDict(data: Readonly<Record<string, unknown>>): LearnerState {
    const d = migrate(data);
    const s = new LearnerState({
      learner_id: String(d["learner_id"] ?? ""),
      name: String(d["name"] ?? ""),
      grade: Math.trunc(Number(d["grade"] ?? 0)),
      age: (d["age"] as number | null | undefined) ?? null,
      settings: { ...((d["settings"] as Record<string, unknown> | null) ?? {}) },
    });
    for (const [k, v] of Object.entries((d["skills"] as Record<string, Partial<SkillStatsData>> | null) ?? {})) {
      s.skills.set(k, new SkillStats(v));
    }
    for (const [k, v] of Object.entries((d["items"] as Record<string, Partial<ItemStats>> | null) ?? {})) {
      s.items.set(k, { b_offset: v.b_offset ?? 0, n: v.n ?? 0, last: v.last ?? 0 });
    }
    s.srs = LeitnerDeck.fromDict(d["srs"] as { cards?: Partial<Card>[] } | null);
    s.mastered = new Map(Object.entries((d["mastered"] as Record<string, number> | null) ?? {}));
    s.stars = new Map(
      Object.entries((d["stars"] as Record<string, number> | null) ?? {}).map(([k, v]) => [k, Math.trunc(Number(v))]),
    );
    for (const raw of (d["log"] as Record<string, unknown>[] | null) ?? []) s.logAnswer(logEntryFromDict(raw));
    s.words = new Map(Object.entries((d["words"] as Record<string, number> | null) ?? {}));
    s.worked_examples = new Set((d["worked_examples"] as string[] | null) ?? []);
    s.coins_total = Math.trunc(Number(d["coins_total"] ?? 0));
    s.answers_total = Math.trunc(Number(d["answers_total"] ?? 0));
    s.correct_total = Math.trunc(Number(d["correct_total"] ?? 0));
    s.time_total_s = Number(d["time_total_s"] ?? 0);
    return s;
  }
}

/** The saved JSON (schema_version 1). */
export interface LearnerData {
  schema_version: number;
  learner_id: string;
  name: string;
  grade: number;
  age: number | null;
  settings: Record<string, unknown>;
  skills: Record<string, SkillStatsData>;
  items: Record<string, ItemStats>;
  srs: { cards: Card[] };
  mastered: Record<string, number>;
  stars: Record<string, number>;
  log: Record<string, unknown>[];
  words: Record<string, number>;
  worked_examples: string[];
  coins_total: number;
  answers_total: number;
  correct_total: number;
  time_total_s: number;
}

// --------------------------------------------------------------------------
// Migration
// --------------------------------------------------------------------------

export const ELO_400_TO_LOGIT = Math.log(10) / 400.0;

type Dict = Record<string, unknown>;

/** v0 = the GAME_PLAN draft: Elo around 1200, `leitner`, `ok` log. */
function migrateV0(d: Readonly<Dict>): Dict {
  const skills: Record<string, SkillStatsData> = {};
  for (const [sid, rating] of Object.entries((d["ratings"] as Record<string, number> | null) ?? {})) {
    skills[sid] = new SkillStats({ theta: (Number(rating) - 1200.0) * ELO_400_TO_LOGIT }).toDict();
  }
  const cards: Partial<Card>[] = [];
  for (const [itemId, raw] of Object.entries((d["leitner"] as Record<string, unknown> | null) ?? {})) {
    let box: number;
    let skill: string;
    if (raw !== null && typeof raw === "object") {
      const r = raw as Dict;
      box = Math.trunc(Number(r["box"] ?? 1));
      skill = String(r["skill"] ?? "");
    } else {
      box = Math.trunc(Number(raw));
      skill = "";
    }
    // Due immediately: the schedule is unknown.
    cards.push({ item_id: itemId, skill_id: skill, seed: null, box: Math.max(1, Math.min(5, box)), due: 0 });
  }
  const log: LogEntry[] = [];
  for (const e of (d["log"] as Dict[] | null) ?? []) {
    const ok = truthy(get(e, "ok", get(e, "correct", false)));
    log.push(
      makeLogEntry({
        ts: Number(get(e, "t", get(e, "ts", 0))),
        skill: String(get(e, "skill", "")),
        item: String(get(e, "item", "")),
        subject: truthy(e["subject"]) ? String(e["subject"]) : String(get(e, "skill", "")).split(".")[0]!,
        correct: ok,
        quality: ok ? "correct" : "wrong",
        elapsed: Number(get(e, "secs", get(e, "elapsed", 0))),
        context: String(get(e, "where", get(e, "context", "battle"))),
      }),
    );
  }
  const correct = log.filter((e) => e.correct).length;
  for (const e of log) {
    const st = (skills[e.skill] ??= new SkillStats().toDict());
    st.n += 1;
    st.correct += e.correct ? 1 : 0;
    st.recent.push(e.correct ? 1 : 0);
    st.last = Math.max(st.last, e.ts);
  }
  return {
    schema_version: 1,
    learner_id: get(d, "id", get(d, "learner_id", "")),
    name: get(d, "name", ""),
    grade: get(d, "grade", 0),
    age: d["age"] ?? null,
    settings: { ...((d["settings"] as Dict | null) ?? {}) },
    skills,
    srs: { cards },
    stars: { ...((d["stars"] as Dict | null) ?? {}) },
    log: log.map(logEntryToDict),
    coins_total: Math.trunc(Number(get(d, "coins", 0))),
    answers_total: log.length,
    correct_total: correct,
    time_total_s: log.reduce((a, e) => a + e.elapsed, 0),
  };
}

/** Python `dict.get(key, default)`: the default only when the key is absent. */
function get(d: Readonly<Dict>, key: string, dflt: unknown): unknown {
  return key in d ? d[key] : dflt;
}

const MIGRATIONS: Record<number, (d: Readonly<Dict>) => Dict> = { 0: migrateV0 };

/** Upgrade a saved learner dict to `SCHEMA_VERSION`; a newer version throws. */
export function migrate(data: Readonly<Dict>): Dict {
  let d: Dict = { ...data };
  let version = Math.trunc(Number(d["schema_version"] ?? 0));
  if (version > SCHEMA_VERSION) {
    throw new RangeError(`learner schema_version ${version} is newer than supported ${SCHEMA_VERSION}`);
  }
  while (version < SCHEMA_VERSION) {
    d = MIGRATIONS[version]!(d);
    version = Math.trunc(Number(d["schema_version"]));
  }
  return d;
}
