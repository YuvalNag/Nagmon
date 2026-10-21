import { id, openMap, seedChild, steps } from "./cashier";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * The second batch of art (docs/app/ART_ASSETS.md): the zone's backdrop in
 * the battle and the owl's story cards in the intro, at the family's phone
 * (873x393), at 100% and 130% text. The pictures are loaded, cover the
 * screen, and nothing the child needs is cut off.
 */

test.describe.configure({ timeout: 240_000 });

const text = (scale: number) => async ({ page }: { page: import("@playwright/test").Page }) => {
  await page.addInitScript((s) => {
    const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
    set();
    document.addEventListener("DOMContentLoaded", set);
  }, scale);
};

const loaded = (page: import("@playwright/test").Page, sel: string) =>
  page.waitForFunction((s) => {
    const el = document.querySelector<HTMLElement>(s);
    if (!el) return false;
    const url = el.tagName === "IMG" ? (el as HTMLImageElement).src : getComputedStyle(el).backgroundImage.replace(/^url\("?|"?\)$/g, "");
    if (!url || url === "none") return false;
    if (el.tagName === "IMG") return (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0;
    return !!performance.getEntriesByType("resource").find((r) => url.endsWith(new URL(r.name).pathname) && (r as PerformanceResourceTiming).responseEnd > 0);
  }, sel);

for (const scale of [1, 1.3]) {
  test(`the battle shows the zone's backdrop, at ${scale * 100}% text`, async ({ page }, info) => {
    await text(scale)({ page });
    await seedChild(page, { grade: 2, battle: true });
    await openMap(page);
    await steps(page, "right", 1);
    await expect(page.locator("[data-screen=battle][data-view=meet]")).toBeVisible();
    // Route 1 has no backdrop of its own: Hearthrock's
    await expect(page.locator(".scene-ground")).toHaveAttribute("data-backdrop", "backdrop_hearthrock");
    await loaded(page, ".scene-ground");
    await page.screenshot({ path: info.outputPath(`${scale * 100}-battle-hearthrock.png`) });
    const box = await page.locator(".scene-ground").boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(872);
    expect(box!.height).toBeGreaterThanOrEqual(392);
  });

  test(`the owl's intro shows its story cards behind the words, at ${scale * 100}% text`, async ({ page }, info) => {
    await text(scale)({ page });
    await seedChild(page, { grade: 3, intro: true });
    await page.goto("/");
    await touch(page, page.locator(id("child_p00001")), 30);
    await expect(page.locator("[data-screen=play][data-map=ready][data-play=ready]")).toBeVisible({ timeout: 30_000 });
    const layer = page.locator("[data-screen=dialog]");
    const art = page.locator(id("dialog_art"));
    await expect(layer).toHaveAttribute("data-full", "true", { timeout: 10_000 });
    await loaded(page, "[data-id=dialog_art]");
    await expect(art).toHaveAttribute("src", /card_owl_help/);
    await page.screenshot({ path: info.outputPath(`${scale * 100}-intro-1.png`) });
    // tap through: the second card (the fog) follows, with the words still on top
    for (let i = 0; i < 5 && !/card_forgetting_fog/.test((await art.getAttribute("src")) ?? ""); i++) {
      await expect(layer).toHaveAttribute("data-full", "true", { timeout: 10_000 });
      await touch(page, page.locator(id("dialog")), 30);
    }
    await expect(art).toHaveAttribute("src", /card_forgetting_fog/);
    await expect(layer).toHaveAttribute("data-full", "true", { timeout: 10_000 });
    await loaded(page, "[data-id=dialog_art]");
    await page.screenshot({ path: info.outputPath(`${scale * 100}-intro-2.png`) });
    // the words are on top of the card and readable
    const words = await page.locator(id("dialog_text")).boundingBox();
    expect(words!.y + words!.height).toBeLessThanOrEqual(393);
  });
}
