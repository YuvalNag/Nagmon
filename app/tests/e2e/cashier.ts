import { expect, type Page } from "@playwright/test";
import { middle, settled, touch } from "./touch";

/**
 * The walk to the cashier and a talk with her or him, for quiz.spec.ts and
 * quality.spec.ts: a child seeded straight into the browser's store, the
 * steps from the start, the dialog's pages, the question's answer.
 */

export const id = (s: string) => `[data-id="${s}"]`;
export const PID = "p00001";

export type Rect = { left: number; top: number; right: number; bottom: number };
export interface Debug {
  map: string | null;
  ready: boolean;
  player: { x: number; y: number; facing: string; moving: boolean; steps: number };
  inFront: string | null;
  heroRect: Rect | null;
  paused: string[];
  loopRunning: boolean;
  music: { playing: boolean };
}
export interface Quiz {
  phase: string;
  kind: string | null;
  answer: string | string[] | null;
  skill: string | null;
}
export type W = { __nagmonMap?: { debug(): Debug | null }; __nagmonQuiz?: () => Quiz };

export const debug = (page: Page) => page.evaluate(() => (window as unknown as W).__nagmonMap?.debug() ?? null);
export const quiz = (page: Page) => page.evaluate(() => (window as unknown as W).__nagmonQuiz?.() ?? null);

/** The phone's local day, as the app writes it (core/world/worldState.ts localDay). */
export const TODAY = `(() => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); })()`;

/**
 * A child straight into the browser's store (a made-up name), with the
 * question picker seeded. `world` is their saved coins and variables;
 * `{today}` in a variable's value is the phone's day.
 */
export async function seedChild(
  page: Page,
  { grade = 2, settings = {} as Record<string, unknown>, world = null as null | { money: number; variables: Record<string, string> }, seed = 3, intro = false, battle = false } = {},
) {
  await page.addInitScript(
    ({ grade, settings, world, seed, pid, today, intro, battle }) => {
      if (localStorage.getItem("seeded")) return;
      localStorage.setItem("seeded", "1");
      localStorage.setItem("nagmon.map.adaptiveResolution", "off");
      localStorage.setItem("nagmon.quiz.seed", String(seed));
      localStorage.setItem("nagmon-fs:d:profiles", "");
      localStorage.setItem(`nagmon-fs:d:profiles/${pid}`, "");
      localStorage.setItem(
        `nagmon-fs:f:profiles/${pid}/profile.json`,
        JSON.stringify({ id: pid, name: "תמר", avatar: "girl_teal", grade, order: 0, schema_version: 2, settings }),
      );
      // a child who has had the owl's intro, unless the test is about it
      if (world || !intro) {
        const day = (0, eval)(today) as string;
        const have = world ?? { money: 0, variables: {} };
        const variables = Object.fromEntries(Object.entries(have.variables).map(([k, v]) => [k, v.replace("{today}", day)]));
        if (!intro) variables["nagmon_intro_done"] = "yes";
        // a partner, Route 1 to start on, and a wild creature at every step in the grass
        const extra = battle ? { creatures: [{ id: "c1", species: "agnite", level: 6, xp: 0 }], seen: ["agnite"], caught: ["agnite"] } : {};
        if (battle) {
          localStorage.setItem("nagmon.map.start", "classic_route_1");
          localStorage.setItem("nagmon.encounter.always", "1");
        }
        localStorage.setItem(`nagmon-fs:d:profiles/${pid}/saves`, "");
        localStorage.setItem(`nagmon-fs:f:profiles/${pid}/saves/world.json`, JSON.stringify({ schema_version: 1, money: have.money, variables, ...extra }));
      }
    },
    { grade, settings, world, seed, pid: PID, today: TODAY, intro, battle },
  );
}

/** A saved file of the child, as the app wrote it to the browser's store. */
export async function saved(page: Page, file: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => {
    const v = localStorage.getItem(key);
    return v === null ? null : (JSON.parse(v) as Record<string, unknown>);
  }, `nagmon-fs:f:profiles/${PID}/${file}`);
}

export async function openMap(page: Page) {
  await page.goto("/");
  await touch(page, page.locator(id(`child_${PID}`)));
  await expect(page.locator("[data-screen=play][data-map=ready][data-play=ready]")).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (window as unknown as W).__nagmonMap?.debug()?.ready);
}

/** Short taps on an arrow, one step each (as map.spec.ts: down and up sent together). */
export async function steps(page: Page, dir: string, n: number) {
  const at = await middle(page.locator(id(`dpad_${dir}`)));
  await settled(page);
  const c = await page.context().newCDPSession(page);
  for (let i = 0; i < n; i++) {
    const before = (await debug(page))!.player.steps;
    await Promise.all([
      c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] }),
      c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
    ]);
    await page.waitForFunction((before) => {
      const p = (window as unknown as W).__nagmonMap!.debug()!.player;
      return p.steps > before && !p.moving;
    }, before);
  }
  await c.detach();
}

/** From the start (29,16) to (14,15), facing the cashier at (14,14) (the shop door at (13,13) stays free). */
export async function toCashier(page: Page) {
  expect((await debug(page))!.player).toMatchObject({ x: 29, y: 16 });
  // nobody to talk to at the start: the owl's words wait for M5
  await expect(page.locator(id("map_talk"))).toHaveCount(0);
  await steps(page, "left", 15);
  await steps(page, "up", 1);
  const d = (await debug(page))!;
  expect(d.player).toMatchObject({ x: 14, y: 15, facing: "up" });
  expect(d.inFront).toBe("nagmon_cashier");
  await expect(page.locator(id("map_talk"))).toBeVisible();
}

/** Taps through a dialog's pages until it closes; returns the pages' texts. */
export async function readDialog(page: Page): Promise<string[]> {
  const read: string[] = [];
  const layer = page.locator("[data-screen=dialog]");
  await expect(layer).toBeVisible();
  const pages = Number(await layer.getAttribute("data-pages"));
  for (let i = 0; i < pages; i++) {
    await expect(layer).toHaveAttribute("data-page", String(i));
    await expect(layer).toHaveAttribute("data-full", "true", { timeout: 10_000 });
    read.push((await page.locator(id("dialog")).getAttribute("aria-label"))!);
    await touch(page, page.locator(id("dialog")));
  }
  return read;
}

/** Answers the question showing: right, or "don't know". */
export async function answer(page: Page, how: "right" | "dont_know") {
  await expect(page.locator("[data-screen=quiz]")).toBeVisible();
  if ((await quiz(page))!.phase === "example") {
    await expect(page.locator(id("quiz_example"))).not.toBeEmpty();
    await touch(page, page.locator(id("quiz_example_done")));
  }
  await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
  const q = (await quiz(page))!;
  if (how === "dont_know") {
    await touch(page, page.locator(id("quiz_dont_know")));
  } else if (q.kind === "number") {
    for (const k of String(q.answer)) await touch(page, page.locator(id(`quiz_key_${k}`)));
    await expect(page.locator(id("quiz_typed"))).toHaveText(String(q.answer));
    await touch(page, page.locator(id("quiz_check")));
  } else {
    await touch(page, page.locator(id(`quiz_choice_${q.answer}`)));
  }
  await expect(page.locator("[data-screen=quiz][data-phase=feedback]")).toBeVisible();
  return q;
}

export const coins = (page: Page) => page.locator(id("coins"));
