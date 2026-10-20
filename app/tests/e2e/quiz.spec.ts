import { answer, coins, debug, id, openMap, PID, quiz, readDialog, saved, seedChild, steps, toCashier } from "./cashier";
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

test("the owl's intro: questions in different subjects, then a choice of one of three, then the world", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  await seedChild(page, { grade: 3, intro: true });
  await page.goto("/");
  await touch(page, page.locator(id(`child_${PID}`)));
  await expect(page.locator("[data-screen=play][data-map=ready][data-play=ready]")).toBeVisible({ timeout: 30_000 });
  // the owl first: the arrows and the menu are not there yet
  await expect(page.locator("[data-screen=dialog]")).toBeVisible();
  await expect(page.locator(id("dpad"))).toHaveCount(0);
  await shot("i01_owl_hello");
  await readDialog(page);

  // six questions, the last one wrong: a wrong answer blocks nothing
  const subjects: string[] = [];
  for (let i = 0; i < 6; i++) {
    await expect(page.locator("[data-screen=intro-ask]")).toHaveAttribute("data-n", String(i + 1));
    await expect(page.locator(".intro-progress")).toContainText(`${i + 1}`);
    const q = await answer(page, i === 5 ? "dont_know" : "right");
    subjects.push(q.skill!.split(".")[0]!);
    if (i === 0) await shot("i02_question");
    if (i === 5) await shot("i03_wrong_is_fine");
    await touch(page, page.locator(id("quiz_continue")));
  }
  expect(new Set(subjects).size).toBe(6);

  // three creatures; any one is fine, and the cards are big
  await readDialog(page);
  const cards = page.locator("[data-id^=starter_]");
  await expect(cards).toHaveCount(3);
  for (const box of await cards.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as { width: number; height: number; bottom: number }))) {
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(48);
    expect(box.bottom).toBeLessThanOrEqual(393);
  }
  await shot("i04_starters");
  await touch(page, cards.nth(1));
  await readDialog(page);
  // the world opens: the arrows are back, and the choice is saved
  await expect(page.locator(id("dpad"))).toBeVisible();
  await shot("i05_world_opens");
  await expect.poll(async () => ((await saved(page, "saves/world.json"))?.["creatures"] as unknown[] | undefined)?.length).toBe(1);
  const learner = (await saved(page, "learning.json"))!;
  expect(learner["answers_total"]).toBe(6);
  expect(Object.keys(learner["subject_grade"] as object).length).toBeGreaterThanOrEqual(5);
  expect((await saved(page, "saves/world.json"))?.["variables"]).toMatchObject({ nagmon_intro_done: "yes" });
});

test("a wild creature in the grass: a friendly battle, wrong answers hurt nobody, a right one wins a friend", async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  await seedChild(page, { grade: 2, battle: true });
  await openMap(page);
  expect((await debug(page))!.map).toBe("classic_route_1");
  // one step into the grass
  await steps(page, "right", 1);
  const battle = page.locator("[data-screen=battle]");
  await expect(battle).toBeVisible();
  await expect(battle).toHaveAttribute("data-view", "meet");
  await expect(page.locator(id("dpad"))).toHaveCount(0);
  await shot("b01_meet");
  const hp0 = Number(await battle.getAttribute("data-hp"));
  await touch(page, page.locator(id("battle_fight")));

  // a wrong answer: nobody is hurt
  await answer(page, "dont_know");
  await shot("b02_feedback_wrong");
  await touch(page, page.locator(id("quiz_continue")));
  await expect(battle).toHaveAttribute("data-view", "turn");
  await expect(page.locator(id("battle_message"))).toContainText("אף אחד לא נפגע");
  expect(Number(await battle.getAttribute("data-hp"))).toBe(hp0);
  await shot("b03_no_damage");

  // right answers calm it
  for (let i = 0; i < 12 && (await battle.getAttribute("data-view")) !== "calm"; i++) {
    await touch(page, page.locator(id("battle_next")));
    await answer(page, "right");
    await touch(page, page.locator(id("quiz_continue")));
    if (await page.locator(id("growth_close")).count()) await touch(page, page.locator(id("growth_close")));
    await expect(battle).toHaveAttribute("data-view", /turn|calm/);
    if (i === 0) await shot("b04_hit");
  }
  await expect(battle).toHaveAttribute("data-view", "calm");
  expect(Number(await battle.getAttribute("data-hp"))).toBe(0);
  await shot("b05_calm");
  // nobody joined yet; the Net pulses
  await expect(page.locator(id("battle_net"))).toBeEnabled();
  // the net, a wrong seal answer (the net bounces back), then a right one
  await touch(page, page.locator(id("battle_net")));
  await answer(page, "dont_know");
  await touch(page, page.locator(id("quiz_continue")));
  await expect(battle).toHaveAttribute("data-view", "calm");
  await shot("b06_try_again");
  // a grown-up creature needs three seal answers
  for (let i = 0; i < 3 && !(await page.locator("[data-screen=battle-caught]").count()); i++) {
    await touch(page, page.locator(id("battle_net")));
    await answer(page, "right");
    await touch(page, page.locator(id("quiz_continue")));
    if (await page.locator(id("growth_close")).count()) await touch(page, page.locator(id("growth_close")));
  }
  await expect(page.locator("[data-screen=battle-caught]")).toBeVisible();
  await shot("b07_new_friend");
  await touch(page, page.locator(id("battle_skip")));
  await expect(battle).toHaveCount(0);
  await expect(page.locator(id("dpad"))).toBeVisible();
  const world = (await saved(page, "saves/world.json"))!;
  expect((world["creatures"] as unknown[]).length).toBe(2);
  expect((world["caught"] as string[]).length).toBe(2);
  expect((world["items"] as Record<string, number>)["magic_net"]).toBe(2);
});

test("the battle's action bar: five buttons of 120x72 and more in the bottom 123px, Ask the wide one at the thumb's end", async ({ page }, info) => {
  await seedChild(page, { grade: 2, battle: true });
  await openMap(page);
  await steps(page, "right", 1);
  const battle = page.locator("[data-screen=battle]");
  await expect(battle).toBeVisible();
  await page.screenshot({ path: info.outputPath("bar.png") });
  const boxes = await page.locator(".action-bar button").evaluateAll((els) => els.map((e) => ({ id: (e as HTMLElement).dataset["id"]!, ...(e.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number; right: number; bottom: number }) })));
  expect(boxes.map((b) => b.id)).toEqual(["battle_fight", "battle_net", "battle_bag", "battle_friends", "battle_run"]);
  for (const b of boxes) {
    expect(b.width, b.id).toBeGreaterThanOrEqual(120);
    expect(b.height, b.id).toBeGreaterThanOrEqual(72);
    expect(b.y, b.id).toBeGreaterThanOrEqual(393 - 123 - 1);
    expect(b.bottom, b.id).toBeLessThanOrEqual(393);
    expect(b.x, b.id).toBeGreaterThanOrEqual(0);
    expect(b.right, b.id).toBeLessThanOrEqual(873);
  }
  // Hebrew runs right to left: Ask is at the right edge and twice as wide as the others
  expect(boxes[0]!.width).toBeGreaterThanOrEqual(boxes[1]!.width * 1.9);
  for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.right).toBeLessThanOrEqual(boxes[i - 1]!.x + 1);
  // the arena above is not covered by the bar
  const arena = (await page.locator(".battle-arena").boundingBox())!;
  expect(arena.y + arena.height).toBeLessThanOrEqual(boxes[0]!.y + 1);
});

test("the Bag from the battle: three tabs at the start edge, cards with counts, the panel at the end, all inside the screen", async ({ page }, info) => {
  await seedChild(page, { grade: 2, battle: true });
  await openMap(page);
  await steps(page, "right", 1);
  await expect(page.locator("[data-screen=battle]")).toBeVisible();
  await touch(page, page.locator(id("battle_bag")));
  const bag = page.locator("[data-screen=bag]");
  await expect(bag).toBeVisible();
  // the starter nets arrived, once
  await expect(page.locator(id("bag_item_magic_net"))).toContainText("x3");
  await page.screenshot({ path: info.outputPath("bag.png") });
  const rect = (sel: string) => page.locator(sel).evaluate((e) => e.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number; right: number; bottom: number });
  const tab = await rect(id("bag_tab_nets"));
  const card = await rect(id("bag_item_magic_net"));
  const detail = await rect(id("bag_detail"));
  expect(tab.width).toBeGreaterThanOrEqual(56);
  expect(tab.height).toBeGreaterThanOrEqual(56);
  // Hebrew: the rail at the right (start) edge, the panel at the left (end)
  expect(tab.x).toBeGreaterThan(card.x);
  expect(detail.right).toBeLessThanOrEqual(card.x);
  expect(Math.min(card.width, card.height)).toBeGreaterThanOrEqual(80);
  for (const b of [tab, card, detail]) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(873);
    expect(b.bottom).toBeLessThanOrEqual(393);
  }
  // not calm yet: a net cannot be used, and the Bag says why
  await expect(page.locator(id("bag_use"))).toBeDisabled();
  await touch(page, page.locator(id("bag_close")));
  await expect(bag).toHaveCount(0);
});

test("helpers on the question: owned ones sit in the foot, big enough, one use each question", async ({ page }, info) => {
  await seedChild(page, { grade: 2, battle: true, items: { hint_feather: 2, clover: 2, owl_pass: 1 } });
  await openMap(page);
  await steps(page, "right", 1);
  await touch(page, page.locator(id("battle_fight")));
  if ((await quiz(page))!.phase === "example") await touch(page, page.locator(id("quiz_example_done")));
  await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
  await page.screenshot({ path: info.outputPath("helpers.png") });
  const helpers = page.locator("[data-id^=quiz_helper_]");
  const count = await helpers.count();
  expect(count).toBeGreaterThanOrEqual(2);
  for (const box of await helpers.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as { width: number; height: number; bottom: number; right: number }))) {
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(48);
    expect(box.bottom).toBeLessThanOrEqual(393);
    expect(box.right).toBeLessThanOrEqual(873);
  }
  await touch(page, page.locator(id("quiz_helper_hint")));
  await expect(page.locator(id("quiz_hint_text"))).toBeVisible();
  // one helper for each question
  await expect(page.locator("[data-id^=quiz_helper_]")).toHaveCount(0);
  const world = (await saved(page, "saves/world.json"))!;
  expect((world["items"] as Record<string, number>)["hint_feather"]).toBe(1);
});

test("Friends from the battle: four cards, details at the end, the partner changes and the question follows", async ({ page }, info) => {
  const party = [
    { id: "c1", species: "agnite", level: 6, xp: 1 },
    { id: "c2", species: "kroki", level: 7, xp: 0, name: "נוגה", hearts: 3 },
    { id: "c3", species: "squabbit", level: 5, xp: 0 },
    { id: "c4", species: "alphabel", level: 5, xp: 0 },
    { id: "c5", species: "pluson", level: 5, xp: 0 },
  ];
  await seedChild(page, { grade: 2, battle: true, creatures: party });
  await openMap(page);
  await steps(page, "right", 1);
  await touch(page, page.locator(id("battle_friends")));
  await expect(page.locator("[data-screen=friends]")).toBeVisible();
  await expect(page.locator("[data-id^=friend_c]")).toHaveCount(4);
  await expect(page.locator(id("friends_meadow"))).toBeVisible();
  await touch(page, page.locator(id("friend_c2")));
  await page.screenshot({ path: info.outputPath("friends.png") });
  const rects = await page.locator("[data-id^=friend_c], [data-id=friend_detail], [data-id=friend_partner]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as { x: number; width: number; height: number; right: number; bottom: number }));
  for (const b of rects) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(873);
    expect(b.bottom).toBeLessThanOrEqual(393);
    expect(b.height).toBeGreaterThanOrEqual(48);
  }
  await touch(page, page.locator(id("friend_partner")));
  await expect(page.locator(id("friend_said"))).toBeVisible();
  await touch(page, page.locator(id("sheet_close")));
  const world = (await saved(page, "saves/world.json"))!;
  expect((world["creatures"] as { id: string }[])[0]!.id).toBe("c2");
});
