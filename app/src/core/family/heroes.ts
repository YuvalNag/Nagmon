import heroesData from "../../../public/game/heroes.json";
import { artFile } from "../../game/artSource";

/**
 * The heroes a child can be: read from game/heroes.json, which the build writes from
 * mods/nagmon/heroes/heroes.yaml (docs/app/HEROES.md). There is no hero list in the code: a new
 * hero is a data entry and its art, nothing here changes.
 *
 * The file carries each picture's file, frame and map scale (the build looked them up in the art
 * manifest), so the start screen does not load the 265 KB manifest. Pictures are drawn through
 * `artFile`, the same fallback as `artUrl` (a file not in the build shows its placeholder).
 */

export type HeroArt = "map" | "portrait" | "face";

export interface HeroFile {
  /** Under game/. */
  file: string;
  /** Map sheets only: one frame, in the sheet's pixels. */
  frame?: [number, number];
  /** Map sheets only: sheet pixels per 1x Tuxemon pixel. */
  scale?: number;
}

/** A look of the same hero (a head covering, a hairstyle): swaps any of its pictures. */
export interface HeroVariant {
  id: string;
  kind: string;
  name: { he: string; en: string };
  art: Partial<Record<HeroArt, string>>;
  files: Partial<Record<HeroArt, HeroFile>>;
}

export interface Hero {
  id: string;
  order: number;
  /** Offered in the pickers; a hero that is not still shows for a child who has it. */
  enabled: boolean;
  name: { he: string; en: string };
  colors: { primary: string; secondary: string };
  art: Record<HeroArt, string>;
  files: Record<HeroArt, HeroFile>;
  variants?: HeroVariant[];
}

export interface HeroesFile {
  version: number;
  max: number;
  fallback: string;
  /** Ids the old app saved -> the hero they are drawn as. */
  legacy: Record<string, string>;
  heroes: Hero[];
}

export interface Roster {
  /** The heroes a child may pick, in order. */
  readonly offered: readonly Hero[];
  /** Every id a profile may hold: the heroes' and the old app's. */
  readonly keys: ReadonlySet<string>;
  /** The hero a saved id is drawn as (old ids too; an unknown id gets the fallback). */
  hero(id: string): Hero;
  /** The picture's file, from the variant when it has one for it. */
  file(id: string, art: HeroArt, variant?: string): HeroFile;
  /** The face on the cards and in the battle. */
  faceUrl(id: string, variant?: string): string;
  /** The large portrait. */
  portraitUrl(id: string, variant?: string): string;
}

export function makeRoster(data: HeroesFile): Roster {
  const all = new Map(data.heroes.map((h) => [h.id, h]));
  const offered = data.heroes.filter((h) => h.enabled).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const fallback = all.get(data.fallback) ?? offered[0];
  if (!fallback) throw new Error("heroes: the roster has no hero");
  const hero = (id: string): Hero => all.get(id) ?? all.get(data.legacy[id] ?? "") ?? fallback;
  const file = (id: string, art: HeroArt, variant?: string): HeroFile => {
    const h = hero(id);
    return h.variants?.find((v) => v.id === variant)?.files[art] ?? h.files[art];
  };
  return {
    offered,
    keys: new Set([...all.keys(), ...Object.keys(data.legacy)]),
    hero,
    file,
    faceUrl: (id, variant) => artFile(file(id, "face", variant).file),
    portraitUrl: (id, variant) => artFile(file(id, "portrait", variant).file),
  };
}

/**
 * A roster to preview (tests, screenshots): localStorage `nagmon.heroes.preview` holds a whole heroes.json
 * (the e2e checks the picker with 12 heroes this way). Anything that is not one is ignored.
 */
function previewed(): HeroesFile | null {
  try {
    const d = JSON.parse(localStorage.getItem("nagmon.heroes.preview") ?? "null") as HeroesFile | null;
    const ok = d && typeof d.fallback === "string" && Array.isArray(d.heroes) && d.heroes.length > 0 && d.heroes.every((h) => typeof h.id === "string" && h.files?.face?.file && h.files.map?.file && h.name?.he);
    return ok ? d : null;
  } catch {
    return null; // no storage (a unit test) or not JSON
  }
}

/** The shipped roster. */
export const heroes: Roster = makeRoster(previewed() ?? (heroesData as unknown as HeroesFile));

/** What the picker offers: an id, the name on the card and the picture. */
export function heroChoices(roster: Roster = heroes): { id: string; label: string; image: string }[] {
  return roster.offered.map((h) => ({ id: h.id, label: h.name.he, image: roster.faceUrl(h.id) }));
}
