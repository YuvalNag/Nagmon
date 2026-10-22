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
  { grade = 2, settings = {} as Record<string, unknown>, world = null as null | { money: number; variables: Record<string, string> }, seed = 3, intro = false, battle = false, items = {} as Record<string, number>, creatures = null as null | Record<string, unknown>[], battleScale = 0.1, battleStart = {} as Record<string, number> } = {},
) {
  await page.addInitScript(
    ({ grade, settings, world, seed, pid, today, intro, battle, items, creatures, battleScale, battleStart }) => {
      if (localStorage.getItem("seeded")) return;
      localStorage.setItem("seeded", "1");
      localStorage.setItem("nagmon.map.adaptiveResolution", "off");
      localStorage.setItem("nagmon.quiz.seed", String(seed));
      // the people of the town are those of ten in the morning, whatever the machine's clock says
      localStorage.setItem("nagmon.clock.hour", "10");
      // a battle's draws are the same every run, and its beats are short unless a test wants the real ones (battle_v3.spec.ts)
      localStorage.setItem("nagmon.battle.seed", String(seed));
      if (battleScale !== 1) localStorage.setItem("nagmon.battle.timescale", String(battleScale));
      for (const [k, v] of Object.entries(battleStart)) localStorage.setItem(`nagmon.battle.${k}`, String(v));
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
        const extra = battle ? { creatures: creatures ?? [{ id: "c1", species: "heliobud", level: 6, xp: 0 }], seen: ["heliobud"], caught: ["heliobud"] } : {};
        if (battle) {
          localStorage.setItem("nagmon.map.start", "classic_route_1");
          localStorage.setItem("nagmon.encounter.always", "1");
        }
        localStorage.setItem(`nagmon-fs:d:profiles/${pid}/saves`, "");
        localStorage.setItem(`nagmon-fs:f:profiles/${pid}/saves/world.json`, JSON.stringify({ schema_version: 1, money: have.money, variables, ...extra, ...(Object.keys(items).length ? { items } : {}) }));
      }
    },
    { grade, settings, world, seed, pid: PID, today: TODAY, intro, battle, items, creatures, battleScale, battleStart },
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
  // the owl stands in front of the start and can be talked to now: every person of the world can (W1)
  expect((await debug(page))!.inFront).toBe("nagmon_owl");
  await expect(page.locator(id("map_talk"))).toBeVisible();
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

/** Answers the battle's question (a panel over the arena): right, or "don't know"; the result plays in the arena. */
export async function battleAnswer(page: Page, how: "right" | "dont_know" = "right") {
  await expect(page.locator("[data-screen=quiz]")).toBeVisible();
  if ((await quiz(page))!.phase === "example") await touch(page, page.locator(id("quiz_example_done")));
  await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
  const q = (await quiz(page))!;
  if (how === "dont_know") await touch(page, page.locator(id("quiz_dont_know")));
  else if (q.kind === "number") {
    for (const k of String(q.answer)) await touch(page, page.locator(id(`quiz_key_${k}`)));
    await touch(page, page.locator(id("quiz_check")));
  } else await touch(page, page.locator(id(`quiz_choice_${q.answer}`)));
  await expect(page.locator("[data-screen=battle]")).toHaveAttribute("data-flow", "result");
  return q;
}

/** The round plays out (the answer's line closes by itself, the enemy has its beat): waits for the menu to be back. */
export async function battleResultClosed(page: Page) {
  // the arena again with nothing playing, or what follows it: the level-up card, the new friend
  await expect(page.locator("[data-screen=battle][data-asking=false][data-turn=idle], [data-screen=battle-caught], [data-id=growth_close]").first()).toBeVisible({ timeout: 15_000 });
}

/** Casts the first move whose card is open: its question opens (the question is the cast). */
export async function castMove(page: Page, steps = 30) {
  const card = page.locator(".move-card:not(:disabled)").first();
  await expect(card).toBeVisible();
  await touch(page, card, steps);
}
