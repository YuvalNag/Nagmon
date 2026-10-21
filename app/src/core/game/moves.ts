/**
 * The moves (docs/app/BATTLE_V3.md, section 3). A creature has four on
 * its cards; choosing a move IS the question. The full table (50 moves,
 * game/moves.json, built from mods/nagmon/moves/*.yaml) is another
 * branch's work; S1 needs the plain attacks, so they are here as the
 * default table and a loaded table takes over when there is one.
 *
 * Field names follow the spec's columns: id, subject, tier (T), mp (MP),
 * charges (Ch), lv (Lv).
 */
import { WHEEL } from "./battleNumbers";

/** E easy, N normal, S stretch, F finale, U utility, C chain starter, K finisher, Q quick, W the fallback Wiggle. */
export type Tier = "E" | "N" | "S" | "F" | "U" | "C" | "K" | "Q" | "W";

export interface Move {
  id: string;
  /** A subject id (the wheel's). The Wiggle has none. */
  subject: string | null;
  tier: Tier;
  /** Base power (0 for a utility). */
  mp: number;
  /** Uses in one battle; null: no limit (the Wiggle). */
  charges: number | null;
  /** The level at which a creature of the subject knows it. */
  lv: number;
}

export type MoveTable = Readonly<Record<string, Move>>;

export const WIGGLE = "little_wiggle";

const row = (id: string, subject: string, tier: Tier, mp: number, charges: number): Move => ({ id, subject, tier, mp, charges, lv: 1 });

/** The plain attacks of the six subjects (spec rows 1, 2, 9, 10, 17, 18, 25, 26, 34, 35, 42, 43) and the Little Wiggle (50). */
const DEFAULT_LIST: Move[] = [
  row("number_nudge", "math", "E", 40, 15),
  row("sum_spark", "math", "N", 60, 10),
  row("dot_tap", "geometry", "E", 40, 15),
  row("block_bounce", "geometry", "N", 60, 10),
  row("leaf_flick", "science", "E", 40, 15),
  row("splash", "science", "N", 60, 10),
  row("letter_toss", "english", "E", 40, 15),
  row("word_wave", "english", "N", 60, 10),
  row("aleph_hop", "hebrew", "E", 40, 15),
  row("word_bloom", "hebrew", "N", 60, 10),
  row("pattern_peek", "logic", "E", 40, 15),
  row("puzzle_pop", "logic", "N", 60, 10),
  { id: WIGGLE, subject: null, tier: "W", mp: 25, charges: null, lv: 1 },
];

export const DEFAULT_MOVES: MoveTable = Object.fromEntries(DEFAULT_LIST.map((m) => [m.id, m]));

const TIERS = new Set<string>(["E", "N", "S", "F", "U", "C", "K", "Q", "W"]);
const int = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : d);

/**
 * From a parsed game/moves.json: `{moves: [..]}` or a plain list. A row
 * with no id, an unknown tier or a subject off the wheel is left out. The
 * default plain attacks and the Wiggle stay when the file has none of them.
 */
export function movesFrom(doc: unknown): MoveTable {
  const d = doc as { moves?: unknown } | unknown[] | null | undefined;
  const list = Array.isArray(d) ? d : Array.isArray(d?.moves) ? d.moves : [];
  const out: Record<string, Move> = { ...DEFAULT_MOVES };
  for (const raw of list) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const tier = String(r["tier"] ?? r["t"] ?? "");
    const subject = typeof r["subject"] === "string" ? r["subject"] : null;
    if (typeof r["id"] !== "string" || !TIERS.has(tier)) continue;
    if (tier !== "W" && (subject === null || !WHEEL.includes(subject))) continue;
    const charges = r["charges"] ?? r["ch"];
    out[r["id"]] = { id: r["id"], subject, tier: tier as Tier, mp: int(r["mp"], 0), charges: charges === null || charges === undefined ? (tier === "W" ? null : 10) : int(charges, 10), lv: Math.max(1, int(r["lv"] ?? r["level"], 1)) };
  }
  return out;
}

/** What a card shows: the flames (1 to 4), by tier. */
export const flames = (tier: Tier): number => ({ E: 1, N: 2, S: 3, F: 4, C: 1, K: 3, Q: 1, U: 1, W: 1 })[tier];

/**
 * The four moves of a creature, by its home subject and level (3.1, 3.3).
 * It knows every plain attack of its own subject up to its level. S1 has
 * no lesson cards yet (S2), so two more fill the free slots as coverage,
 * a normal move two places on the wheel and an easy one four places on, so
 * that the wheel gives a real choice from the first fight.
 */
export function equipped(subject: string, level: number, moves: MoveTable = DEFAULT_MOVES): Move[] {
  const known = (s: string, tiers: Tier[]) =>
    Object.values(moves)
      .filter((m) => m.subject === s && tiers.includes(m.tier) && m.lv <= level)
      .sort((a, b) => a.lv - b.lv || a.mp - b.mp);
  const home = known(subject, ["E", "N"]);
  const at = WHEEL.indexOf(subject);
  const out = [...home.filter((m) => m.tier === "E").slice(0, 1), ...home.filter((m) => m.tier === "N").slice(0, 1)];
  if (at >= 0) {
    const n = known(WHEEL[(at + 2) % WHEEL.length]!, ["N"])[0];
    const e = known(WHEEL[(at + 4) % WHEEL.length]!, ["E"])[0];
    if (n) out.push(n);
    if (e) out.push(e);
  }
  return out.slice(0, 4);
}
