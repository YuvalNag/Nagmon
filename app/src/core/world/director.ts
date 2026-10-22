/**
 * The Dialogue Director (docs/app/WORLD_V2.md 4.1): what a person of the
 * world says, and when. Pure TypeScript, deterministic for a seed, and
 * kind to a child who talks to the same person every day: the same line
 * does not come twice within the person's last 8, a line that is not
 * for this day part or this friendship is not chosen, and the memory it
 * keeps is ids and numbers (core/world/memory.ts), never the words.
 *
 * One interface, {@link LineSource}: the shipped pools ({@link pickLine},
 * always there) and, in a later slice (W6), a live line from a model that
 * plugs in as `live` without a change to the callers. W1 ships no model
 * client and no network call: this file has none. A live line is asked
 * for only for the intents of {@link LIVE_OK} (never a quest, a price, a
 * question, a scene or a joke), waits at most {@link LIVE_WAIT_MS}, and
 * any failure falls back to the pool line.
 *
 * The child never types to a person: they tap a topic chip
 * ({@link Director.chips}).
 */
import { addPoints, emptyRecord, remember, setFlag, type NpcRecord } from "./memory";
import { type Line, type NpcDef, type NpcTable, type Phase, type Topic, phaseOf } from "./npcs";
import { rngFor, weekdayOf } from "./rand";

/** The longest a live line is waited for before the pool line is used. */
export const LIVE_WAIT_MS = 1200;
/** Shapes remembered across all people (the "global ring"). */
export const SHAPE_RING = 12;

const LIVE_INTENTS = /^(greet_first|greet_again|idle|farewell|topic:[\w-]+|react:[\w-]+|gift:[\w-]+)$/;

/** Whether a live line may be asked for this intent (WORLD_V2.md 4.2). Quests, shops, questions, scenes, jokes: authored only. */
export function LIVE_OK(intent: string): boolean {
  return LIVE_INTENTS.test(intent);
}

/** Everything a source needs to choose a line. */
export interface LineRequest {
  npc: NpcDef;
  intent: string;
  phase: Phase;
  weekday: number;
  /** The friendship level, 0 to 3. */
  friendship: number;
  /** The ids this person showed last, oldest first. */
  recent: readonly string[];
  /** The same words give the same pick. */
  seed: string;
  /** The last shapes shown by anyone, oldest first. */
  shapes: readonly string[];
  /** Names of others who are here (for a line with {who}). */
  names: readonly string[];
}

export interface LineSource {
  next(request: LineRequest): Promise<Line | null>;
}

/** What was said: the line's id (the only thing remembered), its words and who says them. */
export interface Spoken {
  id: string;
  intent: string;
  text: string;
  speaker: string;
  source: "pool" | "live";
  /** A fact id (facts.json) the "fact" topic hands over; the screen shows it verbatim. */
  fact?: string;
}

const eligible = (l: Line, r: LineRequest): boolean => {
  const w = l.when;
  if (w) {
    if (w.phase && !w.phase.includes(r.phase)) return false;
    if (w.weekday && !w.weekday.includes(r.weekday)) return false;
    if (w.friendship_min !== undefined && r.friendship < w.friendship_min) return false;
    if (w.friendship_max !== undefined && r.friendship > w.friendship_max) return false;
  }
  return !l.text.includes("{who}") || r.names.length > 0;
};

const specificity = (l: Line): number => (l.when ? Object.keys(l.when).length : 0);

/**
 * Picks a line from a pool (WORLD_V2.md 4.3): the ones that fit this
 * moment, minus the person's recent ones (when all are recent, the 3 seen
 * longest ago), minus a running gag shown in the last 3 visits; then a
 * weighted pick that favours the more specific lines and holds back a
 * shape that was just heard.
 */
export function pickLine(lines: readonly Line[], r: LineRequest): Line | null {
  const cands = lines.filter((l) => eligible(l, r));
  if (!cands.length) return null;
  const fresh = cands.filter((l) => !r.recent.includes(l.id));
  const pool = fresh.length ? fresh : [...cands].sort((a, b) => r.recent.indexOf(a.id) - r.recent.indexOf(b.id)).slice(0, 3);
  const lastThree = r.recent.slice(-3);
  const noGag = pool.filter((l) => !(l.gag && lastThree.includes(l.id)));
  const from = noGag.length ? noGag : pool;
  const last = r.shapes.at(-1);
  const score = (l: Line): number => {
    let s = l.weight * (1 + 0.5 * specificity(l));
    if (l.shape && r.shapes.includes(l.shape)) s *= 0.3;
    if (l.shape && l.shape === last) s *= 0.3;
    return s;
  };
  const total = from.reduce((n, l) => n + score(l), 0);
  let at = rngFor(r.seed)() * total;
  for (const l of from) {
    at -= score(l);
    if (at < 0) return l;
  }
  return from.at(-1) ?? null;
}

/** The shipped pools: always there, free and safe. */
export class PoolSource implements LineSource {
  async next(r: LineRequest): Promise<Line | null> {
    return pickLine(r.npc.lines[r.intent] ?? [], r);
  }
}

export interface DirectorOptions {
  npcs: NpcTable;
  /** What each person remembers (WorldState.npcs); changed in place. */
  memory: Map<string, NpcRecord>;
  /** The phone's local date, `YYYY-MM-DD`. */
  today: () => string;
  /** The phone's local hour, 0 to 23. */
  hour: () => number;
  /** The child's name, put into `{hero}` on the screen only. */
  hero: () => string;
  /** A live line source (W6); none in W1. */
  live?: LineSource;
  /** Names of the other people on this map today, for `{who}`. */
  town?: () => readonly string[];
}

/** One of up to 4 topic chips, ready to show. */
export type Chip = Topic;

const GREET_FALLBACK: Record<string, string[]> = {
  greet_first: ["greet_first"],
  greet_again: ["greet_again", "greet_first"],
  idle: ["idle", "greet_again", "greet_first"],
};

export class Director {
  private readonly pool = new PoolSource();
  private readonly shapes: string[] = [];
  private readonly o: DirectorOptions;

  constructor(options: DirectorOptions) {
    this.o = options;
  }

  /** Whether this slug is a person of the world (has a definition). */
  defined(slug: string): boolean {
    return slug in this.o.npcs;
  }

  /** The friendship level of a person, 0 to 3. */
  level(slug: string): number {
    return this.o.memory.get(slug)?.lvl ?? 0;
  }

  /** The flags a person remembers (ids of its own list). */
  flags(slug: string): readonly string[] {
    return this.o.memory.get(slug)?.flags ?? [];
  }

  private record(slug: string): NpcRecord {
    let r = this.o.memory.get(slug);
    if (!r) {
      r = emptyRecord();
      this.o.memory.set(slug, r);
    }
    return r;
  }

  /** The first contact of a day: the day's counters start again, and the first talk of the day gives a point. */
  private contact(def: NpcDef, rec: NpcRecord): void {
    const today = this.o.today();
    if (rec.last === today) return;
    rec.last = today;
    delete rec.td;
    delete rec.tn;
    addPoints(rec, def.relationship.gain.first_talk_today, def.relationship.levels);
  }

  private who(seed: string): string {
    const names = [...(this.o.town?.() ?? [])];
    if (!names.length) return "";
    const rng = rngFor(seed, "who");
    const a = names.splice(Math.floor(rng() * names.length), 1)[0]!;
    if (!names.length) return a;
    const b = names[Math.floor(rng() * names.length)]!;
    return `${a} ו${b}`;
  }

  /** What the person says for an intent: a live line if one may be asked for and comes in time, else the pool's. Null when there is nothing to say. */
  async say(slug: string, intent: string, extra: { fact?: string } = {}): Promise<Spoken | null> {
    const def = this.o.npcs[slug];
    if (!def) return null;
    const rec = this.record(slug);
    const today = this.o.today();
    const names = [...(this.o.town?.() ?? [])].filter((n) => n !== def.name);
    const seed = `${today}|${slug}|${intent}|${rec.met}|${rec.td ?? 0}|${rec.tn ?? 0}|${rec.recent.length}`;
    const request: LineRequest = {
      npc: def,
      intent,
      phase: phaseOf(this.o.hour()),
      weekday: weekdayOf(today),
      friendship: rec.lvl,
      recent: rec.recent,
      seed,
      shapes: this.shapes,
      names,
    };
    let line: Line | null = null;
    let source: "pool" | "live" = "pool";
    if (this.o.live && LIVE_OK(intent)) {
      line = await this.askLive(this.o.live, request);
      if (line) source = "live";
    }
    if (!line) {
      const kinds = GREET_FALLBACK[intent] ?? [intent];
      for (const k of kinds) {
        line = await this.pool.next({ ...request, intent: k });
        if (line) break;
      }
    }
    if (!line) return null;
    remember(rec, line.id);
    if (line.shape) this.shapes.push(line.shape);
    while (this.shapes.length > SHAPE_RING) this.shapes.shift();
    const text = line.text.replace(/\{hero\}|\{name\}/g, this.o.hero()).replace(/\{who\}/g, () => this.who(seed));
    return { id: line.id, intent, text, speaker: def.name, source, ...(extra.fact ? { fact: extra.fact } : {}) };
  }

  private async askLive(live: LineSource, request: LineRequest): Promise<Line | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const wait = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), LIVE_WAIT_MS);
      });
      const got = await Promise.race([live.next(request).catch(() => null), wait]);
      return got && got.text.trim() ? got : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * The opening of a talk. The first talk of the day greets first, the
   * second greets again, later ones say something idle. Records the talk
   * (a count, the day, a friendship point).
   */
  async greet(slug: string): Promise<Spoken | null> {
    const def = this.o.npcs[slug];
    if (!def) return null;
    const rec = this.record(slug);
    const first = rec.last !== this.o.today();
    this.contact(def, rec);
    const talks = (rec.td ?? 0) + 1;
    const intent = first ? "greet_first" : talks === 2 ? "greet_again" : "idle";
    const spoken = await this.say(slug, intent);
    rec.met += 1;
    rec.td = talks;
    return spoken;
  }

  /** The chips to show now: topics that are open at this friendship and have something to say. */
  chips(slug: string): Chip[] {
    const def = this.o.npcs[slug];
    if (!def) return [];
    const lvl = this.level(slug);
    return def.topics.filter((t) => t.unlock <= lvl && (def.lines[`topic:${t.id}`]?.length ?? 0) > 0 && (t.id !== "fact" || def.facts.length > 0)).slice(0, 4);
  }

  /** What the person says about a topic the child tapped (null if it is not open). A new topic gives a point, twice a day at most. */
  async topic(slug: string, id: string): Promise<Spoken | null> {
    const def = this.o.npcs[slug];
    if (!def || !this.chips(slug).some((c) => c.id === id)) return null;
    const rec = this.record(slug);
    this.contact(def, rec);
    const flag = `asked_${id}`;
    const isNew = !rec.flags.includes(flag);
    let fact: string | undefined;
    if (id === "fact") {
      // the fact itself is authored: the person only leads in to it, each fact in turn
      const ids = def.facts.map((f) => `fact:${f}`);
      const fresh = ids.filter((f) => !rec.recent.includes(f));
      const pickFrom = fresh.length ? fresh : [...ids].sort((a, b) => rec.recent.indexOf(a) - rec.recent.indexOf(b)).slice(0, 1);
      const chosen = pickFrom[Math.floor(rngFor(this.o.today(), slug, "fact", rec.met, rec.tn ?? 0)() * pickFrom.length)]!;
      fact = chosen.slice(5);
      remember(rec, chosen);
    }
    const spoken = await this.say(slug, `topic:${id}`, { fact });
    if (isNew) {
      if ((rec.tn ?? 0) < 2) addPoints(rec, def.relationship.gain.new_topic, def.relationship.levels);
      setFlag(rec, flag, [flag]);
    }
    rec.tn = (rec.tn ?? 0) + 1;
    return spoken;
  }

  /** A finished quest is a friendship gain: the person's own `quest_done` points (the level may rise, never falls). */
  questDone(slug: string): void {
    const def = this.o.npcs[slug];
    if (def) addPoints(this.record(slug), def.relationship.gain.quest_done, def.relationship.levels);
  }

  /** The words at the end of a talk (null if the person has none). */
  async farewell(slug: string): Promise<Spoken | null> {
    return this.say(slug, "farewell");
  }
}
