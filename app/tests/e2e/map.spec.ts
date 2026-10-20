import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { fitsAndSharp, middle, responseTimes, settled, touch } from "./touch";

/**
 * Milestone M3: the map and walking, at the family's phone (873x393 CSS
 * px at DPR 2.75, touch only), in a Hebrew and an English browser.
 */

// the walks take real seconds, and software WebGL is slow on a busy machine
test.describe.configure({ timeout: 240_000 });

const id = (s: string) => `[data-id="${s}"]`;
// 1 mm in CSS px at 2.75 device px per CSS px (as layout.spec.ts)
const MM = 51 / 9;

interface Scale {
  what: string;
  texels: number;
  devicePx: number;
  ratio: number;
  filter: string;
}

interface Debug {
  ready: boolean;
  map: string;
  player: { x: number; y: number; facing: string; moving: boolean; steps: number; bumps: number };
  npcs: { slug: string; x: number; y: number }[];
  left: string[];
  zoom: number;
  dpr: number;
  renderer: string;
  canvas: { width: number; height: number; cssWidth: number; cssHeight: number };
  view: { x: number; y: number; width: number; height: number };
  world: { width: number; height: number };
  scales: Scale[];
  frames: { frames: number; avgFps: number; slowestMs: number; slow: number };
  music: { track: string | null; playing: boolean };
  paused: string[];
  cachedMaps: string[];
  textures: string[];
}

const debug = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nagmonMap?: { debug(): unknown } }).__nagmonMap?.debug() ?? null) as Promise<Debug | null>;

/** A child straight into the browser's store (made-up name). */
async function seedChild(page: Page, name = "תמר", avatar = "girl_teal") {
  await page.addInitScript(
    ({ name, avatar }) => {
      if (localStorage.getItem("seeded")) return;
      localStorage.setItem("seeded", "1");
      localStorage.setItem("nagmon-fs:d:profiles", "");
      localStorage.setItem("nagmon-fs:d:profiles/p00001", "");
      localStorage.setItem(
        "nagmon-fs:f:profiles/p00001/profile.json",
        JSON.stringify({ id: "p00001", name, avatar, grade: 2, order: 0, schema_version: 2 }),
      );
    },
    { name, avatar },
  );
}

/** Opens the map from who-plays and waits until the hero stands on it. */
async function openMap(page: Page): Promise<Debug> {
  await touch(page, page.locator(id("child_p00001")));
  await expect(page.locator("[data-screen=play][data-map=ready]")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => (window as unknown as { __nagmonMap?: { debug(): { ready: boolean } | null } }).__nagmonMap?.debug()?.ready);
  return (await debug(page))!;
}

/** Waits until the hero stands still on a tile. */
async function stopped(page: Page): Promise<Debug> {
  await page.waitForFunction(() => {
    const d = (window as unknown as { __nagmonMap?: { debug(): { player: { moving: boolean } } | null } }).__nagmonMap?.debug();
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
    // the step is done: one more tile walked, standing (or a bump: no step at all)
    await page.waitForFunction(
      (before) => {
        const p = (window as unknown as { __nagmonMap: { debug(): { player: { moving: boolean; steps: number } } } }).__nagmonMap.debug().player;
        return p.steps > before && !p.moving;
      },
      before,
    );
  }
  await c.detach();
}

/** Holds an arrow until the hero walks into something (a wall, a fence, someone), then lets go. */
async function toWall(page: Page, dir: string): Promise<Debug> {
  const before = (await debug(page))!.player.bumps;
  const at = await middle(arrow(page, dir));
  const c = await cdp(page);
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
  await page.waitForFunction(
    (before) => (window as unknown as { __nagmonMap: { debug(): { player: { bumps: number } } } }).__nagmonMap.debug().player.bumps > before,
    before,
    { timeout: 60_000 },
  );
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await c.detach();
  return stopped(page);
}

/** Holds an arrow until a door has led to `map`, then lets go at once. */
async function throughDoor(page: Page, dir: string, map: string) {
  const at = await middle(arrow(page, dir));
  const c = await cdp(page);
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
  await page.waitForFunction(
    (map) => (window as unknown as { __nagmonMap?: { debug(): { map: string } | null } }).__nagmonMap?.debug()?.map === map,
    map,
    { polling: 20 },
  );
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await c.detach();
  await page.waitForFunction(() => (window as unknown as { __nagmonMap?: { debug(): { ready: boolean } | null } }).__nagmonMap?.debug()?.ready);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`${m.text()} ${m.location().url}`);
  });
  (page as unknown as { __errors: string[] }).__errors = errors;
  await seedChild(page);
});

test.afterEach(async ({ page }) => {
  // no uncaught errors and no console errors on the way (SDD §10, stability)
  expect((page as unknown as { __errors: string[] }).__errors).toEqual([]);
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
  console.log("left off until HD:", d.left.join(", ") || "none");

  // Hearthrock, the hero at the start in front of the owl's house, and the owl
  expect(d.map).toBe("classic_hearthrock_city");
  expect(d.player).toMatchObject({ x: 29, y: 16, facing: "up", moving: false });
  expect(d.npcs).toContainEqual({ slug: "nagmon_owl", x: 29, y: 15 });
  expect(d.music.track).toMatch(/JRPG_town_loop\.ogg$/);

  // the canvas has the screen's own pixels, laid over the page exactly
  expect(d.dpr).toBe(2.75);
  expect(Math.abs(d.canvas.width - d.canvas.cssWidth * d.dpr)).toBeLessThanOrEqual(1);
  expect(Math.abs(d.canvas.height - d.canvas.cssHeight * d.dpr)).toBeLessThanOrEqual(1);
  expect(d.canvas.cssWidth).toBe(873);
  expect(d.canvas.cssHeight).toBe(393);

  // SDD §10 "images": nothing drawn at more than twice its pixels; tiles at
  // a whole number of device pixels per texel, sampled NEAREST (not blurred)
  expect(d.zoom).toBe(2);
  expect(d.scales.length).toBeGreaterThan(5);
  for (const s of d.scales) {
    expect(s.ratio, s.what).toBeLessThanOrEqual(2);
    expect(s.ratio, s.what).toBeGreaterThan(0);
  }
  for (const s of d.scales.filter((x) => x.what.startsWith("tiles"))) {
    expect(Number.isInteger(s.ratio), s.what).toBe(true);
    expect(s.filter, s.what).toBe("nearest");
  }
  expect(d.scales.find((s) => s.what === "hero")).toMatchObject({ texels: 128, devicePx: 128, ratio: 1 });
  // the camera sees only the map, about 8 rows of tiles
  expect(d.view.x).toBeGreaterThanOrEqual(0);
  expect(d.view.y).toBeGreaterThanOrEqual(0);
  expect(d.view.x + d.view.width).toBeLessThanOrEqual(d.world.width);
  expect(d.view.y + d.view.height).toBeLessThanOrEqual(d.world.height);

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
  // one-way fences: west to the gardener, up the alley at column 8, east
  // along the fence of row 9, down the east edge and to the exit
  d = await toWall(page, "left");
  expect(d.player).toMatchObject({ x: 5, y: 16 }); // the gardener stands on (4,16)
  await steps(page, "up", 2);
  await steps(page, "right", 3);
  d = await toWall(page, "up");
  expect(d.player).toMatchObject({ x: 8, y: 9 }); // a fence: no way up from row 9
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

test("the menu pauses the map: continue, or back to who-plays", async ({ page }, info) => {
  await page.goto("/");
  await openMap(page);
  await touch(page, page.locator(id("map_menu")));
  await expect(page.locator("[data-screen=map-menu]")).toBeVisible();
  let d = (await debug(page))!;
  expect(d.paused).toEqual(["menu"]);
  expect(d.music.playing).toBe(false);
  await fitsAndSharp(page);
  await page.screenshot({ path: info.outputPath("map_05_menu.png") });
  // the arrows are off under the menu
  await expect(arrow(page, "left")).toBeDisabled();

  await touch(page, page.locator(id("map_continue")));
  await expect(page.locator("[data-screen=map-menu]")).toHaveCount(0);
  d = (await debug(page))!;
  expect(d.paused).toEqual([]);
  await hold(page, arrow(page, "left"), 400);
  d = await stopped(page);
  expect(d.player.x).toBeLessThan(29);

  // the background pauses it too, and coming back with the menu open keeps it paused
  const hide = (hidden: boolean) =>
    page.evaluate((hidden) => {
      Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
      Object.defineProperty(document, "visibilityState", { value: hidden ? "hidden" : "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }, hidden);
  await hide(true);
  expect((await debug(page))!.paused).toEqual(["background"]);
  await hide(false);
  expect((await debug(page))!.paused).toEqual([]);

  await touch(page, page.locator(id("map_menu")));
  await touch(page, page.locator(id("map_exit")));
  await expect(page.locator("[data-screen=who-plays]")).toBeVisible();
  expect(await page.evaluate(() => document.querySelectorAll("canvas").length)).toBe(0);
  expect(await debug(page)).toBeNull();
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
