/**
 * The map: a Phaser scene that draws a converted Tiled map, its people
 * and the child's hero, and walks the hero by the d-pad
 * (docs/app/SDD.md §4, §5, §10). Loaded on demand: Phaser is not in the
 * bundle that opens "who plays".
 *
 * Crisp on the phone:
 * - The canvas has the screen's own device pixels (2400x1080 at DPR 2.75)
 *   and CSS stretches it over the page's CSS pixels exactly.
 * - The map has one fixed size, MAP_SCALE device px per 1x px (8, from
 *   db/display.json): a whole zoom of 2 over the x4 atlas. Textures are
 *   sampled NEAREST, and the camera and every sprite sit on whole canvas
 *   pixels: one texel is always the same square of pixels.
 * - If the phone cannot keep up, the canvas draws fewer pixels
 *   (./resolution.ts): the zoom shrinks with it, the textures are then
 *   smoothed (LINEAR), and the map keeps its size on the screen.
 * - No picture is drawn at more than twice its own pixels. A sheet that
 *   would be (a 1x prop) is left off the map, and the log says so.
 * - The camera may go past the map's left edge by the d-pad's width, so
 *   the hero is never drawn under the arrows.
 * - A lost WebGL context is logged; if it does not come back within
 *   {@link CONTEXT_WAIT_MS}, the map says it failed (the menu offers the
 *   way back to who-plays).
 */
import Phaser from "phaser";
import { mapZoom, scrollFor, snap } from "../core/world/camera";
import { type Dir, STEP } from "../core/world/grid";
import { placeIsFree, type Place } from "../core/world/place";
import { blockedAhead, readMap, teleportAt, type Placement, type TiledMap, type WorldMap } from "../core/world/mapData";
import { avatarSheet, frameIndex, npcSheet, type Sheet, worldSize } from "../core/world/sprites";
import { Walker } from "../core/world/walker";
import { getLogger } from "../platform/appLog";
import { FrameStats, type FrameSummary } from "../platform/frameStats";
import { MAP_SCALE, MAP_SOURCE_TILE_PX } from "./display";
import { Music } from "./music";
import { PauseReasons, type PauseReason } from "./pauseReasons";
import { AdaptiveResolution, type Change, changeLine, startLine } from "./resolution";

const log = getLogger("nagmon.map");

import { START_MAP } from "./startMap";
export { START_MAP };
/** docs/app/SDD.md §10, "images": no picture over twice its pixels. */
export const MAX_SHOWN = 2;
/** The maps kept in memory: the one shown and the one before it (the way back). */
export const KEEP_MAPS = 2;
const FADE_MS = 150;
/** A longer frame (a stall) walks as if it were this long: no jump across the map. */
const MAX_FRAME_MS = 250;
/** How long a lost WebGL context may take to come back. */
export const CONTEXT_WAIT_MS = 5000;

export interface MapOptions {
  parent: HTMLElement;
  /** The profile's avatar key (core/family/avatars.ts). */
  avatar: string;
  /** The direction asked for this frame (the d-pad's `take`). */
  input: () => Dir | null;
  /** Lets go of every finger on the d-pad (a pause: a press must not walk on after it). */
  release?: () => void;
  /** CSS px at the left of the screen covered by the d-pad (its right edge and a gap). */
  reservedLeft?: () => number;
  /** CSS px at the right of the screen covered by the "talk" button (and a gap). */
  reservedRight?: () => number;
  /**
   * Who stands right in front of the hero, standing still: a person's
   * slug, or null. Told when it changes (the map's "talk" button).
   */
  onFacing?: (slug: string | null) => void;
  /** The hero finished a step onto this tile. */
  onStep?: (x: number, y: number, facing?: Dir) => void;
  /** A map was entered (the first, or through a door): its events run (core/world/events.ts). `at` is where the hero stands. */
  onMap?: (world: WorldMap, at?: Place) => void;
  /**
   * Where the child left off (the saved place), asked once as the map
   * opens: the hero stands there if the map exists and the tile is free,
   * else on the map's own start, else in the town.
   */
  resume?: () => Promise<Place | null>;
  /**
   * The app's lifecycle (src/platform/lifecycle.ts): the map pauses in the
   * background (loop, music, d-pad) and goes on in the foreground.
   */
  lifecycle?: MapLifecycle;
  /** The game's time, ms (the lifecycle's gameClock, which stands still in the background). */
  clock?: () => number;
  /** The hero pushed against a closed way (route 8, Steamshore). */
  onBlocked: () => void;
  onReady?: () => void;
  onError?: (e: unknown) => void;
  map?: string;
}

/** How big one picture is drawn: device pixels per texel, from the camera and the canvas as they are. */
export interface ScaleEntry {
  what: string;
  texels: number;
  devicePx: number;
  ratio: number;
  filter: "nearest" | "linear";
}

/** Raw numbers read from Phaser and the page, for the tests to do their own sums. */
export interface Measured {
  camZoom: number;
  /** canvas.width / its CSS width. */
  canvasPxPerCss: number;
  devicePixelRatio: number;
  layers: {
    name: string;
    /** World px per map tile, and the layer's own scale. */
    mapTileWidth: number;
    scaleX: number;
    tileset: { tileWidth: number; margin: number; spacing: number; columns: number };
    /** The atlas texture's own size, in texels. */
    atlas: { key: string; width: number; height: number };
    filter: "nearest" | "linear";
  }[];
  sprites: { what: string; displayWidth: number; frameWidth: number; frames: number; filter: "nearest" | "linear" }[];
}

export interface MapDebug {
  ready: boolean;
  map: string | null;
  /** `steps`: tiles walked since the map opened; `bumps`: pushes against a wall or someone. */
  player: { x: number; y: number; facing: Dir; moving: boolean; steps: number; bumps: number };
  /** The person right in front of the hero, standing still. */
  inFront: string | null;
  /** The hero's picture on the page, CSS px. */
  heroRect: { left: number; top: number; right: number; bottom: number } | null;
  npcs: { slug: string; x: number; y: number; frame: number }[];
  left: string[];
  zoom: number;
  dpr: number;
  /** Canvas px per CSS px the canvas draws at (adaptive resolution), and its steps. */
  resolution: { dpr: number; steps: number[]; adaptive: boolean; start: string; changes: Change[] };
  renderer: "webgl" | "canvas";
  canvas: { width: number; height: number; cssWidth: number; cssHeight: number };
  view: { x: number; y: number; width: number; height: number };
  world: { width: number; height: number };
  scales: ScaleEntry[];
  measured: Measured;
  frames: FrameSummary;
  music: { track: string | null; playing: boolean };
  paused: PauseReason[];
  /** Whether Phaser's loop is running (it sleeps while paused). */
  loopRunning: boolean;
  webgl: { lost: number; restored: number; contextLost: boolean };
  cachedMaps: string[];
  textures: string[];
}

/** The part of the app's Lifecycle the map needs. */
export interface MapLifecycle {
  readonly state: "active" | "background";
  onBackground(fn: () => void): () => void;
  onForeground(fn: () => void): () => void;
}

export interface MapController {
  /** Stops the loop and the music; `resume` with the same reason starts them again. */
  pause(why?: PauseReason): void;
  resume(why?: PauseReason): void;
  readonly paused: boolean;
  destroy(): void;
  /** Mila's vehicle: the map at a tile (null: its own start). False if a trip is under way. */
  goTo(map: string, at: { x: number; y: number } | null): boolean;
  debug(): MapDebug | null;
}

interface MusicDb {
  [slug: string]: string;
}

interface TiledTileset {
  name: string;
  image: string;
  tilewidth: number;
  tileheight: number;
  margin: number;
  spacing: number;
  columns: number;
}

const tilesKey = (map: string) => `map:${map}`;
const atlasKey = (map: string) => `atlas:${map}`;
const npcKey = (slug: string) => `npc:${slug}`;
const NEAREST = Phaser.Textures.FilterMode.NEAREST;
const LINEAR = Phaser.Textures.FilterMode.LINEAR;

/** Canvas px per atlas texel on a map, at the canvas's resolution. */
function zoomFor(world: WorldMap | null, render: number): number {
  const tile = world?.tileSize ?? 64;
  return mapZoom(MAP_SCALE, tile / (world?.sourceTile ?? MAP_SOURCE_TILE_PX), render);
}

/** NEAREST at a whole zoom; smoothed when the canvas draws fewer pixels or shrinks a picture. */
function filterFor(canvasPxPerTexel: number): Phaser.Textures.FilterMode {
  const whole = Math.abs(canvasPxPerTexel - Math.round(canvasPxPerTexel)) < 1e-6 && canvasPxPerTexel >= 1;
  return whole ? NEAREST : LINEAR;
}

class MapScene extends Phaser.Scene {
  world: WorldMap | null = null;
  walker = new Walker(0, 0, "up");
  zoom = 1;
  /** Canvas px per device px: 1 at the screen's full pixels (./resolution.ts). */
  render = 1;
  /** Canvas px per CSS px (the resolution's ratio). */
  canvasPerCss = 1;
  /** Each real frame, for the adaptive resolution (set by startMap). */
  measure: (dtMs: number, now: number) => void = () => {};
  /** A map was entered: its texture uploads are not the phone's speed (set by startMap). */
  entered: () => void = () => {};
  busy = true;
  /** The map closed: work that was waiting (a door's load) stops where it is. */
  dead = false;
  frames = new FrameStats((line) => log.info(line));
  readonly music = new Music();
  private player!: Phaser.GameObjects.Sprite;
  private playerSheet!: Sheet;
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private layers: Phaser.Tilemaps.TilemapLayer[] = [];
  private people: { place: Placement; sprite: Phaser.GameObjects.Sprite; sheet: Sheet }[] = [];
  private occupied = new Set<string>();
  private leftOff: string[] = [];
  private leftFoot = false;
  private inFront: string | null = null;
  private skipDelta = false;
  private lastFrame: number | null = null;
  private lastGame: number | null = null;
  private stepCount = 0;
  private waitLift = false;
  private bumpCount = 0;
  private cached: string[] = [];
  private maps = new Map<string, WorldMap>();
  /** The filter each texture has: set only when it changes. */
  private filters = new Map<string, Phaser.Textures.FilterMode>();

  constructor(private readonly opts: MapOptions) {
    super({ key: "map" });
  }

  preload(): void {
    this.load.json("db:avatars", "game/db/avatars.json");
    this.load.json("db:npcs", "game/db/npcs.json");
    this.load.json("db:music", "game/db/music.json");
  }

  create(): void {
    this.cameras.main.setRoundPixels(true).setBackgroundColor("#000000");
    void this.begin().catch((e) => {
      if (this.dead) return;
      log.error("The map did not open", e);
      this.opts.onError?.(e);
    });
  }

  private async begin(): Promise<void> {
    this.playerSheet = avatarSheet(this.cache.json.get("db:avatars"), this.opts.avatar);
    await this.loadAll(() => {
      this.load.spritesheet("hero", this.playerSheet.url, {
        frameWidth: this.playerSheet.frameWidth,
        frameHeight: this.playerSheet.frameHeight,
      });
    });
    if (this.dead) return;
    this.player = this.add.sprite(0, 0, "hero", 1).setOrigin(0.5, 1);
    const saved = await this.opts.resume?.().catch(() => null);
    if (this.dead) return;
    let opened = false;
    if (saved) {
      try {
        opened = await this.enter(saved.map, { x: saved.x, y: saved.y, facing: saved.facing }, true);
        if (this.dead) return;
      } catch (e) {
        log.warning(`The saved map ${saved.map} did not open (${e instanceof Error ? e.message : String(e)}): the town instead`);
      }
    }
    if (!opened && !(await this.enter(saved ? START_MAP : (this.opts.map ?? START_MAP), null))) return;
    this.busy = false;
    this.opts.onReady?.();
  }

  /** Runs the loader for what `queue` adds, and waits for it. */
  private loadAll(queue: () => void): Promise<void> {
    return new Promise((resolve) => {
      queue();
      const failed: string[] = [];
      const onError = (file: Phaser.Loader.File) => failed.push(file.key);
      this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
        if (failed.length) log.warning(`Could not load: ${failed.join(", ")}`);
        resolve();
      });
      this.load.start();
    });
  }

  /**
   * Loads a map (if it is not in memory) and puts the hero on it. False
   * if the map closed while it loaded: nothing more is done.
   */
  private async enter(name: string, at: { x: number; y: number; facing: Dir | null } | null, resumed = false): Promise<boolean> {
    if (!this.cache.tilemap.exists(tilesKey(name))) {
      await this.loadAll(() => this.load.tilemapTiledJSON(tilesKey(name), `game/maps/${name}.json`));
      if (this.dead) return false;
    }
    const json = this.cache.tilemap.get(tilesKey(name))?.data as (TiledMap & { tilesets: TiledTileset[] }) | undefined;
    if (!json) throw new Error(`no map ${name}`);
    const world = this.maps.get(name) ?? readMap(name, json);
    this.maps.set(name, world);
    const ts = json.tilesets[0];
    const npcs = this.cache.json.get("db:npcs");
    await this.loadAll(() => {
      if (!this.textures.exists(atlasKey(name))) this.load.image(atlasKey(name), `game/${ts.image.replace(/^\.\.\//, "")}`);
      for (const p of world.npcs) {
        const sheet = npcSheet(npcs, p.slug);
        if (sheet && !this.textures.exists(npcKey(p.slug)) && this.fits(sheet, world)) {
          this.load.spritesheet(npcKey(p.slug), sheet.url, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
        }
      }
    });
    if (this.dead) return false;

    this.clearMap();
    const map = this.make.tilemap({ key: tilesKey(name) });
    const tileset = map.addTilesetImage(ts.name, atlasKey(name), ts.tilewidth, ts.tileheight, ts.margin, ts.spacing);
    if (!tileset) throw new Error(`no tileset for ${name}`);
    world.layers.below.forEach((l, i) => {
      const layer = map.createLayer(l, tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer | null;
      if (layer) this.layers.push(layer.setDepth(i));
    });
    for (const l of world.layers.above) {
      const layer = map.createLayer(l, tileset, 0, 0) as Phaser.Tilemaps.TilemapLayer | null;
      if (layer) this.layers.push(layer.setDepth(1e7));
    }
    this.tilemap = map;
    this.world = world;
    this.zoom = zoomFor(world, this.render);

    this.leftOff = [];
    for (const p of world.npcs) {
      const sheet = npcSheet(npcs, p.slug);
      if (!sheet || !this.textures.exists(npcKey(p.slug))) {
        this.leftOff.push(p.slug);
        continue;
      }
      const frames = this.frameCount(npcKey(p.slug));
      const sprite = this.add.sprite(0, 0, npcKey(p.slug), frameIndex(p.facing, null, true, frames)).setOrigin(0.5, 1);
      this.people.push({ place: p, sprite, sheet });
      this.occupied.add(`${p.x},${p.y}`);
    }
    if (this.leftOff.length) {
      log.info(`Left off ${name}: no sheet, or one drawn over twice its pixels: ${this.leftOff.join(", ")}`);
    }

    // a place from the save must still be open ground: else the map's own start
    if (resumed && at && !placeIsFree(world.collision, at.x, at.y, (x, y) => this.occupied.has(`${x},${y}`))) {
      log.info(`The saved tile ${at.x},${at.y} on ${name} is not free: the map's start`);
      at = null;
    }
    const start = at ?? { ...(world.start ?? { x: Math.floor(world.width / 2), y: Math.floor(world.height / 2) }), facing: "up" as Dir };
    this.walker.place(start.x, start.y, start.facing ?? this.walker.facing);
    this.layout();
    this.playMusic(world);
    this.remember(name);
    this.entered();
    log.info(`Map ${name}, the hero at ${start.x},${start.y}, zoom ${this.zoom}`);
    this.opts.onMap?.(world, { map: name, x: start.x, y: start.y, facing: start.facing ?? this.walker.facing });
    this.lookAhead();
    return true;
  }

  /** A sheet's frames (Phaser counts its whole picture as one more). */
  private frameCount(key: string): number {
    return Math.max(1, this.textures.get(key).frameTotal - 1);
  }

  /** Whether a sheet stays within twice its pixels on the screen, on this map. */
  private fits(sheet: Sheet, world: WorldMap): boolean {
    const size = worldSize(sheet, world.tileSize, world.sourceTile ?? MAP_SOURCE_TILE_PX);
    return (size.width * zoomFor(world, 1)) / sheet.frameWidth <= MAX_SHOWN;
  }

  /** Sets a texture's filter, only when it changes. */
  private setFilter(key: string, mode: Phaser.Textures.FilterMode): void {
    if (this.filters.get(key) === mode) return;
    this.filters.set(key, mode);
    this.textures.get(key).setFilter(mode);
  }

  private sizeSprite(sprite: Phaser.GameObjects.Sprite, sheet: Sheet, world: WorldMap): void {
    const size = worldSize(sheet, world.tileSize, world.sourceTile ?? MAP_SOURCE_TILE_PX);
    sprite.setDisplaySize(size.width, size.height);
    this.setFilter(sprite.texture.key, filterFor((size.width * this.zoom) / sheet.frameWidth));
  }

  private clearMap(): void {
    for (const l of this.layers) l.destroy();
    this.layers = [];
    this.tilemap?.destroy();
    this.tilemap = null;
    for (const p of this.people) p.sprite.destroy();
    this.people = [];
    this.occupied.clear();
  }

  /** Keeps this map and the one before; frees the rest (docs/app/SDD.md §5, memory). */
  private remember(name: string): void {
    this.cached = [name, ...this.cached.filter((m) => m !== name)];
    const dropped = this.cached.splice(KEEP_MAPS);
    const needed = new Set(this.cached.flatMap((m) => this.maps.get(m)?.npcs.map((n) => n.slug) ?? []));
    for (const m of dropped) {
      this.cache.tilemap.remove(tilesKey(m));
      if (this.textures.exists(atlasKey(m))) this.textures.remove(atlasKey(m));
      this.filters.delete(atlasKey(m));
      for (const n of this.maps.get(m)?.npcs ?? []) {
        if (!needed.has(n.slug) && this.textures.exists(npcKey(n.slug))) {
          this.textures.remove(npcKey(n.slug));
          this.filters.delete(npcKey(n.slug));
        }
      }
      this.maps.delete(m);
    }
  }

  private playMusic(world: WorldMap): void {
    const tracks = this.cache.json.get("db:music") as MusicDb;
    const file = world.music ? tracks[world.music] : undefined;
    this.music.play(file ? `game/${file}` : null);
  }

  /** The canvas changed size or resolution: a new zoom and camera. */
  layout(): void {
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    const world = this.world;
    this.zoom = zoomFor(world, this.render);
    cam.setZoom(this.zoom);
    if (!world) return;
    if (this.textures.exists(atlasKey(world.name))) this.setFilter(atlasKey(world.name), filterFor(this.zoom));
    if (this.player && this.playerSheet) this.sizeSprite(this.player, this.playerSheet, world);
    for (const p of this.people) this.sizeSprite(p.sprite, p.sheet, world);
    this.draw();
  }

  /** Back from a pause: the time away is not one long frame (the minute's frame line goes on). */
  resumed(): void {
    this.skipDelta = true;
  }

  update(time: number): void {
    // the real time since the last frame: Phaser's own delta is smoothed
    // and capped, so a slow phone would walk slower and log 60 fps anyway
    const now = performance.now();
    const real = this.lastFrame === null ? 0 : now - this.lastFrame;
    this.lastFrame = now;
    // the walk goes by the game's clock, which stands still in the background
    const game = (this.opts.clock ?? (() => now))();
    let delta = this.lastGame === null ? 0 : Math.min(Math.max(game - this.lastGame, 0), MAX_FRAME_MS);
    this.lastGame = game;
    if (this.skipDelta) {
      this.skipDelta = false;
      delta = 0;
    } else if (real > 0) {
      this.frames.add(real, time);
      if (!this.busy) this.measure(real, now);
    }
    let held = this.opts.input();
    if (!this.world || this.busy) return;
    // after a door the hero stands until the finger lifts: a held arrow
    // does not carry the child on into the new map
    if (this.waitLift) {
      if (held === null) this.waitLift = false;
      else held = null;
    }
    const world = this.world;
    const canStep = (x: number, y: number, d: Dir) =>
      world.collision.canStep(x, y, d, (tx, ty) => this.occupied.has(`${tx},${ty}`));
    for (const e of this.walker.update(delta, held, canStep)) {
      if (e.kind === "arrived") {
        this.leftFoot = !this.leftFoot;
        this.stepCount++;
        this.opts.onStep?.(e.x, e.y, this.walker.facing);
        const t = teleportAt(world, e.x, e.y, this.walker.facing);
        if (t) {
          // stop on the door: the step after it must not start
          this.walker.place(e.x, e.y);
          void this.travel(t.to);
          break;
        }
      } else if (e.kind === "bumped") {
        this.bumpCount++;
        // a door at the map's edge (the academies' way out)
        const t = teleportAt(world, e.x, e.y, e.dir);
        if (t) {
          void this.travel(t.to);
          break;
        }
        const [dx, dy] = STEP[e.dir];
        const closed = blockedAhead(world, e.x, e.y, e.dir, { x: e.x + dx, y: e.y + dy });
        if (closed) {
          log.info(`A closed way: ${closed.reason}`);
          this.opts.onBlocked();
        }
      }
    }
    this.draw();
    this.lookAhead();
  }

  /** Tells who stands right in front of the hero now (null while walking or between maps). */
  private lookAhead(): void {
    let who: string | null = null;
    if (this.world && !this.busy && !this.walker.moving) {
      const [dx, dy] = STEP[this.walker.facing];
      const x = this.walker.x + dx;
      const y = this.walker.y + dy;
      who = this.people.find((p) => p.place.x === x && p.place.y === y)?.place.slug ?? null;
    }
    if (who === this.inFront) return;
    this.inFront = who;
    this.opts.onFacing?.(who);
  }

  /** Mila's vehicle: to a map, at a tile (or the map's own start). False while another trip is under way. */
  goTo(map: string, at: { x: number; y: number } | null): boolean {
    if (this.busy || !this.world) return false;
    void this.travel({ map, x: at?.x ?? null, y: at?.y ?? null, facing: "down" });
    return true;
  }

  private async travel(to: { map: string; x: number | null; y: number | null; facing: Dir | null }): Promise<void> {
    this.busy = true;
    this.lookAhead();
    try {
      await this.fade(false);
      if (this.dead || !(await this.enter(to.map, to.x === null || to.y === null ? null : { x: to.x, y: to.y, facing: to.facing }))) return;
      this.waitLift = true;
      await this.fade(true);
    } catch (e) {
      if (this.dead) return;
      log.error(`Could not go to ${to.map}`, e);
      this.opts.onError?.(e);
    } finally {
      this.busy = false;
    }
  }

  private fade(into: boolean): Promise<void> {
    const cam = this.cameras.main;
    return new Promise((resolve) => {
      const done = into ? Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE : Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE;
      cam.once(done, () => resolve());
      if (into) cam.fadeIn(FADE_MS, 0, 0, 0);
      else cam.fadeOut(FADE_MS, 0, 0, 0);
    });
  }

  /** Puts the camera, the hero and the people on whole canvas pixels. */
  private draw(): void {
    const world = this.world;
    if (!world || !this.player) return;
    const T = world.tileSize;
    const z = this.zoom;
    const pos = this.walker.position();
    const px = pos.x * T + T / 2;
    const py = (pos.y + 1) * T;
    this.player.setPosition(snap(px, z), snap(py, z));
    this.player.setFrame(frameIndex(this.walker.facing, this.walker.step?.t ?? null, this.leftFoot));
    this.player.setDepth(1000 + py);
    for (const { place, sprite } of this.people) {
      sprite.setPosition(place.x * T + T / 2, (place.y + 1) * T).setDepth(1000 + (place.y + 1) * T);
    }
    // the view's top-left in the world; Phaser zooms about the camera's
    // middle, so its scroll is that corner less the zoom's shift
    const cam = this.cameras.main;
    const vw = cam.width / z;
    const vh = cam.height / z;
    // the d-pad's part of the view, in world px: the camera may go that far past the left edge
    const reserved = ((this.opts.reservedLeft?.() ?? 0) * this.canvasPerCss) / z;
    const reservedHigh = ((this.opts.reservedRight?.() ?? 0) * this.canvasPerCss) / z;
    const left = scrollFor(px, vw, world.width * T, z, reserved, reservedHigh);
    const top = scrollFor(py - T / 2, vh, world.height * T, z);
    cam.setScroll(left - (cam.width / 2) * (1 - 1 / z), top - (cam.height / 2) * (1 - 1 / z));
  }

  filterOf(key: string): "nearest" | "linear" {
    const mode = this.textures.get(key).source[0]?.scaleMode;
    if (mode === Phaser.ScaleModes.LINEAR) return "linear";
    if (mode === Phaser.ScaleModes.NEAREST) return "nearest";
    return this.game.config.antialias ? "linear" : "nearest";
  }

  /** The raw numbers, read from Phaser as it draws now. */
  measured(): Omit<Measured, "canvasPxPerCss" | "devicePixelRatio"> {
    return {
      camZoom: this.cameras.main.zoom,
      layers: this.layers.map((l) => {
        const ts = l.tileset[0];
        const src = this.textures.get(ts.image!.key).source[0];
        return {
          name: l.layer.name,
          mapTileWidth: l.layer.tileWidth,
          scaleX: l.scaleX,
          tileset: { tileWidth: ts.tileWidth, margin: ts.tileMargin, spacing: ts.tileSpacing, columns: ts.columns },
          atlas: { key: ts.image!.key, width: src.width, height: src.height },
          filter: this.filterOf(ts.image!.key),
        };
      }),
      sprites: [
        ...(this.player ? [{ what: "hero", sprite: this.player }] : []),
        ...this.people.map((p) => ({ what: `npc ${p.place.slug}`, sprite: p.sprite })),
      ].map(({ what, sprite }) => ({
        what,
        displayWidth: sprite.displayWidth,
        frameWidth: sprite.frame.width,
        frames: this.frameCount(sprite.texture.key),
        filter: this.filterOf(sprite.texture.key),
      })),
    };
  }

  /** The hero's picture in canvas px (the camera as it was last drawn). */
  heroCanvasRect(): { left: number; top: number; right: number; bottom: number } | null {
    if (!this.player || !this.world) return null;
    const cam = this.cameras.main;
    const v = cam.worldView;
    const x0 = this.player.x - this.player.displayWidth * this.player.originX;
    const y0 = this.player.y - this.player.displayHeight * this.player.originY;
    return {
      left: (x0 - v.x) * cam.zoom,
      top: (y0 - v.y) * cam.zoom,
      right: (x0 + this.player.displayWidth - v.x) * cam.zoom,
      bottom: (y0 + this.player.displayHeight - v.y) * cam.zoom,
    };
  }

  state() {
    const cam = this.cameras.main;
    const T = this.world?.tileSize ?? 64;
    return {
      ready: !this.busy && !!this.world,
      map: this.world?.name ?? null,
      player: { x: this.walker.x, y: this.walker.y, facing: this.walker.facing, moving: this.walker.moving, steps: this.stepCount, bumps: this.bumpCount },
      inFront: this.inFront,
      npcs: this.people.map((p) => ({ slug: p.place.slug, x: p.place.x, y: p.place.y, frame: Number(p.sprite.frame.name) })),
      left: [...this.leftOff],
      zoom: this.zoom,
      view: { x: cam.worldView.x, y: cam.worldView.y, width: cam.worldView.width, height: cam.worldView.height },
      world: { width: (this.world?.width ?? 0) * T, height: (this.world?.height ?? 0) * T },
      frames: this.frames.overall(),
      music: { track: this.music.track, playing: this.music.playing },
      cachedMaps: [...this.cached],
      textures: this.textures.getTextureKeys(),
    };
  }

  shutdownAll(): void {
    this.dead = true;
    this.frames.flush();
    this.music.destroy();
  }
}

/** Starts the map in `parent` (which it fills). */
export function startMap(opts: MapOptions): MapController {
  const dpr = window.devicePixelRatio || 1;
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    // no storage here: the resolution is measured afresh each time
  }
  // the parent's "send log" carries these lines
  const resolution = new AdaptiveResolution(dpr, storage, (c: Change) => log.info(changeLine(c)));
  log.info(startLine(resolution, dpr));
  const size = () => {
    const r = opts.parent.getBoundingClientRect();
    const k = resolution.dpr;
    return { w: Math.max(1, Math.round(r.width * k)), h: Math.max(1, Math.round(r.height * k)) };
  };
  const first = size();
  const scene = new MapScene(opts);
  const setRender = () => {
    scene.render = resolution.dpr / dpr;
    scene.canvasPerCss = resolution.dpr;
  };
  setRender();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.parent,
    width: first.w,
    height: first.h,
    backgroundColor: "#000000",
    banner: false,
    // the canvas is the screen's own pixels; CSS lays it over the page
    scale: { mode: Phaser.Scale.NONE, autoRound: true },
    render: { pixelArt: true, antialias: false, antialiasGL: false, roundPixels: true, powerPreference: "high-performance" },
    // the d-pad and the menu are DOM buttons; Phaser takes no touches
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    // the music is a streamed <audio> (./music.ts): no WebAudio buffers
    audio: { noAudio: true },
    scene,
    autoFocus: false,
    disableContextMenu: true,
  });

  const reasons = new PauseReasons();
  let destroyed = false;
  let started = false;
  const webgl = { lost: 0, restored: 0 };
  let lostTimer: ReturnType<typeof setTimeout> | undefined;

  const apply = () => {
    if (destroyed) return;
    if (reasons.paused) {
      opts.release?.();
      game.loop.sleep();
      // a talk keeps the town's music; the menu and the background stop it
      if (reasons.silent) scene.music.hold();
      else scene.music.release();
    } else if (started) {
      scene.resumed();
      resolution.reset();
      game.loop.wake();
      scene.music.release();
    }
  };
  // the loop starts after boot, whatever was asked before: a pause asked
  // while Phaser booted is applied on its first step
  game.events.once(Phaser.Core.Events.POST_STEP, () => {
    started = true;
    if (reasons.paused) apply();
  });

  // a lost GPU context (a driver reset, the phone short of memory)
  game.events.once(Phaser.Core.Events.READY, () => {
    const renderer = game.renderer;
    if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
    renderer.on(Phaser.Renderer.Events.LOSE_WEBGL, () => {
      webgl.lost++;
      log.warning(`The map's WebGL context was lost; waiting ${CONTEXT_WAIT_MS / 1000} s for it to come back`);
      clearTimeout(lostTimer);
      lostTimer = setTimeout(() => {
        if (destroyed || !renderer.contextLost) return;
        log.error("The map's WebGL context did not come back");
        opts.onError?.(new Error("WebGL context lost"));
      }, CONTEXT_WAIT_MS);
    });
    renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => {
      webgl.restored++;
      clearTimeout(lostTimer);
      log.info("The map's WebGL context is back");
    });
  });

  const fit = () => {
    const s = size();
    if (s.w === game.scale.width && s.h === game.scale.height) return;
    game.scale.resize(s.w, s.h);
    if (scene.sys.isActive()) scene.layout();
  };
  const resize = new ResizeObserver(fit);
  scene.entered = () => resolution.reset();
  scene.measure = (dtMs, now) => {
    if (!resolution.frame(dtMs, now)) return;
    setRender();
    fit();
    // a new canvas size uploads again: measure after it
    resolution.reset();
  };
  resize.observe(opts.parent);

  // the app's lifecycle: in the background the loop, the music and the
  // d-pad stop (a finger on an arrow when the app left never lifts here)
  const unbind = [
    opts.lifecycle?.onBackground(() => {
      if (reasons.pause("lifecycle")) log.info("Map paused: the app went to the background");
      apply();
      opts.release?.();
    }),
    opts.lifecycle?.onForeground(() => {
      if (reasons.resume("lifecycle")) log.info("Map running again: the app is back");
      apply();
    }),
  ];
  // opened behind another app (or with the screen off)
  if (opts.lifecycle?.state === "background") reasons.pause("lifecycle");

  return {
    pause(why = "lifecycle") {
      if (reasons.pause(why)) log.info(`Map paused (${why})`);
      apply();
    },
    resume(why = "lifecycle") {
      if (reasons.resume(why)) log.info(`Map running again (${why})`);
      apply();
    },
    get paused() {
      return reasons.paused;
    },
    goTo: (map, at) => scene.goTo(map, at),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(lostTimer);
      resize.disconnect();
      for (const off of unbind) off?.();
      scene.shutdownAll();
      // destroy runs on the next frame: a sleeping loop must wake for it
      game.loop.wake();
      game.destroy(true);
    },
    debug() {
      if (destroyed || !scene.sys.isActive()) return null;
      const canvas = game.canvas;
      const r = canvas.getBoundingClientRect();
      const canvasPxPerCss = canvas.width / r.width;
      const m = { ...scene.measured(), canvasPxPerCss, devicePixelRatio: dpr };
      // device px per texel, from the camera and the canvas as they are
      const device = (worldPx: number) => (worldPx * m.camZoom * dpr) / canvasPxPerCss;
      const scales: ScaleEntry[] = [
        ...m.layers.map((l) => {
          const devicePx = device(l.mapTileWidth * l.scaleX);
          return { what: `tiles ${l.name}`, texels: l.tileset.tileWidth, devicePx, ratio: devicePx / l.tileset.tileWidth, filter: l.filter };
        }),
        ...m.sprites.map((s) => {
          const devicePx = device(s.displayWidth);
          return { what: s.what, texels: s.frameWidth, devicePx, ratio: devicePx / s.frameWidth, filter: s.filter };
        }),
      ];
      const hero = scene.heroCanvasRect();
      const renderer = game.renderer;
      return {
        ...scene.state(),
        heroRect: hero && {
          left: r.left + hero.left / canvasPxPerCss,
          top: r.top + hero.top / canvasPxPerCss,
          right: r.left + hero.right / canvasPxPerCss,
          bottom: r.top + hero.bottom / canvasPxPerCss,
        },
        scales,
        measured: m,
        dpr,
        resolution: {
          dpr: resolution.dpr,
          steps: resolution.steps,
          adaptive: resolution.adaptive,
          start: resolution.start,
          changes: [...resolution.changes],
        },
        renderer: renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer ? "webgl" : "canvas",
        canvas: { width: canvas.width, height: canvas.height, cssWidth: r.width, cssHeight: r.height },
        paused: reasons.reasons(),
        loopRunning: game.loop.running,
        webgl: { ...webgl, contextLost: renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer ? renderer.contextLost : false },
      };
    },
  };
}
