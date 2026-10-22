import type { Page } from "@playwright/test";
import { castMove, debug, id, openMap, PID, quiz, readDialog, saved, seedChild, steps } from "./cashier";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * Medicine and the nurse, at the family's phone (873x393), at 100% and 130% text (docs/app/BATTLE_V3.md; FEATURES.md 4.2, 4.4):
 *  - the Bag outside a battle: a Wake Berry on a friend who fell asleep (the friend wakes, the berry is used up);
 *  - the Bag in a battle: an Energy Berry refills the partner's move, a Wake Berry wakes a sleeping friend;
 *  - the Rest Center's nurse wakes every sleeping friend, free (no coin is taken).
 * Every screen is audited for scrolling, cut-off text, overlapping buttons and fingers' size (48 CSS px).
 * The screenshots are looked at (test-results).
 */

test.describe.configure({ timeout: 300_000 });

const TEAM = [
  { id: "c1", species: "heliobud", level: 6, xp: 0 },
  { id: "c2", species: "lunibble", level: 6, xp: 0, fainted: true },
  { id: "c3", species: "terrabub", level: 6, xp: 0 },
];

async function scaled(page: Page, scale: number) {
  await page.addInitScript((s) => {
    const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
    set();
    document.addEventListener("DOMContentLoaded", set);
  }, scale);
}

/** The screen's buttons are a finger wide and inside the phone, nothing overlaps or is cut off in its box, nothing scrolls. */
async function audit(page: Page, screen: string, where: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const g = await page.evaluate((screen) => {
    const sheet = document.querySelector<HTMLElement>(`[data-screen=${screen}]`)!;
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { name: (e as HTMLElement).dataset["id"] ?? e.className.toString() ?? e.tagName, l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
    };
    const buttons = [...sheet.querySelectorAll<HTMLElement>("button")].filter(visible);
    const clipped = [...sheet.querySelectorAll<HTMLElement>("button, strong, small, p, span, h2, li")]
      .filter(visible)
      .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
      .filter((e) => getComputedStyle(e).display !== "inline")
      // a picture drawn as an emoji (aria-hidden) is not text
      .filter((e) => e.getAttribute("aria-hidden") !== "true")
      // the creature's picture box holds the drifting 💤 and the heart that pops: decoration that may leave its box
      .filter((e) => !e.classList.contains("rest-pic"))
      .map((e) => `${e.dataset["id"] ?? e.className ?? e.tagName} "${(e.textContent ?? "").slice(0, 24)}"`);
    // a button's own text must be inside the button
    const spill = buttons.flatMap((b) => {
      const r = b.getBoundingClientRect();
      return [...b.querySelectorAll<HTMLElement>("span, strong, small")]
        .filter(visible)
        .filter((c) => {
          const cr = c.getBoundingClientRect();
          return cr.left < r.left - 1 || cr.right > r.right + 1 || cr.top < r.top - 1 || cr.bottom > r.bottom + 1;
        })
        .map((c) => `${b.dataset["id"]}: ${c.className} "${(c.textContent ?? "").slice(0, 16)}"`);
    });
    return {
      vw: innerWidth,
      vh: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      sheetOverflow: sheet.scrollHeight > sheet.clientHeight + 1 || sheet.scrollWidth > sheet.clientWidth + 1,
      buttons: buttons.map((b) => ({ ...box(b), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })),
      clipped,
      spill,
    };
  }, screen);
  expect([g.scrollW <= g.vw, g.scrollH <= g.vh], `${where}: the page scrolls`).toEqual([true, true]);
  expect(g.sheetOverflow, `${where}: the screen overflows`).toBe(false);
  expect(g.clipped, `${where}: text is cut inside a box`).toEqual([]);
  expect(g.spill, `${where}: text sticks out of its button`).toEqual([]);
  for (const b of g.buttons) {
    expect(b.l, `${where}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.r, `${where}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vw + 0.5);
    expect(b.t, `${where}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.b, `${where}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vh + 0.5);
    expect(Math.min(b.w, b.h), `${where}: ${b.name} is under 48 (${Math.round(b.w)}x${Math.round(b.h)})`).toBeGreaterThanOrEqual(48);
  }
  for (let i = 0; i < g.buttons.length; i++)
    for (let j = i + 1; j < g.buttons.length; j++) {
      const a = g.buttons[i]!;
      const b = g.buttons[j]!;
      const apart = a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;
      expect(apart, `${where}: ${a.name} and ${b.name} overlap`).toBe(true);
    }
}

const world = async (page: Page) => (await saved(page, "saves/world.json")) as { money: number; items?: Record<string, number>; creatures: { id: string; fainted?: boolean }[] };

for (const scale of [1, 1.3]) {
  test(`the Bag outside a battle: a Wake Berry wakes a friend who fell asleep, at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-bag-${name}.png`) });
    await scaled(page, scale);
    await seedChild(page, { grade: 3, battle: true, creatures: TEAM, items: { wake_berry: 2, energy_berry: 1, dew_drop: 1 } });
    await openMap(page);
    await touch(page, page.locator(id("map_menu")));
    await touch(page, page.locator(id("map_bag")));
    await expect(page.locator("[data-screen=bag]")).toBeVisible();
    await touch(page, page.locator(id("bag_tab_snacks")));
    await expect(page.locator(id("bag_item_wake_berry"))).toContainText("x2");
    await shot("1-snacks");
    await audit(page, "bag", "bag, snacks tab");

    // the Wake Berry: it says who is asleep, and the use button is open
    await touch(page, page.locator(id("bag_item_wake_berry")));
    await expect(page.locator(id("bag_name"))).toContainText("תות הערה");
    await expect(page.locator(id("bag_use"))).toBeEnabled();
    await shot("2-wake-picked");
    await audit(page, "bag", "wake berry picked");
    // the Energy Berry and the Dew Drop work in a battle only: they say so, and cannot be used here
    await touch(page, page.locator(id("bag_item_energy_berry")));
    await expect(page.locator(id("bag_why"))).toBeVisible();
    await expect(page.locator(id("bag_use"))).toBeDisabled();
    await shot("3-energy-outside");
    await audit(page, "bag", "energy berry outside a battle");

    // the wake: pick the berry, "use", the sleeping friend, and only the sleeping one is offered
    await touch(page, page.locator(id("bag_item_wake_berry")));
    await touch(page, page.locator(id("bag_use")));
    await expect(page.locator("[data-id^=bag_who_]")).toHaveCount(1);
    await expect(page.locator(id("bag_who_c2"))).toContainText("💤");
    await shot("4-who");
    await audit(page, "bag", "who to wake");
    await touch(page, page.locator(id("bag_who_c2")));
    await expect(page.locator(id("bag_said"))).toBeVisible();
    await shot("5-woke");
    await audit(page, "bag", "woke up");
    await expect(page.locator(id("bag_item_wake_berry"))).toContainText("x1");
    await expect.poll(async () => (await world(page)).creatures.filter((c) => c.fainted).length).toBe(0);
    const w = await world(page);
    expect(w.items!["wake_berry"]).toBe(1);

    // nobody is asleep now: the next berry says so and waits
    await expect(page.locator(id("bag_use"))).toBeDisabled();
    await expect(page.locator(id("bag_why"))).toBeVisible();
  });

  test(`the Bag in a battle: an Energy Berry refills a move, a Wake Berry wakes a friend, at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-battle-bag-${name}.png`) });
    await scaled(page, scale);
    await seedChild(page, { grade: 1, battle: true, creatures: TEAM, items: { energy_berry: 2, wake_berry: 1 } });
    await openMap(page);
    await steps(page, "right", 1);
    await expect(page.locator("[data-screen=battle][data-view=meet]")).toBeVisible();
    await page.waitForTimeout(1000);

    const cards = () => page.evaluate(() => (window as unknown as { __nagmonBattle: () => { cards: { id: string; left: number | null }[]; team: { id: string; fainted: boolean }[] } }).__nagmonBattle());

    // nothing to refill yet: the berry waits and says why
    await touch(page, page.locator(id("battle_bag")), 30);
    await expect(page.locator("[data-screen=bag]")).toBeVisible();
    await touch(page, page.locator(id("bag_tab_snacks")), 30);
    await touch(page, page.locator(id("bag_item_energy_berry")), 30);
    await expect(page.locator(id("bag_use"))).toBeDisabled();
    await shot("1-nothing-to-refill");
    await audit(page, "bag", "in a battle, nothing to refill");
    await touch(page, page.locator(id("bag_close")), 30);
    await expect(page.locator("[data-screen=bag]")).toHaveCount(0);

    // one cast spends a charge of a move that has a few
    await castMove(page);
    if ((await quiz(page))!.phase === "example") await touch(page, page.locator(id("quiz_example_done")), 30);
    await touch(page, page.locator(id("quiz_dont_know")), 30);
    await expect(page.locator("[data-screen=battle][data-asking=false][data-turn=idle]").first()).toBeVisible({ timeout: 20_000 });
    const worn = (await cards()).cards.filter((c) => c.left !== null);
    expect(worn.length, "a move with charges").toBeGreaterThan(0);
    await shot("2-after-a-cast");

    // the Energy Berry: use, the partner, the Bag closes, the round goes on
    await touch(page, page.locator(id("battle_bag")), 30);
    await touch(page, page.locator(id("bag_tab_snacks")), 30);
    await touch(page, page.locator(id("bag_item_energy_berry")), 30);
    await expect(page.locator(id("bag_use"))).toBeEnabled();
    await shot("3-energy-picked");
    await audit(page, "bag", "in a battle, energy berry picked");
    await touch(page, page.locator(id("bag_use")), 30);
    await shot("4-energy-who");
    await audit(page, "bag", "in a battle, who gets the energy");
    await touch(page, page.locator(id("bag_who_c1")), 30);
    await expect(page.locator("[data-screen=bag]")).toHaveCount(0);
    await expect.poll(async () => (await world(page)).items?.["energy_berry"]).toBe(1);
    await expect(page.locator("[data-screen=battle][data-asking=false][data-turn=idle]").first()).toBeVisible({ timeout: 20_000 });
    // the move that was spent is full again
    const emptiest = worn.reduce((a, c) => (c.left! < a.left! ? c : a));
    const now = (await cards()).cards.find((c) => c.id === emptiest.id)!;
    expect(now.left!, `${emptiest.id} was ${emptiest.left}`).toBeGreaterThan(emptiest.left!);

    // the Wake Berry on the sleeping friend of the team (it costs the turn: the partner is awake)
    expect((await cards()).team.find((c) => c.id === "c2")!.fainted).toBe(true);
    await touch(page, page.locator(id("battle_bag")), 30);
    await touch(page, page.locator(id("bag_tab_snacks")), 30);
    await touch(page, page.locator(id("bag_item_wake_berry")), 30);
    await expect(page.locator(id("bag_use"))).toBeEnabled();
    await touch(page, page.locator(id("bag_use")), 30);
    await expect(page.locator("[data-id^=bag_who_]")).toHaveCount(1);
    await shot("5-wake-who");
    await audit(page, "bag", "in a battle, who to wake");
    await touch(page, page.locator(id("bag_who_c2")), 30);
    await expect(page.locator("[data-screen=bag]")).toHaveCount(0);
    await expect(page.locator("[data-screen=battle][data-asking=false][data-turn=idle]").first()).toBeVisible({ timeout: 20_000 });
    await shot("6-after-wake");
    // the menu's small buttons keep their one word on one line (at 130% "ממשיכים" once broke in the middle)
    const lines = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".action-bar button.small")].map((b) => {
        const text = [...b.childNodes].filter((n) => n.nodeType === 3 && (n.textContent ?? "").trim()).pop()!;
        const r = document.createRange();
        r.selectNodeContents(text);
        return { id: b.dataset["id"], lines: new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size };
      }),
    );
    for (const l of lines) expect(l.lines, `${l.id} breaks its word`).toBe(1);
    expect((await cards()).team.find((c) => c.id === "c2")!.fainted).toBe(false);
    const w = await world(page);
    expect(w.items!["wake_berry"] ?? 0).toBe(0);
    expect(w.creatures.filter((c) => c.fainted)).toEqual([]);
  });

  test(`the nurse at the Rest Center wakes the sleeping friends, free, at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-rest-${name}.png`) });
    await scaled(page, scale);
    await seedChild(page, { grade: 3 });
    await page.addInitScript((pid) => {
      if (localStorage.getItem("rest-seeded")) return;
      localStorage.setItem("rest-seeded", "1");
      localStorage.setItem("nagmon.map.start", "nagmon_rest_center");
      localStorage.setItem(
        `nagmon-fs:f:profiles/${pid}/saves/world.json`,
        JSON.stringify({
          schema_version: 1,
          money: 100,
          variables: { nagmon_intro_done: "yes", nagmon_kit: "yes" },
          creatures: [
            { id: "c1", species: "heliobud", level: 6, xp: 0, fainted: true },
            { id: "c2", species: "lunibble", level: 6, xp: 0, fainted: true },
            { id: "c3", species: "terrabub", level: 5, xp: 0 },
            { id: "c4", species: "heliobud", level: 4, xp: 0, fainted: true },
            { id: "c5", species: "lunibble", level: 4, xp: 0 },
          ],
          seen: ["heliobud", "lunibble", "terrabub"],
          caught: ["heliobud", "lunibble", "terrabub"],
          place: { map: "nagmon_rest_center", x: 6, y: 7, facing: "up" },
        }),
      );
    }, PID);
    await openMap(page);
    expect((await debug(page))!.map).toBe("nagmon_rest_center");
    await steps(page, "up", 1);
    expect((await debug(page))!.inFront).toBe("nagmon_house_nurse");
    await shot("0-map");
    await touch(page, page.locator(id("map_talk")));
    await readDialog(page);
    await expect(page.locator("[data-screen=rest][data-mode=main]")).toBeVisible();
    await expect(page.locator(id("rest_nurse"))).toHaveAttribute("data-asleep", "3");
    await shot("1-asleep");
    await audit(page, "rest", "rest center, friends asleep");

    // a friend tapped: only a heart pops (nothing is cured by it)
    await touch(page, page.locator(id("rest_nurse")));
    await expect(page.locator(id("rest_said"))).toContainText("3");
    await shot("2-healed");
    await audit(page, "rest", "rest center, healed");
    await expect(page.locator(id("rest_nurse"))).toHaveAttribute("data-asleep", "0");
    await expect(page.locator("[data-asleep=true]")).toHaveCount(0);
    await expect.poll(async () => (await world(page)).creatures.filter((c) => c.fainted).length).toBe(0);
    // free: no coin taken
    expect((await world(page)).money).toBe(100);

    // nobody left asleep: the nurse says so, and that is free too
    await touch(page, page.locator(id("rest_nurse")));
    await expect(page.locator(id("rest_said"))).toBeVisible();
    await shot("3-none-left");
    expect((await world(page)).money).toBe(100);
  });
}
