import type { CDPSession, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { middle, touch } from "./touch";

/**
 * A child who comes back is on the same map, on the same tile, facing
 * the same way: after the app went to the background and the page was
 * reloaded (the system ended it), and after leaving through the menu.
 * The phone's size, touch only; helpers as map.spec.ts.
 */
test.describe.configure({ timeout: 240_000 });

const id = (s: string) => `[data-id="${s}"]`;

interface Debug {
  ready: boolean;
  map: string;
  player: { x: number; y: number; facing: string; moving: boolean; steps: number; bumps: number };
}
type MapWindow = { __nagmonMap?: { debug(): Debug | null } };
const debug = (page: Page) => page.evaluate(() => (window as unknown as MapWindow).__nagmonMap?.debug() ?? null);

async function seedChild(page: Page, { name = "תמר", avatar = "girl_teal", adaptive = false, start = "" } = {}) {
  await page.addInitScript(
    ({ name, avatar, adaptive, start }) => {
      if (localStorage.getItem("seeded")) return;
      localStorage.setItem("seeded", "1");
      // the town's people are those of ten in the morning, whatever the machine's clock says
      localStorage.setItem("nagmon.clock.hour", "10");
      if (start) localStorage.setItem("nagmon.map.start", start);
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
    { name, avatar, adaptive, start },
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

async function cdp(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
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


/** Pretends the app went to the background: the page's visibility, which the lifecycle hears. */
async function hide(page: Page, hidden: boolean) {
  await page.evaluate((hidden) => {
    Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: hidden ? "hidden" : "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

/** Waits until the saved world holds this place (the write is asked for at once on a map change, and held back two seconds on steps). */
async function savedPlace(page: Page, at: { map: string; x: number; y: number; facing: string }) {
  await page.waitForFunction((at) => {
    const raw = localStorage.getItem("nagmon-fs:f:profiles/p00001/saves/world.json");
    const p = raw ? (JSON.parse(raw) as { place?: typeof at }).place : undefined;
    return !!p && p.map === at.map && p.x === at.x && p.y === at.y && p.facing === at.facing;
  }, at);
}

test("a child who left the town in the background comes back on the same tile, facing the same way", async ({ page }) => {
  await seedChild(page);
  await page.goto("/");
  let d = await openMap(page);
  expect(d.player).toMatchObject({ x: 29, y: 16 });
  await steps(page, "left", 3);
  await steps(page, "up", 1);
  d = (await debug(page))!;
  expect(d.player).toMatchObject({ x: 26, y: 15, facing: "up" });
  // the app goes to the background (the place is written), then the system ends it
  await hide(page, true);
  await savedPlace(page, { map: "classic_hearthrock_city", x: 26, y: 15, facing: "up" });
  await page.reload();
  await expect(page.locator("[data-screen=who-plays]")).toBeVisible();
  d = await openMap(page);
  expect(d.map).toBe("classic_hearthrock_city");
  expect(d.player).toMatchObject({ x: 26, y: 15, facing: "up", moving: false });
});

test("a child who left a house through the menu comes back inside, on the same tile", async ({ page }) => {
  await seedChild(page, { start: "nagmon_home" });
  await page.goto("/");
  let d = await openMap(page);
  expect(d.map).toBe("nagmon_home");
  const first = d.player;
  // the house has no start of its own: the middle (4,3), a wall above it
  expect(first).toMatchObject({ x: 4, y: 3 });
  await steps(page, "down", 1);
  d = (await debug(page))!;
  expect(d.player).toMatchObject({ x: 4, y: 4, facing: "down" });
  const here = { map: "nagmon_home", x: d.player.x, y: d.player.y, facing: d.player.facing };
  await leaveMap(page);
  await savedPlace(page, here);
  // the test's start hook is still set, and the saved place comes first
  d = await openMap(page);
  expect(d.map).toBe("nagmon_home");
  expect(d.player).toMatchObject({ x: here.x, y: here.y, facing: here.facing });
  // and after a reload as well
  await page.reload();
  d = await openMap(page);
  expect(d.player).toMatchObject({ x: here.x, y: here.y, facing: here.facing });
});

test("a saved tile that is a wall opens the town's own start", async ({ page }) => {
  await seedChild(page);
  await page.addInitScript(() => {
    if (localStorage.getItem("placed")) return;
    localStorage.setItem("placed", "1");
    const key = "nagmon-fs:f:profiles/p00001/saves/world.json";
    const w = JSON.parse(localStorage.getItem(key)!) as Record<string, unknown>;
    w["place"] = { map: "classic_hearthrock_city", x: 1, y: 0, facing: "left" };
    localStorage.setItem(key, JSON.stringify(w));
  });
  await page.goto("/");
  const d = await openMap(page);
  // (1,0) is a wall: the town's own start
  expect(d.map).toBe("classic_hearthrock_city");
  expect(d.player).toMatchObject({ x: 29, y: 16 });
});
