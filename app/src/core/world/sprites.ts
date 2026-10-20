import type { Dir } from "./grid";

/**
 * Map sheets (db/avatars.json, db/npcs.json): 3 frames across (step,
 * stand, step) and 4 directions down (down, left, right, up), each
 * frame two tiles tall.
 */

export interface Sheet {
  url: string;
  /** One frame, in the sheet's own (HD) pixels. */
  frameWidth: number;
  frameHeight: number;
  /** How many sheet pixels make one 1x Tuxemon pixel (the build's `scale`), if the record says. */
  scale: number | null;
}

interface SheetRecord {
  map: string;
  frame: [number, number];
  scale?: number;
}

function sheetOf(r: SheetRecord): Sheet {
  return { url: `game/${r.map}`, frameWidth: r.frame[0], frameHeight: r.frame[1], scale: r.scale ?? null };
}

/**
 * How big a frame is drawn on the map, in world pixels (an atlas tile is
 * `tileSize` of them, `sourceTile` 1x pixels). With the record's `scale`
 * the frame keeps its 1x size (a 16x32 hero is a tile wide, two tall);
 * without one, the frame is a tile wide.
 */
export function worldSize(sheet: Sheet, tileSize: number, sourceTile: number): { width: number; height: number } {
  const width = sheet.scale ? (sheet.frameWidth / sheet.scale) * (tileSize / sourceTile) : tileSize;
  return { width, height: (width * sheet.frameHeight) / sheet.frameWidth };
}

interface AvatarsDb {
  avatars: ({ key: string } & SheetRecord)[];
  legacy: Record<string, string>;
  fallback: string;
}

interface NpcsDb {
  [slug: string]: { sprites?: SheetRecord };
}

const ROWS: Readonly<Record<Dir, number>> = { down: 0, left: 1, right: 2, up: 3 };

/** The map sheet of the hero a profile's avatar key draws (old keys and unknown ones too). */
export function avatarSheet(db: AvatarsDb, key: string): Sheet {
  const want = db.avatars.find((a) => a.key === key) ? key : (db.legacy[key] ?? db.fallback);
  return sheetOf(db.avatars.find((x) => x.key === want) ?? db.avatars[0]);
}

export function npcSheet(db: NpcsDb, slug: string): Sheet | null {
  const s = db[slug]?.sprites;
  return s ? sheetOf(s) : null;
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
