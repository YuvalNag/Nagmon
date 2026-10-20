/**
 * The map: a Phaser scene that draws a converted Tiled map, its people
 * and the child's hero, and walks the hero by the d-pad
 * (docs/app/SDD.md §4, §5, §10). Loaded on demand: Phaser is not in the
 * bundle that opens "who plays".
 *
 * Crisp on the phone:
 * - The canvas has the screen's own device pixels (2400x1080 at DPR 2.75)
 *   and CSS stretches it over the page's CSS pixels exactly.
 * - The camera's zoom is a whole number (core/world/camera.ts), textures
 *   are sampled NEAREST, and the camera and every sprite sit on whole
 *   device pixels: one texel is always the same square of pixels.
 * - No picture is drawn at more than twice its own pixels. A sheet that
 *   is still low-res (a 16 px prop) is left off the map until its HD
 *   sheet exists, and the log says so.
 */
import Phaser from "phaser";
import { pickZoom, scrollFor, snap } from "../core/world/camera";
import { type Dir, STEP } from "../core/world/grid";
import { blockedAhead, readMap, teleportAt, type Placement, type TiledMap, type WorldMap } from "../core/world/mapData";
import { avatarSheet, frameIndex, npcSheet, type Sheet, worldSize } from "../core/world/sprites";
import { Walker } from "../core/world/walker";
import { getLogger } from "../platform/appLog";
import { FrameStats, type FrameSummary } from "../platform/frameStats";
import { MAP_SOURCE_TILE_PX } from "./display";
import { Music } from "./music";
import { PauseReasons, type PauseReason } from "./pauseReasons";

const log = getLogger("nagmon.map");

export const START_MAP = "classic_hearthrock_city";
/** docs/app/SDD.md §10, "images": no picture over twice its pixels. */
export const MAX_SHOWN = 2;
/** The maps kept in memory: the one shown and the one before it (the way back). */
export const KEEP_MAPS = 2;
const FADE_MS = 150;
/** A longer frame (a stall) walks as if it were this long: no jump across the map. */
const MAX_FRAME_MS = 250;

export interface MapOptions {
  parent: HTMLElement;
  /** The profile's avatar key (core/family/avatars.ts). */
  avatar: string;
  /** The direction asked for this frame (the d-pad's `take`). */
  input: () => Dir | null;
  /** The hero pushed against a closed way (route 8, Steamshore). */
  onBlocked: () => void;
  onReady?: () => void;
  onError?: (e: unknown) => void;
  map?: string;
}

/** How big one picture is drawn: device pixels per texel. */
export interface ScaleEntry {
  what: string;
  texels: number;
  devicePx: number;
  ratio: number;
  filter: "nearest" | "linear";
}

export interface MapDebug {
  ready: boolean;
  map: string | null;
  /** `steps`: tiles walked since the map opened; `bumps`: pushes against a wall or someone. */
  player: { x: number; y: number; facing: Dir; moving: boolean; steps: number; bumps: number };
  npcs: { slug: string; x: number; y: number }[];
  left: string[];
  zoom: number;
  dpr: number;
  renderer: "webgl" | "canvas";
  canvas: { width: number; height: number; cssWidth: number; cssHeight: number };
  view: { x: number; y: number; width: number; height: number };
  world: { width: number; height: number };
  scales: ScaleEntry[];
  frames: FrameSummary;
  music: { track: string | null; playing: boolean };
  paused: PauseReason[];
  cachedMaps: string[];
  textures: string[];
}

export interface MapController {
  /** Stops the loop and the music; `resume` with the same reason starts them again. */
  pause(why?: PauseReason): void;
  resume(why?: PauseReason): void;
  readonly paused: boolean;
  destroy(): void;
  debug(): MapDebug | null;
}

interface MusicDb {
  [slug: string]: string;
}

const tilesKey = (map: string) => `map:${map}`;
const atlasKey = (map: string) => `atlas:${map}`;
const npcKey = (slug: string) => `npc:${slug}`;

class MapScene extends Phaser.Scene {
  world: WorldMap | null = null;
  walker = new Walker(0, 0, "up");
  zoom = 1;
  busy = true;
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
  private skipDelta = false;
  private lastFrame: number | null = null;
  private stepCount = 0;
  private waitLift = false;
  private bumpCount = 0;
  private cached: string[] = [];
  private maps = new Map<string, WorldMap>();

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
    this.player = this.add.sprite(0, 0, "hero", 1).setOrigin(0.5, 1);
    const name = this.opts.map ?? START_MAP;
    await this.enter(name, null);
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

  /** Loads a map (if it is not in memory) and puts the hero on it. */
  private async enter(name: string, at: { x: number; y: number; facing: Dir | null } | null): Promise<void> {
    if (!this.cache.tilemap.exists(tilesKey(name))) {
      await this.loadAll(() => this.load.tilemapTiledJSON(tilesKey(name), `game/maps/${name}.json`));
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
        if (sheet && !this.textures.exists(npcKey(p.slug)) && this.fits(sheet)) {
          this.load.spritesheet(npcKey(p.slug), sheet.url, { frameWidth: sheet.frameWidth, frameHeight: sheet.frameHeight });
        }
      }
    });

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
    this.zoom = pickZoom(this.scale.height, world.tileSize);

    this.leftOff = [];
    for (const p of world.npcs) {
      const sheet = npcSheet(npcs, p.slug);
      if (!sheet || !this.textures.exists(npcKey(p.slug))) {
        this.leftOff.push(p.slug);
        continue;
      }
      const sprite = this.add.sprite(0, 0, npcKey(p.slug), frameIndex(p.facing, null, true)).setOrigin(0.5, 1);
      this.people.push({ place: p, sprite, sheet });
      this.occupied.add(`${p.x},${p.y}`);
    }
    if (this.leftOff.length) {
      log.info(`Left off ${name} until their sheets are HD: ${this.leftOff.join(", ")}`);
    }

    const start = at ?? { ...(world.start ?? { x: Math.floor(world.width / 2), y: Math.floor(world.height / 2) }), facing: "up" as Dir };
    this.walker.place(start.x, start.y, start.facing ?? this.walker.facing);
    this.layout();
    this.playMusic(world);
    this.remember(name);
    log.info(`Map ${name}, the hero at ${start.x},${start.y}, zoom ${this.zoom}`);
  }

  /** The map's tile in 1x Tuxemon pixels (its `source_tile_size`). */
  private sourceTile(): number {
    return this.world?.sourceTile ?? MAP_SOURCE_TILE_PX;
  }

  /** Whether a sheet stays within twice its pixels at the zoom this screen gets. */
  private fits(sheet: Sheet): boolean {
    const tile = this.world?.tileSize ?? 64;
    return (worldSize(sheet, tile, this.sourceTile()).width * pickZoom(this.scale.height, tile)) / sheet.frameWidth <= MAX_SHOWN;
  }

  private sizeSprite(sprite: Phaser.GameObjects.Sprite, sheet: Sheet): void {
    const size = worldSize(sheet, this.world?.tileSize ?? 64, this.sourceTile());
    sprite.setDisplaySize(size.width, size.height);
    // a sheet drawn smaller than its pixels is smoothed, not dropped pixel by pixel
    const ratio = (size.width * this.zoom) / sheet.frameWidth;
    sprite.texture.setFilter(ratio < 1 ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST);
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
      for (const n of this.maps.get(m)?.npcs ?? []) {
        if (!needed.has(n.slug) && this.textures.exists(npcKey(n.slug))) this.textures.remove(npcKey(n.slug));
      }
      this.maps.delete(m);
    }
  }

  private playMusic(world: WorldMap): void {
    const tracks = this.cache.json.get("db:music") as MusicDb;
    const file = world.music ? tracks[world.music] : undefined;
    this.music.play(file ? `game/${file}` : null);
  }

  /** The canvas changed size (or the page's zoom): a new zoom and camera. */
  layout(): void {
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    this.zoom = pickZoom(this.scale.height, this.world?.tileSize ?? 64);
    cam.setZoom(this.zoom);
    if (this.player && this.playerSheet) this.sizeSprite(this.player, this.playerSheet);
    for (const p of this.people) this.sizeSprite(p.sprite, p.sheet);
    this.draw();
  }

  /** Back from a pause: the time away is not one long frame. */
  resumed(): void {
    this.skipDelta = true;
    this.frames.restart();
  }

  update(time: number): void {
    // the real time since the last frame: Phaser's own delta is smoothed
    // and capped, so a slow phone would walk slower and log 60 fps anyway
    const now = performance.now();
    const real = this.lastFrame === null ? 0 : now - this.lastFrame;
    this.lastFrame = now;
    let delta = Math.min(real, MAX_FRAME_MS);
    if (this.skipDelta) {
      this.skipDelta = false;
      delta = 0;
    } else if (real > 0) {
      this.frames.add(real, time);
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
  }

  private async travel(to: { map: string; x: number; y: number; facing: Dir | null }): Promise<void> {
    this.busy = true;
    try {
      await this.fade(false);
      await this.enter(to.map, to);
      this.waitLift = true;
      await this.fade(true);
    } catch (e) {
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

  /** Puts the camera, the hero and the people on whole device pixels. */
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
    const left = scrollFor(px, vw, world.width * T, z);
    const top = scrollFor(py - T / 2, vh, world.height * T, z);
    cam.setScroll(left - (cam.width / 2) * (1 - 1 / z), top - (cam.height / 2) * (1 - 1 / z));
  }

  debug(): Omit<MapDebug, "dpr" | "canvas" | "paused" | "renderer"> {
    const cam = this.cameras.main;
    const z = this.zoom;
    const filter = (key: string): "nearest" | "linear" => {
      const mode = this.textures.get(key).source[0]?.scaleMode;
      if (mode === Phaser.ScaleModes.LINEAR) return "linear";
      if (mode === Phaser.ScaleModes.NEAREST) return "nearest";
      return this.game.config.antialias ? "linear" : "nearest";
    };
    const scales: ScaleEntry[] = this.layers.map((l) => {
      const texels = l.tileset[0]?.tileWidth ?? 0;
      const devicePx = l.layer.tileWidth * l.scaleX * z;
      return { what: `tiles ${l.layer.name}`, texels, devicePx, ratio: devicePx / texels, filter: filter(l.tileset[0].image!.key) };
    });
    const sprites = [
      { what: "hero", sprite: this.player },
      ...this.people.map((p) => ({ what: `npc ${p.place.slug}`, sprite: p.sprite })),
    ];
    for (const { what, sprite } of sprites) {
      if (!sprite) continue;
      const texels = sprite.frame.width;
      const devicePx = sprite.displayWidth * z;
      scales.push({ what, texels, devicePx, ratio: devicePx / texels, filter: filter(sprite.texture.key) });
    }
    const T = this.world?.tileSize ?? 64;
    return {
      ready: !this.busy && !!this.world,
      map: this.world?.name ?? null,
      player: { x: this.walker.x, y: this.walker.y, facing: this.walker.facing, moving: this.walker.moving, steps: this.stepCount, bumps: this.bumpCount },
      npcs: this.people.map((p) => ({ slug: p.place.slug, x: p.place.x, y: p.place.y })),
      left: [...this.leftOff],
      zoom: z,
      view: { x: cam.worldView.x, y: cam.worldView.y, width: cam.worldView.width, height: cam.worldView.height },
      world: { width: (this.world?.width ?? 0) * T, height: (this.world?.height ?? 0) * T },
      scales,
      frames: this.frames.overall(),
      music: { track: this.music.track, playing: this.music.playing },
      cachedMaps: [...this.cached],
      textures: this.textures.getTextureKeys(),
    };
  }

  shutdownAll(): void {
    this.frames.flush();
    this.music.destroy();
  }
}

interface TiledTileset {
  name: string;
  image: string;
  tilewidth: number;
  tileheight: number;
  margin: number;
  spacing: number;
}

/** Starts the map in `parent` (which it fills). */
export function startMap(opts: MapOptions): MapController {
  const dpr = window.devicePixelRatio || 1;
  const size = () => {
    const r = opts.parent.getBoundingClientRect();
    return { w: Math.max(1, Math.round(r.width * dpr)), h: Math.max(1, Math.round(r.height * dpr)) };
  };
  const first = size();
  const scene = new MapScene(opts);
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

  const apply = () => {
    if (destroyed) return;
    if (reasons.paused) {
      game.loop.sleep();
      scene.music.hold();
    } else {
      scene.resumed();
      game.loop.wake();
      scene.music.release();
    }
  };

  const resize = new ResizeObserver(() => {
    const s = size();
    if (s.w === game.scale.width && s.h === game.scale.height) return;
    game.scale.resize(s.w, s.h);
    if (scene.sys.isActive()) scene.layout();
  });
  resize.observe(opts.parent);

  // the lifecycle module (Android pause/resume) will call pause/resume;
  // until it lands, the page's own visibility does
  const onVisibility = () => {
    if (document.hidden) {
      if (reasons.pause("background")) log.info("Map paused: the app went to the background");
      apply();
    } else {
      if (reasons.resume("background")) log.info("Map running again: the app is back");
      apply();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

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
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resize.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      scene.shutdownAll();
      // destroy runs on the next frame: a sleeping loop must wake for it
      game.loop.wake();
      game.destroy(true);
    },
    debug() {
      if (destroyed || !scene.sys.isActive()) return null;
      const canvas = game.canvas;
      const r = canvas.getBoundingClientRect();
      return {
        ...scene.debug(),
        dpr,
        renderer: game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer ? "webgl" : "canvas",
        canvas: { width: canvas.width, height: canvas.height, cssWidth: r.width, cssHeight: r.height },
        paused: reasons.reasons(),
      };
    },
  };
}
