/**
 * How big the map draws things, as named numbers (docs/app/SDD.md §10,
 * "images"). Sizes of pictures come from their records (`frame` in the
 * sheet's HD pixels and `scale`, HD pixels per 1x Tuxemon pixel), never
 * from a 1x size assumed here.
 *
 * - The canvas has the screen's own device pixels (devicePixelRatio).
 * - The atlas tile is 64 HD texels (Tuxemon's 16 px tile, xBRZ x4).
 * - The camera's zoom (device px per HD texel) is a whole number up to 2
 *   (core/world/camera.ts): on the family's phone it is 2, so one 1x
 *   pixel is 8 device px and a tile 128. A non-whole zoom (7 device px
 *   per 1x px would be 1.75 per texel) would shimmer as the camera moves.
 */
export { MAX_ZOOM as MAP_MAX_ZOOM, TARGET_ROWS as MAP_TARGET_ROWS } from "../core/world/camera";

/** Tuxemon's tile, in 1x pixels (maps without a `source_tile_size` property). */
export const MAP_SOURCE_TILE_PX = 16;

/** Device pixels per 1x Tuxemon pixel on the map, at a zoom. */
export function mapDevicePxPerSourcePx(zoom: number, atlasTilePx = 64, sourceTilePx = MAP_SOURCE_TILE_PX): number {
  return (atlasTilePx * zoom) / sourceTilePx;
}
