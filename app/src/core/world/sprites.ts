import type { Dir } from "./grid";

/**
 * Map sheets (db/avatars.json, db/npcs.json): 3 frames across (step,
 * stand, step) and 4 directions down (down, left, right, up), each
 * frame two tiles tall.
 */

export interface Sheet {
  url: string;
  frameWidth: number;
  frameHeight: number;
}

interface AvatarsDb {
  avatars: { key: string; map: string; frame: [number, number] }[];
  legacy: Record<string, string>;
  fallback: string;
}

interface NpcsDb {
  [slug: string]: { sprites?: { map: string; frame: [number, number] } };
}

const ROWS: Readonly<Record<Dir, number>> = { down: 0, left: 1, right: 2, up: 3 };

/** The map sheet of the hero a profile's avatar key draws (old keys and unknown ones too). */
export function avatarSheet(db: AvatarsDb, key: string): Sheet {
  const want = db.avatars.find((a) => a.key === key) ? key : (db.legacy[key] ?? db.fallback);
  const a = db.avatars.find((x) => x.key === want) ?? db.avatars[0];
  return { url: `game/${a.map}`, frameWidth: a.frame[0], frameHeight: a.frame[1] };
}

export function npcSheet(db: NpcsDb, slug: string): Sheet | null {
  const s = db[slug]?.sprites;
  return s ? { url: `game/${s.map}`, frameWidth: s.frame[0], frameHeight: s.frame[1] } : null;
}

/**
 * The frame to draw: standing, or mid-step (`t` 0..1 of a step) on the
 * left or right foot, which change with every tile.
 */
export function frameIndex(facing: Dir, t: number | null, leftFoot: boolean): number {
  const row = ROWS[facing] * 3;
  if (t === null || t < 0.25 || t >= 0.75) return row + 1;
  return row + (leftFoot ? 0 : 2);
}
