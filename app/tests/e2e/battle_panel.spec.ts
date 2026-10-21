import type { Page } from "@playwright/test";
import { id, openMap, quiz, seedChild, steps } from "./cashier";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * The battle's question is part of the arena (docs/app/BATTLE.md, slice 1):
 * the creatures stay in view while the child thinks, the answers float
 * around the wild creature, the result plays at once, and the message box
 * closes by itself. At the family's phone (873x393), at 100% and 130% text.
 */

test.describe.configure({ timeout: 240_000 });

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

const apart = (a: Box, b: Box) => a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;

/** Where everything is, in CSS pixels. */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const boxes = (sel: string) =>
      [...document.querySelectorAll(sel)].map((e) => {
        const b = e.getBoundingClientRect();
        return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, name: (e as HTMLElement).dataset["id"] ?? e.className.toString() };
      });
    const section = document.querySelector<HTMLElement>("[data-screen=battle]")!;
    return {
      creatures: [...boxes(".battle-pic.mine .monster-pic"), ...boxes(".battle-pic.theirs .monster-pic"), ...boxes(".battle-child")],
      cover: [...boxes(".quiz-top"), ...boxes(".answer-ring > button"), ...boxes(".quiz-keys"), ...boxes(".quiz-foot > *"), ...boxes(".hud"), ...boxes(".message-box")],
      chips: boxes(".answer-ring > button"),
      buttons: boxes(".quiz-foot button, .answer-ring button, .quiz-keys button"),
      vw: innerWidth,
      vh: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      sectionOverflow: section.scrollHeight > section.clientHeight + 1 || section.scrollWidth > section.clientWidth + 1,
    };
  });
}

async function answerRight(page: Page) {
  const q = (await quiz(page))!;
  if (q.kind === "number") {
    for (const k of String(q.answer)) await touch(page, page.locator(id(`quiz_key_${k}`)));
    await touch(page, page.locator(id("quiz_check")));
  } else {
    await touch(page, page.locator(id(`quiz_choice_${q.answer}`)));
  }
}

async function toQuestion(page: Page, shot: (n: string) => Promise<unknown>) {
  await touch(page, page.locator(id("battle_fight")), 30);
  if ((await quiz(page))!.phase === "example") {
    await expect(page.locator("[data-screen=quiz][data-phase=example]")).toBeVisible();
    await shot("example");
    await touch(page, page.locator(id("quiz_example_done")), 30);
  }
  await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
}

for (const scale of [1, 1.3]) {
  test(`the question is a panel over the arena, the result plays at once, the box closes by itself, at ${scale * 100}% text`, async ({ page }, info) => {
    await page.addInitScript((s) => {
      const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
      set();
      document.addEventListener("DOMContentLoaded", set);
    }, scale);
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
    await seedChild(page, { grade: 2, battle: true });
    await openMap(page);
    await steps(page, "right", 1);
    await expect(page.locator("[data-screen=battle][data-view=meet]")).toBeVisible();
    await shot("meet");

    await toQuestion(page, shot);
    await expect(page.locator("[data-screen=battle]")).toHaveAttribute("data-asking", "true");
    // the arena stays: both creatures and the child are on screen, and nothing sits on them
    await expect(page.locator(".battle-pic.mine .monster-pic")).toBeVisible();
    await expect(page.locator(".battle-pic.theirs .monster-pic")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const g = await geometry(page);
    expect(g.creatures.length).toBe(3);
    for (const c of g.creatures) {
      expect(c.l).toBeGreaterThanOrEqual(0);
      expect(c.r).toBeLessThanOrEqual(g.vw);
      expect(c.t).toBeGreaterThanOrEqual(0);
      expect(c.b).toBeLessThanOrEqual(g.vh);
      for (const o of g.cover) expect(apart(c, o), `${c.name} is covered by ${o.name}`).toBe(true);
    }
    // the answers: big buttons, apart from each other; every button 48 and more; nothing scrolls
    for (const b of g.buttons) expect(Math.min(b.w, b.h), `${b.name} is under 48`).toBeGreaterThanOrEqual(48);
    for (let i = 0; i < g.chips.length; i++) for (let j = i + 1; j < g.chips.length; j++) expect(apart(g.chips[i]!, g.chips[j]!), "answers overlap").toBe(true);
    for (const o of g.cover) {
      expect(o.l, `${o.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
      expect(o.r, `${o.name} is cut off`).toBeLessThanOrEqual(g.vw + 0.5);
      expect(o.b, `${o.name} is cut off`).toBeLessThanOrEqual(g.vh + 0.5);
    }
    expect([g.scrollW <= g.vw, g.scrollH <= g.vh, g.sectionOverflow]).toEqual([true, true, false]);
    await shot("question");

    // a hint: the owl's bubble, and still nothing over the creatures
    if (await page.locator(id("quiz_hint")).isEnabled()) {
      await touch(page, page.locator(id("quiz_hint")), 30);
      await expect(page.locator('[data-id="quiz_hint_text"][data-hint=true]')).toBeVisible();
      const h = await geometry(page);
      for (const c of h.creatures) for (const o of h.cover) expect(apart(c, o), `${c.name} is covered by ${o.name} with a hint`).toBe(true);
      await shot("hint");
    }

    // a right answer: the result at once, in the arena; no separate feedback page
    const hpBefore = Number(await page.locator("[data-screen=battle]").getAttribute("data-hp"));
    await answerRight(page);
    const arena = page.locator("[data-screen=battle]");
    await expect(arena).toHaveAttribute("data-flow", "result");
    await expect(page.locator(".battle-scene")).toHaveAttribute("data-fx", "right");
    await expect(page.locator(".fx-number")).toBeVisible();
    expect(await page.locator(".fx-star").count()).toBeGreaterThan(1);
    await expect(page.locator(id("battle_result"))).toBeVisible();
    await expect(page.locator("[data-screen=quiz][data-phase=feedback]")).toHaveCount(0);
    await expect(page.locator(id("quiz_continue"))).toHaveCount(0);
    expect(Number(await arena.getAttribute("data-hp"))).toBeLessThan(hpBefore);
    await shot("result_right");
    const g2 = await geometry(page);
    for (const c of g2.creatures) for (const o of g2.cover.filter((x) => x.name.includes("message"))) expect(apart(c, o), `${c.name} is covered by the message box`).toBe(true);
    // the box closes by itself (no tap)
    await expect(arena).toHaveAttribute("data-view", /turn|calm/, { timeout: 5000 });
    await expect(page.locator(id("battle_next"))).toBeVisible();
    await shot("after_result");

    // a wrong answer: the harmless oops; "why?" is one tap away; a tap anywhere goes on
    await touch(page, page.locator(id("battle_next")), 30);
    await expect(page.locator("[data-screen=quiz][data-phase=question],[data-screen=quiz][data-phase=example]")).toBeVisible();
    if ((await quiz(page))!.phase === "example") await touch(page, page.locator(id("quiz_example_done")), 30);
    await touch(page, page.locator(id("quiz_dont_know")), 30);
    await expect(page.locator(".battle-scene")).toHaveAttribute("data-fx", "wrong");
    await expect(page.locator(".fx-oops")).toBeVisible();
    await expect(page.locator(".fx-number")).toHaveCount(0);
    await expect(page.locator(id("quiz_answer"))).toBeVisible();
    await shot("result_wrong");
    await touch(page, page.locator(id("battle_why")), 30);
    await expect(page.locator(id("quiz_explanation"))).not.toBeEmpty();
    await shot("why");
    // "why?" holds the box: it is still there after the usual time
    await page.waitForTimeout(2800);
    await expect(arena).toHaveAttribute("data-flow", "result");
    await touch(page, page.locator(id("battle_skip")), 30);
    await expect(arena).toHaveAttribute("data-view", "turn", { timeout: 3000 });
  });
}

test("calm effects: the system's 'reduce motion' makes the result a fade, not a flight", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedChild(page, { grade: 2, battle: true });
  await openMap(page);
  await steps(page, "right", 1);
  await expect(page.locator("[data-screen=battle][data-view=meet]")).toBeVisible();
  await toQuestion(page, (n) => page.screenshot({ path: info.outputPath(`calm-${n}.png`) }));
  await expect(page.locator("[data-screen=battle]")).toHaveAttribute("data-calm-fx", "true");
  await answerRight(page);
  await expect(page.locator(".battle-scene")).toHaveAttribute("data-fx", "right");
  expect(await page.locator(".fx-star").count()).toBe(1);
  await expect(page.locator(".fx-bolt")).toHaveCount(0);
  const moving = await page.evaluate(() => getComputedStyle(document.querySelector(".battle-pic.mine")!).animationName);
  expect(moving).toBe("none");
  await page.screenshot({ path: info.outputPath("calm-result.png") });
});
