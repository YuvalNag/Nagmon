import { expect, type Locator, type Page } from "@playwright/test";

/** A press this soon after a screen appeared is ignored (src/ui/screenTime.tsx), plus a margin. */
const FRESH_WAIT_MS = 300;

/** Waits until the screen showing has been up long enough to take a tap. */
export async function settled(page: Page): Promise<void> {
  await page.waitForFunction(
    (ms) => performance.now() - ((window as unknown as { __screenShownAt?: number }).__screenShownAt ?? -1e9) >= ms,
    FRESH_WAIT_MS,
  );
}

export async function middle(target: Locator): Promise<{ x: number; y: number }> {
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error("nothing to touch");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * A finger on the phone: a real touch (CDP touchStart, a hold, touchEnd)
 * at the middle of the element, the way Android's WebView gets it. A
 * child's tap lasts 100-200 ms; the old app counted a held finger twice.
 * Like a child, it waits until the screen has been up a moment
 * (`settle: false` taps at once, as a parent typing on in one rhythm).
 */
export async function touch(page: Page, target: Locator, holdMs = 120, { settle = true } = {}): Promise<void> {
  const { x, y } = await middle(target);
  if (settle) await settled(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(holdMs);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/**
 * A parent typing the code in one rhythm: a wait for the pad to settle,
 * then every digit with no pause but `gapMs`. The code's second entry
 * and a new try are the same screen, so no digit may be lost.
 */
export async function typeCode(page: Page, digits: string, { holdMs = 60, gapMs = 90 } = {}): Promise<void> {
  await settled(page);
  for (const d of digits) {
    await touch(page, page.locator(`[data-id="key_${d}"]`), holdMs, { settle: false });
    await page.waitForTimeout(gapMs);
  }
}

/**
 * The browser's own measure of each tap (Event Timing): from the finger's
 * lift to the next frame drawn. Only taps of 16 ms and more are listed.
 */
export async function watchEventTiming(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __eventTiming: number[] };
    w.__eventTiming = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === "pointerup") w.__eventTiming.push(e.duration);
    }).observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  });
}

/** Tap to drawn frame, ms: the app's own measure (src/platform/tapTiming.ts) and Event Timing's. */
export async function responseTimes(page: Page): Promise<{ app: number[]; events: number[] }> {
  return page.evaluate(() => {
    const w = window as unknown as { __responses?: number[]; __eventTiming?: number[] };
    return { app: [...(w.__responses ?? [])], events: [...(w.__eventTiming ?? [])] };
  });
}

/**
 * Nothing sticks out of the screen: every button lies inside it, and
 * neither the page, #root nor the screen scrolls (#root hides overflow,
 * so the page alone would never show it). And the Hebrew font is the one
 * drawn.
 */
export async function fitsAndSharp(page: Page): Promise<void> {
  const r = await page.evaluate(async () => {
    await document.fonts.ready;
    const out: string[] = [];
    for (const el of document.querySelectorAll("button")) {
      const b = el.getBoundingClientRect();
      if (b.top < -0.5 || b.left < -0.5 || b.bottom > innerHeight + 0.5 || b.right > innerWidth + 0.5) {
        out.push(`${el.dataset.id} at ${Math.round(b.left)},${Math.round(b.top)}-${Math.round(b.right)},${Math.round(b.bottom)}`);
      }
    }
    const scrolls = (el: Element | null) => (el ? el.scrollHeight - el.clientHeight + (el.scrollWidth - el.clientWidth) : 0);
    return {
      outside: out,
      page: scrolls(document.documentElement),
      root: scrolls(document.getElementById("root")),
      screen: scrolls(document.querySelector(".screen")),
      rubik: document.fonts.check("500 20px NagmonRubik", "שלום"),
    };
  });
  expect(r).toEqual({ outside: [], page: 0, root: 0, screen: 0, rubik: true });
}
