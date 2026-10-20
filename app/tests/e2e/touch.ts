import { expect, type Locator, type Page } from "@playwright/test";

/**
 * A finger on the phone: a real touch (CDP touchStart, a hold, touchEnd)
 * at the middle of the element, the way Android's WebView gets it. A
 * child's tap lasts 100-200 ms; the old app counted a held finger twice.
 */
export async function touch(page: Page, target: Locator, holdMs = 120): Promise<void> {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error("nothing to touch");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(holdMs);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Records, for every tap, the time until the page next changed. */
export async function watchResponseTimes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __responses: number[] };
    w.__responses = [];
    let start = 0;
    addEventListener("pointerup", () => (start = performance.now()), true);
    new MutationObserver(() => {
      if (start) {
        w.__responses.push(performance.now() - start);
        start = 0;
      }
    }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });
}

export async function responseTimes(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as unknown as { __responses: number[] }).__responses);
}

/** Nothing sticks out of the screen, and the Hebrew font is the one drawn. */
export async function fitsAndSharp(page: Page): Promise<void> {
  const r = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      x: document.documentElement.scrollWidth - innerWidth,
      y: document.documentElement.scrollHeight - innerHeight,
      rubik: document.fonts.check("500 20px Rubik", "שלום"),
    };
  });
  expect(r).toEqual({ x: 0, y: 0, rubik: true });
}
