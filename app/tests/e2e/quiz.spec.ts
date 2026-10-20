import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { middle, responseTimes, settled, touch, watchEventTiming } from "./touch";

/**
 * Milestone M4: one quiz, at the family's phone (873x393 CSS px at DPR
 * 2.75, touch only), in a Hebrew and an English browser. The child walks
 * to the cashier, talks, answers; the coins, the daily cap, Android's
 * back in the dialog and the question, and what is saved.
 */

test.describe.configure({ timeout: 240_000 });

const id = (s: string) => `[data-id="${s}"]`;
const PID = "p00001";

type Rect = { left: number; top: number; right: number; bottom: number };
interface Debug {
  ready: boolean;
  player: { x: number; y: number; facing: string; moving: boolean; steps: number };
  inFront: string | null;
  heroRect: Rect | null;
  paused: string[];
  loopRunning: boolean;
  music: { playing: boolean };
}
interface Quiz {
  phase: string;
  kind: string | null;
  answer: string | string[] | null;
  skill: string | null;
}
type W = { __nagmonMap?: { debug(): Debug | null }; __nagmonQuiz?: () => Quiz };

const debug = (page: Page) => page.evaluate(() => (window as unknown as W).__nagmonMap?.debug() ?? null);
const quiz = (page: Page) => page.evaluate(() => (window as unknown as W).__nagmonQuiz?.() ?? null);

/** The phone's local day, as the app writes it (core/world/worldState.ts localDay). */
const TODAY = `(() => { const d = new Date(); const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); })()`;

/**
 * A child straight into the browser's store (a made-up name), with the
 * question picker seeded. `world` is their saved coins and variables;
 * `{today}` in a variable's value is the phone's day.
 */
async function seedChild(
  page: Page,
  { grade = 2, settings = {} as Record<string, unknown>, world = null as null | { money: number; variables: Record<string, string> }, seed = 3 } = {},
) {
  await page.addInitScript(
    ({ grade, settings, world, seed, pid, today }) => {
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
      if (world) {
        const day = (0, eval)(today) as string;
        const variables = Object.fromEntries(Object.entries(world.variables).map(([k, v]) => [k, v.replace("{today}", day)]));
        localStorage.setItem(`nagmon-fs:d:profiles/${pid}/saves`, "");
        localStorage.setItem(`nagmon-fs:f:profiles/${pid}/saves/world.json`, JSON.stringify({ schema_version: 1, money: world.money, variables }));
      }
    },
    { grade, settings, world, seed, pid: PID, today: TODAY },
  );
}

/** A saved file of the child, as the app wrote it to the browser's store. */
async function saved(page: Page, file: string): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => {
    const v = localStorage.getItem(key);
    return v === null ? null : (JSON.parse(v) as Record<string, unknown>);
  }, `nagmon-fs:f:profiles/${PID}/${file}`);
}

async function openMap(page: Page) {
  await page.goto("/");
  await touch(page, page.locator(id(`child_${PID}`)));
  await expect(page.locator("[data-screen=play][data-map=ready][data-play=ready]")).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (window as unknown as W).__nagmonMap?.debug()?.ready);
}

/** Short taps on an arrow, one step each (as map.spec.ts: down and up sent together). */
async function steps(page: Page, dir: string, n: number) {
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

/** From the start (29,16) to (13,15), facing the cashier at (13,14). */
async function toCashier(page: Page) {
  expect((await debug(page))!.player).toMatchObject({ x: 29, y: 16 });
  // nobody to talk to at the start: the owl's words wait for M5
  await expect(page.locator(id("map_talk"))).toHaveCount(0);
  await steps(page, "left", 16);
  await steps(page, "up", 1);
  const d = (await debug(page))!;
  expect(d.player).toMatchObject({ x: 13, y: 15, facing: "up" });
  expect(d.inFront).toBe("nagmon_cashier");
  await expect(page.locator(id("map_talk"))).toBeVisible();
}

/** Taps through a dialog's pages until it closes; returns the pages' texts. */
async function readDialog(page: Page): Promise<string[]> {
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
async function answer(page: Page, how: "right" | "dont_know") {
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

const coins = (page: Page) => page.locator(id("coins"));

test.beforeEach(async ({ page }) => {
  await watchEventTiming(page);
});

test("the cashier: talk, a right answer (+20 coins), a 'don't know' (an explanation, no coins), all saved", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  await seedChild(page);
  await openMap(page);
  await expect(coins(page)).toHaveAttribute("data-coins", "0");
  await toCashier(page);
  await shot("q01_in_front_of_the_cashier");

  // the talk button: a real button of 48dp and more, beside the hero, not over it
  const talkBox = (await page.locator(id("map_talk")).boundingBox())!;
  expect(Math.min(talkBox.width, talkBox.height)).toBeGreaterThanOrEqual(48);
  const hero = (await debug(page))!.heroRect!;
  const apart = hero.right <= talkBox.x || hero.left >= talkBox.x + talkBox.width || hero.bottom <= talkBox.y || hero.top >= talkBox.y + talkBox.height;
  expect(apart, `hero ${JSON.stringify(hero)} and talk ${JSON.stringify(talkBox)}`).toBe(true);
  // the coins: small, at the top, away from the menu button
  const coinBox = (await coins(page).boundingBox())!;
  const menuBox = (await page.locator(id("map_menu")).boundingBox())!;
  expect(coinBox.y).toBeLessThan(60);
  expect(Math.abs(coinBox.x + coinBox.width / 2 - (menuBox.x + menuBox.width / 2))).toBeGreaterThan(400);

  await touch(page, page.locator(id("map_talk")));
  const layer = page.locator("[data-screen=dialog]");
  await expect(layer).toBeVisible();
  // the map holds still under the words, the music goes on, the arrows are gone
  const held = (await debug(page))!;
  expect(held.paused).toEqual(["talk"]);
  expect(held.loopRunning).toBe(false);
  await expect(page.locator(id("dpad"))).toHaveCount(0);
  // a tap while the line types out shows all of it, and stays on the page
  await expect(layer).toHaveAttribute("data-full", "false");
  await touch(page, page.locator(id("dialog")), 60);
  await expect(layer).toHaveAttribute("data-full", "true");
  await expect(layer).toHaveAttribute("data-page", "0");
  await shot("q02_dialog_hello");
  const hello = await readDialog(page);
  expect(hello).toEqual(["המוכר אבי: שלום! אני סופר את הכסף בקופה.", "אפשר לעזור לי עם חשבון קטן?"]);

  // the question, for a child in grade 2: the change from 20
  await expect(page.locator("[data-screen=quiz]")).toBeVisible();
  expect((await quiz(page))!.skill).toBe("math.money.change_20");
  await shot("q03_quiz");
  const before = (await responseTimes(page)).app.length;
  const q = await answer(page, "right");
  await expect(page.locator(id("quiz_headline"))).toHaveText(/נכון|סופר/);
  await expect(page.locator(id("quiz_explanation"))).not.toBeEmpty();
  await shot("q04_feedback_right");
  // the answer is saved at once, before "continue"
  await expect.poll(async () => (await saved(page, "learning.json"))?.["answers_total"]).toBe(1);
  await touch(page, page.locator(id("quiz_continue")));
  // the cashier pays 20 and thanks the child
  await expect(coins(page)).toHaveAttribute("data-coins", "20");
  const good = await readDialog(page);
  expect(good.join(" ")).toContain("הנה 20 מטבעות");
  await shot("q05_coins_20");
  await expect(page.locator(id("map_talk"))).toBeVisible();
  // the map runs again
  await expect.poll(async () => (await debug(page))!.paused).toEqual([]);

  // again, and "don't know": the right answer and how, no coins
  await touch(page, page.locator(id("map_talk")));
  await readDialog(page);
  const q2 = await answer(page, "dont_know");
  expect(q2.skill).toBe(q.skill);
  await expect(page.locator(id("quiz_headline"))).toHaveText("זה בסדר לא לדעת! ככה פותרים:");
  await expect(page.locator(id("quiz_answer"))).toContainText("התשובה:");
  await expect(page.locator(id("quiz_explanation"))).not.toBeEmpty();
  await shot("q06_feedback_dont_know");
  await touch(page, page.locator(id("quiz_continue")));
  const wrong = await readDialog(page);
  expect(wrong.join(" ")).toContain("כמעט!");
  await expect(coins(page)).toHaveAttribute("data-coins", "20");

  const times = (await responseTimes(page)).app.slice(before);
  console.log(`quiz taps, tap to drawn frame (ms): ${times.map(Math.round).join(" ")}`);
  expect(times.length).toBeGreaterThanOrEqual(4);

  // all of it is on disk: a new start finds the coins and both answers
  expect((await saved(page, "saves/world.json"))?.["money"]).toBe(20);
  const learner = (await saved(page, "learning.json"))!;
  expect([learner["answers_total"], learner["correct_total"]]).toEqual([2, 1]);
  await page.reload();
  await touch(page, page.locator(id(`child_${PID}`)));
  await expect(page.locator("[data-screen=play][data-play=ready]")).toBeVisible({ timeout: 30_000 });
  await expect(coins(page)).toHaveAttribute("data-coins", "20");
});

test("the daily prize: the third of the day pays, the fourth is praise only; the number pad", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  // two prizes already today, 40 coins; this child answers on the number pad
  await seedChild(page, {
    grade: 3,
    settings: { learning: { answer_mode: "number" } },
    world: { money: 40, variables: { nagmon_daily_cashier: "{today}:2" } },
  });
  await openMap(page);
  await expect(coins(page)).toHaveAttribute("data-coins", "40");
  await toCashier(page);

  await touch(page, page.locator(id("map_talk")));
  await readDialog(page);
  const q = await answer(page, "right");
  expect(q.kind).toBe("number");
  await touch(page, page.locator(id("quiz_continue")));
  await expect(coins(page)).toHaveAttribute("data-coins", "60");
  expect((await readDialog(page)).join(" ")).toContain("הנה 20 מטבעות");

  // the fourth right answer today: thanks and praise, no coins, no "come back tomorrow"
  await touch(page, page.locator(id("map_talk")));
  await readDialog(page);
  await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
  await shot("q07_number_pad");
  await answer(page, "right");
  await touch(page, page.locator(id("quiz_continue")));
  const free = await readDialog(page);
  expect(free).toEqual(["בדיוק! ספרת נכון.", "היום כבר עזרת לי הרבה. תודה!"]);
  await expect(coins(page)).toHaveAttribute("data-coins", "60");
  await shot("q08_praise_only");
  const world = (await saved(page, "saves/world.json"))!;
  expect(world["money"]).toBe(60);
  expect(String((world["variables"] as Record<string, string>)["nagmon_daily_cashier"])).toMatch(/:3$/);
});

test("Android's back in the dialog goes on in it, in the question closes it, and never leaves the map", async ({ page }) => {
  await seedChild(page);
  await openMap(page);
  await toCashier(page);
  await touch(page, page.locator(id("map_talk")));
  const layer = page.locator("[data-screen=dialog]");
  // Android's back: Escape in a browser (src/platform/backButton.ts)
  const back = () => page.keyboard.press("Escape");
  await expect(layer).toHaveAttribute("data-full", "false");
  await back();
  await expect(layer).toHaveAttribute("data-full", "true");
  await expect(layer).toHaveAttribute("data-page", "0");
  await back();
  await expect(layer).toHaveAttribute("data-page", "1");
  await expect(layer).toHaveAttribute("data-full", "true", { timeout: 10_000 });
  await back();
  // the question; back closes it with nothing counted
  await expect(page.locator("[data-screen=quiz]")).toBeVisible();
  await back();
  await expect(page.locator("[data-screen=quiz]")).toHaveCount(0);
  await expect(page.locator("[data-screen=dialog]")).toHaveCount(0);
  await expect(page.locator("[data-screen=play]")).toBeVisible();
  expect((await saved(page, "learning.json"))?.["answers_total"] ?? 0).toBe(0);
  await expect(coins(page)).toHaveAttribute("data-coins", "0");
  await expect.poll(async () => (await debug(page))!.paused).toEqual([]);
  // the map as before: talk again, or back opens the pause menu
  await expect(page.locator(id("map_talk"))).toBeVisible();
  await back();
  await expect(page.locator("[data-screen=map-menu]")).toBeVisible();
  await back();
  await expect(page.locator("[data-screen=map-menu]")).toHaveCount(0);
  // after an answer, back is "continue": the answer counts
  await touch(page, page.locator(id("map_talk")));
  await readDialog(page);
  await answer(page, "right");
  await back();
  await expect(coins(page)).toHaveAttribute("data-coins", "20");
  await expect(layer).toBeVisible();
});
