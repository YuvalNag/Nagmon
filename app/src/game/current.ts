import type { MapController } from "./mapGame";

/**
 * The map that is open now, if any, for the app's lifecycle (Android's
 * pause and resume): `currentMap()?.pause("lifecycle")` stops its loop and
 * music, and `resume("lifecycle")` starts them again. Phaser is not
 * loaded by this module: the type is all it takes from the map.
 */
let current: MapController | null = null;

export function currentMap(): MapController | null {
  return current;
}

/** The map screen sets it when its map starts, and clears it when it closes. */
export function setCurrentMap(map: MapController | null): void {
  current = map;
}
