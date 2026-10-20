/**
 * The map's camera, in pure numbers.
 *
 * - The map has one fixed size, `MAP_SCALE` device px per 1x Tuxemon px
 *   (db/display.json, tools/app/display.py): 8, a 16 px tile is 128 device
 *   px. A larger screen shows more of the map.
 * - Over the x4 HD atlas that is a whole zoom of 2: every texel covers the
 *   same 2x2 device px, so nothing shimmers as the camera moves, and no
 *   tile is drawn at more than twice its pixels (docs/app/SDD.md §10).
 * - When the canvas draws fewer pixels than the screen has (adaptive
 *   resolution, game/resolution.ts), the zoom shrinks with it: the map
 *   looks the same size, only softer.
 */

/**
 * Canvas px per atlas texel. `mapScale`: device px per 1x px;
 * `texelsPerSourcePx`: atlas texels per 1x px (64 / 16 = 4); `render`:
 * canvas px per device px (1 at the screen's full pixels).
 */
export function mapZoom(mapScale: number, texelsPerSourcePx: number, render = 1): number {
  return (mapScale / texelsPerSourcePx) * render;
}

/**
 * The camera's top-left corner in world pixels for one axis: the walker
 * in the middle, but never past the map's edge. A map smaller than the
 * view sits in the middle of it. Rounded to whole device pixels.
 *
 * `reserved` world px at the low end of the view are covered (the d-pad
 * at the bottom left): the camera may go that far past the map's low
 * edge, so a walker at the edge is drawn beside the cover, not under it,
 * with the map's black background showing there. `reservedHigh` is the
 * same at the high end (the "talk" button at the bottom right).
 */
export function scrollFor(center: number, view: number, size: number, zoom: number, reserved = 0, reservedHigh = 0): number {
  let s: number;
  if (size + reserved + reservedHigh <= view) {
    // the whole map fits beside the covers: in the middle of the rest
    s = -(reserved + (view - reserved - reservedHigh - size) / 2);
  } else {
    s = Math.min(Math.max(center - view / 2, reserved > 0 ? -reserved : 0), size - view + reservedHigh);
  }
  return snap(s, zoom);
}

/** A world coordinate on a whole device pixel. */
export function snap(world: number, zoom: number): number {
  return Math.round(world * zoom) / zoom;
}
