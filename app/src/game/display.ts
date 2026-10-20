/**
 * How large the game draws its pictures (docs/app/SDD.md §10.1). The
 * numbers are db/display.json, written by tools/app/display.py: the one
 * source of truth, which the build's check (tests/app/test_app_hd.py)
 * reads too. Sizes are device px for one px of 1x art (a 16 px tile, a
 * 64 px monster frame); a record's `scale` says how many picture px that
 * 1x px has.
 *
 * Layout: the map has one fixed scale; in battle the monsters, islands,
 * HUD and animations share `battleScale`, and the background covers
 * the screen (`backgroundScale`).
 */
import table from "../../public/game/db/display.json";

export const DISPLAY = table;

/** Device px per 1x px on the map (a 16 px tile is 112 px). */
export const MAP_SCALE: number = table.map.scale;

/** Device px per 1x px in battle on a screen this tall (device px). */
export function battleScale(screenHeight: number): number {
  return Math.min(table.battle.max_scale, screenHeight / table.battle.stage_height);
}

/** Device px per picture px of a background that covers the screen. */
export function backgroundScale(
  image: { width: number; height: number },
  screen: { width: number; height: number },
): number {
  return Math.max(screen.width / image.width, screen.height / image.height);
}

/** How many times a picture of `scale` is enlarged when 1x px are `perPx`. */
export function enlargement(perPx: number, scale: number): number {
  return perPx / scale;
}
