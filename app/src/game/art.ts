/**
 * The owner's second batch of art (docs/app/ART_ASSETS.md): its manifest
 * is game/art/manifest.json, written by tools/app/art2.py (the file is
 * also served, for anything that wants it at run time).
 */
import manifest from "../../public/game/art/manifest.json";
import { artFile, artFileState } from "./artSource";
import { sheetStyle } from "./icons";

export { onArtChanged } from "./artSource";

const { backdrops, assets } = manifest;

/** The address of a picture of the manifest, by id. */
export function artUrl(id: string): string {
  const entry = assets.find((a) => a.id === id);
  if (!entry) throw new Error(`art: no picture ${id}`);
  return artFile(entry.file);
}

/** "real" when the picture's file is in the build, "placeholder" when its flat stand-in is drawn instead (A1 of docs/app/ART_DELIVERY.md). */
export function artState(id: string): "real" | "placeholder" {
  const entry = assets.find((a) => a.id === id);
  if (!entry) throw new Error(`art: no picture ${id}`);
  return artFileState(entry.file);
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

// ---------------------------------------------------------------- batch 3 (tools/app/art3.py)

/** What the manifest says of one picture or sheet (the fields the app reads). */
export interface ArtEntry {
  id: string;
  kind: string;
  file: string;
  size: [number, number];
  frame: [number, number];
  frames: number;
  cols: number;
  rows: number;
  labels?: string[];
  status?: "accepted" | "draft" | "needs_revision";
  /** The group it ships with (docs/app/ART_DELIVERY.md). */
  pack?: string;
  /** For a creature sheet: where front, back and the menu icons are, in the sheet's pixels. */
  regions?: Record<string, [number, number, number, number]>;
  known_issues?: string[];
  lazy?: boolean;
  empty_frames?: number[];
  anchor?: [number, number];
  feet?: [number, number][];
}

const entries = assets as unknown as ArtEntry[];
const byId = new Map(entries.map((e) => [e.id, e]));
const extra = manifest as unknown as {
  drafts_enabled?: boolean;
  chapters_lazy?: boolean;
  icons?: { items: Record<string, { asset: string; frame: number }>; ui: Record<string, { asset: string; frame: number }> };
  npc_sprites?: Record<string, NpcSprite>;
};

/** The manifest entry of a picture, or undefined. */
export function artEntry(id: string): ArtEntry | undefined {
  return byId.get(id);
}

/** Whether drafts (art still to be repaired) may be used; the map wiring chooses draft or the previous art by this. */
export function draftsEnabled(): boolean {
  return extra.drafts_enabled !== false;
}

/** Whether the app may show a picture: it is accepted, or drafts are on; a lazy chapter picture only in a build that ships them. */
export function artUsable(id: string): boolean {
  const e = byId.get(id);
  if (!e) return false;
  if (e.lazy && !CHAPTER_ART_SHIPPED) return false;
  return e.status === undefined || e.status === "accepted" || draftsEnabled();
}

declare const __NAGMON_CHAPTER_ART__: boolean | undefined;
/** Chapter pictures are in the app only when the build asked for them (NAGMON_CHAPTER_ART=1, see docs/app/ART_ASSETS.md). */
export const CHAPTER_ART_SHIPPED: boolean = typeof __NAGMON_CHAPTER_ART__ === "undefined" ? true : __NAGMON_CHAPTER_ART__;

/** Where frame `frame` of a sheet is, in the sheet's own pixels. */
export function frameRect(id: string, frame: number): { x: number; y: number; w: number; h: number } {
  const e = byId.get(id);
  if (!e) throw new Error(`art: no picture ${id}`);
  const [w, h] = e.frame;
  return { x: (frame % e.cols) * w, y: Math.floor(frame / e.cols) * h, w, h };
}

/** CSS that shows one frame of a sheet as a background, scaled to `height` (any CSS length). */
export function frameStyle(id: string, frame: number, height: string): Record<string, string> {
  const e = byId.get(id);
  if (!e) throw new Error(`art: no picture ${id}`);
  return sheetStyle(artUrl(id), e.cols, e.rows, e.frame, frame, height);
}

/** The frame of the item-icon sheet that shows a shop item, if it has one (else the emoji stays). */
export function itemIcon(itemId: string): { id: string; frame: number } | null {
  const v = extra.icons?.items[itemId];
  if (!v || !artUsable(v.asset)) return null;
  return { id: v.asset, frame: v.frame };
}

/** The frame of the UI-icon sheet for a name (`heart_full`, `settings`...). */
export function uiIcon(name: string): { id: string; frame: number } | null {
  const v = extra.icons?.ui[name];
  if (!v || !artUsable(v.asset)) return null;
  return { id: v.asset, frame: v.frame };
}

export type Facing = "down" | "left" | "right" | "up";

/** One person of the sprite registry (the NPC files of the world name them by id). */
export interface NpcSprite {
  sheets: Record<string, string>;
  pack: string;
  status: "accepted" | "draft" | "needs_revision";
  sheet_status: Record<string, string>;
  known_issues: string[];
  walk?: Partial<Record<Facing, { sheet: string; frames: number[] }>>;
  /** One frame of a walk sheet, in the shipped pixels. */
  frame?: [number, number];
  /** Where the feet are in a frame: the point that stands on the tile. */
  anchor?: [number, number];
  feet?: Record<string, [number, number][]>;
  battle?: { sheet: string; frame: [number, number]; back: number; front: number; feet: [number, number][] };
  icon?: string;
}

/** The registry record of a person (`nagmon_baker`, `nagmon_owl`, `sea_guide`...), or undefined. */
export function npcSprite(id: string): NpcSprite | undefined {
  return extra.npc_sprites?.[id];
}

/** The ids of the people in the registry. */
export function npcSpriteIds(): string[] {
  return Object.keys(extra.npc_sprites ?? {});
}

/** What to draw for a person walking: the sheet, the frame, and the point of the feet. `step` is 0..2 (left foot, stand, right foot). */
export function npcWalkFrame(id: string, facing: Facing, step: number): { sheetId: string; url: string; frame: number; rect: { x: number; y: number; w: number; h: number }; anchor: [number, number] } | null {
  const rec = npcSprite(id);
  const walk = rec?.walk?.[facing];
  if (!rec || !walk) return null;
  const sheetId = rec.sheets[walk.sheet]!;
  if (!artUsable(sheetId)) return null;
  const frame = walk.frames[Math.max(0, Math.min(walk.frames.length - 1, step))]!;
  const feet = rec.feet?.[walk.sheet]?.[frame];
  return { sheetId, url: artUrl(sheetId), frame, rect: frameRect(sheetId, frame), anchor: feet ?? rec.anchor ?? [0, 0] };
}

/** A person's battle portrait: `front` (facing the child) or `back`. */
export function npcBattleFrame(id: string, side: "front" | "back" = "front"): { sheetId: string; url: string; frame: number; rect: { x: number; y: number; w: number; h: number } } | null {
  const rec = npcSprite(id);
  if (!rec?.battle) return null;
  const sheetId = rec.sheets[rec.battle.sheet]!;
  if (!artUsable(sheetId)) return null;
  const frame = rec.battle[side];
  return { sheetId, url: artUrl(sheetId), frame, rect: frameRect(sheetId, frame) };
}

/** A person's small face icon (an art id), if there is one. */
export function npcIconId(id: string): string | null {
  const icon = npcSprite(id)?.icon;
  return icon && artUsable(icon) ? icon : null;
}
