import type { Page } from "@playwright/test";
import { battleAnswer, battleResultClosed, debug, id, openMap, PID, quiz, seedChild, steps } from "./cashier";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * "Something is wrong" from inside the game (docs/app/SDD.md §7.2), at
 * the family's phone (873x393 CSS px, touch only): the icon on the map,
 * the sheet, one report written to the browser's store with its log
 * line, the game held still meanwhile; and the icon covers no button of
 * the game, at 100% and 130% text. There is no screenshot in a browser
 * (only the Android app takes one), and the sheet says nothing of it.
 */

test.describe.configure({ timeout: 240_000 });

const scaleAt = (page: Page, s: number) =>
  page.addInitScript((scale) => {
    const set = () => document.documentElement?.style.setProperty("--font-scale", String(scale));
    set();
    document.addEventListener("DOMContentLoaded", set);
  }, s);

/** The reports in the browser's store, parsed. */
const reports = (page: Page) =>
  page.evaluate((pid) => {
    const prefix = `nagmon-fs:f:profiles/${pid}/reports/`;
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .map((k) => ({ file: k.slice(prefix.length), text: localStorage.getItem(k)! }));
  }, PID);

/** What the report icon's area covers: any button of the game, the name or the coins. */
const covers = (page: Page) =>
  page.evaluate(() => {
    const b = document.querySelector('[data-id="report_open"]')!.getBoundingClientRect();
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("button, .map-name, .map-coins, .dpad")) {
      if (el.dataset.id === "report_open" || el.classList.contains("dialog") || el.closest("[data-report-sheet]")) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) out.push(el.dataset.id ?? el.className);
    }
    return out;
  });

/** The icon: 48x48 in the screen, with a 26 px drawing, named in Hebrew. */
async function iconIsRight(page: Page) {
  const box = (await page.locator(id("report_open")).boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([48, 48]);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(873);
  const svg = (await page.locator(`${id("report_open")} svg`).boundingBox())!;
  expect([Math.round(svg.width), Math.round(svg.height)]).toEqual([26, 26]);
  await expect(page.locator(id("report_open"))).toHaveAttribute("aria-label", "משהו לא בסדר? אפשר לספר לנו");
  // see-through: it never competes with the game
  const opacity = await page.locator(id("report_open")).evaluate((e) => Number(getComputedStyle(e).opacity));
  expect(opacity).toBeLessThan(0.8);
}

/** The open sheet fits the phone: every button 48 px and more, all inside the screen. */
async function sheetFits(page: Page) {
  const problems = await page.evaluate(() => {
    const out: string[] = [];
    const sheet = document.querySelector<HTMLElement>(".report-sheet")!.getBoundingClientRect();
    if (sheet.top < 0 || sheet.bottom > innerHeight + 0.5) out.push(`sheet ${Math.round(sheet.top)}..${Math.round(sheet.bottom)}`);
    for (const el of document.querySelectorAll<HTMLElement>(".report-sheet button, .report-sheet textarea")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const name = el.dataset.id ?? el.tagName;
      if (r.width < 47.5 || r.height < 47.5) out.push(`${name} is ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (r.left < 0 || r.right > innerWidth + 0.5 || r.top < 0 || r.bottom > innerHeight + 0.5) out.push(`${name} outside the screen`);
      if (el.scrollWidth - el.clientWidth > 1 || el.scrollHeight - el.clientHeight > 1) out.push(`${name} scrolls or is cut`);
    }
    return out;
  });
  expect(problems).toEqual([]);
}

test("the icon, the sheet, one tap on a chip and a word: a report in the store, the game held meanwhile", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  await seedChild(page);
  // who-plays has no icon
  await page.goto("/");
  await expect(page.locator("[data-screen=who-plays]")).toBeVisible();
  await expect(page.locator(id("report_open"))).toHaveCount(0);
  await openMap(page);
  await expect(page.locator(id("report_open"))).toBeVisible();
  await iconIsRight(page);
  expect(await covers(page)).toEqual([]);
  await shot("r01_map_with_icon");

  // the tap: the game stands still under the sheet
  expect((await debug(page))!.paused).toEqual([]);
  await touch(page, page.locator(id("report_open")));
  const sheet = page.locator("[data-report-sheet]");
  await expect(sheet).toBeVisible();
  expect((await debug(page))!.paused).toEqual(["report"]);
  await expect(page.locator(".report-title")).toHaveText("מה לא בסדר?");
  const chips = await page.locator(".report-chip").evaluateAll((els) => els.map((e) => e.textContent));
  expect(chips).toEqual(["לא הבנתי את השאלה", "משהו לא נראה טוב", "נתקעתי", "משהו אחר"]);
  await sheetFits(page);
  // no word about a screenshot: a browser has none
  expect(await sheet.textContent()).not.toMatch(/צילום|תמונה/);
  await shot("r02_sheet");

  // one chip, a word in the field (the field has the keyboard: the sheet goes up)
  await touch(page, page.locator(id("report_chip_stuck")), 60);
  await expect(page.locator(id("report_chip_stuck"))).toHaveAttribute("aria-pressed", "true");
  await touch(page, page.locator(id("report_text")), 60);
  await page.keyboard.insertText("שבור");
  await expect(sheet).toHaveAttribute("data-typing", "true");
  await sheetFits(page);
  const field = (await page.locator(id("report_text")).boundingBox())!;
  expect(field.y + field.height).toBeLessThan(393 / 2);
  await shot("r03_typing");

  await touch(page, page.locator(id("report_send")), 60);
  await expect(page.locator(id("report_thanks"))).toHaveText("תודה! נרשם.");
  await shot("r04_thanks");
  await expect(sheet).toHaveCount(0, { timeout: 5000 });
  await expect.poll(async () => (await debug(page))!.paused).toEqual([]);

  // the report: in the child's folder, no screenshot file, the screen and the map
  const saved = await reports(page);
  expect(saved.map((r) => r.file)).toHaveLength(1);
  expect(saved[0]!.file).toMatch(/^\d{8}T\d{6}Z\.json$/);
  const json = JSON.parse(saved[0]!.text);
  expect(json).toMatchObject({ chip: "stuck", text: "שבור", screen: "play", child: PID, screenshot: false });
  expect(json.map).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
  expect(typeof json.map.name).toBe("string");
  expect(json.build).toBeTruthy();
  expect(Array.isArray(json.log)).toBe(true);
  expect(json.log.length).toBeLessThanOrEqual(60);
  // one line in the saved log: ids only, no typed text, no name
  const log = await page.evaluate(() => localStorage.getItem("nagmon-fs:f:nagmon/app_log.txt") ?? "");
  const lines = log.split("\n").filter((l) => l.includes(" REPORT "));
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/REPORT screen=play chip=stuck$/);
  expect(log).not.toContain("שבור");

  // a second one: nothing chosen, nothing typed, still written
  await touch(page, page.locator(id("report_open")));
  await expect(sheet).toBeVisible();
  await touch(page, page.locator(id("report_send")), 60);
  await expect(page.locator(id("report_thanks"))).toBeVisible();
  await expect(sheet).toHaveCount(0, { timeout: 5000 });
  expect((await reports(page)).length).toBe(2);
  // and cancel writes nothing
  await touch(page, page.locator(id("report_open")));
  await touch(page, page.locator(id("report_cancel")), 60);
  await expect(sheet).toHaveCount(0);
  expect((await reports(page)).length).toBe(2);
  await expect.poll(async () => (await debug(page))!.paused).toEqual([]);
});

for (const scale of [1, 1.3]) {
  test(`the icon covers nothing on the map, in the menu and in a battle, at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
    await scaleAt(page, scale);
    await seedChild(page, { grade: 2, battle: true });
    await openMap(page);
    await iconIsRight(page);
    expect(await covers(page)).toEqual([]);
    await shot("map");

    // the sheet at this text size, and with the keyboard on the field
    await touch(page, page.locator(id("report_open")));
    await expect(page.locator("[data-report-sheet]")).toBeVisible();
    await sheetFits(page);
    await shot("sheet");
    await touch(page, page.locator(id("report_text")), 60);
    await page.keyboard.insertText("שבור");
    await expect(page.locator("[data-report-sheet]")).toHaveAttribute("data-typing", "true");
    await sheetFits(page);
    await shot("typing");
    await touch(page, page.locator(id("report_cancel")), 60);
    await expect(page.locator("[data-report-sheet]")).toHaveCount(0);

    // the pause menu
    await touch(page, page.locator(id("map_menu")), 30);
    await expect(page.locator("[data-screen=map-menu]")).toBeVisible();
    expect(await covers(page)).toEqual([]);
    await shot("menu");
    await touch(page, page.locator(id("map_continue")), 30);

    // a battle: the meeting, a question, the turn
    await steps(page, "right", 1);
    await expect(page.locator("[data-screen=battle][data-view=meet]")).toBeVisible();
    expect(await covers(page)).toEqual([]);
    await shot("meet");
    await touch(page, page.locator(id("battle_fight")), 30);
    if ((await quiz(page))!.phase === "example") await touch(page, page.locator(id("quiz_example_done")), 30);
    await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
    expect(await covers(page)).toEqual([]);
    await shot("question");
    // a report here says the question
    await touch(page, page.locator(id("report_open")));
    await touch(page, page.locator(id("report_chip_unclear")), 60);
    await touch(page, page.locator(id("report_send")), 60);
    await expect(page.locator("[data-report-sheet]")).toHaveCount(0, { timeout: 5000 });
    const all = await reports(page);
    const json = JSON.parse(all[all.length - 1]!.text);
    expect(json.screen).toBe("quiz");
    expect(json.question).toMatchObject({ phase: "question" });
    expect(json.question.item).toBeTruthy();
    expect(json.question.skill).toBeTruthy();
    expect(json.question.choices.length).toBeGreaterThan(0);
    expect(json.battle).toMatchObject({ species: expect.any(String) });
    await battleAnswer(page, "right");
    await battleResultClosed(page);
    await expect(page.locator("[data-screen=battle][data-view=turn]")).toBeVisible();
    expect(await covers(page)).toEqual([]);
    await shot("turn");
  });
}
