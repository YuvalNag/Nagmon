import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { id, openMap, quiz, seedChild, steps } from "./cashier";
import { expect } from "./fixtures";
import { touch } from "./touch";

/** Shared by the battle specs of S2 (a copy of the helpers of battle_v3.spec.ts: the geometry audit, axe, answering, starting a fight). */

export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
  name: string;
}
const apart = (a: Box, b: Box) => a.r <= b.l + 0.5 || b.r <= a.l + 0.5 || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;

export interface Probe {
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
  spark: number;
  yawning: boolean;
  finale: { ready: boolean; spark: number } | null;
  badges: { mine: string[]; theirs: string[] };
  peek: string[];
  windup: boolean;
}
export const probe = (page: Page) => page.evaluate(() => (window as unknown as { __nagmonBattle: () => Probe }).__nagmonBattle());

/** Where the things of the arena are, in CSS pixels, and whether any text is cut inside its button. */
export async function geometry(page: Page) {
  return page.evaluate(() => {
    const boxes = (sel: string): Box[] =>
      [...document.querySelectorAll(sel)].map((e) => {
        const b = e.getBoundingClientRect();
        return { l: b.left, t: b.top, r: b.right, b: b.bottom, name: (e as HTMLElement).dataset["id"] ?? e.className.toString() };
      });
    const section = document.querySelector<HTMLElement>("[data-screen=battle]")!;
    const clipped = [...document.querySelectorAll<HTMLElement>(".action-bar button, .quiz-foot button, .answer-ring button, .quiz-tiles button, .hud, .message-box, .cast-chip, .intent, .results, .finale-pill, .badge, .hud-extra, .intent-peek")]
      .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
      .map((e) => e.dataset["id"] ?? e.className);
    return {
      creatures: [...boxes(".battle-pic.mine .monster-pic"), ...boxes(".battle-pic.theirs .monster-pic"), ...boxes(".battle-child")],
      bar: boxes(".action-bar button"),
      hud: boxes(".hud"),
      cover: [...boxes(".quiz-top"), ...boxes(".answer-ring > button"), ...boxes(".quiz-tiles"), ...boxes(".quiz-keys"), ...boxes(".quiz-foot > *"), ...boxes(".hud"), ...boxes(".message-box"), ...boxes(".intent"), ...boxes(".finale-pill"), ...boxes(".wake-tap")],
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
export async function audit(page: Page, where: string, opts: { cards?: boolean } = {}) {
  await page.evaluate(() => document.fonts.ready);
  // the creatures bob and fade: measure once the boxes hold still (two samples agree)
  let g = await geometry(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const again = await geometry(page);
    const same = JSON.stringify([again.creatures, again.cover]) === JSON.stringify([g.creatures, g.cover]);
    g = again;
    if (same) break;
  }
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
export async function axe(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    `${where}: axe`,
  ).toEqual([]);
}

/** Answers the question open, whatever its look: right, or "don't know". */
export async function answerOpen(page: Page, how: "right" | "dont_know") {
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

export const arena = (page: Page) => page.locator("[data-screen=battle]");

export async function start(page: Page, scale: number, o: { grade?: number; settings?: Record<string, unknown>; creatures?: Record<string, unknown>[]; battleScale?: number; battleStart?: Record<string, number | string> } = {}) {
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

export const TEAM = [
  { id: "c1", species: "heliobud", level: 6, xp: 0 },
  { id: "c2", species: "lunibble", level: 6, xp: 0 },
  { id: "c3", species: "terrabub", level: 6, xp: 0 },
];

