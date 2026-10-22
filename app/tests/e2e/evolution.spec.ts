import type { Page } from "@playwright/test";
import { castMove, id, openMap, PID, quiz, readDialog, saved, seedChild, steps } from "./cashier";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * Growth and evolution (docs/app/BATTLE_V3.md 7, slice S4) at the family's phone (873x393), at 100% and 130% text:
 *  - the Friends screen: the checklist of the gates, the gold ring, Evolve, the scene and the new form, "Keep small";
 *  - the scene itself at its real length (beats, the name card inside the phone, skip, "continue");
 *  - the shop's cards shelf and an Evolution Card used from the Bag (the card is used up, no Shimmer);
 *  - a fight that ends with "feels something warm": Evolve, the scene, back to the fight's end.
 * Every screen is audited for scrolling, cut-off text, overlapping buttons and fingers' size (48 CSS px); the
 * screenshots are looked at (test-results).
 */

test.describe.configure({ timeout: 300_000 });

const PARTY = [
  { id: "c1", species: "heliobud", level: 12, xp: 0, knowHow: 40, hearts: 2 },
  { id: "c2", species: "lunibble", level: 6, xp: 0 },
];
const LEARNED = { lessons: { done: ["solar_system"], repeatDay: null, charges: 0 } };

async function scaled(page: Page, scale: number) {
  await page.addInitScript((s) => {
    const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
    set();
    document.addEventListener("DOMContentLoaded", set);
  }, scale);
}

/** The screen's buttons are a finger wide and inside the phone, nothing overlaps or is cut off in its box, nothing scrolls. */
async function audit(page: Page, screen: string, where: string, opts: { scrolls?: string } = {}) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const g = await page.evaluate(
    ({ screen, scrolls }) => {
      const sheet = document.querySelector<HTMLElement>(`[data-screen=${screen}]`)!;
      const visible = (e: Element) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
      };
      const box = (e: Element) => {
        const r = e.getBoundingClientRect();
        return { name: (e as HTMLElement).dataset["id"] ?? e.className.toString() ?? e.tagName, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
      };
      const buttons = [...sheet.querySelectorAll<HTMLElement>("button")].filter(visible).filter((b) => !b.classList.contains("skip-layer")).filter((b) => (scrolls ? !b.closest(scrolls) : true));
      const clipped = [...sheet.querySelectorAll<HTMLElement>("button, strong, small, p, span, h2, li, b")]
        .filter(visible)
        .filter((e) => (scrolls ? !e.closest(scrolls) : true))
        .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
        .filter((e) => getComputedStyle(e).display !== "inline")
        .filter((e) => e.getAttribute("aria-hidden") !== "true")
        .map((e) => `${e.dataset["id"] ?? e.className ?? e.tagName} "${(e.textContent ?? "").slice(0, 24)}"`);
      const inside = [...sheet.querySelectorAll<HTMLElement>("[data-id=evolve_card] *, [data-id=evolve_card]")].filter(visible).map(box);
      return {
        vw: innerWidth,
        vh: innerHeight,
        scrollW: document.documentElement.scrollWidth,
        scrollH: document.documentElement.scrollHeight,
        sheetOverflow: scrolls ? false : sheet.scrollHeight > sheet.clientHeight + 1 || sheet.scrollWidth > sheet.clientWidth + 1,
        buttons: buttons.map(box),
        clipped,
        inside,
      };
    },
    { screen, scrolls: opts.scrolls ?? null },
  );
  expect([g.scrollW <= g.vw, g.scrollH <= g.vh], `${where}: the page scrolls`).toEqual([true, true]);
  expect(g.sheetOverflow, `${where}: the screen overflows`).toBe(false);
  expect(g.clipped, `${where}: text is cut inside a box`).toEqual([]);
  for (const b of g.buttons) {
    expect(b.l, `${where}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.r, `${where}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vw + 0.5);
    expect(b.t, `${where}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.b, `${where}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vh + 0.5);
    expect(Math.min(b.w, b.h), `${where}: ${b.name} is under 48 (${Math.round(b.w)}x${Math.round(b.h)})`).toBeGreaterThanOrEqual(48);
  }
  for (const b of g.inside) {
    expect(b.l, `${where}: ${b.name} leaves the phone`).toBeGreaterThanOrEqual(-0.5);
    expect(b.r, `${where}: ${b.name} leaves the phone`).toBeLessThanOrEqual(g.vw + 0.5);
    expect(b.b, `${where}: ${b.name} leaves the phone`).toBeLessThanOrEqual(g.vh + 0.5);
  }
  for (let i = 0; i < g.buttons.length; i++)
    for (let j = i + 1; j < g.buttons.length; j++) {
      const a = g.buttons[i]!;
      const b = g.buttons[j]!;
      expect(a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5, `${where}: ${a.name} and ${b.name} overlap`).toBe(true);
    }
}

type World = { items?: Record<string, number>; money: number; creatures: { id: string; species: string; level: number; shimmer?: boolean; keepSmall?: boolean; knowHow?: number }[]; caught?: string[] };
const world = async (page: Page) => (await saved(page, "saves/world.json")) as World;

/** The shop scene of shop.spec.ts: a child in the shop next to the shopkeeper, with what the test wants in the world file. */
async function inShop(page: Page, extra: Record<string, unknown>) {
  await seedChild(page, { grade: 3 });
  await page.addInitScript(
    ({ pid, extra }) => {
      if (localStorage.getItem("shop-seeded")) return;
      localStorage.setItem("shop-seeded", "1");
      localStorage.setItem("nagmon.map.start", "nagmon_shop");
      localStorage.setItem(`nagmon-fs:f:profiles/${pid}/saves/world.json`, JSON.stringify({ schema_version: 1, variables: { nagmon_intro_done: "yes", nagmon_kit: "yes" }, seen: ["heliobud"], caught: ["heliobud"], place: { map: "nagmon_shop", x: 4, y: 5, facing: "left" }, ...extra }));
    },
    { pid: PID, extra },
  );
}

for (const scale of [1, 1.3]) {
  test(`the Friends screen: the checklist, the gold ring, Evolve, the scene at its real length, the new form, at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-friends-${name}.png`) });
    await scaled(page, scale);
    // the real beats (a scale of 1): the scene is audited at its name card
    await seedChild(page, { grade: 3, battle: true, creatures: PARTY, worldExtra: LEARNED, stars: { math: 2 }, battleScale: 1 });
    await openMap(page);
    await touch(page, page.locator(id("map_menu")));
    await touch(page, page.locator(id("map_friends")));
    await expect(page.locator("[data-screen=friends]")).toBeVisible();

    // every gate met: the gold ring, the checklist of five ticks, Evolve
    await expect(page.locator("[data-id=friend_c1][data-ready=true]")).toBeVisible();
    await expect(page.locator("[data-gate]")).toHaveCount(5);
    await expect(page.locator("[data-gate][data-met=true]")).toHaveCount(5);
    await expect(page.locator(id("friend_evolve"))).toBeVisible();
    await shot("1-ready");
    await audit(page, "friends", "friends, ready to evolve", { scrolls: ".friend-detail" });

    // the other friend is far from it: the checklist shows what is missing, and in which subject to practise
    await touch(page, page.locator(id("friend_c2")));
    await expect(page.locator("[data-id=friend_c2][data-ready=true]")).toHaveCount(0);
    await expect(page.locator("[data-gate][data-met=false]").first()).toBeVisible();
    await expect(page.locator(id("friend_evolve"))).toHaveCount(0);
    await shot("2-missing");
    await audit(page, "friends", "friends, gates missing", { scrolls: ".friend-detail" });

    // Keep small: the ribbon stays, the ring stays off, and it comes off again
    await touch(page, page.locator(id("friend_c1")));
    await touch(page, page.locator(id("friend_keep_small")));
    await expect(page.locator("[data-id=friend_c1][data-ready=true]")).toHaveCount(0);
    await expect(page.locator(id("friend_keep_small"))).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await world(page)).creatures[0]!.keepSmall).toBe(true);
    await touch(page, page.locator(id("friend_keep_small")));
    await expect(page.locator("[data-id=friend_c1][data-ready=true]")).toBeVisible();

    // Evolve: the species has changed at once (saved); the scene plays its ten beats
    await touch(page, page.locator(id("friend_evolve")));
    await expect(page.locator("[data-screen=evolution]")).toBeVisible();
    await expect.poll(async () => (await world(page)).creatures[0]!.species).toBe("heliolynx");
    await expect(page.locator("[data-screen=evolution]")).toHaveAttribute("data-beat", "B0");
    await shot("3-b0");
    const seen: string[] = [];
    for (let i = 0; i < 200; i++) {
      const beat = await page.locator("[data-screen=evolution]").getAttribute("data-beat");
      if (beat && seen.at(-1) !== beat) {
        seen.push(beat);
        if (beat === "B3" || beat === "B5") await shot(`4-${beat.toLowerCase()}`);
      }
      if (beat === "B7") break;
      await page.waitForTimeout(100);
    }
    expect(seen, "the beats in order").toEqual(["B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7"]);
    await page.waitForTimeout(1300);
    await expect(page.locator(id("evolve_card"))).toContainText("הפך");
    await expect(page.locator(id("evolve_shimmer"))).toBeVisible();
    await shot("5-name-card");
    await audit(page, "evolution", "the name card");
    await touch(page, page.locator(id("evolve_done")));
    await expect(page.locator("[data-screen=evolution]")).toHaveCount(0);

    // back on the Friends screen: the new form, with its Shimmer, no longer asking
    await expect(page.locator("[data-screen=friends]")).toBeVisible();
    await expect(page.locator(id("friend_shimmer"))).toBeVisible();
    await expect(page.locator(id("friend_evolve"))).toHaveCount(0);
    await shot("6-after");
    await audit(page, "friends", "friends, evolved", { scrolls: ".friend-detail" });
    const w = await world(page);
    expect(w.creatures[0]).toMatchObject({ species: "heliolynx", level: 12, shimmer: true, knowHow: 40 });
    expect(w.caught).toContain("heliolynx");
  });

  test(`the scene: a tap skips the rest after 1.4 s and the name card is still read, at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-skip-${name}.png`) });
    await scaled(page, scale);
    await seedChild(page, { grade: 3, battle: true, creatures: PARTY, worldExtra: LEARNED, stars: { math: 2 }, battleScale: 1 });
    await openMap(page);
    await touch(page, page.locator(id("map_menu")));
    await touch(page, page.locator(id("map_friends")));
    await touch(page, page.locator(id("friend_evolve")));
    await expect(page.locator("[data-screen=evolution][data-beat=B1]")).toBeVisible();
    const t0 = Date.now();
    // after 1.4 s of the plan a tap speeds up the rest (3x); the name card still shows, then the scene ends by itself
    await page.waitForTimeout(1300);
    await touch(page, page.locator(id("evolve_skip")), 30, { settle: false });
    await expect(page.locator("[data-screen=evolution][data-beat=B7]")).toBeVisible({ timeout: 10_000 });
    await shot("b7");
    expect(Date.now() - t0, "a skipped scene reaches the name card well before 7.6 s").toBeLessThan(5500);
    await expect(page.locator("[data-screen=evolution]")).toHaveCount(0, { timeout: 15_000 });
    expect(Date.now() - t0, "a skipped scene is over well before 10.6 s").toBeLessThan(9000);
    expect((await world(page)).creatures[0]!.species).toBe("heliolynx");
  });

  test(`the shop's cards shelf, buying a Zone Card, and using it from the Bag: the friend grows, the card is used up, no Shimmer, at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-card-${name}.png`) });
    await scaled(page, scale);
    await inShop(page, {
      money: 200,
      creatures: [
        { id: "c1", species: "lunibble", level: 9, xp: 0 },
        { id: "c2", species: "heliobud", level: 9, xp: 0 },
      ],
      trips: { done: ["solar/moon"], visited: [], badges: [], at: null },
    });
    await openMap(page);
    await steps(page, "left", 1);
    await touch(page, page.locator(id("map_talk")));
    await readDialog(page);
    await expect(page.locator("[data-screen=shop][data-mode=browse]")).toBeVisible();
    await touch(page, page.locator(id("shop_shelf_cards")));
    await expect(page.locator("[data-screen=shop][data-shelf=cards]")).toBeVisible();
    // the first finished zone stands in for the first Keeper: the six Subject Cards (200) and the Moon's Zone Card (120)
    await expect(page.locator("[data-id^=shop_item_]")).toHaveCount(7);
    await expect(page.locator(id("shop_item_zone_card_moon"))).toContainText("120");
    await expect(page.locator(id("shop_item_subject_card_math"))).toContainText("200");
    await expect(page.locator(id("shop_item_bright_card"))).toHaveCount(0);
    await shot("1-shelf");
    await audit(page, "shop", "the cards shelf", { scrolls: ".shop-grid" });

    // 120 = 50 + 50 + 20, the exact change
    await touch(page, page.locator(id("shop_item_zone_card_moon")));
    await touch(page, page.locator(id("shop_buy")));
    await expect(page.locator("[data-screen=shop][data-mode=pay]")).toBeVisible();
    await shot("2-pay");
    await audit(page, "shop", "paying for a card", { scrolls: ".pay-coins" });
    await touch(page, page.locator(id("pay_coin_50")));
    await touch(page, page.locator(id("pay_coin_50")));
    await touch(page, page.locator(id("pay_coin_20")));
    await touch(page, page.locator(id("pay_go")));
    await expect(page.locator(id("shop_bought"))).toBeVisible({ timeout: 20_000 });
    await shot("3-bought");
    await expect.poll(async () => (await world(page)).items?.["zone_card_moon"]).toBe(1);
    // an exact first try gives a tenth back: 12
    expect((await world(page)).money).toBe(200 - 108);
    await touch(page, page.locator(id("shop_more")));
    await touch(page, page.locator(id("shop_close")));
    await expect(page.locator("[data-screen=shop]")).toHaveCount(0);

    // the Bag: the card is in Tools; it asks who, and offers only the Moon friend
    await touch(page, page.locator(id("map_menu")));
    await touch(page, page.locator(id("map_bag")));
    await touch(page, page.locator(id("bag_tab_tools")));
    await touch(page, page.locator(id("bag_item_zone_card_moon")));
    await expect(page.locator(id("bag_name"))).toContainText("כרטיס התפתחות הירח");
    await shot("4-bag");
    await audit(page, "bag", "the card in the Bag");
    await touch(page, page.locator(id("bag_use")));
    await expect(page.locator("[data-id^=bag_who_]")).toHaveCount(1);
    await expect(page.locator(id("bag_who_c1"))).toBeVisible();
    await shot("5-who");
    await audit(page, "bag", "who grows");
    await touch(page, page.locator(id("bag_who_c1")));
    await expect(page.locator("[data-screen=evolution]")).toBeVisible();
    await expect.poll(async () => (await world(page)).creatures[0]!.species).toBe("lunihare");
    await expect(page.locator("[data-screen=evolution]")).toHaveCount(0, { timeout: 20_000 });
    const w = await world(page);
    expect(w.creatures[0]!.shimmer).toBeUndefined();
    expect(w.items?.["zone_card_moon"] ?? 0).toBe(0);
    await expect(page.locator("[data-screen=bag]")).toBeVisible();
  });

  test(`a fight that ends with "feels something warm": Evolve, the scene, and the fight's end after it, at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-fight-${name}.png`) });
    await scaled(page, scale);
    // the wild creature has 1 Fog: the first answer calms it
    await seedChild(page, { grade: 3, battle: true, creatures: PARTY, worldExtra: LEARNED, stars: { math: 2 }, battleStart: { fog: 1 } });
    await openMap(page);
    await steps(page, "right", 1);
    await expect(page.locator("[data-screen=battle][data-view=meet]")).toBeVisible();
    await page.waitForTimeout(800);
    await castMove(page);
    if ((await quiz(page))!.phase === "example") await touch(page, page.locator(id("quiz_example_done")), 30);
    await touch(page, page.locator(id("quiz_dont_know")), 30);

    // never in the middle of the fight: the offer comes with the end of it
    await expect(page.locator("[data-screen=evolve-offer]")).toBeVisible({ timeout: 30_000 });
    expect((await world(page)).creatures[0]!.species).toBe("heliobud");
    await shot("1-offer");
    await audit(page, "evolve-offer", "the offer");
    await touch(page, page.locator(id("evolve_go")));
    await expect(page.locator("[data-screen=evolution]")).toBeVisible();
    await expect.poll(async () => (await world(page)).creatures[0]!.species).toBe("heliolynx");
    await expect(page.locator("[data-screen=evolution]")).toHaveCount(0, { timeout: 30_000 });
    // back at the fight's end: the calm creature, the Befriend tray
    await expect(page.locator("[data-screen=battle]")).toBeVisible();
    await expect(page.locator(id("befriend_tray"))).toBeVisible({ timeout: 10_000 });
    await shot("2-after");
  });
}
