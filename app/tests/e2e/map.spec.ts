import type { CDPSession, Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { fitsAndSharp, middle, responseTimes, settled, touch } from "./touch";

/**
 * Milestone M3: the map and walking, at the family's phone (873x393 CSS
 * px at DPR 2.75, touch only), in a Hebrew and an English browser. Every
 * test fails on a console error or warning (./fixtures.ts).
 */

// the walks take real seconds, and software WebGL is slow on a busy machine
test.describe.configure({ timeout: 240_000 });

const id = (s: string) => `[data-id="${s}"]`;
// 1 mm in CSS px at 2.75 device px per CSS px (as layout.spec.ts)
const MM = 51 / 9;

type Rect = { left: number; top: number; right: number; bottom: number };

interface Debug {
  ready: boolean;
  map: string;
  player: { x: number; y: number; facing: string; moving: boolean; steps: number; bumps: number };
  heroRect: Rect | null;
  npcs: { slug: string; x: number; y: number; frame: number }[];
  left: string[];
  zoom: number;
  dpr: number;
  resolution: { dpr: number; steps: number[]; adaptive: boolean; start: string; changes: { kind: string; from: number; to: number; fps: number; before?: number }[] };
  renderer: string;
  canvas: { width: number; height: number; cssWidth: number; cssHeight: number };
  view: { x: number; y: number; width: number; height: number };
  world: { width: number; height: number };
  scales: { what: string; texels: number; devicePx: number; ratio: number; filter: string }[];
  measured: {
    camZoom: number;
    canvasPxPerCss: number;
    devicePixelRatio: number;
    layers: {
      name: string;
      mapTileWidth: number;
      scaleX: number;
      tileset: { tileWidth: number; margin: number; spacing: number; columns: number };
      atlas: { key: string; width: number; height: number };
      filter: string;
    }[];
    sprites: { what: string; displayWidth: number; frameWidth: number; frames: number; filter: string }[];
  };
  frames: { frames: number; avgFps: number; slowestMs: number; slow: number };
  music: { track: string | null; playing: boolean };
  paused: string[];
  loopRunning: boolean;
  webgl: { lost: number; restored: number; contextLost: boolean };
  cachedMaps: string[];
  textures: string[];
}

type MapWindow = { __nagmonMap?: { debug(): Debug | null } };

const debug = (page: Page) => page.evaluate(() => (window as unknown as MapWindow).__nagmonMap?.debug() ?? null);

/**
 * A child straight into the browser's store (made-up name). The map's
 * adaptive resolution is off unless asked for: this browser draws WebGL
 * in software and would lower it at once, and most checks measure the
 * full-pixel canvas.
 */
async function seedChild(page: Page, { name = "תמר", avatar = "girl_teal", adaptive = false } = {}) {
  await page.addInitScript(
    ({ name, avatar, adaptive }) => {
      if (localStorage.getItem("seeded")) return;
      localStorage.setItem("seeded", "1");
      if (!adaptive) localStorage.setItem("nagmon.map.adaptiveResolution", "off");
      localStorage.setItem("nagmon-fs:d:profiles", "");
      localStorage.setItem("nagmon-fs:d:profiles/p00001", "");
      localStorage.setItem(
        "nagmon-fs:f:profiles/p00001/profile.json",
        JSON.stringify({ id: "p00001", name, avatar, grade: 2, order: 0, schema_version: 2 }),
      );
      // a child who has had the owl's intro
      localStorage.setItem("nagmon-fs:d:profiles/p00001/saves", "");
      localStorage.setItem(
        "nagmon-fs:f:profiles/p00001/saves/world.json",
        JSON.stringify({ schema_version: 1, money: 0, variables: { nagmon_intro_done: "yes" } }),
      );
    },
    { name, avatar, adaptive },
  );
}

/** Opens the map from who-plays and waits until the hero stands on it. */
async function openMap(page: Page): Promise<Debug> {
  await touch(page, page.locator(id("child_p00001")));
  await expect(page.locator("[data-screen=play][data-map=ready]")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as MapWindow).__nagmonMap?.debug()?.ready);
  return (await debug(page))!;
}

/** Leaves the map through its menu, to who-plays. */
async function leaveMap(page: Page) {
  await touch(page, page.locator(id("map_menu")));
  await touch(page, page.locator(id("map_exit")));
  await expect(page.locator("[data-screen=who-plays]")).toBeVisible();
}

/** Waits until the hero stands still on a tile. */
async function stopped(page: Page): Promise<Debug> {
  await page.waitForFunction(() => {
    const d = (window as unknown as MapWindow).__nagmonMap?.debug();
    return d && !d.player.moving;
  });
  return (await debug(page))!;
}

async function cdp(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}

/** A finger held on an arrow for `ms`, as a child walks. */
async function hold(page: Page, arrow: Locator, ms: number, { settle = true } = {}) {
  await touch(page, arrow, ms, { settle });
}

const arrow = (page: Page, dir: string) => page.locator(id(`dpad_${dir}`));

/**
 * Short taps on an arrow, one step each. The finger's down and up go out
 * together: this browser draws WebGL in software, a frame takes 100-300 ms
 * on a busy machine, and a touch sent after a wait reaches the page a
 * frame or two late, as a longer hold (several steps).
 */
async function steps(page: Page, dir: string, n: number) {
  const at = await middle(arrow(page, dir));
  const c = await cdp(page);
  for (let i = 0; i < n; i++) {
    const before = (await debug(page))!.player.steps;
    await Promise.all([
      c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] }),
      c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
    ]);
    // the step is done: one more tile walked, standing
    await page.waitForFunction((before) => {
      const p = (window as unknown as MapWindow).__nagmonMap!.debug()!.player;
      return p.steps > before && !p.moving;
    }, before);
  }
  await c.detach();
}

/** Holds an arrow until the hero walks into something (a wall, a fence, someone), then lets go. */
async function toWall(page: Page, dir: string): Promise<Debug> {
  const before = (await debug(page))!.player.bumps;
  const at = await middle(arrow(page, dir));
  const c = await cdp(page);
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
  await page.waitForFunction((before) => (window as unknown as MapWindow).__nagmonMap!.debug()!.player.bumps > before, before, {
    timeout: 60_000,
  });
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await c.detach();
  return stopped(page);
}

/** Holds an arrow until a door has led to `map`, then lets go at once. */
async function throughDoor(page: Page, dir: string, map: string) {
  const at = await middle(arrow(page, dir));
  const c = await cdp(page);
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
  await page.waitForFunction((map) => (window as unknown as MapWindow).__nagmonMap?.debug()?.map === map, map, { polling: 20 });
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await c.detach();
  await page.waitForFunction(() => (window as unknown as MapWindow).__nagmonMap?.debug()?.ready);
}

/** The hero's picture and the d-pad do not overlap on the page. */
async function padClear(page: Page, where: string) {
  await page.waitForTimeout(100);
  const d = (await debug(page))!;
  const pad = (await page.locator(id("dpad")).boundingBox())!;
  const h = d.heroRect!;
  const apart = h.right <= pad.x || h.left >= pad.x + pad.width || h.bottom <= pad.y || h.top >= pad.y + pad.height;
  expect(apart, `${where}: hero ${JSON.stringify(h)} and d-pad ${JSON.stringify(pad)}`).toBe(true);
}

/** Pretends the app went to the background (or came back): the page's visibility, which the lifecycle hears. */
async function hide(page: Page, hidden: boolean) {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: hidden ? "hidden" : "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

test.beforeEach(async ({ page }, info) => {
  if (!info.title.includes("adaptive")) await seedChild(page);
});

test("who-plays opens without Phaser; the map opens on the child's card, crisp at the phone's pixels", async ({ page }, info) => {
  const t0 = Date.now();
  await page.goto("/");
  await expect(page.locator("[data-screen=who-plays] .card")).toHaveText(["תמר"]);
  const coldMs = Date.now() - t0;
  // Phaser is fetched only for the map: who-plays loads a small bundle
  const before = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((r) => r.name.endsWith(".js"))
      .map((r) => ({ name: r.name.split("/").pop()!, size: (r as PerformanceResourceTiming).decodedBodySize })),
  );
  console.log(`who-plays shown ${coldMs} ms after the page started loading; scripts: ${JSON.stringify(before)}`);
  expect(before.some((s) => s.name.startsWith("mapGame"))).toBe(false);
  expect(before.reduce((n, s) => n + s.size, 0)).toBeLessThan(600_000);

  const d = await openMap(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath("map_01_start.png") });
  console.log(`map: ${d.renderer}, canvas ${d.canvas.width}x${d.canvas.height} for ${d.canvas.cssWidth}x${d.canvas.cssHeight} CSS px at DPR ${d.dpr}, zoom ${d.zoom}`);
  console.log("drawn sizes:", d.scales.map((s) => `${s.what} ${s.texels}->${s.devicePx} (${s.ratio}x, ${s.filter})`).join("; "));

  // Hearthrock, the hero at the start in front of the owl's house, and the owl
  expect(d.map).toBe("classic_hearthrock_city");
  expect(d.player).toMatchObject({ x: 29, y: 16, facing: "up", moving: false });
  expect(d.npcs).toContainEqual({ slug: "nagmon_owl", x: 29, y: 15, frame: 1 });
  expect(d.music.track).toMatch(/JRPG_town_loop\.ogg$/);
  expect(d.resolution).toMatchObject({ dpr: 2.75, adaptive: false, start: "off" });
  // every sheet is HD now (app/hd-art): the wallet, a prop, is drawn (its one frame)
  expect(d.left).toEqual([]);
  expect(d.npcs).toContainEqual({ slug: "nagmon_wallet", x: 12, y: 7, frame: 0 });

  // SDD §10 "images", measured: Phaser's camera zoom, the canvas's pixels
  // against its size on the page, and the textures' own sizes
  const m = d.measured;
  const box = (await page.locator("canvas").boundingBox())!;
  expect(m.canvasPxPerCss).toBeCloseTo(d.canvas.width / box.width, 6);
  expect(m.devicePixelRatio).toBe(2.75);
  // the canvas has the screen's own pixels, laid over the page exactly
  expect(Math.abs(m.canvasPxPerCss - 2.75)).toBeLessThan(0.01);
  expect([box.width, box.height]).toEqual([873, 393]);
  expect(m.camZoom).toBe(2);
  const devicePerTexel = (worldPx: number, texels: number) => (worldPx * m.camZoom * m.devicePixelRatio) / m.canvasPxPerCss / texels;
  expect(m.layers.length).toBe(5);
  for (const l of m.layers) {
    // the atlas texture is the tileset it says: margin, columns of tiles and spacing
    const { tileWidth, margin, spacing, columns } = l.tileset;
    expect(l.atlas.width, l.name).toBe(2 * margin + columns * tileWidth + (columns - 1) * spacing);
    const r = devicePerTexel(l.mapTileWidth * l.scaleX, tileWidth);
    expect(r, l.name).toBeGreaterThan(1.99);
    expect(r, l.name).toBeLessThanOrEqual(2.001);
    expect(l.filter, l.name).toBe("nearest");
  }
  expect(m.sprites.length).toBeGreaterThan(5);
  for (const sp of m.sprites) {
    const r = devicePerTexel(sp.displayWidth, sp.frameWidth);
    expect(r, sp.what).toBeLessThanOrEqual(2.001);
    expect(r, sp.what).toBeGreaterThan(0);
  }
  expect(devicePerTexel(m.sprites.find((s) => s.what === "hero")!.displayWidth, 128)).toBeCloseTo(1, 2);
  const wallet = m.sprites.find((s) => s.what === "npc nagmon_wallet")!;
  expect(wallet.frames).toBe(1);
  expect(devicePerTexel(wallet.displayWidth, wallet.frameWidth)).toBeCloseTo(2, 2);

  // and in the picture: a ground tile on the screen is its atlas tile, each texel a 2x2 block
  const shot = await page.screenshot();
  const pixels = await page.evaluate(async (png) => {
    const d = (window as unknown as MapWindow).__nagmonMap!.debug()!;
    const json = await (await fetch("game/maps/classic_hearthrock_city.json")).json();
    const ts = json.tilesets[0];
    const T = json.tilewidth as number;
    const load = async (src: string) => {
      const im = new Image();
      im.src = src;
      await im.decode();
      const c = document.createElement("canvas");
      c.width = im.width;
      c.height = im.height;
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(im, 0, 0);
      return { w: im.width, data: g.getImageData(0, 0, im.width, im.height).data };
    };
    const screen = await load(`data:image/png;base64,${png}`);
    const atlas = await load("game/atlas/classic_hearthrock_city.png");
    const z = d.measured.camZoom;
    const k = screen.w / d.canvas.width; // screenshot px per canvas px
    const layers = json.layers.filter((l: { type: string }) => l.type === "tilelayer");
    const covered = [...document.querySelectorAll(".dpad, .map-hud, .map-note")].map((e) => e.getBoundingClientRect());
    const people = new Set([...d.npcs, d.player].flatMap((p) => [`${p.x},${p.y}`, `${p.x},${p.y - 1}`]));
    const cssPerCanvas = 1 / d.measured.canvasPxPerCss;
    const rect = document.querySelector("canvas")!.getBoundingClientRect();
    const tried: string[] = [];
    for (let ty = 0; ty < json.height; ty++) {
      for (let tx = 0; tx < json.width; tx++) {
        const X = (tx * T - d.view.x) * z;
        const Y = (ty * T - d.view.y) * z;
        if (X < 0 || Y < 0 || X + T * z > d.canvas.width || Y + T * z > d.canvas.height) continue;
        if (people.has(`${tx},${ty}`)) continue;
        const i = ty * json.width + tx;
        const gid = layers[0].data[i];
        if (!gid || gid >= 2 ** 29 || layers.slice(1).some((l: { data: number[] }) => l.data[i])) continue;
        const css = { l: rect.left + X * cssPerCanvas, t: rect.top + Y * cssPerCanvas, r: rect.left + (X + T * z) * cssPerCanvas, b: rect.top + (Y + T * z) * cssPerCanvas };
        if (covered.some((c) => css.l < c.right && css.r > c.left && css.t < c.bottom && css.b > c.top)) continue;
        const local = gid - ts.firstgid;
        const ax = ts.margin + (local % ts.columns) * (T + ts.spacing);
        const ay = ts.margin + Math.floor(local / ts.columns) * (T + ts.spacing);
        const colours = new Set<number>();
        let same = 0;
        let total = 0;
        for (let v = 0; v < T; v++) {
          for (let u = 0; u < T; u++) {
            const a = ((ay + v) * atlas.w + ax + u) * 4;
            colours.add((atlas.data[a] << 16) | (atlas.data[a + 1] << 8) | atlas.data[a + 2]);
            for (let b = 0; b < z * z; b++) {
              const sx = Math.round((X + u * z + (b % z)) * k);
              const sy = Math.round((Y + v * z + Math.floor(b / z)) * k);
              const p = (sy * screen.w + sx) * 4;
              const diff = Math.max(...[0, 1, 2].map((ch) => Math.abs(screen.data[p + ch] - atlas.data[a + ch])));
              if (diff <= 8) same++;
              total++;
            }
          }
        }
        // a plain tile would match any scaling: one with texture tells
        if (colours.size < 6) {
          tried.push(`${tx},${ty} plain`);
          continue;
        }
        return { tile: [tx, ty], colours: colours.size, share: same / total };
      }
    }
    return { tile: null, tried };
  }, shot.toString("base64"));
  console.log("pixel check:", JSON.stringify(pixels));
  expect(pixels.tile).not.toBeNull();
  expect(pixels.share).toBeGreaterThan(0.97);

  // 20:9 landscape, nothing outside the screen, finger-sized arrows with names
  await fitsAndSharp(page);
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.dataset.id, w: r.width, h: r.height, name: b.getAttribute("aria-label") ?? b.textContent };
    }),
  );
  for (const b of buttons) {
    expect(Math.min(b.w, b.h), `${b.id} is a finger wide`).toBeGreaterThanOrEqual(9 * MM);
    expect(b.name, `${b.id} has a name`).toBeTruthy();
  }
  expect(buttons.map((b) => b.id).sort()).toEqual(["dpad_down", "dpad_left", "dpad_right", "dpad_up", "map_menu"]);
  // the d-pad on the left, low; the menu at the top on the other side
  const pad = (await page.locator(id("dpad")).boundingBox())!;
  expect(pad.x).toBeLessThan(873 / 3);
  expect(pad.y + pad.height).toBeGreaterThan(393 * 0.9);
});

test("hold an arrow to walk, let go to stop; the owl, walls and the closed way hold", async ({ page }, info) => {
  await page.goto("/");
  await openMap(page);
  await settled(page);

  // the owl stands on (29,15), right in front: walking into it turns the hero, no step
  await hold(page, arrow(page, "up"), 600);
  let d = await stopped(page);
  expect(d.player).toMatchObject({ x: 29, y: 16, facing: "up" });

  // hold left a second: several tiles along the row, then a stop on a tile
  await hold(page, arrow(page, "left"), 1000, { settle: false });
  d = await stopped(page);
  console.log(`held left 1 s: from 29 to ${d.player.x}`);
  expect(d.player).toMatchObject({ y: 16, facing: "left" });
  // 3.75 tiles a second; this busy browser sees the finger lift late
  expect(d.player.x).toBeLessThanOrEqual(27);
  expect(d.player.x).toBeGreaterThanOrEqual(18);
  await page.screenshot({ path: info.outputPath("map_02_walked_left.png") });

  // one tap is one step
  const x = d.player.x;
  await steps(page, "right", 1);
  d = await stopped(page);
  expect(d.player).toMatchObject({ x: x + 1, y: 16, facing: "right" });

  // the wall below row 17: one step down, then no more
  d = await toWall(page, "down");
  expect(d.player).toMatchObject({ x: x + 1, y: 17, facing: "down" });
  await steps(page, "up", 1);

  // to the closed way to route 8 (39, 15-17), the long way round the
  // one-way fences: west to the gardener, up the alley at column 5 to row
  // 9 (the doors at (8,13) and (13,13) lead into the Rest Center and the shop, (18,13) and
  // (23,13) lead into the academies), east along the fence of row 9, down
  // the east edge and to the exit
  d = await toWall(page, "left");
  expect(d.player).toMatchObject({ x: 5, y: 16 }); // the gardener stands on (4,16)
  await steps(page, "up", 7);
  expect((await debug(page))!.player).toMatchObject({ x: 5, y: 9 });
  d = await toWall(page, "right");
  expect(d.player).toMatchObject({ x: 39, y: 9 });
  d = await toWall(page, "down");
  expect(d.player).toMatchObject({ x: 39, y: 12 });
  await steps(page, "left", 2);
  d = await toWall(page, "down");
  expect(d.player).toMatchObject({ x: 37, y: 17 });
  await expect(page.locator(id("map_note"))).toHaveCount(0);
  d = await toWall(page, "right");
  expect(d.player).toMatchObject({ x: 38, y: 17, facing: "right" });
  await expect(page.locator(id("map_note"))).toHaveText("הדרך הזאת עוד סגורה. יש עוד הרבה לראות בעיר!");
  await fitsAndSharp(page);
  await page.screenshot({ path: info.outputPath("map_04_closed_way.png") });
  // the camera stopped at the map's right and bottom edges
  expect(d.view.x + d.view.width).toBe(d.world.width);
  expect(d.view.y + d.view.height).toBe(d.world.height);
  // and the note goes away by itself
  await expect(page.locator(id("map_note"))).toHaveCount(0, { timeout: 10_000 });

  // frame rate and tap timing while walking (docs/app/SDD.md §5). This
  // browser draws WebGL in software (SwiftShader) at the phone's 2.6 million
  // pixels, so its rate says little about the phone's GPU: it is printed,
  // and the budget is read from the phone's own log line.
  const frames = d.frames;
  const taps = (await responseTimes(page)).app;
  console.log(
    `map frames (software WebGL): ${frames.avgFps.toFixed(1)} fps on average, slowest ${frames.slowestMs.toFixed(0)} ms, ${frames.slow} over 50 ms (${frames.frames} frames); ` +
      `tap to drawn frame, ms: ${taps.map((t) => Math.round(t)).join(" ")}`,
  );
  expect(frames.frames).toBeGreaterThan(0);
  expect(frames.avgFps).toBeGreaterThan(0);
});

test("a finger down before the map appears walks nowhere; a resting thumb does not stop a walk", async ({ page }) => {
  await page.goto("/");
  // where the left arrow is: open the map once, then back to who-plays
  await openMap(page);
  const leftAt = await middle(arrow(page, "left"));
  await touch(page, page.locator(id("map_menu")));
  await touch(page, page.locator(id("map_exit")));
  await expect(page.locator("[data-screen=who-plays]")).toBeVisible();
  // the card's tap, and at once a finger on the spot where the arrow will be,
  // held while the map opens and well after it is up
  await touch(page, page.locator(id("child_p00001")));
  const early = await cdp(page);
  await early.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...leftAt, id: 9 }] });
  await expect(page.locator("[data-screen=play][data-map=ready]")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await early.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await early.detach();
  let d = await stopped(page);
  expect(d.player).toMatchObject({ x: 29, y: 16 });

  await settled(page);
  const c = await cdp(page);
  const thumb = { x: 860, y: 380, id: 1 };
  const left = { ...(await middle(arrow(page, "left"))), id: 2 };
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [thumb] });
  await page.waitForTimeout(100);
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [thumb, left] });
  await page.waitForTimeout(600);
  // the thumb lifts mid-walk: the walk goes on
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [thumb] });
  await page.waitForTimeout(300);
  d = (await debug(page))!;
  expect(d.player.x).toBeLessThan(29);
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const after = await stopped(page);
  expect(after.player.x).toBeLessThan(d.player.x + 1);
  // a finger that slides from left to up turns the walk up
  await settled(page);
  const start = (await debug(page))!.player;
  const up = await middle(arrow(page, "up"));
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...left, id: 3 }] });
  await page.waitForTimeout(200);
  await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...up, id: 3 }] });
  await page.waitForTimeout(400);
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  d = await stopped(page);
  expect(d.player.x).toBeLessThan(start.x);
  expect(d.player.facing === "up" || d.player.y < start.y).toBe(true);
  await c.detach();
});

test("the menu pauses the map: the loop sleeps and the music stops; continue plays again", async ({ page }, info) => {
  await page.goto("/");
  let d = await openMap(page);
  // the town music plays from the start (the card's tap allowed the sound)
  await expect.poll(async () => (await debug(page))!.music.playing).toBe(true);
  expect(d.loopRunning).toBe(true);

  await touch(page, page.locator(id("map_menu")));
  await expect(page.locator("[data-screen=map-menu]")).toBeVisible();
  d = (await debug(page))!;
  expect(d.paused).toEqual(["menu"]);
  expect(d.loopRunning).toBe(false);
  expect(d.music.playing).toBe(false);
  await fitsAndSharp(page);
  await page.screenshot({ path: info.outputPath("map_05_menu.png") });
  // under the menu the map's own buttons are gone
  await expect(arrow(page, "left")).toHaveCount(0);
  await expect(page.locator(id("map_menu"))).toHaveCount(0);

  await touch(page, page.locator(id("map_continue")));
  await expect(page.locator("[data-screen=map-menu]")).toHaveCount(0);
  d = (await debug(page))!;
  expect(d.paused).toEqual([]);
  expect(d.loopRunning).toBe(true);
  await expect.poll(async () => (await debug(page))!.music.playing).toBe(true);
  await hold(page, arrow(page, "left"), 400);
  d = await stopped(page);
  expect(d.player.x).toBeLessThan(29);
});

test("the background pauses the map through the app's lifecycle; a finger held as it left does not walk on", async ({ page }) => {
  await page.goto("/");
  let d = await openMap(page);
  await expect.poll(async () => (await debug(page))!.music.playing).toBe(true);
  await settled(page);
  // a finger on the left arrow when the app goes to the background
  const c = await cdp(page);
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [await middle(arrow(page, "left"))] });
  await page.waitForFunction(() => (window as unknown as MapWindow).__nagmonMap!.debug()!.player.moving);
  await hide(page, true);
  d = (await debug(page))!;
  expect(d.paused).toEqual(["lifecycle"]);
  expect(d.loopRunning).toBe(false);
  expect(d.music.playing).toBe(false);
  const life = await page.evaluate(() => (window as unknown as { __lifecycle: () => { state: string } }).__lifecycle());
  expect(life.state).toBe("background");
  // back: the step under way ends, and the hero stands (the finger's lift never came)
  await hide(page, false);
  d = (await debug(page))!;
  expect(d.paused).toEqual([]);
  expect(d.loopRunning).toBe(true);
  await expect.poll(async () => (await debug(page))!.music.playing).toBe(true);
  const at = (await stopped(page)).player;
  await page.waitForTimeout(1200);
  expect((await debug(page))!.player).toMatchObject({ x: at.x, y: at.y, moving: false });
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await c.detach();
  // the menu and the background each hold it: back from the background with the menu open stays paused
  await touch(page, page.locator(id("map_menu")));
  await hide(page, true);
  await hide(page, false);
  expect((await debug(page))!.paused).toEqual(["menu"]);
  expect((await debug(page))!.loopRunning).toBe(false);
});

test("leaving the map leaves nothing running: no frame callbacks and no sound, every time", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __raf: number; __audio: HTMLAudioElement[] };
    w.__raf = 0;
    w.__audio = [];
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      w.__raf++;
      return raf(cb);
    };
    const RealAudio = window.Audio;
    window.Audio = function (src?: string) {
      const a = new RealAudio(src);
      w.__audio.push(a);
      return a;
    } as unknown as typeof Audio;
  });
  await page.goto("/");
  for (let round = 1; round <= 4; round++) {
    await openMap(page);
    if (round === 2) await steps(page, "left", 1);
    await leaveMap(page);
    // the last frames of the closing map and of the tap itself
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => {
      const w = window as unknown as { __raf: number; __audio: HTMLAudioElement[] };
      return { raf: w.__raf, audio: w.__audio.map((a) => a.paused), canvases: document.querySelectorAll("canvas").length };
    });
    expect(after.raf - before, `round ${round}: frame callbacks in 1 s after leaving`).toBe(0);
    expect(after.audio.length, `round ${round}: tracks made`).toBeGreaterThan(0);
    expect(after.audio.every(Boolean), `round ${round}: every track paused`).toBe(true);
    expect(after.canvases).toBe(0);
    expect(await debug(page)).toBeNull();
  }
});

test("a lost WebGL context that comes back is logged and the map goes on; one that does not fails kindly", async ({ page, console: problems }) => {
  await page.goto("/");
  await openMap(page);
  const lose = (restoreAfter: number | null) =>
    page.evaluate((restoreAfter) => {
      const gl = document.querySelector("canvas")!.getContext("webgl")!;
      const ext = gl.getExtension("WEBGL_lose_context")!;
      ext.loseContext();
      if (restoreAfter !== null) setTimeout(() => ext.restoreContext(), restoreAfter);
      return true;
    }, restoreAfter);
  await lose(500);
  await page.waitForFunction(() => {
    const w = (window as unknown as MapWindow).__nagmonMap!.debug()!.webgl;
    return w.lost === 1 && w.restored === 1 && !w.contextLost;
  });
  // still a map: it walks and draws
  await settled(page);
  const x = (await debug(page))!.player.x;
  await steps(page, "left", 1);
  expect((await debug(page))!.player.x).toBe(x - 1);
  await expect(page.locator("[data-screen=map-failed]")).toHaveCount(0);

  // lost for good: after 5 s the map says it did not open, and its button leads out
  await lose(null);
  await expect(page.locator("[data-screen=map-failed]")).toBeVisible({ timeout: 10_000 });
  await touch(page, page.locator(id("map_back")));
  await expect(page.locator("[data-screen=who-plays]")).toBeVisible();
  // Chromium's and Phaser's own notes on the context this test took away
  for (let i = problems.length - 1; i >= 0; i--) {
    if (/CONTEXT_LOST_WEBGL|context lost|WebGL Context (restored|lost)/i.test(problems[i])) problems.splice(i, 1);
  }
});

test("adaptive resolution: a slow phone tries fewer pixels, keeps a step that helps, and the map keeps its size", async ({ page }, info) => {
  await seedChild(page, { adaptive: true });
  // a slow phone: this browser's software WebGL, and the CPU 4x slower
  const c = await cdp(page);
  await c.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.goto("/");
  let d = await openMap(page);
  expect(d.resolution).toMatchObject({ steps: [2.75, 2, 1.5], adaptive: true, start: "screen" });
  // well under 45 fps here: a lower step is tried, then kept or undone;
  // wait until the last one is decided, at the floor or with adapting over
  await page.waitForFunction(
    () => {
      const r = (window as unknown as MapWindow).__nagmonMap!.debug()!.resolution;
      const last = r.changes.at(-1);
      return !!last && last.kind !== "lowered" && (r.dpr === 1.5 || !r.adaptive);
    },
    null,
    { timeout: 90_000 },
  );
  d = (await debug(page))!;
  const kinds = d.resolution.changes.map((x) => `${x.kind} ${x.from}->${x.to}`);
  console.log("resolution changes:", JSON.stringify(d.resolution.changes), `canvas ${d.canvas.width}x${d.canvas.height}, zoom ${d.zoom}`);
  expect(kinds[0]).toBe("lowered 2.75->2");
  // each tried step is decided by the next window: kept if 15% faster, else undone (and no more changes)
  for (let i = 0; i < d.resolution.changes.length; i++) {
    const ch = d.resolution.changes[i];
    if (ch.kind === "kept") expect(ch.fps).toBeGreaterThanOrEqual(ch.before! * 1.15);
    if (ch.kind === "reverted") {
      expect(ch.fps).toBeLessThan(ch.before! * 1.15);
      expect(i).toBe(d.resolution.changes.length - 1);
    }
  }
  const saved = await page.evaluate(() => localStorage.getItem("nagmon.map.renderDpr"));
  const lastKept = [...d.resolution.changes].reverse().find((x) => x.kind === "kept");
  expect(saved === null ? null : JSON.parse(saved).dpr).toBe(lastKept?.to ?? null);
  // the canvas draws at its resolution, stretched over the page
  expect(Math.abs(d.canvas.width - 873 * d.resolution.dpr)).toBeLessThanOrEqual(1);
  expect(d.canvas.cssWidth).toBe(873);
  // the map keeps its size on the screen: 2 device px per texel, measured
  const m = d.measured;
  for (const l of m.layers) {
    const r = (l.mapTileWidth * l.scaleX * m.camZoom * m.devicePixelRatio) / m.canvasPxPerCss / l.tileset.tileWidth;
    expect(r).toBeCloseTo(2, 2);
    expect(l.filter).toBe(d.resolution.dpr === 2.75 ? "nearest" : "linear");
  }
  for (const s of d.scales) expect(s.ratio, s.what).toBeLessThanOrEqual(2.001);
  await fitsAndSharp(page);
  await page.screenshot({ path: info.outputPath("map_07_lower_resolution.png") });
  // still walks
  await settled(page);
  await hold(page, arrow(page, "left"), 800, { settle: false });
  expect((await stopped(page)).player.x).toBeLessThan(29);

  // the next start opens at the kept step (or measures afresh if none was kept)
  await c.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.reload();
  d = await openMap(page);
  expect(d.resolution.start).toBe(lastKept ? "kept" : "screen");
  if (lastKept) expect(d.resolution.dpr).toBe(lastKept.to);
  await c.detach();
});

test("a door leads into the academy and back; two maps stay in memory", async ({ page }, info) => {
  await page.goto("/");
  await openMap(page);
  await settled(page);
  // along row 16 to the Mila academy's door column (18), then up through the door (18,13)
  await steps(page, "left", 11);
  expect((await debug(page))!.player).toMatchObject({ x: 18, y: 16 });
  await throughDoor(page, "up", "classic_gym_mila");
  let d = await stopped(page);
  // in at (10,19), standing: a door ends the walk until the finger lifts
  expect(d.player).toMatchObject({ x: 10, y: 19, facing: "up" });
  expect(d.music.track).toMatch(/JRPG_royalCourt_loop\.ogg$/);
  expect(d.cachedMaps).toEqual(["classic_gym_mila", "classic_hearthrock_city"]);
  for (const s of d.scales) expect(s.ratio, s.what).toBeLessThanOrEqual(2);
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath("map_06_academy.png") });

  // the bottom-left corner of the academy: the hero is drawn beside the
  // d-pad, never under it (the camera goes past the left edge for it)
  await steps(page, "up", 1);
  d = await toWall(page, "left");
  expect(d.player).toMatchObject({ x: 0, y: 18 });
  await padClear(page, "at (0,18)");
  await steps(page, "right", 1);
  expect((await debug(page))!.player).toMatchObject({ x: 1, y: 18 });
  await padClear(page, "at (1,18)");
  await page.screenshot({ path: info.outputPath("map_06b_academy_corner.png") });
  await steps(page, "down", 1);
  await padClear(page, "at (1,19)");
  // back to the door (10,19)
  await steps(page, "right", 9);
  expect((await debug(page))!.player).toMatchObject({ x: 10, y: 19 });

  // down at the door: back in town, in front of the academy
  await throughDoor(page, "down", "classic_hearthrock_city");
  d = await stopped(page);
  // out of the door at (18,14), standing
  expect(d.player).toMatchObject({ x: 18, y: 14, facing: "down" });
  // a new press walks on
  await steps(page, "down", 1);
  expect((await debug(page))!.player).toMatchObject({ x: 18, y: 15 });
  expect(d.cachedMaps).toEqual(["classic_hearthrock_city", "classic_gym_mila"]);
});
