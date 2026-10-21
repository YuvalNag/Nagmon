import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { battleResultClosed, castMove, id, openMap, quiz, saved, seedChild, steps } from "./cashier";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * Battle v3, slice S1 (docs/app/BATTLE_V3.md 12.1): four move cards, the question is the cast, a round (our move,
 * the enemy's intent, Pep and Fog), fainting and the free swap, Run, calm effects. At the family's phone (873x393),
 * at 100% and 130% text; the screenshots are looked at (they are in test-results).
 */

test.describe.configure({ timeout: 300_000 });

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
  name: string;
}
const apart = (a: Box, b: Box) => a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;

interface Probe {
  phase: string;
  mode: string;
  fog: number;
  maxFog: number;
  pep: number;
  maxPep: number;
  intent: string | null;
  turns: number;
  questions: number;
  needSwap: boolean;
  cards: { id: string; left: number | null; dimmed: boolean; hit: string | null }[];
  team: { id: string; fainted: boolean }[];
}
const probe = (page: Page) => page.evaluate(() => (window as unknown as { __nagmonBattle: () => Probe }).__nagmonBattle());

/** Where the things of the arena are, in CSS pixels, and whether any text is cut inside its button. */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const boxes = (sel: string): Box[] =>
      [...document.querySelectorAll(sel)].map((e) => {
        const b = e.getBoundingClientRect();
        return { l: b.left, t: b.top, r: b.right, b: b.bottom, name: (e as HTMLElement).dataset["id"] ?? e.className.toString() };
      });
    const section = document.querySelector<HTMLElement>("[data-screen=battle]")!;
    const clipped = [...document.querySelectorAll<HTMLElement>(".action-bar button, .quiz-foot button, .answer-ring button, .quiz-tiles button, .hud, .message-box, .cast-chip, .intent, .results")]
      .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
      .map((e) => e.dataset["id"] ?? e.className);
    return {
      creatures: [...boxes(".battle-pic.mine .monster-pic"), ...boxes(".battle-pic.theirs .monster-pic"), ...boxes(".battle-child")],
      bar: boxes(".action-bar button"),
      hud: boxes(".hud"),
      cover: [...boxes(".quiz-top"), ...boxes(".answer-ring > button"), ...boxes(".quiz-tiles"), ...boxes(".quiz-keys"), ...boxes(".quiz-foot > *"), ...boxes(".hud"), ...boxes(".message-box"), ...boxes(".intent")],
      clipped,
      vw: innerWidth,
      vh: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      sectionOverflow: section.scrollHeight > section.clientHeight + 1 || section.scrollWidth > section.clientWidth + 1,
    };
  });
}

/** Nothing overlaps, nothing is cut off, nothing scrolls, every button is 48 and more (the cards 150 x 56). */
async function audit(page: Page, where: string, opts: { cards?: boolean } = {}) {
  await page.evaluate(() => document.fonts.ready);
  const g = await geometry(page);
  for (const b of g.bar) {
    expect(Math.min(b.r - b.l, b.b - b.t), `${where}: ${b.name} is under 48`).toBeGreaterThanOrEqual(48);
    expect(b.l, `${where}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.r, `${where}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vw + 0.5);
    expect(b.b, `${where}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vh + 0.5);
    if (opts.cards && b.name.startsWith("battle_move_")) {
      expect(b.r - b.l, `${where}: ${b.name} is under 150 wide`).toBeGreaterThanOrEqual(150);
      expect(b.b - b.t, `${where}: ${b.name} is under 56 high`).toBeGreaterThanOrEqual(56);
    }
  }
  for (let i = 0; i < g.bar.length; i++) for (let j = i + 1; j < g.bar.length; j++) expect(apart(g.bar[i]!, g.bar[j]!), `${where}: ${g.bar[i]!.name} and ${g.bar[j]!.name} overlap`).toBe(true);
  for (const c of g.creatures) {
    for (const o of g.cover) expect(apart(c, o), `${where}: ${c.name} is covered by ${o.name}`).toBe(true);
    for (const o of g.bar) expect(apart(c, o), `${where}: ${c.name} is covered by ${o.name}`).toBe(true);
  }
  for (let i = 0; i < g.cover.length; i++) {
    const o = g.cover[i]!;
    expect(o.l, `${where}: ${o.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(o.r, `${where}: ${o.name} is cut off`).toBeLessThanOrEqual(g.vw + 0.5);
    expect(o.b, `${where}: ${o.name} is cut off`).toBeLessThanOrEqual(g.vh + 0.5);
  }
  // the two HUD cards stay apart, and the intent and the messages never sit on them
  expect(g.clipped, `${where}: text is cut inside a box`).toEqual([]);
  expect([g.scrollW <= g.vw, g.scrollH <= g.vh, g.sectionOverflow], `${where}: something scrolls`).toEqual([true, true, false]);
}

/** axe finds nothing on the screen showing (WCAG 2.2 A and AA, best practice). */
async function axe(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    `${where}: axe`,
  ).toEqual([]);
}

/** Answers the question open, whatever its look: right, or "don't know". */
async function answerOpen(page: Page, how: "right" | "dont_know") {
  if ((await quiz(page))!.phase === "example") await touch(page, page.locator(id("quiz_example_done")), 30);
  await expect(page.locator("[data-screen=quiz][data-phase=question]")).toBeVisible();
  const q = (await quiz(page))!;
  if (how === "dont_know") await touch(page, page.locator(id("quiz_dont_know")), 30);
  else if (q.kind === "number") {
    for (const k of String(q.answer)) await touch(page, page.locator(id(`quiz_key_${k}`)), 30);
    await touch(page, page.locator(id("quiz_check")), 30);
  } else if (q.kind === "order") {
    for (const c of q.answer as unknown as string[]) await touch(page, page.locator(id(`quiz_tile_${c}`)), 30);
    await touch(page, page.locator(id("quiz_check")), 30);
  } else if (q.kind === "letters") {
    const tiles = page.locator("[data-id^=quiz_tile_]");
    const used = new Set<number>();
    const texts = await tiles.allTextContents();
    for (const ch of String(q.answer)) {
      const i = texts.findIndex((t, k) => !used.has(k) && t.trim().toLowerCase() === ch.toLowerCase());
      used.add(i);
      await touch(page, tiles.nth(i), 30);
    }
    await touch(page, page.locator(id("quiz_check")), 30);
  } else await touch(page, page.locator(id(`quiz_choice_${q.answer}`)), 30);
  await expect(page.locator("[data-screen=battle]")).toHaveAttribute("data-flow", "result");
}

const arena = (page: Page) => page.locator("[data-screen=battle]");

async function start(page: Page, scale: number, o: { grade?: number; settings?: Record<string, unknown>; creatures?: Record<string, unknown>[]; battleScale?: number; battleStart?: Record<string, number> } = {}) {
  await page.addInitScript((s) => {
    const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
    set();
    document.addEventListener("DOMContentLoaded", set);
  }, scale);
  await seedChild(page, { grade: o.grade ?? 1, battle: true, settings: o.settings ?? {}, ...(o.creatures ? { creatures: o.creatures } : {}), ...(o.battleScale ? { battleScale: o.battleScale } : {}), ...(o.battleStart ? { battleStart: o.battleStart } : {}) });
  await openMap(page);
  await steps(page, "right", 1);
  await expect(page.locator("[data-screen=battle][data-view=meet]")).toBeVisible();
  // the intro (the enemy slides in, the cards rise) is over: the screenshots show the settled arena
  await page.waitForTimeout(1000);
}

const TEAM = [
  { id: "c1", species: "heliobud", level: 6, xp: 0 },
  { id: "c2", species: "lunibble", level: 6, xp: 0 },
  { id: "c3", species: "terrabub", level: 6, xp: 0 },
];

for (const scale of [1, 1.3]) {
  test(`a fight: the menu, a cast, the round, calm; nothing clipped, 48dp, axe clean, at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
    await start(page, scale, { creatures: TEAM });

    // ---- the menu: 4 cards, the strip, the bars, the intent, what the enemy loves ----
    const p0 = await probe(page);
    expect(p0.cards).toHaveLength(4);
    expect(p0.intent).toMatch(/puff|giggle|silly/);
    expect(p0.team).toHaveLength(3);
    await expect(page.locator(".move-card")).toHaveCount(4);
    await expect(page.locator(id("partner_pep"))).toBeVisible();
    await expect(page.locator(id("wild_hp"))).toBeVisible();
    await expect(page.locator(id("battle_intent"))).toBeVisible();
    await expect(page.locator(id("battle_loves"))).toHaveAttribute("data-known", "true");
    for (const b of ["battle_net", "battle_bag", "battle_run"]) await expect(page.locator(id(b))).toBeVisible();
    await expect(page.locator(id("battle_net"))).toBeDisabled();
    for (const old of ["battle_fight", "battle_move", "battle_friend", "battle_special", "battle_charge"]) await expect(page.locator(id(old))).toHaveCount(0);
    await shot("1-menu");
    await audit(page, "menu", { cards: true });
    await axe(page, "menu");

    // ---- a cast: the card opens its question, the move's name heads it ----
    await touch(page, page.locator(id("battle_move_sum_spark")), 30);
    await expect(arena(page)).toHaveAttribute("data-view", "question");
    if ((await quiz(page))!.phase === "example") {
      await shot("2-example");
      await touch(page, page.locator(id("quiz_example_done")), 30);
    }
    await expect(page.locator(".cast-chip")).toContainText("ניצוץ סכום");
    await shot("3-question");
    await audit(page, "question");
    await axe(page, "question");
    const before = await probe(page);
    await answerOpen(page, "right");
    await shot("4-result");
    await audit(page, "result");
    await battleResultClosed(page);
    const after = await probe(page);
    expect(after.fog).toBeLessThan(before.fog);
    expect(after.turns).toBe(1);
    expect(after.questions).toBe(1);
    // the bars and the next intent are in view again
    await expect(page.locator(id("battle_intent"))).toBeVisible();
    await shot("5-after-round");
    await audit(page, "after round", { cards: true });

    // ---- a wrong answer: a weak hit (at least 1), nothing lost ----
    const fog1 = after.fog;
    await touch(page, page.locator(id("battle_move_add_it_up")), 30);
    await answerOpen(page, "dont_know");
    await shot("6-wrong");
    await battleResultClosed(page);
    const afterWrong = await probe(page);
    expect(afterWrong.fog).toBeLessThan(fog1);
    expect(fog1 - afterWrong.fog).toBeLessThan(10);
    // right answers pay nothing by themselves: the win pays
    await expect.poll(async () => Number((await saved(page, "saves/world.json"))?.["money"] ?? 0)).toBe(0);

    // ---- right answers calm it; the results card, the Net ----
    for (let i = 0; i < 20 && (await arena(page).getAttribute("data-view")) !== "calm"; i++) {
      if ((await arena(page).getAttribute("data-view")) === "swap") {
        const next = (await probe(page)).team.find((t) => !t.fainted && t.id !== "c1");
        await touch(page, page.locator(id(`battle_friend_${next!.id}`)), 30);
      }
      await castMove(page);
      await answerOpen(page, "right");
      await battleResultClosed(page);
      if (await page.locator(id("growth_close")).count()) await touch(page, page.locator(id("growth_close")), 30);
    }
    await expect(arena(page)).toHaveAttribute("data-view", "calm");
    await expect(page.locator(id("battle_results"))).toBeVisible();
    await expect(page.locator("[data-star=calm]")).toHaveAttribute("data-on", "true");
    await expect(page.locator(id("battle_net"))).toBeEnabled();
    await shot("7-calm");
    await audit(page, "calm");
    await axe(page, "calm");
    const world = (await saved(page, "saves/world.json"))!;
    expect(Number(world["money"])).toBeGreaterThanOrEqual(5 + 3);
  });

  test(`a friend falls asleep and is swapped for another, free; it stays asleep; at ${scale * 100}% text`, async ({ page }, info) => {
    const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-faint-${name}.png`) });
    // grade 3 is nine years old (no Brave Heart); the partner starts with 1 Pep so the first Puff puts it to sleep
    await start(page, scale, { grade: 3, creatures: TEAM, battleStart: { pep: 1 } });
    let probeNow = await probe(page);
    expect(probeNow.pep).toBe(1);
    for (let i = 0; i < 25 && !probeNow.needSwap; i++) {
      await castMove(page);
      await answerOpen(page, "dont_know");
      await battleResultClosed(page);
      probeNow = await probe(page);
      if (probeNow.phase !== "fighting") break;
    }
    expect(probeNow.needSwap).toBe(true);
    await expect(arena(page)).toHaveAttribute("data-view", "swap");
    await expect(page.locator(id("battle_message"))).toContainText("נרדם");
    await expect(page.locator(id("battle_friend_c1"))).toHaveAttribute("data-asleep", "true");
    await expect(page.locator(".blanket")).toBeVisible();
    await expect(page.locator(".move-card:not(:disabled)")).toHaveCount(0);
    await shot("1-asleep");
    await audit(page, "asleep", { cards: true });
    await axe(page, "asleep");
    // the sleeper cannot be picked; the others pulse
    await expect(page.locator(id("battle_friend_c1"))).toBeDisabled();
    await expect(page.locator(id("battle_friend_c2"))).toBeEnabled();
    // saved at once
    const w1 = (await saved(page, "saves/world.json"))!;
    expect((w1["creatures"] as { id: string; fainted?: boolean }[]).find((c) => c.id === "c1")!.fainted).toBe(true);
    const turns = probeNow.turns;
    await touch(page, page.locator(id("battle_friend_c2")), 30);
    // free: no round passed; the friend is full and the cards are open
    await expect(arena(page)).toHaveAttribute("data-view", "turn");
    probeNow = await probe(page);
    expect(probeNow.turns).toBe(turns);
    expect(probeNow.pep).toBe(probeNow.maxPep);
    await expect(page.locator(".move-card:not(:disabled)").first()).toBeVisible();
    await expect(page.locator(id("battle_friend_c1"))).toBeDisabled();
    await shot("2-swapped");
    await audit(page, "swapped", { cards: true });
    // nothing wakes it: run away, and it is still asleep in the save
    await touch(page, page.locator(id("battle_run")), 30);
    await expect(arena(page)).toHaveCount(0);
    await expect.poll(async () => ((await saved(page, "saves/world.json"))!["creatures"] as { id: string; fainted?: boolean }[]).filter((c) => c.fainted).map((c) => c.id)).toEqual(["c1"]);
    await expect(page.locator(id("dpad"))).toBeVisible();
  });
}

test("Run always works, straight from the meeting", async ({ page }) => {
  await start(page, 1);
  await touch(page, page.locator(id("battle_run")), 30);
  await expect(arena(page)).toHaveCount(0);
  await expect(page.locator(id("dpad"))).toBeVisible();
  const world = (await saved(page, "saves/world.json"))!;
  expect((world["creatures"] as unknown[]).length).toBe(1);
});

test("the whole team asleep: carried back to the Rest Center, healed, free", async ({ page }, info) => {
  await start(page, 1.3, { grade: 3, creatures: [{ id: "c1", species: "heliobud", level: 6, xp: 0 }], battleStart: { pep: 1 } });
  for (let i = 0; i < 25 && !(await page.locator("[data-screen=carried]").count()); i++) {
    await castMove(page);
    await answerOpen(page, "dont_know");
    await expect(page.locator("[data-screen=battle][data-asking=false][data-turn=idle], [data-screen=carried]").first()).toBeVisible({ timeout: 15_000 });
  }
  await expect(page.locator("[data-screen=carried]")).toBeVisible();
  await page.screenshot({ path: info.outputPath("carried.png") });
  await expect(page.locator(id("battle_carried"))).toContainText("מרכז המנוחה");
  const world = (await saved(page, "saves/world.json"))!;
  expect((world["creatures"] as { fainted?: boolean }[]).every((c) => !c.fainted)).toBe(true);
  await touch(page, page.locator(id("battle_carried_ok")), 30);
  await expect(page.locator(id("dpad"))).toBeVisible();
});

test("calm effects: no shake and no flight; the numbers and the round still show, at 130% text", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(page, 1.3, { creatures: TEAM });
  await expect(arena(page)).toHaveAttribute("data-calm-fx", "true");
  await touch(page, page.locator(id("battle_move_number_nudge")), 30);
  await answerOpen(page, "right");
  await expect(page.locator(".fx-number").first()).toBeVisible();
  await expect(page.locator(".fx-bolt")).toHaveCount(0);
  expect(await page.locator(".fx-star").count()).toBe(1);
  await page.screenshot({ path: info.outputPath("calm-result.png") });
  await battleResultClosed(page);
  // the cards are back and work
  await expect(page.locator(".move-card:not(:disabled)").first()).toBeVisible();
  await audit(page, "calm after round", { cards: true });
});

test("at the real speed a round takes its beats, and a tap speeds it up, a second tap skips it", async ({ page }, info) => {
  await start(page, 1, { battleScale: 1, creatures: TEAM });
  // the meeting itself: the cards are there at once (the intro never blocks a tap)
  await expect(page.locator(".move-card:not(:disabled)").first()).toBeVisible();
  await touch(page, page.locator(id("battle_move_sum_spark")), 30);
  await answerOpen(page, "dont_know");
  // the answer's line is 2.2 s for a wrong answer; a tap on it goes on after a moment
  await page.waitForTimeout(400);
  await touch(page, page.locator(id("battle_skip")), 30);
  const playing = arena(page);
  if ((await playing.getAttribute("data-turn")) === "playing") {
    const t0 = Date.now();
    // the enemy's beat (1.5 s) and the tick (0.4 s): two quick taps on the arena end it
    const layer = page.locator(id("battle_pace"));
    if (await layer.count()) {
      await touch(page, layer, 30);
      await touch(page, layer, 30).catch(() => undefined);
    }
    await expect(playing).toHaveAttribute("data-turn", "idle", { timeout: 6000 });
    expect(Date.now() - t0).toBeLessThan(1900);
  }
  await page.screenshot({ path: info.outputPath("real-speed.png") });
});

test("a move tapped late in the enemy's beat waits and opens at the end of the round", async ({ page }) => {
  await start(page, 1, { battleScale: 0.5, creatures: TEAM });
  await touch(page, page.locator(id("battle_move_sum_spark")), 30);
  await answerOpen(page, "dont_know");
  await page.waitForTimeout(350);
  await touch(page, page.locator(id("battle_skip")), 30);
  let queued: Locator | null = null;
  for (let i = 0; i < 60 && (await arena(page).getAttribute("data-turn")) === "playing"; i++) {
    const live = (await page.locator(".action-bar").getAttribute("data-live")) === "true";
    const card = page.locator(".move-card:not(:disabled)").first();
    if (live && (await card.count())) {
      await touch(page, card, 30);
      queued = card;
      break;
    }
    await page.waitForTimeout(40);
  }
  if (queued) {
    await expect(page.locator(".move-card.queued")).toHaveCount(1);
    await expect(arena(page)).toHaveAttribute("data-view", "question", { timeout: 10_000 });
  } else {
    // the enemy had no beat to tap in (a Silly turn is quick, or the round ended first): nothing to check
    await expect(arena(page)).toHaveAttribute("data-turn", "idle");
  }
});
