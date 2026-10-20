import { CollisionGrid, type CollisionData, type Dir, isDir, type Tile } from "./grid";

/**
 * What the map scene needs from a converted map (tools/app/maps.py):
 * its size, collision, music, where the player starts, who stands where
 * at the start, the ways to other maps and the ways that are closed.
 * Read from the map's own data, so a change in the scripts reaches the
 * game through the build alone.
 */

interface Property {
  name: string;
  value: unknown;
}

export interface Condition {
  operator: "is" | "not";
  type: string;
  args: string[];
}

export interface Action {
  type: string;
  args: string[];
}

interface EventScript {
  conditions: Condition[];
  actions: Action[];
  behaviors?: Action[];
}

/** One of the map's event scripts, in the map's order (core/world/events.ts runs them). */
export interface WorldEvent {
  id: number;
  name: string;
  conditions: Condition[];
  actions: Action[];
  /** `talk <npc>`: the event runs when the player talks to that person. */
  behaviors: Action[];
}

interface TiledObject {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: Property[];
}

interface TiledLayer {
  name: string;
  type: string;
  objects?: TiledObject[];
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  properties?: Property[];
  layers: TiledLayer[];
}

/** A box of tiles: (x, y) and its size in tiles. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placement {
  slug: string;
  x: number;
  y: number;
  facing: Dir;
}

export interface Teleport {
  box: Box;
  /** The player must face this way on the box (the old `char_facing`). */
  facing: Dir | null;
  to: { map: string; x: number; y: number; facing: Dir | null };
}

export interface BlockedExit {
  box: Box;
  facing: Dir | null;
  /** Where it led, for the log (never shown to the child). */
  reason: string;
}

export interface WorldMap {
  name: string;
  width: number;
  height: number;
  tileSize: number;
  /** The tile in 1x Tuxemon pixels (`source_tile_size`), if the map says. */
  sourceTile: number | null;
  collision: CollisionGrid;
  /** The music slug the map plays (db/music.json), if any. */
  music: string | null;
  /** The new game's start on this map (the old `set_teleport_faint`), if it is here. */
  start: Tile | null;
  /** Who stands on the map at the start of a new game. */
  npcs: Placement[];
  teleports: Teleport[];
  blocked: BlockedExit[];
  /** The tile layers, bottom up; `above` are drawn over the walkers. */
  layers: { below: string[]; above: string[] };
  /** Every event script on the map, in its order. */
  events: WorldEvent[];
  /** Where wild creatures may meet the hero (the old `random_encounter` events). */
  encounters: EncounterArea[];
}

/** A box of the map where a step may meet a wild creature of a table (db/encounters.json). */
export interface EncounterArea {
  box: Box;
  table: string;
  /** The chance of a meeting in a step, in percent. */
  rate: number;
}

/** The game's state as conditions see it: variables (`key` -> `value`) and who exists. */
export interface WorldState {
  variables: ReadonlyMap<string, string>;
  characters: ReadonlySet<string>;
}

export const NEW_GAME: WorldState = { variables: new Map(), characters: new Set() };

/** "classic_route_1.tmx" -> "classic_route_1" */
export function mapName(file: string): string {
  return file.replace(/\.tmx$/, "");
}

function script(o: TiledObject): EventScript | null {
  const p = o.properties?.find((q) => q.name === "script");
  return p ? (p.value as EventScript) : null;
}

function box(o: TiledObject, tile: number): Box {
  return {
    x: Math.round(o.x / tile),
    y: Math.round(o.y / tile),
    w: Math.max(1, Math.round(o.width / tile)),
    h: Math.max(1, Math.round(o.height / tile)),
  };
}

export function inBox(b: Box, x: number, y: number): boolean {
  return x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h;
}

/**
 * Whether a condition holds. Only the kinds the map's start needs are
 * known (`variable_set`, `char_exists`); any other kind does not hold,
 * so an event that needs more of the game simply does not run yet.
 */
export function holds(c: Condition, state: WorldState): boolean {
  let value: boolean;
  switch (c.type) {
    case "variable_set": {
      const [key, want] = c.args[0].split(":");
      const have = state.variables.get(key);
      value = want === undefined ? have !== undefined : have === want;
      break;
    }
    case "char_exists":
      value = state.characters.has(c.args[0]);
      break;
    default:
      return false;
  }
  return c.operator === "not" ? !value : value;
}

function facingOf(conditions: Condition[]): Dir | null {
  const f = conditions.find((c) => c.type === "char_facing" && c.operator === "is");
  return f && isDir(f.args[1]) ? f.args[1] : null;
}

export function readMap(name: string, json: TiledMap, state: WorldState = NEW_GAME): WorldMap {
  const prop = (n: string) => json.properties?.find((p) => p.name === n)?.value;
  const tile = json.tilewidth;
  const collision = new CollisionGrid(prop("collision") as CollisionData, json.width, json.height);
  const objects = (layer: string) => json.layers.find((l) => l.name === layer && l.type === "objectgroup")?.objects ?? [];

  let music: string | null = null;
  let start: Tile | null = null;
  const npcs: Placement[] = [];
  const teleports: Teleport[] = [];
  const events: WorldEvent[] = [];
  const encounters: EncounterArea[] = [];
  const characters = new Set(state.characters);

  for (const o of objects("events")) {
    const s = script(o);
    if (!s) continue;
    events.push({ id: o.id, name: o.name, conditions: s.conditions, actions: s.actions, behaviors: s.behaviors ?? [] });
    for (const a of s.actions) {
      if (a.type === "play_music" && music === null) music = a.args[0];
      if (a.type === "set_teleport_faint" && mapName(a.args[1]) === name && start === null) {
        start = { x: Number(a.args[2]), y: Number(a.args[3]) };
      }
    }
    const meet = s.actions.find((a) => a.type === "random_encounter");
    if (meet && s.conditions.some((c) => c.type === "char_at") && meet.args[0]) {
      const rate = Number(meet.args[1]);
      encounters.push({ box: box(o, tile), table: meet.args[0], rate: Number.isFinite(rate) && rate > 0 ? rate : 10 });
    }
    const teleport = s.actions.find((a) => a.type === "transition_teleport" || a.type === "teleport");
    if (teleport && teleport.args[0] === "player" && s.conditions.some((c) => c.type === "char_at")) {
      const face = s.actions.find((a) => a.type === "char_face" && a.args[0] === "player")?.args[1];
      teleports.push({
        box: box(o, tile),
        facing: facingOf(s.conditions),
        to: {
          map: mapName(teleport.args[1]),
          x: Number(teleport.args[2]),
          y: Number(teleport.args[3]),
          facing: isDir(face) ? face : null,
        },
      });
    }
    // who is created at the start: the events whose conditions hold now,
    // in the map's order (one that exists already is not made twice)
    const creates = s.actions.filter((a) => a.type === "create_npc");
    if (creates.length && s.conditions.every((c) => holds(c, { variables: state.variables, characters }))) {
      for (const c of creates) {
        const face = s.actions.find((a) => a.type === "char_face" && a.args[0] === c.args[0])?.args[1];
        npcs.push({ slug: c.args[0], x: Number(c.args[1]), y: Number(c.args[2]), facing: isDir(face) ? face : "down" });
        characters.add(c.args[0]);
      }
    }
  }

  const blocked: BlockedExit[] = objects("blocked_exits").map((o) => {
    const s = script(o);
    const reason = o.properties?.find((p) => p.name === "blocked_reason")?.value;
    return { box: box(o, tile), facing: s ? facingOf(s.conditions) : null, reason: String(reason ?? o.name) };
  });

  const tileLayers = json.layers.filter((l) => l.type === "tilelayer").map((l) => l.name);
  const above = tileLayers.filter((n) => /above/i.test(n));
  return {
    name,
    width: json.width,
    height: json.height,
    tileSize: tile,
    sourceTile: typeof prop("source_tile_size") === "number" ? (prop("source_tile_size") as number) : null,
    collision,
    music,
    start,
    npcs,
    teleports,
    blocked,
    layers: { below: tileLayers.filter((n) => !above.includes(n)), above },
    events,
    encounters,
  };
}

/** The teleport the player takes standing on (x, y) and facing `facing`, if any. */
export function teleportAt(map: WorldMap, x: number, y: number, facing: Dir): Teleport | null {
  return map.teleports.find((t) => inBox(t.box, x, y) && (t.facing === null || t.facing === facing)) ?? null;
}

/**
 * The closed way the player pushes against: standing on (x, y), facing
 * `facing`, and the tile ahead (or this one) is in a blocked exit.
 */
export function blockedAhead(map: WorldMap, x: number, y: number, facing: Dir, ahead: Tile): BlockedExit | null {
  return (
    map.blocked.find(
      (b) => (inBox(b.box, ahead.x, ahead.y) || inBox(b.box, x, y)) && (b.facing === null || b.facing === facing),
    ) ?? null
  );
}
