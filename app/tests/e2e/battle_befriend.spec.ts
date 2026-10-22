import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { id, openMap, saved, seedChild, steps } from "./cashier";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * Befriending, slice S3 (docs/app/BATTLE_V3.md 8 and 12.3): the Befriend tray at any time (one tap in the common
 * case), the chance as a word, the throw (about 4 s, skippable), a failed try (the creature sniffs the net, the word
 * moves) and a friend (the result card with a "Name it" chip). At the family's phone (873x393), at 100% and 130% text.
 * The draws of the shakes are set by the test ("0.999" fails on the first shake, "0" holds on all three).
 */

test.describe.configure({ timeout: 300_000 });

interface Probe {
  phase: string;
  mode: string;
  fog: number;
  maxFog: number;
  tray: boolean;
  tries: number;
  failed: number;
  word: string | null;
}
const probe = (page: Page) => page.evaluate(() => (window as unknown as { __nagmonBattle: () => Probe }).__nagmonBattle());
const arena = (page: Page) => page.locator("[data-screen=battle]");

async function start(page: Page, scale: number, o: { grade?: number; items?: Record<string, number>; dice?: string; fog?: number; creatures?: Record<string, unknown>[]; battleScale?: number } = {}) {
  await page.addInitScript((s) => {
    const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
    set();
    document.addEventListener("DOMContentLoaded", set);
  }, scale);
  await seedChild(page, {
    grade: o.grade ?? 3,
    battle: true,
    ...(o.items ? { items: o.items } : {}),
    ...(o.dice ? { befriendDice: o.dice } : {}),
    ...(o.fog ? { battleStart: { fog: o.fog } } : {}),
    ...(o.creatures ? { creatures: o.creatures } : {}),
    ...(o.battleScale ? { battleScale: o.battleScale } : {}),
  });
  await openMap(page);
  await steps(page, "right", 1);
  await expect(page.locator("[data-screen=battle][data-view=meet]")).toBeVisible();
  await page.waitForTimeout(1000);
}

/** Every tray button is 48 and more, inside the screen, apart from each other, with no text cut off inside it. */
async function auditTray(page: Page, where: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const g = await page.evaluate(() => {
    const els = [...document.querySelectorAll<HTMLElement>(".befriend-tray button, .tray-chance")];
    return {
      boxes: els.map((e) => {
        const b = e.getBoundingClientRect();
        return { name: e.dataset["id"] ?? e.className, l: b.left, t: b.top, r: b.right, b: b.bottom };
      }),
      clipped: els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map((e) => e.dataset["id"] ?? e.className),
      vw: innerWidth,
      vh: innerHeight,
      scroll: [document.documentElement.scrollWidth > innerWidth, document.documentElement.scrollHeight > innerHeight],
      pics: [...document.querySelectorAll(".battle-pic .monster-pic")].map((e) => e.getBoundingClientRect().bottom),
      trayTop: document.querySelector(".befriend-tray")!.getBoundingClientRect().top,
    };
  });
  expect(g.boxes.length, `${where}: the tray has its buttons`).toBeGreaterThanOrEqual(6);
  for (const b of g.boxes) {
    expect(Math.min(b.r - b.l, b.b - b.t), `${where}: ${b.name} is under 48`).toBeGreaterThanOrEqual(48);
    expect(b.l, `${where}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.r, `${where}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vw + 0.5);
    expect(b.b, `${where}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vh + 0.5);
  }
  const apart = (a: (typeof g.boxes)[0], b: (typeof g.boxes)[0]) => a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;
  for (let i = 0; i < g.boxes.length; i++) for (let j = i + 1; j < g.boxes.length; j++) expect(apart(g.boxes[i]!, g.boxes[j]!), `${where}: ${g.boxes[i]!.name} and ${g.boxes[j]!.name} overlap`).toBe(true);
  expect(g.clipped, `${where}: text is cut inside a box`).toEqual([]);
  expect(g.scroll, `${where}: something scrolls`).toEqual([false, false]);
  // the creatures above are not covered by the tray
  for (const bottom of g.pics) expect(bottom, `${where}: a creature is under the tray`).toBeLessThanOrEqual(g.trayTop + 1);
}

async function axe(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    `${where}: axe`,
  ).toEqual([]);
}

/** A level-up card may come with a friend: tap it away. */
async function growth(page: Page) {
  for (let i = 0; i < 10 && !(await page.locator("[data-screen=battle-caught]").count()); i++) {
    if (await page.locator(id("growth_close")).count()) await touch(page, page.locator(id("growth_close")), 30);
    await page.waitForTimeout(200);
  }
}

for (const scale of [1, 1.3]) {
  test(`befriend in the middle of a fight: the tray, a failed try, a friend; nothing clipped, 48dp, axe clean, at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
    // grade 3 (band B: no Mercy); the first try fails on shake 1 (the net does not come back: the draw 0.9), the second holds
    await start(page, scale, { grade: 3, items: { magic_net: 2, silver_net: 1, berry: 2, biscuit: 1, pie: 1 }, dice: "0.999,0.9,0,0,0,0", battleScale: 0.25 });
    await expect(page.locator(id("battle_befriend"))).toBeEnabled();
    expect((await probe(page)).phase).toBe("fighting");

    // ---- the tray: one tap, the chance as a word, Auto picked the best net ----
    await touch(page, page.locator(id("battle_befriend")), 30);
    await expect(page.locator(id("befriend_tray"))).toBeVisible();
    await expect(arena(page)).toHaveAttribute("data-tray", "true");
    const p1 = await probe(page);
    expect(p1.tray).toBe(true);
    // Auto picked the best net and the treat the creature likes (the child owns all three treats): any word is possible
    expect(p1.word).toMatch(/^(low|fair|good|great)$/);
    await expect(page.locator(id("befriend_chance"))).toContainText(/נמוך|סביר|טוב|מצוין/);
    await expect(page.locator(id("befriend_tool"))).toContainText("רשת");
    await expect(page.locator(id("befriend_treat"))).not.toHaveAttribute("data-empty", "true");
    await shot("1-tray");
    await auditTray(page, "tray");
    await axe(page, "tray");

    // a tap on the treat tile goes to the next thing owned (the last place is "none"), and the word follows the choice down
    const rank = ["low", "fair", "good", "great"];
    const withTreat = (await page.locator(id("befriend_chance")).getAttribute("data-word"))!;
    for (let i = 0; i < 4 && (await page.locator(id("befriend_treat")).getAttribute("data-empty")) !== "true"; i++) await touch(page, page.locator(id("befriend_treat")), 30);
    await expect(page.locator(id("befriend_treat"))).toHaveAttribute("data-empty", "true");
    const without = (await page.locator(id("befriend_chance")).getAttribute("data-word"))!;
    expect(rank.indexOf(without)).toBeLessThanOrEqual(rank.indexOf(withTreat));
    // the tool tile cycles the nets in the Bag
    const toolText = await page.locator(id("befriend_tool")).textContent();
    await touch(page, page.locator(id("befriend_tool")), 30);
    expect(await page.locator(id("befriend_tool")).textContent()).not.toBe(toolText);
    await shot("2-tray-other-tool");
    await auditTray(page, "tray other tool");
    // Auto goes back to the best net and the liked treat; Back closes the tray and the menu is there again
    await touch(page, page.locator(id("befriend_auto")), 30);
    expect(await page.locator(id("befriend_tool")).textContent()).toBe(toolText);
    await expect(page.locator(id("befriend_treat"))).not.toHaveAttribute("data-empty", "true");
    await touch(page, page.locator(id("befriend_back")), 30);
    await expect(page.locator(id("befriend_tray"))).toHaveCount(0);
    await expect(page.locator(".move-card")).toHaveCount(4);

    // ---- Throw: Befriend, Throw (2 taps) ----
    await touch(page, page.locator(id("battle_befriend")), 30);
    await touch(page, page.locator(id("befriend_throw")), 30);
    const layer = page.locator(id("befriend_throw"));
    await expect(layer).toBeVisible();
    await expect(layer).toHaveAttribute("data-result", "failed");
    await expect(layer).toHaveAttribute("data-failed-at", "1");
    await expect(layer).toHaveAttribute("data-step", /shake1|pop/, { timeout: 10_000 });
    await shot("3-throw");
    // nothing sits over the net but the skip layer: no text, no clipped button
    await expect(layer).toHaveCount(0, { timeout: 20_000 });
    // ---- the failed try: gentle, the fight goes on, pity is in ----
    const p2 = await probe(page);
    expect(p2).toMatchObject({ phase: "fighting", tries: 1, failed: 1, tray: false });
    await expect(page.locator(id("battle_message"))).toContainText("מריח את הרשת");
    await expect(page.locator(".battle-pic.theirs")).toBeVisible();
    await shot("4-failed");
    expect((await saved(page, "saves/world.json"))!["creatures"]).toHaveLength(1);

    // ---- the second try: the same choice, it holds on all three shakes ----
    await touch(page, page.locator(id("battle_befriend")), 30);
    await touch(page, page.locator(id("befriend_throw")), 30);
    await expect(page.locator(id("befriend_throw"))).toHaveAttribute("data-result", "caught");
    await growth(page);
    await expect(page.locator("[data-screen=battle-caught]")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(id("battle_name_chip"))).toBeVisible();
    await shot("5-friend");
    await axe(page, "result card");
    const btns = await page.locator("[data-screen=battle-caught] button").evaluateAll((els) => els.map((e) => ({ id: (e as HTMLElement).dataset["id"], w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height, r: e.getBoundingClientRect().right, b: e.getBoundingClientRect().bottom, clipped: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 })));
    for (const b of btns) {
      expect(Math.min(b.w, b.h), `${b.id} is under 48`).toBeGreaterThanOrEqual(48);
      expect(b.r, `${b.id} is cut off`).toBeLessThanOrEqual(873.5);
      expect(b.b, `${b.id} is cut off`).toBeLessThanOrEqual(393.5);
      expect(b.clipped, `${b.id} text is cut`).toBe(false);
    }
    await touch(page, page.locator(id("battle_befriend_next")), 30);
    await expect(arena(page)).toHaveCount(0);
    const world = (await saved(page, "saves/world.json"))!;
    expect(world["creatures"]).toHaveLength(2);
    // the kit's three nets and two more: the Silver Net went on the first try (it did not come back), the Magic Net on the second
    const items = world["items"] as Record<string, number>;
    expect(items["silver_net"]).toBeUndefined();
    expect(items["magic_net"]).toBe(4);
  });

  test(`a tap speeds the throw up and a second tap skips it; a card of the creature's subject is Auto's pick; at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
    // real beats (the throw takes about 4 s); heliobud (Math) meets a lunibble or similar: the Science card may not fit, the Math one is only a try
    await start(page, scale, { grade: 1, items: { magic_net: 1, friend_card_math: 1, friend_card_science: 1 }, dice: "0", battleScale: 1 });
    await touch(page, page.locator(id("battle_befriend")), 30);
    await expect(page.locator(id("befriend_tool"))).toBeVisible();
    await shot("1-tray-with-cards");
    await auditTray(page, "tray with cards");
    await touch(page, page.locator(id("befriend_throw")), 30);
    const layer = page.locator(id("befriend_throw"));
    await expect(layer).toBeVisible();
    const t0 = Date.now();
    await page.waitForTimeout(500);
    await shot("2-throw-fly");
    await touch(page, page.locator(id("befriend_throw_skip")), 30);
    await touch(page, page.locator(id("befriend_throw_skip")), 30);
    await growth(page);
    await expect(page.locator("[data-screen=battle-caught]")).toBeVisible({ timeout: 5_000 });
    // skipped: well under the 4 s of the full throw
    expect(Date.now() - t0).toBeLessThan(3500);
    await shot("3-friend");
  });
}
