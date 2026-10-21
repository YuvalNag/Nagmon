import type { Page } from "@playwright/test";
import { debug, id, openMap, PID, readDialog, saved, seedChild, steps } from "./cashier";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * The shop (docs/app/FEATURES.md 4.3), at the family's phone (873x393), at
 * 100% and 130% text: the child walks up to the shopkeeper in the shop,
 * talks, looks at the shelves, buys a net with the pay step (a wrong
 * amount first: "a bit more"), and the net is in the Bag. Grade 3: the
 * exact-change band.
 */

test.describe.configure({ timeout: 240_000 });

/** A child (grade 3, a partner, 100 coins, no starter kit) standing in the shop next to the shopkeeper. */
async function seedInShop(page: Page) {
  await seedChild(page, { grade: 3 });
  await page.addInitScript((pid) => {
    if (localStorage.getItem("shop-seeded")) return;
    localStorage.setItem("shop-seeded", "1");
    localStorage.setItem("nagmon.map.start", "nagmon_shop");
    localStorage.setItem(
      `nagmon-fs:f:profiles/${pid}/saves/world.json`,
      JSON.stringify({
        schema_version: 1,
        money: 100,
        variables: { nagmon_intro_done: "yes", nagmon_kit: "yes" },
        creatures: [{ id: "c1", species: "heliobud", level: 6, xp: 0 }],
        seen: ["heliobud"],
        caught: ["heliobud"],
        place: { map: "nagmon_shop", x: 4, y: 5, facing: "left" },
      }),
    );
  }, PID);
}

/** Nothing is cut off or scrolled, every button is a finger's size. */
async function layout(page: Page, name: string) {
  const g = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>("[data-screen=shop]")!;
    return {
      vw: innerWidth,
      vh: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      sheetOverflow: sheet.scrollHeight > sheet.clientHeight + 1 || sheet.scrollWidth > sheet.clientWidth + 1,
      buttons: [...sheet.querySelectorAll<HTMLElement>("button")].map((b) => {
        const r = b.getBoundingClientRect();
        return { name: b.dataset["id"] ?? b.textContent ?? "", l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
      }),
    };
  });
  expect([g.scrollW <= g.vw, g.scrollH <= g.vh], `${name}: the page scrolls`).toEqual([true, true]);
  expect(g.sheetOverflow, `${name}: the screen overflows`).toBe(false);
  for (const b of g.buttons) {
    expect(b.l, `${name}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.r, `${name}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vw + 0.5);
    expect(b.t, `${name}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.b, `${name}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vh + 0.5);
    expect(Math.min(b.w, b.h), `${name}: ${b.name} is under 48`).toBeGreaterThanOrEqual(48);
  }
}

for (const scale of [1, 1.3]) {
  test(`the shopkeeper's shelves, the pay step and the net in the Bag, at ${scale * 100}% text`, async ({ page }, info) => {
    await page.addInitScript((s) => {
      const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
      set();
      document.addEventListener("DOMContentLoaded", set);
    }, scale);
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
    await seedInShop(page);
    await openMap(page);

    // one step to the shopkeeper's counter, then a talk: the greeting, then the shelves
    expect((await debug(page))!.map).toBe("nagmon_shop");
    await steps(page, "left", 1);
    expect((await debug(page))!.inFront).toBe("nagmon_house_shopkeeper");
    await shot("map");
    await touch(page, page.locator(id("map_talk")));
    await readDialog(page);
    await expect(page.locator("[data-screen=shop][data-mode=browse]")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await layout(page, "nets shelf");
    await shot("shelf_nets");

    // three shelves, the nets first, each item with its price from the economy table
    for (const s of ["nets", "snacks", "helpers"]) await expect(page.locator(id(`shop_shelf_${s}`))).toBeVisible();
    await expect(page.locator(id("shop_item_magic_net"))).toContainText("30");
    await touch(page, page.locator(id("shop_shelf_snacks")));
    await expect(page.locator(id("shop_item_biscuit"))).toContainText("25");
    await layout(page, "snacks shelf");
    await shot("shelf_snacks");
    await touch(page, page.locator(id("shop_shelf_nets")));

    // the net: a wrong amount first (20 is a bit short), then the exact change
    await touch(page, page.locator(id("shop_item_magic_net")));
    await touch(page, page.locator(id("shop_buy")));
    await expect(page.locator("[data-screen=shop][data-mode=pay]")).toBeVisible();
    await layout(page, "pay");
    await shot("pay");
    await touch(page, page.locator(id("pay_coin_20")));
    await touch(page, page.locator(id("pay_go")));
    await expect(page.locator(id("pay"))).toHaveAttribute("data-say", "more", { timeout: 15_000 });
    await expect(page.locator(id("pay_say"))).toContainText("עוד קצת");
    await layout(page, "a bit more");
    await shot("more");
    expect(((await saved(page, "saves/world.json")) as { money: number }).money).toBe(100);
    await touch(page, page.locator(id("pay_coin_10")));
    await touch(page, page.locator(id("pay_go")));
    await expect(page.locator(id("shop_bought"))).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(id("shop_back"))).toHaveAttribute("data-back", "3");
    await layout(page, "bought");
    await shot("bought");

    // back on the shelf the card says how many the child has; the world is saved
    await touch(page, page.locator(id("shop_more")));
    await expect(page.locator(id("shop_item_magic_net"))).toContainText("x1");
    await expect(page.locator(id("shop_wallet"))).toHaveAttribute("data-coins", "73");
    const world = (await saved(page, "saves/world.json")) as { money: number; items?: Record<string, number> };
    expect(world.money).toBe(73);
    expect(world.items).toEqual({ magic_net: 1 });

    // and the Bag shows it
    await touch(page, page.locator(id("shop_close")));
    await expect(page.locator("[data-screen=shop]")).toHaveCount(0);
    await touch(page, page.locator(id("map_menu")));
    await touch(page, page.locator(id("map_bag")));
    await expect(page.locator(id("bag_item_magic_net"))).toContainText("x1");
    await shot("bag");
  });
}
