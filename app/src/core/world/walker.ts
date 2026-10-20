import { type Dir, STEP } from "./grid";

/**
 * A walker on the tile grid: one whole tile per step, drawn smoothly in
 * between. While a direction is held it walks on, step after step, with
 * no stop at each tile (the time left over from one step goes into the
 * next). When the direction is let go, the step under way ends on its
 * tile and the walker stops there.
 */

/** Tiles per second. The old game walked at 3.75 (tuxemon CONFIG.player_walkrate). */
export const WALK_SPEED = 3.75;

export interface Step {
  fromX: number;
  fromY: number;
  dir: Dir;
  /** 0 at the start tile, 1 on the next one. */
  t: number;
}

export type WalkEvent =
  /** Arrived on a tile (after a step). */
  | { kind: "arrived"; x: number; y: number }
  /** Tried to step towards `dir` and could not: a wall, an edge or someone there. */
  | { kind: "bumped"; x: number; y: number; dir: Dir }
  /** Turned to face `dir` (the start of a step or a bump). */
  | { kind: "turned"; dir: Dir };

export class Walker {
  x: number;
  y: number;
  facing: Dir;
  step: Step | null = null;
  readonly speed: number;
  /** The direction of the last bump, until the walker moves or lets go: one bump per push. */
  private bumping: Dir | null = null;

  constructor(x: number, y: number, facing: Dir = "down", speed = WALK_SPEED) {
    this.x = x;
    this.y = y;
    this.facing = facing;
    this.speed = speed;
  }

  get moving(): boolean {
    return this.step !== null;
  }

  /** Where to draw the walker, in tiles (fractional while stepping). */
  position(): { x: number; y: number } {
    if (!this.step) return { x: this.x, y: this.y };
    const [dx, dy] = STEP[this.step.dir];
    return { x: this.step.fromX + dx * this.step.t, y: this.step.fromY + dy * this.step.t };
  }

  /** Puts the walker on a tile, standing (a teleport). */
  place(x: number, y: number, facing: Dir = this.facing): void {
    this.x = x;
    this.y = y;
    this.facing = facing;
    this.step = null;
    this.bumping = null;
  }

  /**
   * Moves on by `dtMs`. `held` is the direction asked for now (or none);
   * `canStep(x, y, dir)` says whether a step is allowed.
   */
  update(dtMs: number, held: Dir | null, canStep: (x: number, y: number, dir: Dir) => boolean): WalkEvent[] {
    const events: WalkEvent[] = [];
    let time = Math.max(0, dtMs) / 1000;
    if (held === null) this.bumping = null;
    // at most a few steps in one frame, even after a long stall
    for (let guard = 0; guard < 8; guard++) {
      if (this.step) {
        const left = (1 - this.step.t) / this.speed;
        if (time < left) {
          this.step.t += time * this.speed;
          return events;
        }
        time -= left;
        const [dx, dy] = STEP[this.step.dir];
        this.x = this.step.fromX + dx;
        this.y = this.step.fromY + dy;
        this.step = null;
        events.push({ kind: "arrived", x: this.x, y: this.y });
      }
      if (held === null) return events;
      if (this.facing !== held) {
        this.facing = held;
        events.push({ kind: "turned", dir: held });
      }
      if (!canStep(this.x, this.y, held)) {
        if (this.bumping !== held) events.push({ kind: "bumped", x: this.x, y: this.y, dir: held });
        this.bumping = held;
        return events;
      }
      this.bumping = null;
      this.step = { fromX: this.x, fromY: this.y, dir: held, t: 0 };
      if (time <= 0) return events;
    }
    return events;
  }
}
