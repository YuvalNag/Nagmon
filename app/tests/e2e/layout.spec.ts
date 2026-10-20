import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { fitsAndSharp, touch, typeCode } from "./touch";

/**
 * Every screen at the family's phone and two other landscape sizes: it
 * fits, keys are big enough for a finger, text is big enough to read,
 * and "מחק" is well away from the letters.
 */

const id = (s: string) => `[data-id="${s}"]`;
// 1 mm in CSS px at the family phone's 2.75 device px per CSS px
const MM = 51 / 9;
// Android's own measure (160 CSS px per inch), stricter for text
const MM_DP = 160 / 25.4;

const SIZES = [
  { name: "phone", width: 873, height: 393, dpr: 2.75 },
  { name: "emulator", width: 915, height: 412, dpr: 2.625 },
  { name: "small", width: 800, height: 360, dpr: 3 },
];

interface Measure {
  smallButtons: string[];
  smallText: string[];
  letterKey?: { w: number; h: number; rows: number };
  deleteToLetters?: number;
}

async function measure(page: Page): Promise<Measure> {
  await fitsAndSharp(page);
  return page.evaluate(
    ({ MM, MM_DP }) => {
      const smallButtons: string[] = [];
      for (const el of document.querySelectorAll("button")) {
        const b = el.getBoundingClientRect();
        if (Math.min(b.width, b.height) < 9 * MM) smallButtons.push(`${el.dataset.id} ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
      const smallText: string[] = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.textContent!.trim()) continue;
        const cs = getComputedStyle(n.parentElement!);
        const line = cs.lineHeight === "normal" ? parseFloat(cs.fontSize) * 1.2 : parseFloat(cs.lineHeight);
        if (line < 5 * MM_DP) smallText.push(`${n.textContent!.trim().slice(0, 12)} ${cs.fontSize}/${line.toFixed(1)}px`);
      }
      const out: Measure = { smallButtons, smallText };
      const letters = [...document.querySelectorAll<HTMLElement>("[data-id^=letter_]")];
      const del = document.querySelector('[data-id="board_delete"]');
      if (letters.length && del) {
        const d = del.getBoundingClientRect();
        const rects = letters.map((l) => l.getBoundingClientRect());
        out.letterKey = {
          w: Math.min(...rects.map((r) => r.width)),
          h: Math.min(...rects.map((r) => r.height)),
          rows: new Set(rects.map((r) => Math.round(r.top))).size,
        };
        out.deleteToLetters = Math.min(
          ...rects.map((r) =>
            Math.hypot(Math.max(0, r.left - d.right, d.left - r.right), Math.max(0, r.top - d.bottom, d.top - r.bottom)),
          ),
        );
      }
      return out;
    },
    { MM, MM_DP },
  );
}

for (const size of SIZES) {
  test.describe(`at ${size.width}x${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr });

    test("every screen fits, with finger-sized keys and readable text", async ({ page }, info) => {
      const check = async (label: string, screen: string) => {
        await expect(page.locator(`[data-screen=${screen}]`)).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: info.outputPath(`${size.name}-${label}.png`) });
        const m = await measure(page);
        expect(m.smallButtons, `${label}: buttons under 9 mm`).toEqual([]);
        expect(m.smallText, `${label}: text lines under 5 mm`).toEqual([]);
        return m;
      };
      await page.goto("/");
      await check("01_who", "who-plays");
      await touch(page, page.locator(id("new_child")), 20);
      await check("02_pin", "pin");
      await typeCode(page, "12341234", { holdMs: 20, gapMs: 40 });
      await check("03_notice", "notice");
      await touch(page, page.locator(id("next")), 20);
      // the longest name there is
      for (let i = 0; i < 16; i++) await touch(page, page.locator(id("letter_ש")), 10);
      // all of it shows: the newest letter is not cut off
      const clipped = await page.locator(id("typed")).evaluate((e) => e.scrollWidth - e.clientWidth);
      expect(clipped).toBeLessThanOrEqual(0);
      const board = await check("04_letters", "letters");
      expect(board.letterKey!.rows).toBe(3);
      expect(board.letterKey!.h).toBeGreaterThanOrEqual(56);
      expect(board.letterKey!.w).toBeGreaterThanOrEqual(52);
      // a whole line of text between delete and the nearest letter
      expect(board.deleteToLetters!).toBeGreaterThanOrEqual(7 * MM);
      await touch(page, page.locator(id("board_done")), 20);
      await check("05_grade", "grade");
      await touch(page, page.locator(id("choice_9")), 20);
      await check("06_avatar", "avatar");
      await touch(page, page.locator(id("choice_boy_blue")), 20);
      await touch(page, page.locator(id("next")), 20);
      await check("07_who_one", "who-plays");
    });
  });
}

/** Names of up to 6 letters that the screen broke over two lines. */
async function brokenShortNames(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".card span")]
      .filter((s) => [...(s.textContent ?? "")].length <= 6)
      .filter((s) => s.getBoundingClientRect().height > parseFloat(getComputedStyle(s).lineHeight) * 1.5)
      .map((s) => s.textContent ?? ""),
  );
}

/** Eight children straight into the browser's store, one with the longest name. */
async function seedChildren(page: Page, names: string[]) {
  await page.addInitScript((names) => {
    if (localStorage.getItem("seeded")) return;
    localStorage.setItem("seeded", "1");
    names.forEach((name, i) => {
      const pid = `p0000${i}`;
      localStorage.setItem(`nagmon-fs:d:profiles`, "");
      localStorage.setItem(`nagmon-fs:d:profiles/${pid}`, "");
      localStorage.setItem(
        `nagmon-fs:f:profiles/${pid}/profile.json`,
        JSON.stringify({ id: pid, name, avatar: ["boy_blue", "girl_teal", "girl_curly"][i % 3], grade: 2, order: i, schema_version: 2 }),
      );
    });
  }, names);
}

for (const size of SIZES) {
  test.describe(`eight children at ${size.width}x${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr });

    test("all eight and both tools are on the screen; a ninth is refused before the code", async ({ page }, info) => {
      await seedChildren(page, ["אבגדהוזחטיכלמנסע", "בר", "גל", "דנה", "הדר", "ורד", "זיו", "חן"]);
      await page.goto("/");
      await expect(page.locator("[data-screen=who-plays] .card")).toHaveCount(8);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: info.outputPath(`${size.name}-who_eight.png`) });
      const m = await measure(page);
      expect(m.smallButtons).toEqual([]);
      expect(m.smallText).toEqual([]);
      // a short name stays whole on one line; only the 16-letter one may break
      expect(await brokenShortNames(page)).toEqual([]);
      await expect(page.locator(id("new_child"))).toBeDisabled();
      await expect(page.locator("[data-screen=who-plays]")).toContainText("אפשר עד 8 שחקנים.");
      await touch(page, page.locator(id("new_child")), 30);
      await page.waitForTimeout(300);
      await expect(page.locator("[data-screen=who-plays]")).toBeVisible();
      // a child's card still opens
      await touch(page, page.locator(id("child_p00007")), 30);
      // the map opens with the child's name on it (Phaser loads on demand)
      await expect(page.locator("[data-screen=play][data-map=ready]")).toContainText("חן", { timeout: 20_000 });
    });
  });
}

test.describe("eight six-letter names at 800x360", () => {
  test.use({ viewport: { width: 800, height: 360 }, deviceScaleFactor: 3 });

  test("each name stays whole, and everything fits", async ({ page }, info) => {
    await seedChildren(page, ["אביטלה", "ברקאיה", "גלבועה", "דוריתה", "הדסימה", "ורדיתה", "זהביתה", "חרמונה"]);
    await page.goto("/");
    await expect(page.locator("[data-screen=who-plays] .card")).toHaveCount(8);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath("small-who_eight_six.png") });
    const m = await measure(page);
    expect(m.smallButtons).toEqual([]);
    expect(await brokenShortNames(page)).toEqual([]);
  });
});
