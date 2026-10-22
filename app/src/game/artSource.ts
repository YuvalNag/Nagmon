/**
 * Where a picture of the owner comes from: the real file, or its placeholder.
 *
 * docs/app/ART_DELIVERY.md, slice A1. Every owner picture (art/, the creature sheets, the people's
 * map sheets, the portraits, the hero faces) has a flat placeholder of the same size under
 * `game/placeholders/` (tools/app/placeholders.py). A picture whose file is not in the build is
 * drawn from its placeholder, so the game never shows a broken image. Nothing else in `src/` writes
 * these paths: it asks `artUrl(id)` (game/art.ts) or `artFile(file)` here (src/lint.test: no raw path).
 *
 * This module is small on purpose: it is in the start bundle (the "who plays" screen draws avatars),
 * so it must not import the 265 KB art manifest.
 */

declare const __NAGMON_ART_MISSING__: readonly string[] | undefined;

/** The paths (under game/) the owner's pictures live in. Same rule as tools/app/credits.py `_is_owner_art`. */
const OWNER_PREFIXES = ["art/", "avatars/", "sprites/monsters/", "sprites/portraits/nagmon_", "sprites/npc/nagmon_"] as const;

/** Whether a file under game/ is one of the owner's pictures (so it has a placeholder). */
export function isOwnerArt(file: string): boolean {
  return OWNER_PREFIXES.some((p) => file.startsWith(p));
}

/** Where the placeholder of an owner picture is, under game/ (tools/app/placeholders.py `placeholder_path`). */
export function placeholderFile(file: string): string {
  return `placeholders/${file.replace(/\.[^./]+$/, "")}.png`;
}

/** Files known not to be in the build: the build lists them (vite.config.ts), a later slice adds the packs not installed yet. */
const missing = new Set<string>(typeof __NAGMON_ART_MISSING__ === "undefined" ? [] : __NAGMON_ART_MISSING__);
let forced = readForced();
const listeners = new Set<() => void>();

function readForced(): boolean {
  try {
    return new URLSearchParams(location.search).get("art") === "placeholder" || localStorage.getItem("nagmon.art") === "placeholder";
  } catch {
    return false; // no location or storage (a unit test): not forced
  }
}

/** "real" when the file will be loaded, "placeholder" when its stand-in will be. A file that is not owner art is always "real". */
export function artFileState(file: string): "real" | "placeholder" {
  if (!isOwnerArt(file)) return "real";
  return forced || missing.has(file) ? "placeholder" : "real";
}

/** The address of an owner picture (or any file under game/) by its path under game/: the real one, or the placeholder's. */
export function artFile(file: string): string {
  return `game/${artFileState(file) === "real" ? file : placeholderFile(file)}`;
}

/** Declares which files are not there (replaces the earlier list) and tells the listeners. Used by tests and later by the pack installer. */
export function setArtMissing(files: Iterable<string>): void {
  missing.clear();
  for (const f of files) missing.add(f);
  listeners.forEach((cb) => cb());
}

/** Forces every owner picture to its placeholder (`?art=placeholder` or localStorage `nagmon.art=placeholder`: for screenshots and tests). */
export function forcePlaceholders(on: boolean): void {
  forced = on;
  listeners.forEach((cb) => cb());
}

/** Calls `cb` when the set of real pictures changes (screens re-read their addresses between scenes); returns the unsubscribe. */
export function onArtChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
