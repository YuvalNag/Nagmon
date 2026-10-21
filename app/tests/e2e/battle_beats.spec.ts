import type { Locator, Page } from "@playwright/test";
import { id, openMap, powerUp, quiz, seedChild, steps } from "./cashier";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * The battle's beat menu (docs/app/BATTLE.md, slice 2): Move / Power-up /
 * friend, the charge meter, a Special's burst of three with round medals,
 * and the question cap that calms the creature by itself. A 7-year-old at
 * the family's phone (873x393), at 100% and 130% text.
 */

test.describe.configure({ timeout: 240_000 });

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}
const apart = (a: Box, b: Box) => a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;

/** Where the things of the arena are, in CSS pixels, and whether any text is cut inside its button. */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const boxes = (sel: string) =>
      [...document.querySelectorAll(sel)].map((e) => {
        const b = e.getBoundingClientRect();
        return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, name: (e as HTMLElement).dataset["id"] ?? e.className.toString() };
      });
    const section = document.querySelector<HTMLElement>("[data-screen=battle]")!;
    const clipped = [...document.querySelectorAll<HTMLElement>(".action-bar button, .quiz-foot button, .answer-ring button, .quiz-tiles button")]
      .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
      .map((e) => e.dataset["id"] ?? e.className);
    return {
      creatures: [...boxes(".battle-pic.mine .monster-pic"), ...boxes(".battle-pic.theirs .monster-pic"), ...boxes(".battle-child")],
      bar: boxes(".action-bar button"),
      hud: boxes(".hud"),
      cover: [...boxes(".quiz-top"), ...boxes(".answer-ring > button"), ...boxes(".quiz-tiles"), ...boxes(".quiz-keys"), ...boxes(".quiz-foot > *"), ...boxes(".hud"), ...boxes(".message-box")],
      clipped,
      vw: innerWidth,
      vh: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      sectionOverflow: section.scrollHeight > section.clientHeight + 1 || section.scrollWidth > section.clientWidth + 1,
    };
  });
}

/** Nothing overlaps, nothing is cut off, nothing scrolls, every button is 48 and more. */
async function audit(page: Page, where: string) {
  await page.evaluate(() => document.fonts.ready);
  const g = await geometry(page);
  for (const b of g.bar) {
    expect(Math.min(b.w, b.h), `${where}: ${b.name} is under 48`).toBeGreaterThanOrEqual(48);
    expect(b.l, `${where}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.r, `${where}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vw + 0.5);
    expect(b.b, `${where}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vh + 0.5);
  }
  for (let i = 0; i < g.bar.length; i++) for (let j = i + 1; j < g.bar.length; j++) expect(apart(g.bar[i]!, g.bar[j]!), `${where}: ${g.bar[i]!.name} and ${g.bar[j]!.name} overlap`).toBe(true);
  for (const c of g.creatures) {
    for (const o of g.cover) expect(apart(c, o), `${where}: ${c.name} is covered by ${o.name}`).toBe(true);
    for (const o of g.bar) expect(apart(c, o), `${where}: ${c.name} is covered by ${o.name}`).toBe(true);
  }
  expect(g.clipped, `${where}: text is cut inside a button`).toEqual([]);
  expect([g.scrollW <= g.vw, g.scrollH <= g.vh, g.sectionOverflow], `${where}: something scrolls`).toEqual([true, true, false]);
}

/** Answers the question open, whatever its look: right, or "don't know". */
async function answerOpen(page: Page, how: "right" | "dont_know") {
  if ((await quiz(page))!.phase === "example") {
    await touch(page, page.locator(id("quiz_example_done")), 30);
  }
  await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
  const q = (await quiz(page))!;
  if (how === "dont_know") await touch(page, page.locator(id("quiz_dont_know")), 30);
  else if (q.kind === "number") {
    for (const k of String(q.answer)) await touch(page, page.locator(id(`quiz_key_${k}`)), 30);
    await touch(page, page.locator(id("quiz_check")), 30);
  } else if (q.kind === "order") {
    for (const c of q.answer as unknown as string[]) await touch(page, page.locator(id(`quiz_tile_${c}`)), 30);
    await touch(page, page.locator(id("quiz_check")), 30);
  } else if (q.kind === "letters") {
    const tiles = page.locator("[data-id^=quiz_tile_]");
    const used = new Set<number>();
    const texts = await tiles.allTextContents();
    for (const ch of String(q.answer)) {
      const i = texts.findIndex((t, k) => !used.has(k) && t.trim().toLowerCase() === ch.toLowerCase());
      used.add(i);
      await touch(page, tiles.nth(i), 30);
    }
    await touch(page, page.locator(id("quiz_check")), 30);
  } else await touch(page, page.locator(id(`quiz_choice_${q.answer}`)), 30);
  await expect(page.locator("[data-screen=battle]")).toHaveAttribute("data-flow", "result");
}

/** The result's line closes by itself: the menu is back (or the level-up card, or what follows). */
async function closed(page: Page) {
  await expect(page.locator("[data-screen=battle][data-asking=false], [data-id=growth_close]").first()).toBeVisible({ timeout: 8000 });
  if (await page.locator(id("growth_close")).count()) await touch(page, page.locator(id("growth_close")), 30);
}

const arena = (page: Page) => page.locator("[data-screen=battle]");
const num = async (l: Locator, a: string) => Number(await l.getAttribute(a));

async function start(page: Page, scale: number, settings: Record<string, unknown> = {}) {
  await page.addInitScript((s) => {
    const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
    set();
    document.addEventListener("DOMContentLoaded", set);
  }, scale);
  // grade 1: seven years old, the youngest band (2 pips, a cap of 5 questions)
  await seedChild(page, { grade: 1, battle: true, settings });
  await openMap(page);
  await steps(page, "right", 1);
  await expect(page.locator("[data-screen=battle][data-view=meet]")).toBeVisible();
}

for (const scale of [1, 1.3]) {
  test(`the beat menu, the meter and a Special, at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
    await start(page, scale);
    const section = arena(page);
    await expect(section).toHaveAttribute("data-meter", "0");
    await audit(page, "menu");
    await shot("1-menu");
    // three big cards and four small buttons; Net waits, Move, Power-up and the friend are open
    expect(await page.locator(".action-bar button.card").count()).toBe(3);
    expect(await page.locator(".action-bar button.small").count()).toBe(4);
    for (const b of ["battle_move", "battle_fight", "battle_friend", "battle_bag", "battle_friends", "battle_run"]) await expect(page.locator(id(b))).toBeEnabled();
    await expect(page.locator(id("battle_net"))).toBeDisabled();
    for (const b of await page.locator(".action-bar button.card").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(72);

    // Move: free, no question, the fog goes down a little
    const hp0 = await num(section, "data-hp");
    await touch(page, page.locator(id("battle_move")), 30);
    await expect(section).toHaveAttribute("data-view", "free");
    expect(await quiz(page)).toBeNull();
    expect(await num(section, "data-hp")).toBeLessThan(hp0);
    expect(await num(section, "data-hp")).toBeGreaterThanOrEqual(Math.ceil(hp0 / 2));
    await expect(page.locator(".fx-number")).toBeVisible();
    await shot("2-move");
    await audit(page, "after Move");

    // Power-up: the only question; a right answer charges a pip
    await powerUp(page);
    await answerOpen(page, "right");
    await expect(section).toHaveAttribute("data-meter", "1");
    await expect(page.locator(id("battle_charge"))).toHaveAttribute("data-filled", "1");
    await shot("3-power-result");
    await closed(page);
    // never two questions in a row: the Power-up rests and says so; Move and the friend are open
    await expect(page.locator(id("battle_next"))).toBeDisabled();
    await expect(page.locator(id("battle_next"))).toContainText("קודם תנועה");
    await expect(page.locator(id("battle_move"))).toBeEnabled();
    await shot("4-rest");
    await audit(page, "Power-up resting");

    // the friend's assist: free, limited
    await touch(page, page.locator(id("battle_friend")), 30);
    await expect(section).toHaveAttribute("data-assists", "1");
    await expect(page.locator(id("battle_friend"))).toContainText("1");
    await expect(page.locator(id("battle_next"))).toBeEnabled();

    // a second right answer fills the meter (2 pips for a 7-year-old)
    await powerUp(page);
    await answerOpen(page, "right");
    await expect(section).toHaveAttribute("data-meter", "2");
    await expect(page.locator(id("battle_charge"))).toHaveAttribute("data-full", "true");
    await closed(page);
    if ((await section.getAttribute("data-view")) === "calm") {
      info.annotations.push({ type: "not-checked", description: "the fog was gone before the Special (a weak wild creature)" });
      return;
    }
    // Special takes Move's place, after one free beat
    await expect(page.locator(id("battle_special"))).toHaveCount(0);
    await touch(page, page.locator(id("battle_move")), 30);
    await expect(page.locator(id("battle_special"))).toBeVisible();
    await expect(page.locator(id("battle_move"))).toHaveCount(0);
    await shot("5-special-ready");
    await audit(page, "Special ready");

    // the burst: three questions, no menu between them, round medals fill
    await touch(page, page.locator(id("battle_special")), 30);
    await expect(page.locator(id("battle_combo"))).toBeVisible();
    await expect(page.locator("#root .medal, .medal")).toHaveCount(3);
    await expect(section).toHaveAttribute("data-meter", "0");
    let hits = 0;
    for (let i = 0; i < 3; i++) {
      await expect(page.locator("[data-screen=quiz]")).toBeVisible();
      await answerOpen(page, "right");
      hits++;
      await expect(page.locator(".medal[data-state=hit]")).toHaveCount(hits);
      if (i === 0) {
        await shot("6-burst-hit");
        await audit(page, "burst result");
      }
      // the next question follows at once, no menu between (or the fog is gone: calm)
      await expect(page.locator("[data-screen=battle][data-flow=asking], [data-id=growth_close]").first()).toBeVisible({ timeout: 8000 });
      if ((await page.locator(id("growth_close")).count()) || (await section.getAttribute("data-view")) !== "question") break;
    }
    if (await page.locator(id("growth_close")).count()) await touch(page, page.locator(id("growth_close")), 30);
    // three hits calm it (a third of the fog each), or the fog was gone sooner
    await expect(section).toHaveAttribute("data-view", "calm");
    expect(await num(section, "data-hp")).toBe(0);
    await expect(page.locator(id("battle_net"))).toBeEnabled();
    await shot("7-calm");
    await audit(page, "calm");
  });
}

test("a run of wrong answers never traps the child: at the cap the creature calms by itself, at 130% text", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`cap-${name}.png`) });
  await start(page, 1.3);
  const section = arena(page);
  for (let i = 1; i <= 5; i++) {
    await powerUp(page);
    await answerOpen(page, "dont_know");
    await expect(page.locator(".fx-oops")).toBeVisible();
    // the meter neither fills nor empties on a wrong answer
    await expect(section).toHaveAttribute("data-meter", "0");
    if (i === 1) await shot("wrong");
    await closed(page);
    if (i < 5) await expect(section).toHaveAttribute("data-view", /turn|free/);
  }
  await expect(section).toHaveAttribute("data-view", "calm");
  await expect(page.locator(id("battle_message"))).toContainText("התעייף");
  expect(await num(section, "data-hp")).toBe(0);
  await expect(page.locator(id("battle_net"))).toBeEnabled();
  await shot("calm");
  await audit(page, "capped");
});
