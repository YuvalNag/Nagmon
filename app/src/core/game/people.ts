/**
 * The people the child has met (the PC's People tab, docs/app/WORLD_V2.md
 * 8): who, since when, and a friendship of 0 to 3 hearts. This is the
 * data contract the NPC slice (W1) fills in properly: a person is a
 * slug, nothing the child typed. Until then talking to someone on a new
 * day grows the hearts by one, up to three.
 *
 * Saved (additive, optional): `met[slug] = {first, last, hearts, tastes?}`.
 * `tastes` is for the gift system of a later slice: the tastes found out
 * so far (a gift reveals "loved" or "liked"); nothing here writes it.
 */
import type { WorldState } from "../world/worldState";

export const MAX_HEARTS = 3;

export interface Met {
  first: string;
  last: string;
  hearts: number;
  tastes?: Record<string, "loved" | "liked">;
}

export type MetSave = Record<string, Met>;

/** What the directory knows about a person (from the object definition of the PC). */
export interface Person {
  slug: string;
  name: string;
  /** What they offer, one short phrase. */
  offers: string;
  /** The picture's code in the emoji set (the portrait stand-in). */
  emoji: string;
}

const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const day = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function parseMet(v: unknown): MetSave {
  const out: MetSave = {};
  for (const [slug, raw] of Object.entries(rec(v))) {
    const m = rec(raw);
    const first = day(m["first"]);
    if (!first || !/^[a-z0-9_]+$/.test(slug)) continue;
    const hearts = typeof m["hearts"] === "number" ? Math.max(0, Math.min(MAX_HEARTS, Math.trunc(m["hearts"]))) : 0;
    const met: Met = { first, last: day(m["last"]) ?? first, hearts };
    const tastes: Record<string, "loved" | "liked"> = {};
    for (const [item, how] of Object.entries(rec(m["tastes"]))) if (how === "loved" || how === "liked") tastes[item] = how;
    if (Object.keys(tastes).length) met.tastes = tastes;
    out[slug] = met;
  }
  return out;
}

/** The child talked to `slug` today: met for the first time, or one more heart on a new day. True when something changed. */
export function meet(world: WorldState, slug: string, today: string): boolean {
  const m = world.met[slug];
  if (!m) {
    world.met[slug] = { first: today, last: today, hearts: 0 };
    return true;
  }
  if (m.last === today) return false;
  m.last = today;
  m.hearts = Math.min(MAX_HEARTS, m.hearts + 1);
  return true;
}

/**
 * The child has met `slug`: by the people system of the world (core/world/memory.ts, which has the friendship of the
 * people it defines) or by the plain `met` list (people without a definition there).
 */
export const hasMet = (world: WorldState, slug: string): boolean => (world.npcs.get(slug)?.met ?? 0) > 0 || world.met[slug] !== undefined;

/**
 * The people of the directory the child has met, in the directory's order. For a person the world's people system
 * knows, the hearts are its friendship level; the gift tastes stay in `met`.
 */
export const metPeople = (world: WorldState, directory: readonly Person[]): { person: Person; met: Met }[] =>
  directory.flatMap((p) => {
    const rec = world.npcs.get(p.slug);
    const own = world.met[p.slug];
    if (rec && rec.met > 0) {
      const day = rec.last ?? own?.first ?? "";
      const met: Met = { first: own?.first ?? day, last: day, hearts: Math.min(MAX_HEARTS, rec.lvl) };
      if (own?.tastes) met.tastes = own.tastes;
      return [{ person: p, met }];
    }
    return own ? [{ person: p, met: own }] : [];
  });
