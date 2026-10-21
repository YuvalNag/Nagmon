import { id, openMap, quiz, readDialog, seedChild, toCashier } from "./cashier";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * The robot question's grid (logic.robot.path_end) is drawn, with the
 * squares labelled א ב ג ד, and the figure and the four answers fit the
 * phone's screen (873x393) with no scrolling, at 100% and 130% text.
 */

test.describe.configure({ timeout: 240_000 });

for (const scale of [1, 1.3]) {
  test(`the robot's grid and its four labelled squares fit with the answers at ${scale * 100}% text`, async ({ page }, info) => {
    await page.addInitScript((s) => {
      const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
      set();
      document.addEventListener("DOMContentLoaded", set);
      localStorage.setItem("nagmon.quiz.topic", "logic.robot.path_end");
    }, scale);
    await seedChild(page, { grade: 4, seed: 3 });
    await openMap(page);
    await toCashier(page);
    await touch(page, page.locator(id("map_talk")));
    await readDialog(page);
    await expect(page.locator("[data-screen=quiz]")).toBeVisible();
    expect((await quiz(page))!.skill).toBe("logic.robot.path_end");
    if ((await quiz(page))!.phase === "example") await touch(page, page.locator(id("quiz_example_done")));
    await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();

    const fig = page.locator('svg[data-id="figure"]');
    await expect(fig).toHaveAttribute("data-kind", "grid_path");
    expect(await fig.locator('[data-fig="cell"]').count()).toBe(25);
    expect(await fig.locator('[data-fig="start"]').count()).toBe(1);
    expect(await fig.locator('[data-fig="mark"]').allTextContents()).toEqual(expect.arrayContaining(["א", "ב", "ג", "ד"]));
    expect(await fig.locator("text", { hasText: "?" }).count()).toBe(0);

    // the figure and the four answers are all on the screen, and the page does not scroll
    const view = page.viewportSize()!;
    const boxes = [fig, ...["a", "b", "c", "d"].map((c) => page.locator(id(`quiz_choice_${c}`)))];
    for (const b of boxes) {
      const r = (await b.boundingBox())!;
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.y + r.height, `${scale}`).toBeLessThanOrEqual(view.height);
      expect(r.x + r.width).toBeLessThanOrEqual(view.width);
    }
    const figBox = (await fig.boundingBox())!;
    console.log(`figure box at ${scale}: ${Math.round(figBox.width)}x${Math.round(figBox.height)}`);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`robot_grid_${scale * 100}.png`) });
    await fig.screenshot({ path: info.outputPath(`robot_figure_${scale * 100}.png`) });
  });
}
