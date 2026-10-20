import type { Dir } from "../core/world/grid";

/**
 * The d-pad's fingers (docs/app/SDD.md §4), apart from the DOM.
 *
 * - Each finger on the pad is tracked by its own pointer id. A finger
 *   that slides keeps walking, towards the arrow it is over now.
 * - The newest finger that points somewhere wins; when it lifts, an
 *   older one still down takes over. Other fingers on the screen (on the
 *   menu, resting on the edge) change nothing.
 * - A tap shorter than a frame still counts once ({@link take}).
 * - Only fingers that went down on the pad count: a finger that was
 *   already down when the map appeared is never seen here.
 */
export class DpadState {
  private presses = new Map<number | string, { dir: Dir | null; order: number }>();
  private order = 0;
  private tapped: Dir | null = null;

  down(id: number | string, dir: Dir | null): void {
    this.presses.set(id, { dir, order: ++this.order });
    if (dir) this.tapped = dir;
  }

  /** The finger moved; only a finger that went down here counts. */
  move(id: number | string, dir: Dir | null): void {
    const p = this.presses.get(id);
    if (!p || p.dir === dir) return;
    p.dir = dir;
    if (dir) this.tapped = dir;
  }

  up(id: number | string): void {
    this.presses.delete(id);
  }

  /** All fingers off (the map paused, went to the background or closed). */
  clear(): void {
    this.presses.clear();
    this.tapped = null;
  }

  has(id: number | string): boolean {
    return this.presses.has(id);
  }

  /** The direction held now: the newest finger that points somewhere. */
  held(): Dir | null {
    let best: { dir: Dir | null; order: number } | null = null;
    for (const p of this.presses.values()) if (p.dir && (!best || p.order > best.order)) best = p;
    return best?.dir ?? null;
  }

  /** The direction for this frame: the one held, or a tap since the last frame. */
  take(): Dir | null {
    const dir = this.held() ?? this.tapped;
    this.tapped = null;
    return dir;
  }
}

/**
 * The arrow under a point of the pad: (dx, dy) from its middle, `half`
 * its half size. The middle (`dead` of `half`) points nowhere.
 */
export function dirAt(dx: number, dy: number, half: number, dead = 0.25): Dir | null {
  if (Math.abs(dx) < half * dead && Math.abs(dy) < half * dead) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}
