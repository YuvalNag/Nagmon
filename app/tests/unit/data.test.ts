/// <reference types="node" />
// @vitest-environment node
/**
 * Smoke test of the build outputs in public/game (tools/app/build_data.py):
 * they parse, they fit together, and the event interpreter knows every
 * action they use.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { backgroundScale, battleScale, DISPLAY, enlargement, MAP_SCALE } from "../../src/game/display";
import {
  EVENT_ACTIONS,
  EVENT_BEHAVIORS,
  EVENT_CONDITIONS,
  type Animation,
  type AtlasFile,
  type AvatarsFile,
  type Catalogue,
  type Element,
  type Encounter,
  type Environment,
  type Item,
  type Monster,
  type NagmonEvent,
  type Npc,
  type SubjectsFile,
  type Technique,
  type TiledMap,
  type TiledObjectLayer,
  type TiledTileLayer,
} from "../../src/core/data/types";

const GAME = fileURLToPath(new URL("../../public/game/", import.meta.url));

function read<T>(rel: string): T {
  return JSON.parse(readFileSync(GAME + rel, "utf-8")) as T;
}

const he = read<Catalogue>("i18n/he.json");
const en = read<Catalogue>("i18n/en.json");
const monsters = read<Record<string, Monster>>("db/monsters.json");
const techniques = read<Record<string, Technique>>("db/techniques.json");
const items = read<Record<string, Item>>("db/items.json");
const npcs = read<Record<string, Npc>>("db/npcs.json");
const elements = read<Record<string, Element>>("db/elements.json");
const encounters = read<Record<string, Encounter>>("db/encounters.json");
const animations = read<Record<string, Animation>>("db/animations.json");
const environments = read<Record<string, Environment>>("db/environments.json");
const avatars = read<AvatarsFile>("db/avatars.json");

/** A PNG's size, from its header. */
function pngSize(rel: string): { width: number; height: number } {
  const head = readFileSync(GAME + rel).subarray(0, 24);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}
const mapNames = readdirSync(GAME + "maps")
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""))
  .sort();
const maps = Object.fromEntries(
  mapNames.map((name) => [name, read<TiledMap>(`maps/${name}.json`)]),
);

function events(map: TiledMap): NagmonEvent[] {
  const layer = map.layers.find(
    (l): l is TiledObjectLayer => l.type === "objectgroup" && l.name === "events",
  );
  if (!layer) throw new Error("no events layer");
  return layer.objects.map((o) => {
    const script = o.properties.find((p) => p.name === "script");
    if (!script) throw new Error(`event ${o.name} has no script`);
    return script.value as NagmonEvent;
  });
}

const allEvents = Object.values(maps).flatMap(events);
const allActions = allEvents.flatMap((e) => e.actions);

/** Every msgid the maps, NPCs, database and subjects can show. */
function usedMsgids(): Set<string> {
  const ids = new Set<string>();
  for (const a of allActions) {
    if (a.type === "translated_dialog") ids.add(a.args[0]);
    if (a.type === "translated_dialog_choice") {
      for (const id of a.args[0].split(":")) ids.add(id);
    }
  }
  for (const [slug, npc] of Object.entries(npcs)) {
    ids.add(slug);
    for (const profile of Object.values(npc.speech.profile)) {
      for (const id of Object.values(profile)) if (id) ids.add(id);
    }
  }
  for (const [slug, m] of Object.entries(monsters)) {
    ids.add(slug).add(`${slug}_description`).add(`cat_${m.species}`);
  }
  for (const slug of [...Object.keys(techniques), ...Object.keys(items)]) {
    ids.add(slug).add(`${slug}_description`);
  }
  for (const slug of Object.keys(elements)) ids.add(slug);
  return ids;
}

describe("texts", () => {
  it("has every msgid the world uses, in Hebrew and English", () => {
    const missing = [...usedMsgids()].filter((id) => !(id in he) || !(id in en));
    expect(missing).toEqual([]);
  });

  it("has the same keys in both languages", () => {
    expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
  });

  it("speaks Hebrew in the Nagmon world", () => {
    expect(he.nagmon_owl).toMatch(/[א-ת]/);
  });
});

describe("content", () => {
  it("maps every subject to known elements and monsters", () => {
    const { subjects } = read<SubjectsFile>("content/subjects.json");
    for (const subject of Object.values(subjects)) {
      for (const el of subject.elements) expect(elements).toHaveProperty(el);
      for (const m of subject.monsters ?? []) expect(monsters).toHaveProperty(m);
    }
  });
});

describe.each(mapNames)("map %s", (name) => {
  const map = maps[name];

  it("is a Tiled map with its atlas", () => {
    expect(map.type).toBe("map");
    expect(map.tilesets).toHaveLength(1);
    const atlas = read<AtlasFile>(`atlas/${name}.json`);
    expect(map.tilesets[0].tilecount).toBe(atlas.tilecount);
    expect(existsSync(GAME + `atlas/${atlas.image}`)).toBe(true);
    expect(atlas.imagewidth).toBeLessThanOrEqual(4096);
    expect(atlas.imageheight).toBeLessThanOrEqual(4096);
  });

  it("draws only tiles inside the atlas", () => {
    const count = map.tilesets[0].tilecount;
    for (const layer of map.layers) {
      if (layer.type !== "tilelayer") continue;
      const tiles = (layer as TiledTileLayer).data;
      expect(tiles).toHaveLength(map.width * map.height);
      for (const gid of tiles) {
        const id = gid & 0x1fffffff;
        expect(id >= 0 && id <= count).toBe(true);
      }
    }
  });

  it("uses only actions, conditions and behaviours the interpreter knows", () => {
    const actions: readonly string[] = EVENT_ACTIONS;
    const conditions: readonly string[] = EVENT_CONDITIONS;
    const behaviors: readonly string[] = EVENT_BEHAVIORS;
    for (const event of events(map)) {
      for (const a of event.actions) expect(actions).toContain(a.type);
      for (const c of event.conditions) expect(conditions).toContain(c.type);
      for (const b of event.behaviors) expect(behaviors).toContain(b.type);
    }
  });

  it("only teleports inside the world", () => {
    for (const a of events(map).flatMap((e) => e.actions)) {
      if (a.type === "transition_teleport" || a.type === "set_teleport_faint") {
        expect(mapNames).toContain(a.args[1].replace(/\.tmx$/, ""));
      }
    }
  });
});

describe("database", () => {
  it("has every monster the encounters name", () => {
    for (const enc of Object.values(encounters)) {
      for (const entry of enc.monsters) expect(monsters).toHaveProperty(entry.monster);
    }
  });

  it("has every monster, NPC and item the maps name", () => {
    for (const a of allActions) {
      if (a.type === "add_monster") expect(monsters).toHaveProperty(a.args[0]);
      if (a.type === "choice_monster") {
        for (const m of a.args[0].split(":")) expect(monsters).toHaveProperty(m);
      }
      if (a.type === "create_npc") expect(npcs).toHaveProperty(a.args[0]);
      if (a.type === "add_item") expect(items).toHaveProperty(a.args[0]);
      if (a.type === "random_encounter") expect(encounters).toHaveProperty(a.args[0]);
    }
  });

  it("has every technique of every moveset", () => {
    for (const m of Object.values(monsters)) {
      for (const move of m.moveset) expect(techniques).toHaveProperty(move.technique);
    }
  });

  it("maps every old avatar key to a shipped hero", () => {
    const file = read<AvatarsFile>("db/avatars.json");
    const keys = file.avatars.map((a) => a.key);
    expect(keys).toContain(file.fallback);
    for (const hero of Object.values(file.legacy)) expect(keys).toContain(hero);
    for (const a of file.avatars) {
      expect(existsSync(GAME + a.map)).toBe(true);
      expect(a.frame).toHaveLength(2);
    }
  });

  it("ships every monster sheet", () => {
    for (const m of Object.values(monsters)) {
      expect(m.sprites).not.toBeNull();
      expect(existsSync(GAME + m.sprites!.sheet)).toBe(true);
    }
  });
});

describe("pictures and their scales", () => {
  it("lays every animation sheet out as its record says", () => {
    for (const [slug, a] of Object.entries(animations)) {
      const { width, height } = pngSize(a.sheet!);
      const rows = Math.ceil(a.frames / a.columns);
      expect(width / a.frame_x, slug).toBe(a.columns);
      expect(height / a.frame_y, slug).toBe(rows);
      expect(a.frames, slug).toBeLessThanOrEqual(a.columns * rows);
      expect(a.frames, slug).toBeGreaterThan(a.columns * (rows - 1));
      expect(a.scale, slug).toBeGreaterThan(1);
      expect(a.frame_x % a.scale, slug).toBe(0);
    }
  });

  it("gives every picture record its scale", () => {
    for (const m of Object.values(monsters)) expect(m.sprites!.scale).toBeGreaterThanOrEqual(3);
    for (const item of Object.values(items)) {
      if (item.sprite) expect(item.sprite_scale, item.slug).toBeGreaterThan(1);
    }
    for (const el of Object.values(elements)) {
      if (el.icon) expect(el.icon_scale, el.slug).toBeGreaterThan(1);
    }
    const sheets = [
      ...Object.values(npcs).flatMap((n) => [n.sprites, ...Object.values(n.sprites.alternates ?? {})]),
      ...avatars.avatars,
    ];
    for (const s of sheets) {
      if (!s.map) continue;
      expect(s.scale, s.map).toBeGreaterThan(1);
      const { width, height } = pngSize(s.map);
      const [fw, fh] = s.frame!;
      const isProp = s.map.startsWith("sprites/objects/");
      expect([width, height], s.map).toEqual(isProp ? [fw, fh] : [3 * fw, 4 * fh]);
    }
    for (const n of Object.values(npcs)) {
      if (n.sprites.portrait) expect(n.sprites.portrait_scale, n.slug).toBeGreaterThanOrEqual(3);
    }
    for (const [slug, env] of Object.entries(environments)) {
      const g = env.battle_graphics;
      expect(g.scale, slug).toBe(6);
      const island = pngSize(g.island_sheet);
      expect([island.width, island.height], slug).toEqual([2 * g.island_width, g.island_height]);
    }
  });

  it("shows nothing above twice its pixels on the phone (db/display.json)", () => {
    const phone = DISPLAY.targets.phone;
    const [w, h] = phone.screen;
    const limit = DISPLAY.max_enlargement;
    const battle = battleScale(h);
    expect(battle).toBe(6);
    expect(enlargement(battle, 3)).toBeLessThanOrEqual(limit); // monsters
    // a whole zoom of 2 over the x4 atlas: no shimmer, and exactly the limit
    expect(MAP_SCALE).toBe(8);
    expect(enlargement(MAP_SCALE, 4)).toBeLessThanOrEqual(limit); // map tiles
    for (const env of Object.values(environments)) {
      const g = env.battle_graphics;
      const bg = pngSize(g.background);
      expect(backgroundScale(bg, { width: w, height: h })).toBeLessThanOrEqual(limit);
      expect(enlargement(battle, g.scale)).toBeLessThanOrEqual(limit);
    }
    for (const a of Object.values(animations)) {
      const perPx = a.file === "tileset" ? MAP_SCALE : battle;
      expect(enlargement(perPx, a.scale), a.slug).toBeLessThanOrEqual(limit);
    }
  });
});
