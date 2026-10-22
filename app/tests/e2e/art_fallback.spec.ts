import { openMap, seedChild, steps } from "./cashier";
import { expect, test } from "./fixtures";

/**
 * docs/app/ART_DELIVERY.md, A1: the game never needs the owner's pictures to be playable.
 * Every real file of the owner (art/, creature sheets, people, portraits, avatars) answers 404 here,
 * and the app is told to draw the placeholders: the "who plays" screen, the map and a battle all work,
 * and what they load is the placeholders, never a real file.
 */

test.describe.configure({ timeout: 240_000 });

const REAL = /\/game\/(art\/|avatars\/|sprites\/monsters\/|sprites\/portraits\/nagmon_|sprites\/npc\/nagmon_)/;

test("with no real art the game still plays, on placeholders", async ({ page }, info) => {
  const real: string[] = [];
  const placeholders: string[] = [];
  await page.route(REAL, (route) => {
    real.push(route.request().url());
    return route.fulfill({ status: 404, body: "" });
  });
  page.on("request", (r) => {
    if (r.url().includes("/game/placeholders/")) placeholders.push(r.url());
  });
  await page.addInitScript(() => localStorage.setItem("nagmon.art", "placeholder"));
  await seedChild(page, { grade: 2, battle: true });
  await openMap(page);
  await steps(page, "right", 1);
  await expect(page.locator("[data-screen=battle][data-view=meet]")).toBeVisible();
  await expect(page.locator(".scene-ground")).toHaveAttribute("data-backdrop", "backdrop_hearthrock");
  await page.screenshot({ path: info.outputPath("placeholders-battle.png") });
  // the backdrop is the placeholder's, loaded
  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLElement>(".scene-ground");
    return !!el && /placeholders\/art\/backdrops\/hearthrock\.png/.test(getComputedStyle(el).backgroundImage);
  });
  expect(placeholders.some((u) => u.includes("placeholders/art/backdrops/hearthrock.png"))).toBe(true);
  expect(placeholders.some((u) => u.includes("placeholders/sprites/monsters/"))).toBe(true);
  // no real picture of the owner was asked for
  expect(real).toEqual([]);
});
