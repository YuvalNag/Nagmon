import { battleResultClosed, id, quiz, saved } from "./cashier";
import { audit, answerOpen, arena, axe, probe, start } from "./battleKit";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * Battle v3, slice S2 (docs/app/BATTLE_V3.md 12.2) at the family's phone (873x393), at 100% and 130% text: the Finale
 * (three questions), a utility move and its status badges, the enemy's intents (Windup, mist, Thicken, Cheer Up),
 * the effect sheets. The screenshots are looked at (they are in test-results). The enemy's intents are scripted with
 * the test hook `nagmon.battle.intents`, the Spark with `nagmon.battle.spark`.
 */

test.describe.configure({ timeout: 300_000 });

const MATH = [
  { id: "c1", species: "heliobud", level: 8, xp: 0 },
  { id: "c2", species: "lunibble", level: 8, xp: 0 },
  { id: "c3", species: "terrabub", level: 8, xp: 0 },
];
const SCIENCE = [
  { id: "c1", species: "lunibble", level: 10, xp: 0 },
  { id: "c2", species: "heliobud", level: 8, xp: 0 },
  { id: "c3", species: "terrabub", level: 8, xp: 0 },
];

/** A question opens with its worked example the first time: close it. */
async function example(page: import("@playwright/test").Page) {
  if ((await quiz(page))?.phase === "example") await touch(page, page.locator(id("quiz_example_done")), 30);
}

for (const scale of [1, 1.3]) {
  test(`the Finale: a full Spark meter, three questions in one go, the meter is spent; at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-finale-${name}.png`) });
    await start(page, scale, { grade: 3, creatures: MATH, battleStart: { spark: 4, intents: "silly_dance,silly_dance,silly_dance,silly_dance" } });
    const p0 = await probe(page);
    expect(p0.spark).toBe(4);
    expect(p0.finale).toEqual({ ready: true, spark: 4 });
    await expect(page.locator(id("battle_finale"))).toBeVisible();
    await expect(page.locator(id("battle_spark"))).toHaveAttribute("data-full", "true");
    await shot("1-ready");
    await audit(page, "finale ready", { cards: true });
    await axe(page, "finale ready");
    await touch(page, page.locator(id("battle_finale")), 30);
    for (let i = 1; i <= 3; i++) {
      await expect(arena(page)).toHaveAttribute("data-view", "question");
      await example(page);
      await expect(page.locator(".cast-chip")).toContainText(`גמר ${i}/3`);
      if (i === 1) await shot("2-question");
      await answerOpen(page, "right");
      // the hit of this question is on the enemy at once (an attack sheet plays over it)
      if (i === 1) await expect(page.locator(".sprite-fx")).toHaveCount(1, { timeout: 800 });
      if (i < 3) {
        const p = await probe(page);
        expect(p.turns, "the enemy waits for the third question").toBe(0);
        await shot(`3-hit-${i}`);
        await expect(arena(page)).toHaveAttribute("data-flow", "asking", { timeout: 8000 });
        await example(page);
        await shot(`3-question-${i + 1}`);
        // (a three-line prompt at 130% text reaches the enemy's box: S1's question panel, seen in the screenshot, not audited here)
      }
    }
    await battleResultClosed(page);
    const after = await probe(page);
    expect(after.turns).toBe(1);
    expect(after.questions).toBe(3);
    // the meter is spent (a Silly Dance in the same round may give one star back)
    expect(after.spark).toBeLessThanOrEqual(1);
    expect(after.fog).toBeLessThan(after.maxFog / 2);
    await expect(page.locator(id("battle_finale"))).toHaveCount(0);
    await shot("4-after");
    await audit(page, "after the finale", { cards: true });
  });

  test(`a utility move heals and a Regen badge shows beside the bar; nothing is clipped; at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-utility-${name}.png`) });
    await start(page, scale, { grade: 3, creatures: SCIENCE, battleStart: { pep: 20, intents: "silly_dance,silly_dance,silly_dance,silly_dance,silly_dance" } });
    const p0 = await probe(page);
    expect(p0.cards.map((c) => c.id)).toEqual(["water_plink", "healing_rain", "leaf_flick", "sunbeam"]);
    await expect(page.locator(id("battle_move_healing_rain"))).toContainText("גשם מרפא");
    await shot("1-menu");
    await audit(page, "utility menu", { cards: true });
    await touch(page, page.locator(id("battle_move_healing_rain")), 30);
    await example(page);
    await expect(page.locator(".cast-chip")).toContainText("גשם מרפא");
    await answerOpen(page, "right");
    await expect(page.locator(".fx-layer.aura")).toHaveCount(1, { timeout: 800 });
    await expect(page.locator(".fx-layer.aura .aura-n")).toContainText("+");
    await shot("2-healed");
    await battleResultClosed(page);
    const p1 = await probe(page);
    expect(p1.pep).toBeGreaterThan(20);
    // no damage for a utility move, and no zero-damage beat to be sad about: the line says what it did
    expect(p1.fog).toBe(p1.maxFog);
    await touch(page, page.locator(id("battle_move_sunbeam")), 30);
    await answerOpen(page, "right");
    await battleResultClosed(page);
    const p2 = await probe(page);
    expect(p2.badges.mine).toContain("regen");
    await expect(page.locator("[data-id=badges_mine] [data-status=regen]")).toBeVisible();
    await shot("3-regen");
    await audit(page, "regen badge", { cards: true });
    await axe(page, "regen badge");
    // a wrong answer: the weak version still does something (a smaller heal), never nothing and never a punishment
    const before = (await probe(page)).pep;
    await touch(page, page.locator(id("battle_move_healing_rain")), 30);
    await answerOpen(page, "dont_know");
    await battleResultClosed(page);
    expect((await probe(page)).pep).toBeGreaterThanOrEqual(before);
    await expect.poll(async () => Number((await saved(page, "saves/world.json"))?.["money"] ?? 0)).toBe(0);
  });

  test(`the enemy's intents: a Windup ring, a drowsy mist that three taps wake, a dizzy swirl, Thicken and Cheer Up; at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-intents-${name}.png`) });
    await start(page, scale, { grade: 3, creatures: MATH, battleStart: { intents: "big_puff,drowsy_mist,silly_dance,dizzy_swirl,silly_dance,thicken,cheer_up,sticky_mud,silly_dance" } });
    // ---- the Windup: a ring with a 1 on the bubble ----
    await expect(page.locator(id("battle_intent"))).toHaveAttribute("data-intent", "big_puff");
    await expect(page.locator(".intent-ring")).toBeVisible();
    await shot("1-windup");
    await audit(page, "windup bubble", { cards: true });
    await touch(page, page.locator(id("battle_move_sum_spark")), 30);
    await answerOpen(page, "dont_know");
    await battleResultClosed(page);
    let p = await probe(page);
    expect(p.windup).toBe(true);
    expect(p.badges.theirs).toContain("windup");
    // the same bubble now says it is let go at the end of this round
    await expect(page.locator(".intent-ring")).toHaveAttribute("data-release", "true");
    await shot("2-release");
    await audit(page, "release bubble", { cards: true });
    await touch(page, page.locator(id("battle_move_sum_spark")), 30);
    await answerOpen(page, "dont_know");
    await battleResultClosed(page);
    p = await probe(page);
    expect(p.windup).toBe(false);
    expect(p.pep).toBeLessThan(p.maxPep);
    // ---- the drowsy mist: Yawn, only easy moves, three taps wake it ----
    await expect(page.locator(id("battle_intent"))).toHaveAttribute("data-intent", "drowsy_mist");
    await touch(page, page.locator(id("battle_move_sum_spark")), 30);
    await answerOpen(page, "dont_know");
    await battleResultClosed(page);
    p = await probe(page);
    expect(p.yawning).toBe(true);
    expect(p.badges.mine).toContain("drowsy");
    await expect(page.locator("[data-id=badges_mine] [data-status=drowsy]")).toBeVisible();
    await expect(page.locator(id("battle_wake"))).toBeVisible();
    // all four are above the easy tier: only the Little Wiggle (no question) is open
    await expect(page.locator(id("battle_move_little_wiggle"))).toBeEnabled();
    await expect(page.locator(".move-card")).toHaveCount(1);
    await shot("3-yawn");
    await audit(page, "yawn", { cards: true });
    await axe(page, "yawn");
    for (let i = 0; i < 3; i++) await touch(page, page.locator(id("battle_wake")), 30);
    await expect.poll(async () => (await probe(page)).yawning).toBe(false);
    await expect(page.locator(id("battle_move_times_twister"))).toBeEnabled();
    // ---- a Silly Dance gives a star; Dizzy Swirl: no stretch moves ----
    await touch(page, page.locator(id("battle_move_sum_spark")), 30);
    await answerOpen(page, "dont_know");
    await battleResultClosed(page);
    expect((await probe(page)).spark).toBeGreaterThanOrEqual(1);
    await expect(page.locator(id("battle_intent"))).toHaveAttribute("data-intent", "dizzy_swirl");
    await touch(page, page.locator(id("battle_move_sum_spark")), 30);
    await answerOpen(page, "dont_know");
    await battleResultClosed(page);
    p = await probe(page);
    expect(p.badges.mine).toContain("dizzy");
    await expect(page.locator(id("battle_move_times_twister"))).toBeDisabled();
    await shot("4-dizzy");
    await audit(page, "dizzy", { cards: true });
    // ---- Thicken puts a shield on the enemy, Cheer Up a boost ----
    await touch(page, page.locator(id("battle_move_sum_spark")), 30);
    await answerOpen(page, "dont_know");
    await battleResultClosed(page);
    await expect(page.locator(id("battle_intent"))).toHaveAttribute("data-intent", "thicken");
    await touch(page, page.locator(id("battle_move_sum_spark")), 30);
    await answerOpen(page, "dont_know");
    await battleResultClosed(page);
    p = await probe(page);
    expect(p.badges.theirs).toContain("shield");
    await shot("5-thicken");
    await audit(page, "thicken", { cards: true });
    await touch(page, page.locator(id("battle_move_sum_spark")), 30);
    await answerOpen(page, "dont_know");
    await battleResultClosed(page);
    p = await probe(page);
    expect(p.badges.theirs).toContain("boost");
    await shot("6-cheer");
    await audit(page, "cheer up", { cards: true });
    await axe(page, "cheer up");
  });
}
