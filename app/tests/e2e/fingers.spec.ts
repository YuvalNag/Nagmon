import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { middle, settled, touch } from "./touch";

/**
 * How real hands touch the phone: a thumb resting on the edge, a finger
 * that drifts, a fast double tap, a parent who goes back mid-check.
 */

const id = (s: string) => `[data-id="${s}"]`;
const dots = (page: Page) => page.locator(id("pin_dots"));
type Point = { x: number; y: number; id?: number };

async function finger(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}

const down = (c: CDPSession, points: Point[]) => c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points });
const move = (c: CDPSession, points: Point[]) => c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points });
// CDP lifts the fingers listed, or all of them when none is
const up = (c: CDPSession, lifted: Point[] = []) => c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: lifted });

/** Sets the code 1234 by taps and comes back to who-plays. */
async function setCode(page: Page) {
  await touch(page, page.locator(id("parents")), 30);
  for (const d of "12341234") await touch(page, page.locator(id(`key_${d}`)), 30);
  await touch(page, page.locator(id("next")), 30);
  await touch(page, page.locator(id("back")), 30);
}

/** Slows the code's hash, as on an old phone. */
async function slowHash(page: Page, ms: number) {
  await page.addInitScript((ms) => {
    const real = crypto.subtle.deriveBits.bind(crypto.subtle);
    crypto.subtle.deriveBits = async (...args: Parameters<SubtleCrypto["deriveBits"]>) => {
      const bits = await real(...args);
      await new Promise((r) => setTimeout(r, ms));
      return bits;
    };
  }, ms);
}

test("taps count while a thumb rests on the screen", async ({ page }) => {
  await page.goto("/");
  await touch(page, page.locator(id("new_child")), 30);
  await settled(page);
  const c = await finger(page);
  const key = { ...(await middle(page.locator(id("key_1")))), id: 2 };
  // the thumb holding the phone, on an empty corner
  const thumb = { x: 868, y: 388, id: 1 };
  await down(c, [thumb]);
  await page.waitForTimeout(200);
  for (let i = 1; i <= 3; i++) {
    await down(c, [thumb, key]);
    await page.waitForTimeout(100);
    await up(c, [key]);
    await expect(dots(page)).toHaveAttribute("data-count", String(i));
    await page.waitForTimeout(120);
  }
  await up(c);
  await expect(dots(page)).toHaveAttribute("data-count", "3");
});

test("a finger that drifts on the key still taps it; one that slides off does not", async ({ page }) => {
  await page.goto("/");
  await touch(page, page.locator(id("new_child")), 30);
  await settled(page);
  const c = await finger(page);
  const k1 = await middle(page.locator(id("key_1")));
  const k2 = await middle(page.locator(id("key_2")));
  for (const [i, dx] of [4, 12, 20].entries()) {
    await down(c, [k1]);
    await page.waitForTimeout(40);
    await move(c, [{ x: k1.x + dx / 2, y: k1.y + 2 }]);
    await page.waitForTimeout(40);
    await move(c, [{ x: k1.x + dx, y: k1.y + 3 }]);
    await page.waitForTimeout(40);
    await up(c);
    await expect(dots(page), `drift ${dx} px`).toHaveAttribute("data-count", String(i + 1));
  }
  // slid from 1 onto 2: neither key
  await down(c, [k1]);
  for (let i = 1; i <= 5; i++) {
    await move(c, [{ x: k1.x + ((k2.x - k1.x) * i) / 5, y: k1.y }]);
    await page.waitForTimeout(20);
  }
  await up(c);
  await page.waitForTimeout(150);
  await expect(dots(page)).toHaveAttribute("data-count", "3");
  // a long press is one tap: the 4th digit, so the pad asks again
  await down(c, [k2]);
  await page.waitForTimeout(1200);
  await up(c);
  await expect(page.getByText("הקלידו את אותן 4 ספרות שוב")).toBeVisible();
});

test("a fast double tap acts once, not again on the next screen", async ({ page }) => {
  await page.goto("/");
  await touch(page, page.locator(id("new_child")), 30);
  for (const d of "123") await touch(page, page.locator(id(`key_${d}`)), 30);
  const c = await finger(page);
  const doubleTap = async (p: Point) => {
    for (let i = 0; i < 2; i++) {
      await down(c, [p]);
      await page.waitForTimeout(25);
      await up(c);
      await page.waitForTimeout(40);
    }
    await page.waitForTimeout(400);
  };
  // the 4th digit: the second tap must not start the "again" pad
  const k4 = await middle(page.locator(id("key_4")));
  await settled(page);
  await doubleTap(k4);
  await expect(page.getByText("הקלידו את אותן 4 ספרות שוב")).toBeVisible();
  await expect(dots(page)).toHaveAttribute("data-count", "0");
  for (const d of "1234") await touch(page, page.locator(id(`key_${d}`)), 30);
  // "next" on the notice: the second tap must not press a letter
  const next = await middle(page.locator(id("next")));
  await settled(page);
  await doubleTap(next);
  await expect(page.locator("[data-screen=letters]")).toBeVisible();
  await expect(page.locator(id("typed"))).toHaveText("");
  // "done": the second tap must not pick a grade
  for (const ch of "דן") await touch(page, page.locator(id(`letter_${ch}`)), 30);
  const done = await middle(page.locator(id("board_done")));
  await settled(page);
  await doubleTap(done);
  await expect(page.locator("[data-screen=grade]")).toBeVisible();
});

test("back is shut while the code is checked, and the answer lands on the pad", async ({ page }) => {
  await slowHash(page, 800);
  await page.goto("/");
  await setCode(page);
  // a wrong code, then "back" during the check
  await touch(page, page.locator(id("parents")), 30);
  for (const d of "0000") await touch(page, page.locator(id(`key_${d}`)), 30);
  await expect(page.locator(id("pin_cancel"))).toBeDisabled();
  await touch(page, page.locator(id("pin_cancel")), 30);
  await expect(page.locator("[data-screen=pin]")).toHaveAttribute("data-attempt", "1");
  await expect(page.locator("[data-screen=pin] .message")).toContainText("הקוד לא נכון");
  // the right code, then "back" during the check: the parents' area, once
  for (const d of "1234") await touch(page, page.locator(id(`key_${d}`)), 30);
  await touch(page, page.locator(id("pin_cancel")), 30);
  await expect(page.locator("[data-screen=parents]")).toBeVisible();
});

test("a broken hash leaves a fresh pad and a Hebrew message, not a frozen one", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await setCode(page);
  await page.evaluate(() => {
    crypto.subtle.deriveBits = () => Promise.reject(new Error("crypto broke"));
  });
  await touch(page, page.locator(id("parents")), 30);
  for (const d of "1234") await touch(page, page.locator(id(`key_${d}`)), 30);
  await expect(page.locator("[data-screen=pin] .message")).toHaveText("משהו השתבש. נסו שוב.");
  await expect(page.locator("[data-screen=pin]")).toHaveAttribute("data-waiting", "false");
  await expect(page.locator(id("pin_cancel"))).toBeEnabled();
  expect(errors).toEqual([]);
});
