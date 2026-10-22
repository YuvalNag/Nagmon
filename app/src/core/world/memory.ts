/**
 * What a person of the world remembers about the child: small, local and
 * never free text (docs/app/WORLD_V2.md 5.5). Numbers, dates and short
 * ids only: friendship points and level, how many talks, the last day, a
 * few flags the person's own file allows, the last 8 line ids shown (so
 * the same words do not come twice) and the step of each quest chain.
 *
 * Friendship never decreases. A record is read back with every field
 * checked, so a damaged save cannot put a sentence, or a name, into the
 * people's memory, and it is trimmed to {@link MAX_RECORD_BYTES}.
 */

export const RECENT_MAX = 8;
export const FLAGS_MAX = 12;
/** A record, as JSON, never grows past this (about 250 is usual). */
export const MAX_RECORD_BYTES = 420;

export interface NpcRecord {
  /** Friendship points, and the level they reached (0 to 3); neither goes down. */
  pts: number;
  lvl: number;
  /** Talks so far. */
  met: number;
  /** The last day (`YYYY-MM-DD`) the child talked to this person. */
  last: string | null;
  /** The day the child last gave a gift (one a day). */
  gift_day?: string;
  /** Talks today, and topics asked today: they start again when `last` changes. */
  td?: number;
  tn?: number;
  flags: string[];
  /** The last line ids shown, oldest first. */
  recent: string[];
  /** The step reached in each quest chain. */
  quests?: Record<string, number>;
}

export const emptyRecord = (): NpcRecord => ({ pts: 0, lvl: 0, met: 0, last: null, flags: [], recent: [] });

const ID = /^[A-Za-z0-9_.:-]{1,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The level (0 to 3) the points reach, by the person's own thresholds. */
export function levelFor(pts: number, levels: readonly number[]): number {
  let lvl = 0;
  for (let i = 1; i < levels.length && i <= 3; i++) if (pts >= levels[i]!) lvl = i;
  return lvl;
}

/** Adds friendship points (whole, above zero); the level may rise and never falls. */
export function addPoints(rec: NpcRecord, n: number, levels: readonly number[]): void {
  if (Number.isFinite(n) && n >= 1) rec.pts += Math.trunc(n);
  rec.lvl = Math.max(rec.lvl, levelFor(rec.pts, levels));
}

/** Notes a line id as shown: the ring keeps the last {@link RECENT_MAX}, each once. */
export function remember(rec: NpcRecord, lineId: string): void {
  rec.recent = [...rec.recent.filter((x) => x !== lineId), lineId].slice(-RECENT_MAX);
}

/** Sets a flag of the person's own list; the oldest goes when there are more than {@link FLAGS_MAX}. */
export function setFlag(rec: NpcRecord, flag: string, allowed: readonly string[]): void {
  if (!allowed.includes(flag) || rec.flags.includes(flag)) return;
  rec.flags = [...rec.flags, flag].slice(-FLAGS_MAX);
}

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 1 ? Math.trunc(v) : 0);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && ID.test(x)) : []);

/** A record from a saved `npcs` entry, every field checked and the whole trimmed to fit; null when it is not an object. */
export function parseRecord(v: unknown): NpcRecord | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const rec: NpcRecord = {
    pts: count(o["pts"]),
    lvl: Math.min(3, count(o["lvl"])),
    met: count(o["met"]),
    last: typeof o["last"] === "string" && DAY.test(o["last"]) ? o["last"] : null,
    flags: [...new Set(ids(o["flags"]))].slice(-FLAGS_MAX),
    recent: [...new Set(ids(o["recent"]))].slice(-RECENT_MAX),
  };
  if (typeof o["gift_day"] === "string" && DAY.test(o["gift_day"])) rec.gift_day = o["gift_day"];
  if (count(o["td"])) rec.td = Math.min(99, count(o["td"]));
  if (count(o["tn"])) rec.tn = Math.min(99, count(o["tn"]));
  const q = o["quests"];
  if (typeof q === "object" && q !== null && !Array.isArray(q)) {
    const quests: Record<string, number> = {};
    for (const [k, step] of Object.entries(q)) if (ID.test(k) && count(step)) quests[k] = Math.min(99, count(step));
    if (Object.keys(quests).length) rec.quests = quests;
  }
  return trim(rec);
}

/** Drops what is least needed until the record fits: the quests, then the oldest flags, then (only then) the oldest recent ids. */
function trim(rec: NpcRecord): NpcRecord {
  const size = () => JSON.stringify(rec).length;
  if (size() > MAX_RECORD_BYTES) delete rec.quests;
  while (size() > MAX_RECORD_BYTES && rec.flags.length) rec.flags.shift();
  while (size() > MAX_RECORD_BYTES && rec.recent.length > 1) rec.recent.shift();
  return rec;
}

/** The records of a saved `npcs` map: only well-formed ids with a record that reads. */
export function parseRecords(v: unknown): Map<string, NpcRecord> {
  const out = new Map<string, NpcRecord>();
  if (typeof v !== "object" || v === null || Array.isArray(v)) return out;
  for (const [slug, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!ID.test(slug)) continue;
    const rec = parseRecord(raw);
    if (rec) out.set(slug, rec);
  }
  return out;
}

/** The records as the save holds them: a plain object, sorted by person. */
export function recordsToDict(records: ReadonlyMap<string, NpcRecord>): Record<string, NpcRecord> {
  return Object.fromEntries(
    [...records]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([slug, r]) => [slug, trim({ ...r, flags: [...r.flags], recent: [...r.recent], ...(r.quests ? { quests: { ...r.quests } } : {}) })]),
  );
}
