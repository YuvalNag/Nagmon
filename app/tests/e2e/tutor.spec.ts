import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { answer, coins, debug, id, openMap, quiz, readDialog, saved, seedChild, steps, toCashier } from "./cashier";
import { expect, test } from "./fixtures";
import { touch, typeCode } from "./touch";

/**
 * The tutor's lessons, at the family's phone (873x393, touch only), at 100%
 * and 130% text: talk to the tutor in the lab, see the list, play a lesson
 * (cards, the practice on the quiz screen), get the coins and the stamp; and
 * the Notes sheet on the cashier's question once a lesson is passed.
 */
test.describe.configure({ timeout: 240_000 });

const scales = [1, 1.3];

async function textScale(page: Page, s: number) {
  await page.addInitScript((s) => {
    const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
    set();
    document.addEventListener("DOMContentLoaded", set);
  }, s);
}

/** Nothing of the screen is cut off or scrolls: every button is inside the phone and the screen has no overflow. */
async function fits(page: Page, screen: string) {
  const bad = await page.evaluate((screen) => {
    const root = document.querySelector<HTMLElement>(`[data-screen=${screen}]`)!;
    const out: string[] = [];
    if (root.scrollHeight > root.clientHeight + 1) out.push(`${screen} scrolls: ${root.scrollHeight} > ${root.clientHeight}`);
    for (const b of root.querySelectorAll("button")) {
      const r = b.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push(`${b.getAttribute("data-id")} outside: ${JSON.stringify(r)}`);
    }
    return out;
  }, screen);
  expect(bad).toEqual([]);
}

for (const scale of scales) {
  test(`the lab's tutor: the list, a lesson, the practice, 40 coins and a stamp, at ${scale * 100}% text`, async ({ page }, info) => {
    await textScale(page, scale);
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
    await page.addInitScript(() => localStorage.setItem("nagmon.map.start", "nagmon_lab"));
    await seedChild(page, { grade: 2 });
    await openMap(page);
    expect((await debug(page))!.map).toBe("nagmon_lab");

    // up to the tutor's desk: the tutor stands at (6,5)
    const start = (await debug(page))!.player;
    if (start.x !== 6) await steps(page, start.x < 6 ? "right" : "left", Math.abs(6 - start.x));
    await steps(page, "up", start.y - 6);
    expect((await debug(page))!.inFront).toBe("nagmon_house_tutor");
    await shot("t01_at_the_tutor");
    await touch(page, page.locator(id("map_talk")));
    await readDialog(page);

    // the list: three cards, the Moon open, the two far above grade 2 locked; no stamps yet
    const list = page.locator("[data-screen=tutor-list]");
    await expect(list).toBeVisible();
    await expect(page.locator("[data-screen=tutor-list] .lesson-card")).toHaveCount(3);
    await expect(page.locator(id("lesson_moon"))).toBeEnabled();
    await expect(page.locator(id("lesson_solar_system"))).toBeDisabled();
    await expect(page.locator(id("lesson_stars"))).toBeDisabled();
    await expect(page.locator(id("stamp_card"))).toHaveAttribute("data-done", "0");
    await expect(coins(page)).toHaveAttribute("data-coins", "0");
    await fits(page, "tutor-list");
    await shot("t02_list");

    // the cards: a picture and one line each, one tap to go on
    await touch(page, page.locator(id("lesson_moon")));
    const card = page.locator("[data-screen=tutor-card]");
    await expect(card).toBeVisible();
    await expect(page.locator(id("lesson_line"))).toHaveText("למה הירח משנה צורה?");
    await fits(page, "tutor-card");
    await shot("t03_card_1");
    await touch(page, page.locator(id("lesson_next")));
    await expect(card).toHaveAttribute("data-card", "1");
    await expect(page.locator("[data-screen=tutor-card] mark")).toHaveText("השמש");
    await shot("t04_card_2");
    // the back arrow is always there
    await touch(page, page.locator(id("lesson_back")));
    await expect(card).toHaveAttribute("data-card", "0");
    for (let i = 0; i < 4; i++) {
      await touch(page, page.locator(id("lesson_next")));
      if (i < 3) await expect(card).toHaveAttribute("data-card", String(i + 1));
    }
    await shot("t05_last_card_done");

    // the practice: the normal quiz screen
    await expect(page.locator("[data-screen=quiz]")).toBeVisible();
    expect((await quiz(page))!.skill).toBe("science.space.moon");
    await answer(page, "right");
    await shot("t06_practice_feedback");
    await touch(page, page.locator(id("quiz_continue")));

    // the award: 40 coins, a stamp, then the list with the stamp
    const result = page.locator("[data-screen=tutor-result]");
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("data-coins", "40");
    await expect(page.locator(id("coins"))).toHaveAttribute("data-coins", "40");
    await fits(page, "tutor-result");
    await page.waitForTimeout(1400);
    await shot("t07_award");
    await touch(page, page.locator(id("tutor_done")));
    await expect(page.locator(id("stamp_card"))).toHaveAttribute("data-done", "1");
    await expect(page.locator(id("lesson_moon"))).toHaveAttribute("data-done", "true");
    await shot("t08_list_after");

    // back on the map: the coins, and what is saved (ids and numbers)
    await touch(page, page.locator(id("tutor_close")));
    await expect(page.locator("[data-screen=tutor-list]")).toHaveCount(0);
    await expect(coins(page)).toHaveAttribute("data-coins", "40");
    await expect.poll(async () => (await saved(page, "saves/world.json"))?.["money"]).toBe(40);
    expect((await saved(page, "saves/world.json"))?.["lessons"]).toEqual({ done: ["moon"], repeatDay: null, charges: 1 });
  });
}

test("the Notes sheet on the cashier's question, once the Moon lesson is passed", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  // a child who passed the Moon lesson, and a cashier who asks about the Moon
  await seedChild(page, { grade: 4, world: { money: 0, variables: {} } });
  await page.addInitScript(() => {
    if (localStorage.getItem("seeded_lessons")) return;
    localStorage.setItem("seeded_lessons", "1");
    localStorage.setItem("nagmon.quiz.topic", "science.space.moon");
    const key = "nagmon-fs:f:profiles/p00001/saves/world.json";
    const w = JSON.parse(localStorage.getItem(key)!) as Record<string, unknown>;
    w["lessons"] = { done: ["moon"], charges: 0 };
    localStorage.setItem(key, JSON.stringify(w));
  });
  await openMap(page);
  await toCashier(page);
  await touch(page, page.locator(id("map_talk")));
  await readDialog(page);
  await expect(page.locator("[data-screen=quiz]")).toBeVisible();
  if ((await quiz(page))!.phase === "example") await touch(page, page.locator(id("quiz_example_done")));
  await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
  expect((await quiz(page))!.skill).toBe("science.space.moon");
  await expect(page.locator(id("notes_open"))).toBeVisible();
  await shot("n01_question_with_notes");
  await touch(page, page.locator(id("notes_open")));
  const text = page.locator(id("notes_text"));
  await expect(text).toHaveText("הירח מקיף את כדור הארץ, ולכן הצד המואר שרואים משתנה.");
  // the sheet is the lower 45% of the screen; the question stays above it
  await page.waitForTimeout(500);
  const sheet = (await page.locator(".notes-sheet").boundingBox())!;
  expect(sheet.y).toBeGreaterThan(393 * 0.5);
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(393 + 1);
  const prompt = (await page.locator(id("quiz_prompt")).boundingBox())!;
  expect(prompt.y + prompt.height).toBeLessThanOrEqual(sheet.y + 1);
  await shot("n02_notes_sheet");
  // a tap outside closes it, and the question can be answered
  await touch(page, page.locator(id("notes_outside")));
  await expect(text).toHaveCount(0);
  await touch(page, page.locator(id("quiz_dont_know")));
  await expect(page.locator("[data-screen=quiz][data-phase=feedback]")).toBeVisible();
});

for (const scale of scales) {
  test(`the parents' report and learning pages, at ${scale * 100}% text`, async ({ page }, info) => {
    await textScale(page, scale);
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
    // a child who has answered maths at two grades this week
    const skills = (JSON.parse(readFileSync("public/game/content/skills/math.json", "utf8")) as { skills: { id: string; grade: number }[] }).skills;
    const at = (g: number) => skills.find((k) => k.grade === g)!.id;
    const now = Math.floor(Date.now() / 1000);
    const log = [3, 4].flatMap((g) =>
      Array.from({ length: 8 }, (_, i) => ({ ts: now - 3600 * (g + i), skill: at(g), item: `i${g}${i}`, subject: "math", correct: g === 3 || i < 6, quality: "correct", elapsed: 7, context: "battle" })),
    );
    await page.addInitScript(
      ({ log }) => {
        if (localStorage.getItem("seeded")) return;
        localStorage.setItem("seeded", "1");
        // the town's people are those of ten in the morning, whatever the machine's clock says
        localStorage.setItem("nagmon.clock.hour", "10");
        localStorage.setItem("nagmon-fs:d:profiles", "");
        localStorage.setItem("nagmon-fs:d:profiles/p00001", "");
        localStorage.setItem("nagmon-fs:f:profiles/p00001/profile.json", JSON.stringify({ id: "p00001", name: "דנה", avatar: "girl_teal", grade: 3, order: 0, schema_version: 2, settings: { questions_per_battle: 5, learning: {}, lessons: { first_pass_coins: 40, repeat_coins: 10 } } }));
        localStorage.setItem("nagmon-fs:f:profiles/p00001/learning.json", JSON.stringify({ schema_version: 1, grade: 3, log }));
      },
      { log },
    );
    await page.goto("/");
    await touch(page, page.locator(id("parents")), 30);
    await typeCode(page, "12341234", { holdMs: 30, gapMs: 60 });
    await touch(page, page.locator(id("next")), 30);
    await expect(page.locator("[data-screen=parents]")).toBeVisible();
    await touch(page, page.locator(id("parents_children")), 30);
    await touch(page, page.locator(id("edit_p00001")), 30);
    await expect(page.locator("[data-screen=parents-child]")).toBeVisible();
    await fits(page, "parents-child");
    await shot("p01_child");

    await touch(page, page.locator(id("child_learning")), 30);
    await expect(page.locator("[data-screen=parents-learning]")).toBeVisible();
    await fits(page, "parents-learning");
    await shot("p02_learning");
    await touch(page, page.locator(id("learning_start")), 30);
    await expect(page.locator("[data-screen=parents-learning-start]")).toBeVisible();
    await fits(page, "parents-learning-start");
    await shot("p03_start_grade");
    await touch(page, page.locator(id("back")), 30);
    await touch(page, page.locator(id("back")), 30);
    await expect(page.locator("[data-screen=parents-child]")).toBeVisible();

    await touch(page, page.locator(id("child_report")), 30);
    await expect(page.locator("[data-screen=parents-report]")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(id("level_math"))).toContainText("חשבון: כיתה ד׳");
    await shot("p04_report_top");
    await page.locator(".report-body").evaluate((el) => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(200);
    await shot("p05_report_bottom");
  });
}
