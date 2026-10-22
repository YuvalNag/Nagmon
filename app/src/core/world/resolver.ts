/**
 * Who is where when (docs/app/WORLD_V2.md 5.4): a pure function from the
 * day, the day part, what the child has done and a per-child seed to the
 * people standing on a map. It has no memory of its own: the same inputs
 * give the same town, so the town looks the same when the child comes
 * back to it, and a test can pin any day.
 *
 * R1 one place at a time. R2 deterministic. R3 anchors keep their post.
 * R4 visitors come on some days. R5 a map holds only so many. R6 some
 * people never share a map. R7 a roamer is somewhere else tomorrow. R8 a
 * quest pin holds a giver in place. R9 progress opens people. R10 follows
 * from R1: a person has one position, whichever map it is on.
 * (R6's "pairs" that stand together are not in W1.)
 */
import type { Dir } from "./grid";
import { hash, rngFor, shuffled, dayNumber, weekdayOf } from "./rand";
import type { MapPlacement, NpcDef, NpcTable, Phase, Where } from "./npcs";

/** What decides a day: everything else is in the people's files. */
export interface DayContext {
  /** The phone's local date, `YYYY-MM-DD`. */
  day: string;
  phase: Phase;
  /** The child's own random number (kept in the save); another child's town has other days. */
  seed: number;
  /** Whether a variable of the world is set (the child's progress). */
  flags: (name: string) => boolean;
  /** The friendship level (0 to 3) with a person. */
  friendship: (slug: string) => number;
}

export interface ResolveInput {
  map: string;
  placement: MapPlacement;
  npcs: NpcTable;
  day: string;
  phase: Phase;
  seed: number;
  flags?: (name: string) => boolean;
  friendship?: (slug: string) => number;
  /** A giver held in place by a quest: slug to where. */
  pins?: Readonly<Record<string, { map: string; spot: string }>>;
}

export interface Placed {
  slug: string;
  spot: string;
  x: number;
  y: number;
  facing: Dir;
}

/** The place a person is at, by map and spot name. */
export interface Position {
  map: string;
  spot: string;
}

/**
 * The index into `n` spots for `key` on a day: every day another one than
 * the day before (R7), and over any `n` days every spot once. Days are cut
 * into runs of `n`; each run has its own order, fixed by the key, and a
 * run never starts where the one before ended.
 */
function rotation(n: number, key: string, day: number): number {
  if (n <= 1) return 0;
  if (n === 2) return (hash(key) + day) % 2;
  const epoch = Math.floor(day / n);
  const order = (e: number) => shuffled(n, rngFor(key, e));
  const now = order(epoch);
  const before = order(epoch - 1)[n - 1]!;
  if (now[0] === before) [now[0], now[1]] = [now[1]!, now[0]!];
  return now[day - epoch * n]!;
}

function pick(w: Where, def: NpcDef, ctx: DayContext): { pos: Position; pool: string[] | null; at: number } | null {
  if (w.spots && w.spots.length) {
    const at = rotation(w.spots.length, `${ctx.seed}|${def.id}|${ctx.phase}|${w.map}`, dayNumber(ctx.day));
    return { pos: { map: w.map, spot: w.spots[at]! }, pool: w.spots, at };
  }
  return w.spot ? { pos: { map: w.map, spot: w.spot }, pool: null, at: 0 } : null;
}

function appears(def: NpcDef, ctx: DayContext): boolean {
  const a = def.schedule.appears_if;
  if (!a) return true;
  if (a.flag_all && !a.flag_all.every((f) => ctx.flags(f))) return false;
  if (a.flag_none && a.flag_none.some((f) => ctx.flags(f))) return false;
  if (a.friendship && ctx.friendship(a.friendship.npc) < a.friendship.min) return false;
  return true;
}

/** Every `n`th day, starting on a day that is the person's own (so the people do not all come on the same days). */
function everyNth(n: number, def: NpcDef, ctx: DayContext, extra = ""): boolean {
  return (dayNumber(ctx.day) + (hash(ctx.seed, def.id, extra) % n)) % n === 0;
}

interface Found {
  pos: Position;
  /** A pool the position was picked from (a roamer can move to another spot of it when one is taken). */
  pool: string[] | null;
  at: number;
}

function find(def: NpcDef, ctx: DayContext): Found | null {
  const s = def.schedule;
  if (!appears(def, ctx)) return null;
  if (ctx.phase === "night" && !s.night) return null;
  if (s.visit) {
    const { every_days: n, stay_days: m } = s.visit;
    if (((dayNumber(ctx.day) + (hash(ctx.seed, def.id, "visit") % n)) % n) >= m) return null;
  }
  const wd = weekdayOf(ctx.day);
  for (const r of s.rules) {
    if (r.when.phase && !r.when.phase.includes(ctx.phase)) continue;
    if (r.when.weekday && !r.when.weekday.includes(wd)) continue;
    if (r.when.every && !everyNth(r.when.every, def, ctx, "rule")) continue;
    return r.at ? pick(r.at, def, ctx) : null;
  }
  if (s.roam) return pick({ map: s.roam.map, spots: s.roam.spots }, def, ctx);
  return s.default ? pick(s.default, def, ctx) : null;
}

/** Where a person is on a day and day part (null: not in the world then). */
export function whereIs(def: NpcDef, ctx: DayContext): Position | null {
  return find(def, ctx)?.pos ?? null;
}

/** The people standing on `map` at this time, sorted by slug. */
export function resolve(input: ResolveInput): Placed[] {
  const { map, placement, npcs, day, phase, seed } = input;
  const ctx: DayContext = {
    day,
    phase,
    seed,
    flags: input.flags ?? (() => false),
    friendship: input.friendship ?? (() => 0),
  };
  const pins = input.pins ?? {};
  interface Entry {
    def: NpcDef;
    found: Found;
    pinned: boolean;
    tie: number;
  }
  const entries: Entry[] = [];
  for (const def of Object.values(npcs)) {
    const pin = pins[def.id];
    // R8: a pin wins over everything, on its own map only
    if (pin) {
      if (pin.map === map) entries.push({ def, found: { pos: { map, spot: pin.spot }, pool: null, at: 0 }, pinned: true, tie: hash(seed, day, phase, def.id) });
      continue;
    }
    const found = find(def, ctx);
    if (found && found.pos.map === map) entries.push({ def, found, pinned: false, tie: hash(seed, day, phase, def.id) });
  }
  // who keeps their place first: pinned, then anchors, then by priority, then by the day's luck
  const rank = (a: Entry, b: Entry) =>
    Number(b.pinned) - Number(a.pinned) || Number(b.def.anchor) - Number(a.def.anchor) || b.def.priority - a.def.priority || a.tie - b.tie || (a.def.id < b.def.id ? -1 : 1);
  entries.sort(rank);

  // R6: someone who is not with another steps off the map when the other is here and ranks higher
  const out: Entry[] = [];
  for (const e of entries) {
    const clash = out.some((k) => e.def.not_with.includes(k.def.id) || k.def.not_with.includes(e.def.id));
    if (!clash || e.pinned || e.def.anchor) out.push(e);
  }

  // fixed spots first (a roamer goes round them), then pools
  const taken = new Set<string>();
  const placed: { e: Entry; spot: string }[] = [];
  for (const e of out.filter((x) => x.found.pool === null)) {
    const spot = e.found.pos.spot;
    if (!placement.spots[spot] || taken.has(spot)) continue;
    taken.add(spot);
    placed.push({ e, spot });
  }
  for (const e of out.filter((x) => x.found.pool !== null)) {
    const pool = e.found.pool!;
    for (let i = 0; i < pool.length; i++) {
      const spot = pool[(e.found.at + i) % pool.length]!;
      if (placement.spots[spot] && !taken.has(spot)) {
        taken.add(spot);
        placed.push({ e, spot });
        break;
      }
    }
  }

  // R5: over the number, the lowest-ranked go; anchors and pins stay
  placed.sort((a, b) => rank(a.e, b.e));
  const keep: typeof placed = [];
  for (const p of placed) {
    const must = p.e.pinned || p.e.def.anchor;
    if (must || keep.length < placement.maxNpcs) keep.push(p);
  }
  return keep
    .map((p) => {
      const s = placement.spots[p.spot]!;
      return { slug: p.e.def.id, spot: p.spot, x: s.x, y: s.y, facing: s.facing };
    })
    .sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

