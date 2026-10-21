/**
 * The owner's second batch of art (docs/app/ART_ASSETS.md): its manifest
 * is game/art/manifest.json, written by tools/app/art2.py (the file is
 * also served, for anything that wants it at run time).
 */
import { backdrops, assets } from "../../public/game/art/manifest.json";

/** The address of a picture of the manifest, by id. */
export function artUrl(id: string): string {
  const entry = assets.find((a) => a.id === id);
  if (!entry) throw new Error(`art: no picture ${id}`);
  return `game/${entry.file}`;
}

/**
 * The backdrop of a battle: by the map's name (the solar zones have one
 * each, every other map gets Hearthrock's), or the night one.
 */
export function backdropFor(map?: string, night = false): { id: string; url: string } {
  const table = backdrops.maps as Record<string, string>;
  const id = night ? backdrops.night : (map && table[map]) || backdrops.default;
  return { id, url: artUrl(id) };
}

/** The owl's story cards, in the order the intro shows them. */
export const OWL_CARDS = ["card_forgetting_fog", "card_owl_help", "card_colors_return", "card_creature_steps"] as const;
