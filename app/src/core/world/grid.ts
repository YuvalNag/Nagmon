/**
 * Who may step where on a map: the collision grid the build bakes into
 * each map (tools/app/maps.py `collision_value`), read the way the old
 * game's movement read it (tuxemon/movement.py).
 *
 * - `rows[y][x]` is `.` (free), `#` (a wall) or `r` (a region).
 * - A region is entered only from the sides in its `enter_from`, and
 *   left only towards its `exit_from` (when that list is not empty).
 * - A line `[x, y, dir]` blocks the step from (x, y) towards `dir`.
 * - The map's edges are closed (`edges: clamped`).
 */

export type Dir = "up" | "down" | "left" | "right";

export const DIRS: readonly Dir[] = ["up", "down", "left", "right"];

export const STEP: Readonly<Record<Dir, readonly [number, number]>> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

export const OPPOSITE: Readonly<Record<Dir, Dir>> = { up: "down", down: "up", left: "right", right: "left" };

export function isDir(value: unknown): value is Dir {
  return typeof value === "string" && (DIRS as readonly string[]).includes(value);
}

export interface Region {
  enter_from: string[];
  exit_from: string[];
}

export interface CollisionData {
  rows: string[];
  regions: Record<string, Region>;
  lines: [number, number, string][];
}

export interface Tile {
  x: number;
  y: number;
}

export class CollisionGrid {
  readonly width: number;
  readonly height: number;
  private rows: string[];
  private regions: Map<string, Region>;
  private lines: Set<string>;

  constructor(data: CollisionData, width: number, height: number) {
    if (data.rows.length !== height || data.rows.some((r) => r.length !== width)) {
      throw new Error(`collision grid is not ${width}x${height}`);
    }
    this.width = width;
    this.height = height;
    this.rows = data.rows;
    this.regions = new Map(Object.entries(data.regions));
    this.lines = new Set(data.lines.map(([x, y, d]) => `${x},${y},${d}`));
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** `.`, `#` or `r`; outside the map is a wall. */
  cell(x: number, y: number): string {
    return this.inside(x, y) ? this.rows[y][x] : "#";
  }

  isWall(x: number, y: number): boolean {
    return this.cell(x, y) === "#";
  }

  region(x: number, y: number): Region | undefined {
    return this.cell(x, y) === "r" ? this.regions.get(`${x},${y}`) : undefined;
  }

  /**
   * Whether one step from (x, y) towards `dir` is allowed. `occupied`
   * says whether someone (an NPC) stands on a tile.
   */
  canStep(x: number, y: number, dir: Dir, occupied: (x: number, y: number) => boolean = () => false): boolean {
    const here = this.region(x, y);
    if (here && here.exit_from.length > 0 && !here.exit_from.includes(dir)) return false;
    const [dx, dy] = STEP[dir];
    const tx = x + dx;
    const ty = y + dy;
    if (!this.inside(tx, ty)) return false;
    if (this.lines.has(`${x},${y},${dir}`)) return false;
    const cell = this.cell(tx, ty);
    if (cell === "#") return false;
    if (cell === "r") {
      const there = this.regions.get(`${tx},${ty}`);
      // a region is entered from the side the walker comes from
      if (!there || !there.enter_from.includes(OPPOSITE[dir])) return false;
    }
    return !occupied(tx, ty);
  }
}
