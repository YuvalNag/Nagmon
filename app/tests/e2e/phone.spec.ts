import { expect, test } from "@playwright/test";
import { fitsAndSharp } from "./touch";

test("who-plays is Hebrew, right to left, sharp and fills the phone", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("heading")).toHaveText("מי משחק היום?");
  expect(await page.evaluate(() => document.documentElement.dir)).toBe("rtl");
  // the smooth Hebrew font, not a fallback
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check("500 20px Rubik", "שלום")),
  ).toBe(true);
  // nothing sticks out of the screen, not even inside #root
  await fitsAndSharp(page);
  // buttons are big enough for a finger (9 mm = 51 CSS px here)
  for (const id of ["new_child", "parents"]) {
    const box = await page.locator(`[data-id=${id}]`).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(51);
  }
  await page.screenshot({ path: info.outputPath("who-plays.png") });
});
