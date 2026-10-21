/**
 * Where the child stood last: the map and the tile, and the way they
 * faced. Kept in `world.json` as `place`, so a child who comes back
 * (from the menu, from the background, after the system ended the app)
 * stands where they left. Only a map and a tile: nothing of a battle or a
 * question is kept (what a battle changed is already in the saves).
 */
import { isDir, type CollisionGrid, type Dir } from "./grid";

export interface Place {
  map: string;
  x: number;
  y: number;
  facing: Dir;
}

/** A saved place, or null for anything that is not one. */
export function parsePlace(v: unknown): Place | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const p = v as Record<string, unknown>;
  const { map, x, y, facing } = p;
  if (typeof map !== "string" || !/^[a-z0-9_]+$/.test(map)) return null;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) return null;
  return { map, x, y, facing: isDir(facing) ? facing : "down" };
}

/** Whether the hero may stand on the tile: on the map, open ground, nobody there. */
export function placeIsFree(grid: CollisionGrid, x: number, y: number, occupied: (x: number, y: number) => boolean): boolean {
  return grid.inside(x, y) && grid.cell(x, y) === "." && !occupied(x, y);
}

export const PLACE_EVERY_MS = 2000;

/**
 * Hands the place to `write` on a map change at once, and on steps at
 * most every two seconds (a flush writes what a step held back).
 */
export class PlaceSaver {
  private last = -Infinity;
  private held: Place | null = null;
  private written: string | null = null;

  constructor(
    private readonly write: (p: Place) => void,
    private readonly clock: () => number,
    private readonly every = PLACE_EVERY_MS,
  ) {}

  step(p: Place): void {
    if (this.clock() - this.last >= this.every) this.now(p);
    else this.held = p;
  }

  now(p: Place): void {
    this.held = null;
    this.last = this.clock();
    const key = `${p.map}/${p.x}/${p.y}/${p.facing}`;
    if (key === this.written) return;
    this.written = key;
    this.write(p);
  }

  flush(): void {
    if (this.held) this.now(this.held);
  }
}
