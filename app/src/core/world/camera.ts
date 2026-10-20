/**
 * The map's camera, in pure numbers. The canvas is drawn at the screen's
 * own device pixels; the zoom says how many device pixels one texel of
 * the HD tile atlas takes.
 *
 * - The zoom is a whole number: every texel covers the same square of
 *   device pixels, so nothing shimmers or blurs as the camera moves.
 * - It is at most {@link MAX_ZOOM}: no picture is shown at more than
 *   twice its own pixels (docs/app/SDD.md §10, "images").
 * - It is the one that shows about {@link TARGET_ROWS} rows of tiles,
 *   the size a child's eye finds the hero and the paths.
 */

export const MAX_ZOOM = 2;
export const TARGET_ROWS = 9;

/** Device pixels per texel for a screen `deviceHeight` device pixels tall. */
export function pickZoom(deviceHeight: number, tileSize = 64, targetRows = TARGET_ROWS): number {
  let best = 1;
  let bestMiss = Infinity;
  for (let z = 1; z <= MAX_ZOOM; z++) {
    const rows = deviceHeight / (tileSize * z);
    // fewer rows than asked is worse than more: the paths ahead matter
    const miss = rows < targetRows ? (targetRows - rows) * 1.5 : rows - targetRows;
    if (miss < bestMiss) {
      best = z;
      bestMiss = miss;
    }
  }
  return best;
}

/**
 * The camera's top-left corner in world pixels for one axis: the walker
 * in the middle, but never past the map's edge. A map smaller than the
 * view sits in the middle of it. Rounded to whole device pixels.
 */
export function scrollFor(center: number, view: number, size: number, zoom: number): number {
  const s = size <= view ? (size - view) / 2 : Math.min(Math.max(center - view / 2, 0), size - view);
  return snap(s, zoom);
}

/** A world coordinate on a whole device pixel. */
export function snap(world: number, zoom: number): number {
  return Math.round(world * zoom) / zoom;
}
