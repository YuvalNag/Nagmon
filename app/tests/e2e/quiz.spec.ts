import { answer, coins, debug, id, openMap, PID, quiz, readDialog, saved, seedChild, toCashier } from "./cashier";
import { expect, test } from "./fixtures";
import { responseTimes, touch, watchEventTiming } from "./touch";

/**
 * Milestone M4: one quiz, at the family's phone (873x393 CSS px at DPR
 * 2.75, touch only), in a Hebrew and an English browser. The child walks
 * to the cashier, talks, answers; the coins, the daily cap, Android's
 * back in the dialog and the question, and what is saved.
 */

test.describe.configure({ timeout: 240_000 });


test.beforeEach(async ({ page }) => {
  await watchEventTiming(page);
});

test("the cashier: talk, a right answer (+20 coins), a 'don't know' (an explanation, no coins), all saved", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  await seedChild(page);
  await openMap(page);
  await expect(coins(page)).toHaveAttribute("data-coins", "0");
  await toCashier(page);
  await shot("q01_in_front_of_the_cashier");

  // the talk button: a real button of 48dp and more, beside the hero, not over it
  const talkBox = (await page.locator(id("map_talk")).boundingBox())!;
  expect(Math.min(talkBox.width, talkBox.height)).toBeGreaterThanOrEqual(48);
  const hero = (await debug(page))!.heroRect!;
  const apart = hero.right <= talkBox.x || hero.left >= talkBox.x + talkBox.width || hero.bottom <= talkBox.y || hero.top >= talkBox.y + talkBox.height;
  expect(apart, `hero ${JSON.stringify(hero)} and talk ${JSON.stringify(talkBox)}`).toBe(true);
  // the coins: small, at the top, away from the menu button
  const coinBox = (await coins(page).boundingBox())!;
  const menuBox = (await page.locator(id("map_menu")).boundingBox())!;
  expect(coinBox.y).toBeLessThan(60);
  expect(Math.abs(coinBox.x + coinBox.width / 2 - (menuBox.x + menuBox.width / 2))).toBeGreaterThan(400);

  await touch(page, page.locator(id("map_talk")));
  const layer = page.locator("[data-screen=dialog]");
  await expect(layer).toBeVisible();
  // the map holds still under the words, the music goes on, the arrows are gone
  const held = (await debug(page))!;
  expect(held.paused).toEqual(["talk"]);
  expect(held.loopRunning).toBe(false);
  await expect(page.locator(id("dpad"))).toHaveCount(0);
  // a tap while the line types out shows all of it, and stays on the page
  await expect(layer).toHaveAttribute("data-full", "false");
  await touch(page, page.locator(id("dialog")), 60);
  await expect(layer).toHaveAttribute("data-full", "true");
  await expect(layer).toHaveAttribute("data-page", "0");
  await shot("q02_dialog_hello");
  const hello = await readDialog(page);
  expect(hello).toEqual(["המוכר אבי: שלום! אני סופר את הכסף בקופה.", "אפשר לעזור לי עם חשבון קטן?"]);

  // the question, for a child in grade 2: the change from 20
  await expect(page.locator("[data-screen=quiz]")).toBeVisible();
  expect((await quiz(page))!.skill).toBe("math.money.change_20");
  await shot("q03_quiz");
  const before = (await responseTimes(page)).app.length;
  const q = await answer(page, "right");
  await expect(page.locator(id("quiz_headline"))).toHaveText(/נכון|סופר/);
  await expect(page.locator(id("quiz_explanation"))).not.toBeEmpty();
  await shot("q04_feedback_right");
  // the answer is saved at once, before "continue"
  await expect.poll(async () => (await saved(page, "learning.json"))?.["answers_total"]).toBe(1);
  await touch(page, page.locator(id("quiz_continue")));
  // the cashier pays 20 and thanks the child
  await expect(coins(page)).toHaveAttribute("data-coins", "20");
  const good = await readDialog(page);
  expect(good.join(" ")).toContain("הנה 20 מטבעות");
  await shot("q05_coins_20");
  await expect(page.locator(id("map_talk"))).toBeVisible();
  // the map runs again
  await expect.poll(async () => (await debug(page))!.paused).toEqual([]);

  // again, and "don't know": the right answer and how, no coins
  await touch(page, page.locator(id("map_talk")));
  await readDialog(page);
  const q2 = await answer(page, "dont_know");
  expect(q2.skill).toBe(q.skill);
  await expect(page.locator(id("quiz_headline"))).toHaveText("זה בסדר לא לדעת! ככה פותרים:");
  await expect(page.locator(id("quiz_answer"))).toContainText("התשובה:");
  await expect(page.locator(id("quiz_explanation"))).not.toBeEmpty();
  await shot("q06_feedback_dont_know");
  await touch(page, page.locator(id("quiz_continue")));
  const wrong = await readDialog(page);
  expect(wrong.join(" ")).toContain("כמעט!");
  await expect(coins(page)).toHaveAttribute("data-coins", "20");

  const times = (await responseTimes(page)).app.slice(before);
  console.log(`quiz taps, tap to drawn frame (ms): ${times.map(Math.round).join(" ")}`);
  expect(times.length).toBeGreaterThanOrEqual(4);

  // all of it is on disk: a new start finds the coins and both answers
  expect((await saved(page, "saves/world.json"))?.["money"]).toBe(20);
  const learner = (await saved(page, "learning.json"))!;
  expect([learner["answers_total"], learner["correct_total"]]).toEqual([2, 1]);
  await page.reload();
  await touch(page, page.locator(id(`child_${PID}`)));
  await expect(page.locator("[data-screen=play][data-map=ready][data-play=ready]")).toBeVisible({ timeout: 30_000 });
  await expect(coins(page)).toHaveAttribute("data-coins", "20");
});

test("the daily prize: the third of the day pays, the fourth is praise only; the number pad", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  // two prizes already today, 40 coins; this child answers on the number pad
  await seedChild(page, {
    grade: 3,
    settings: { learning: { answer_mode: "number" } },
    world: { money: 40, variables: { nagmon_daily_cashier: "{today}:2" } },
  });
  await openMap(page);
  await expect(coins(page)).toHaveAttribute("data-coins", "40");
  await toCashier(page);

  await touch(page, page.locator(id("map_talk")));
  await readDialog(page);
  const q = await answer(page, "right");
  expect(q.kind).toBe("number");
  await touch(page, page.locator(id("quiz_continue")));
  await expect(coins(page)).toHaveAttribute("data-coins", "60");
  expect((await readDialog(page)).join(" ")).toContain("הנה 20 מטבעות");

  // the fourth right answer today: thanks and praise, no coins, no "come back tomorrow"
  await touch(page, page.locator(id("map_talk")));
  await readDialog(page);
  await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
  await shot("q07_number_pad");
  await answer(page, "right");
  await touch(page, page.locator(id("quiz_continue")));
  const free = await readDialog(page);
  expect(free).toEqual(["בדיוק! ספרת נכון.", "היום כבר עזרת לי הרבה. תודה!"]);
  await expect(coins(page)).toHaveAttribute("data-coins", "60");
  await shot("q08_praise_only");
  const world = (await saved(page, "saves/world.json"))!;
  expect(world["money"]).toBe(60);
  expect(String((world["variables"] as Record<string, string>)["nagmon_daily_cashier"])).toMatch(/:3$/);
});

test("Android's back in the dialog goes on in it, in the question closes it, and never leaves the map", async ({ page }) => {
  await seedChild(page);
  await openMap(page);
  await toCashier(page);
  await touch(page, page.locator(id("map_talk")));
  const layer = page.locator("[data-screen=dialog]");
  // Android's back: Escape in a browser (src/platform/backButton.ts)
  const back = () => page.keyboard.press("Escape");
  await expect(layer).toHaveAttribute("data-full", "false");
  await back();
  await expect(layer).toHaveAttribute("data-full", "true");
  await expect(layer).toHaveAttribute("data-page", "0");
  await back();
  await expect(layer).toHaveAttribute("data-page", "1");
  await expect(layer).toHaveAttribute("data-full", "true", { timeout: 10_000 });
  await back();
  // the question; back closes it with nothing counted
  await expect(page.locator("[data-screen=quiz]")).toBeVisible();
  await back();
  await expect(page.locator("[data-screen=quiz]")).toHaveCount(0);
  await expect(page.locator("[data-screen=dialog]")).toHaveCount(0);
  await expect(page.locator("[data-screen=play]")).toBeVisible();
  expect((await saved(page, "learning.json"))?.["answers_total"] ?? 0).toBe(0);
  await expect(coins(page)).toHaveAttribute("data-coins", "0");
  await expect.poll(async () => (await debug(page))!.paused).toEqual([]);
  // the map as before: talk again, or back opens the pause menu
  await expect(page.locator(id("map_talk"))).toBeVisible();
  await back();
  await expect(page.locator("[data-screen=map-menu]")).toBeVisible();
  await back();
  await expect(page.locator("[data-screen=map-menu]")).toHaveCount(0);
  // after an answer, back is "continue": the answer counts
  await touch(page, page.locator(id("map_talk")));
  await readDialog(page);
  await answer(page, "right");
  await back();
  await expect(coins(page)).toHaveAttribute("data-coins", "20");
  await expect(layer).toBeVisible();
});
