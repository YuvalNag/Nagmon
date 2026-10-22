import { PID, answer, battleAnswer, battleResultClosed, castMove, coins, debug, id, openMap, quiz, readDialog, saved, seedChild, steps, toCashier } from "./cashier";
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
  // his greeting of the day is the first page of the same box; the old words follow, as before
  expect(hello).toHaveLength(3);
  expect(hello[0]).toMatch(/^המוכר אבי: /);
  expect(hello.slice(1)).toEqual(["המוכר אבי: שלום! אני סופר את הכסף בקופה.", "אפשר לעזור לי עם חשבון קטן?"]);

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
  // three pages: his greeting of the day, then the old two
  await back();
  await expect(layer).toHaveAttribute("data-page", "1");
  await expect(layer).toHaveAttribute("data-full", "true", { timeout: 10_000 });
  await back();
  await expect(layer).toHaveAttribute("data-page", "2");
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
  await expect(page.locator(".move-card")).toHaveCount(4);
  await shot("b01_meet");
  const hp0 = Number(await battle.getAttribute("data-hp"));

  // a wrong answer: the move is weak (a little fog), and nobody is hurt in a lasting way
  await castMove(page);
  await battleAnswer(page, "dont_know");
  await shot("b02_result_wrong");
  await battleResultClosed(page);
  await expect(battle).toHaveAttribute("data-view", "turn");
  const hp1 = Number(await battle.getAttribute("data-hp"));
  expect(hp1).toBeLessThan(hp0);
  expect(hp1).toBeGreaterThan(hp0 - 15);
  await shot("b03_weak_hit");

  // right answers calm it
  for (let i = 0; i < 20 && (await battle.getAttribute("data-view")) !== "calm"; i++) {
    await castMove(page);
    await battleAnswer(page, "right");
    if (i === 0) await shot("b04_hit");
    await battleResultClosed(page);
    if (await page.locator(id("growth_close")).count()) await touch(page, page.locator(id("growth_close")));
  }
  await expect(battle).toHaveAttribute("data-view", "calm");
  expect(Number(await battle.getAttribute("data-hp"))).toBe(0);
  await expect(page.locator(id("battle_results"))).toBeVisible();
  await shot("b05_calm");
  // nobody joined yet; the Net pulses
  await expect(page.locator(id("battle_net"))).toBeEnabled();
  // the net, a wrong seal answer (the net bounces back), then a right one
  await touch(page, page.locator(id("battle_net")));
  await battleAnswer(page, "dont_know");
  await battleResultClosed(page);
  await expect(battle).toHaveAttribute("data-view", "calm");
  await shot("b06_try_again");
  // a grown-up creature needs three seal answers
  for (let i = 0; i < 3 && !(await page.locator("[data-screen=battle-caught]").count()); i++) {
    await touch(page, page.locator(id("battle_net")));
    await battleAnswer(page, "right");
    await battleResultClosed(page);
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

test("naming a new friend with the letter board: the board covers the map, every key can be tapped, the name is saved", async ({ page }, info) => {
  await seedChild(page, { grade: 2, battle: true, creatures: [{ id: "c1", species: "heliobud", level: 12, xp: 0 }] });
  await openMap(page);
  await steps(page, "right", 1);
  const battle = page.locator("[data-screen=battle]");
  await expect(battle).toBeVisible();
  const growth = async () => {
    if (await page.locator(id("growth_close")).count()) await touch(page, page.locator(id("growth_close")), 30);
  };
  for (let i = 0; i < 30 && (await battle.getAttribute("data-view")) !== "calm"; i++) {
    await castMove(page);
    await battleAnswer(page, "right");
    await battleResultClosed(page);
    await growth();
  }
  await expect(battle).toHaveAttribute("data-view", "calm");
  for (let i = 0; i < 6 && !(await page.locator("[data-screen=battle-caught]").count()); i++) {
    await touch(page, page.locator(id("battle_net")));
    await battleAnswer(page, "right");
    await battleResultClosed(page);
    await growth();
  }
  await expect(page.locator("[data-screen=battle-caught]")).toBeVisible();
  await touch(page, page.locator(id("battle_name_own")));

  // the board is on top of the map: its keys are what a finger hits (the old bug: the map's canvas lay over it)
  const board = page.locator("[data-screen=letters]");
  await expect(board).toBeVisible();
  await page.screenshot({ path: info.outputPath("n01_board.png") });
  for (const key of ["letter_נ", "letter_ת", "board_done", "board_delete"]) {
    const hit = await page.locator(id(key)).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { inside: !!top && (top === el || el.contains(top)), w: r.width, h: r.height, bottom: r.bottom };
    });
    expect(hit.inside, key).toBe(true);
    expect(Math.min(hit.w, hit.h), key).toBeGreaterThanOrEqual(40);
    expect(hit.bottom, key).toBeLessThanOrEqual(393);
  }
  await expect(page.locator(id("board_done"))).toBeDisabled();
  for (const c of "נתן") await touch(page, page.locator(id(`letter_${c}`)));
  await expect(page.locator(id("typed"))).toHaveText("נתן");
  await touch(page, page.locator(id("board_done")));
  await expect(battle).toHaveCount(0);
  await expect(page.locator(id("dpad"))).toBeVisible();
  await expect.poll(async () => ((await saved(page, "saves/world.json"))?.["creatures"] as { name?: string }[] | undefined)?.[1]?.name).toBe("נתן");
});

test("a new child (grade 0): the first map opens under the owl, not a black screen; the owl speaks", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  // a phone is slower than this machine
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await seedChild(page, { grade: 0, intro: true });
  await page.goto("/");
  await touch(page, page.locator(id(`child_${PID}`)));
  await expect(page.locator("[data-screen=play][data-map=ready][data-play=ready]")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("[data-screen=map-failed]")).toHaveCount(0);
  await expect(page.locator("[data-screen=dialog]")).toBeVisible();
});

test("the battle's menu: the friends strip, four move cards of 150x56 and more, Net, Bag and Run, all in the bottom third", async ({ page }, info) => {
  await seedChild(page, { grade: 2, battle: true });
  await openMap(page);
  await steps(page, "right", 1);
  const battle = page.locator("[data-screen=battle]");
  await expect(battle).toBeVisible();
  await page.screenshot({ path: info.outputPath("bar.png") });
  const boxes = await page.locator(".action-bar button").evaluateAll((els) => els.map((e) => ({ id: (e as HTMLElement).dataset["id"]!, ...(e.getBoundingClientRect().toJSON() as { x: number; y: number; width: number; height: number; right: number; bottom: number }) })));
  const cards = boxes.filter((b) => b.id.startsWith("battle_move_"));
  const friends = boxes.filter((b) => b.id.startsWith("battle_friend_"));
  const side = boxes.filter((b) => ["battle_net", "battle_bag", "battle_run"].includes(b.id));
  expect([cards.length, friends.length, side.length]).toEqual([4, 1, 3]);
  for (const b of cards) {
    expect(b.width, b.id).toBeGreaterThanOrEqual(150);
    expect(b.height, b.id).toBeGreaterThanOrEqual(56);
  }
  for (const b of [...friends, ...side]) expect(Math.min(b.width, b.height), b.id).toBeGreaterThanOrEqual(48);
  for (const b of boxes) {
    expect(b.y, b.id).toBeGreaterThanOrEqual(393 - 142 - 1);
    expect(b.bottom, b.id).toBeLessThanOrEqual(393);
    expect(b.x, b.id).toBeGreaterThanOrEqual(0);
    expect(b.right, b.id).toBeLessThanOrEqual(873);
  }
  // Hebrew runs right to left: the friends strip at the right edge, then the cards, then Net, Bag and Run at the end
  expect(friends[0]!.x).toBeGreaterThan(cards[0]!.right - 1);
  expect(Math.max(...side.map((b) => b.right))).toBeLessThanOrEqual(Math.min(...cards.map((c) => c.x)) + 1);
  // the creatures above are not covered by the bar
  const pics = await page.locator(".battle-pic .monster-pic").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
  for (const bottom of pics) expect(bottom).toBeLessThanOrEqual(Math.min(...boxes.map((b) => b.y)) + 1);
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
  await castMove(page);
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

test("Friends from the battle: the strip shows the party, a tap swaps (the turn is used) and the cards follow the new partner", async ({ page }, info) => {
  const party = [
    { id: "c1", species: "heliobud", level: 6, xp: 1 },
    { id: "c2", species: "lunibble", level: 7, xp: 0, name: "נוגה", hearts: 3 },
    { id: "c3", species: "terrabub", level: 5, xp: 0 },
    { id: "c4", species: "sailbit", level: 5, xp: 0 },
    { id: "c5", species: "solwind", level: 5, xp: 0 },
  ];
  await seedChild(page, { grade: 2, battle: true, creatures: party });
  await openMap(page);
  await steps(page, "right", 1);
  const battle = page.locator("[data-screen=battle]");
  await expect(battle).toBeVisible();
  await expect(page.locator("[data-id^=battle_friend_c]")).toHaveCount(4);
  await expect(page.locator(id("battle_move_sum_spark"))).toBeVisible();
  await page.screenshot({ path: info.outputPath("friends.png") });
  for (const b of await page.locator("[data-id^=battle_friend_c]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as { x: number; width: number; height: number; right: number; bottom: number }))) {
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(48);
    expect(b.right).toBeLessThanOrEqual(873);
    expect(b.bottom).toBeLessThanOrEqual(393);
  }
  await touch(page, page.locator(id("battle_friend_c2")));
  await expect(battle).toHaveAttribute("data-turn", "playing");
  await battleResultClosed(page);
  // the partner is Lunibble now: its own cards (Science), and the world remembers
  await expect(page.locator(id("battle_move_leaf_flick"))).toBeVisible();
  await expect(page.locator(id("battle_move_sum_spark"))).toHaveCount(0);
  await expect(page.locator(id("battle_friend_c2"))).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => ((await saved(page, "saves/world.json"))!["creatures"] as { id: string }[])[0]!.id).toBe("c2");
});
