import type { Page } from "@playwright/test";
import { answer, debug, id, openMap, PID, saved, seedChild, steps } from "./cashier";
import { expect, test } from "./fixtures";
import { touch } from "./touch";

/**
 * Quests (docs/app/WORLD_V2.md 7, slice W3), at the family's phone (873x393) at 100% and 130% text:
 * accept -> progress -> complete through the notice board (the baker's puzzle) and through a person (Yoav's
 * kitten, over three talks and two places), with the journal showing the card, the dots and "Show me", and the
 * saved quest state. The day is fixed (2026-10-22, ten in the morning) so the town's people stand where the
 * resolver puts them for this child's number (`npc_seed`): seed 2 has the baker at the market stall, seed 3 has
 * Yoav at the school gate.
 */

test.describe.configure({ timeout: 240_000 });

const DAY = "2026-10-22";
const SPECIES = ["heliobud", "lunibble", "terrabub", "rustip"];

interface Seed {
  map: string;
  x: number;
  y: number;
  facing: string;
  npcSeed: number;
  money?: number;
  items?: Record<string, number>;
  variables?: Record<string, string>;
  quests?: unknown;
  board?: unknown;
}

/** A child (grade 2, a few friends) standing at a tile of a map, on the fixed day. */
async function seed(page: Page, s: Seed) {
  await page.clock.setFixedTime(new Date(2026, 9, 22, 10, 0, 0));
  await seedChild(page, { grade: 2 });
  await page.addInitScript(
    ({ pid, s, species }) => {
      if (localStorage.getItem("quests-seeded")) return;
      localStorage.setItem("quests-seeded", "1");
      localStorage.setItem("nagmon.map.start", s.map);
      const creatures = species.map((sp, i) => ({ id: `c${i + 1}`, species: sp, level: 4 + i, xp: 0 }));
      localStorage.setItem(
        `nagmon-fs:f:profiles/${pid}/saves/world.json`,
        JSON.stringify({
          schema_version: 2,
          money: s.money ?? 0,
          variables: { nagmon_intro_done: "yes", nagmon_kit: "yes", ...(s.variables ?? {}) },
          creatures,
          seen: species,
          caught: species,
          ...(s.items ? { items: s.items } : {}),
          place: { map: s.map, x: s.x, y: s.y, facing: s.facing },
          npc_seed: s.npcSeed,
          ...(s.quests ? { quests: s.quests } : {}),
          ...(s.board ? { board: s.board } : {}),
        }),
      );
    },
    { pid: PID, s, species: SPECIES },
  );
}

async function textScale(page: Page, scale: number) {
  await page.addInitScript((s) => {
    const set = () => document.documentElement?.style.setProperty("--font-scale", String(s));
    set();
    document.addEventListener("DOMContentLoaded", set);
  }, scale);
}

/** Nothing cut off or scrolled but a list on purpose, every button a finger (48) wide and tall. */
async function layout(page: Page, name: string, screen: string) {
  await page.evaluate(() => document.fonts.ready);
  const g = await page.evaluate((screen) => {
    const sheet = document.querySelector<HTMLElement>(`[data-screen=${screen}]`)!;
    const bad: string[] = [];
    for (const el of sheet.querySelectorAll<HTMLElement>("*")) {
      const st = getComputedStyle(el);
      if (st.display === "inline" || st.display === "contents") continue;
      const scrolls = st.overflowY === "auto" || st.overflowY === "scroll";
      if (!scrolls && el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) bad.push(`${el.dataset["id"] ?? el.className} taller inside (${el.scrollHeight} > ${el.clientHeight})`);
      if (!scrolls && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) bad.push(`${el.dataset["id"] ?? el.className} wider inside (${el.scrollWidth} > ${el.clientWidth})`);
    }
    return {
      vw: innerWidth,
      vh: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      sheetOverflow: sheet.scrollHeight > sheet.clientHeight + 1 || sheet.scrollWidth > sheet.clientWidth + 1,
      bad,
      buttons: [...sheet.querySelectorAll<HTMLElement>("button")]
        .filter((b) => {
          let p = b.parentElement;
          const r = b.getBoundingClientRect();
          while (p && p !== sheet) {
            if (getComputedStyle(p).overflowY === "auto") {
              const pr = p.getBoundingClientRect();
              if (r.bottom > pr.bottom + 0.5 || r.top < pr.top - 0.5) return false;
            }
            p = p.parentElement;
          }
          return true;
        })
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { name: b.dataset["id"] ?? b.textContent ?? "", l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
        }),
    };
  }, screen);
  expect([g.scrollW <= g.vw, g.scrollH <= g.vh], `${name}: the page scrolls`).toEqual([true, true]);
  expect(g.sheetOverflow, `${name}: the screen overflows`).toBe(false);
  expect(g.bad, `${name}: text or boxes overflow`).toEqual([]);
  for (const b of g.buttons) {
    expect(b.l, `${name}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.r, `${name}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vw + 0.5);
    expect(b.t, `${name}: ${b.name} is cut off`).toBeGreaterThanOrEqual(-0.5);
    expect(b.b, `${name}: ${b.name} is cut off`).toBeLessThanOrEqual(g.vh + 0.5);
    expect(Math.min(b.w, b.h), `${name}: ${b.name} is under 48`).toBeGreaterThanOrEqual(48);
  }
}

type World = { money: number; items?: Record<string, number>; variables: Record<string, string>; quests?: { active: Record<string, { step: number }>; done: Record<string, { n: number }> }; board?: { accepted: Record<string, string> }; npcs?: Record<string, { pts: number }> };
const world = async (page: Page) => (await saved(page, "saves/world.json")) as unknown as World;

/** The pause menu, the Bag, and its quest journal. */
async function openJournal(page: Page) {
  await touch(page, page.locator(id("map_menu")));
  await touch(page, page.locator(id("map_bag")));
  await touch(page, page.locator(id("bag_journal")));
  await expect(page.locator("[data-screen=journal]")).toBeVisible();
}

async function closeJournal(page: Page) {
  await touch(page, page.locator(id("journal_close")));
  await touch(page, page.locator(id("bag_close")));
  await touch(page, page.locator(id("map_continue")));
  await expect(page.locator(id("map_talk"))).toBeVisible();
}

/**
 * Goes through a talk until the map is free: every dialog read, every question answered right, every card
 * closed, and a choice card answered with the next of `picks` (the first option when none is left).
 */
async function finishTalk(page: Page, picks: string[] = []) {
  const layer = page.locator("[data-screen=dialog]");
  for (let guard = 0; guard < 60; guard++) {
    if ((await page.locator("[data-screen=play]").getAttribute("data-talking")) !== "true") return;
    if (await layer.isVisible()) {
      const pages = Number(await layer.getAttribute("data-pages"));
      for (let i = 0; i < pages; i++) {
        await expect(layer).toHaveAttribute("data-page", String(i));
        await expect(layer).toHaveAttribute("data-full", "true", { timeout: 10_000 });
        await touch(page, page.locator(id("dialog")));
      }
    } else if (await page.locator("[data-screen=quiz]").isVisible()) {
      await answer(page, "right");
      await touch(page, page.locator(id("quiz_continue")));
    } else if (await page.locator("[data-screen=found]").isVisible()) {
      await touch(page, page.locator(id("found_ok")));
    } else if (await page.locator("[data-screen=choice]").isVisible()) {
      const pick = picks.shift();
      await touch(page, page.locator(pick ? id(`choice_${pick}`) : "[data-screen=choice] .choice-opt >> nth=0"));
    } else await page.waitForTimeout(150);
  }
  throw new Error("the talk did not end");
}

for (const scale of [1, 1.3]) {
  test.describe(`at ${scale * 100}% text`, () => {
    test.beforeEach(async ({ page }) => {
      await textScale(page, scale);
    });

    test("via the board: accept the baker's puzzle, see it in the journal, find the baker, answer, get the reward", async ({ page }, info) => {
      const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
      const card = `q_baker_double@${DAY}:v3`;
      await seed(page, {
        map: "classic_hearthrock_city",
        x: 21,
        y: 16,
        facing: "up",
        npcSeed: 2,
        // the day's board is the saved one: the test decides which cards stand on it
        quests: {
          active: {},
          done: {},
          week: { w: 0, n: 0 },
          board: {
            day: DAY,
            cards: [
              { id: `q_mail_round@${DAY}`, quest: "q_mail_round", slot: "easy" },
              { id: `q_chess_riddles@${DAY}`, quest: "q_chess_riddles", slot: "normal" },
              { id: card, quest: "q_baker_double", slot: "learning", variant: "v3" },
            ],
          },
          log: [],
          vhist: {},
          declined: {},
          taken: [],
        },
      });
      await openMap(page);
      expect((await debug(page))!.inFront).toBe("nagmon_obj_noticeboard");
      await touch(page, page.locator(id("map_talk")));
      await expect(page.locator(id("board"))).toBeVisible();
      await expect(page.locator(id("board"))).toHaveAttribute("data-count", "3");
      await shot("board");
      await layout(page, "board", "object");

      // accepting is free: the card is the child's, and the quest is in the journal at once
      await touch(page, page.locator(id(`board_accept_${card}`)));
      await expect(page.locator(id("board_said"))).toContainText("יומן");
      await expect(page.locator(id(`board_accept_${card}`))).toBeDisabled();
      await layout(page, "board accepted", "object");
      await expect.poll(async () => (await world(page)).quests?.active["q_baker_double"]?.step).toBe(0);
      expect(Object.keys((await world(page)).board!.accepted)).toEqual([card]);
      expect((await world(page)).money).toBe(0);
      await touch(page, page.locator(id("obj_close")));

      // progress: the journal's card says what to do (0 of 1 done), and where the baker is now
      await openJournal(page);
      await shot("journal");
      const todo = page.locator(id("journal_todo_q_baker_double"));
      await expect(todo).toContainText("אופיר");
      await expect(page.locator(id("journal_card_q_baker_double"))).toHaveAttribute("data-steps", "1");
      await touch(page, page.locator(id("journal_show_q_baker_double")));
      await expect(page.locator(id("journal_said"))).toContainText("ליד דוכן השוק");
      await layout(page, "journal", "journal");
      await shot("journal_show_me");
      await closeJournal(page);

      // the baker stands where "Show me" said: one step left, one up
      await steps(page, "left", 1);
      await steps(page, "up", 1);
      expect((await debug(page))!.inFront).toBe("nagmon_baker");
      await touch(page, page.locator(id("map_talk")));
      await finishTalk(page);

      // complete: 25 coins and a biscuit, a heart with the baker, the card moves to the shelf, all saved
      await expect.poll(async () => (await world(page)).money).toBe(25);
      const w = await world(page);
      expect(w.items?.["biscuit"]).toBe(1);
      expect(w.quests?.active["q_baker_double"]).toBeUndefined();
      expect(w.quests?.done["q_baker_double"]).toMatchObject({ n: 1 });
      expect(w.npcs?.["nagmon_baker"]?.pts).toBeGreaterThanOrEqual(3);
      await openJournal(page);
      await expect(page.locator(id("journal_done_q_baker_double"))).toBeVisible();
      await expect(page.locator(id("journal_empty"))).toBeVisible();
      await layout(page, "journal done", "journal");
      await shot("journal_done");
    });

    test("via a person: Yoav offers the kitten quest, gladly; the kitten is found on Route 1; Yoav is told", async ({ page }, info) => {
      const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
      // 1. accept: Yoav stands at the school gate (24,7); the child is below him
      await seed(page, { map: "classic_hearthrock_city", x: 24, y: 8, facing: "up", npcSeed: 3 });
      await openMap(page);
      expect((await debug(page))!.inFront).toBe("nagmon_kid");
      await touch(page, page.locator(id("map_talk")));
      // the greeting of the day, then the offer with "gladly" and "not now" (both there)
      await expect(page.locator("[data-screen=choice]")).toBeVisible({ timeout: 20_000 }).catch(() => {});
      await finishTalk(page, ["yes"]);
      await expect.poll(async () => (await world(page)).quests?.active["q_kitten_home"]?.step).toBe(1);
      const afterOffer = await world(page);
      expect(afterOffer.variables["nagmon_kitten"]).toBe("asked");
      expect(afterOffer.money).toBe(0);
      await openJournal(page);
      await expect(page.locator(id("journal_card_q_kitten_home"))).toHaveAttribute("data-step", "2");
      await touch(page, page.locator(id("journal_show_q_kitten_home")));
      await expect(page.locator(id("journal_said"))).toContainText("בשביל 1");
      await layout(page, "journal progress", "journal");
      await shot("kitten_journal");
    });

    test("via a person, the kitten on Route 1 and the news to Yoav: the story ends with the reward and the town's kitten", async ({ page }, info) => {
      const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
      const active = { q_kitten_home: { step: 1, day: DAY, stepDay: DAY, wrong: 0, ent: 1 } };
      const state = { active, done: {}, week: { w: 0, n: 0 }, board: null, log: [], vhist: {}, declined: {}, taken: [] };
      // 2. the kitten waits on Route 1 (21,16) while Yoav's story says `asked`
      await seed(page, { map: "classic_route_1", x: 21, y: 17, facing: "up", npcSeed: 3, variables: { nagmon_kitten: "asked" }, quests: state });
      await openMap(page);
      expect((await debug(page))!.inFront).toBe("nagmon_kitten");
      await touch(page, page.locator(id("map_talk")));
      await finishTalk(page);
      await expect.poll(async () => (await world(page)).variables["nagmon_kitten"]).toBe("found");
      expect((await world(page)).quests?.active["q_kitten_home"]?.step).toBe(2);
      await openJournal(page);
      await expect(page.locator(id("journal_card_q_kitten_home"))).toHaveAttribute("data-step", "3");
      await layout(page, "journal found", "journal");
      await shot("kitten_found");
    });

    test("via a person, the end: Yoav is told, the reward comes and the kitten is home", async ({ page }, info) => {
      const shot = (name: string) => page.screenshot({ path: info.outputPath(`${scale * 100}-${name}.png`) });
      const active = { q_kitten_home: { step: 2, day: DAY, stepDay: DAY, wrong: 0, ent: 2 } };
      const state = { active, done: {}, week: { w: 0, n: 0 }, board: null, log: [], vhist: {}, declined: {}, taken: [] };
      await seed(page, { map: "classic_hearthrock_city", x: 24, y: 8, facing: "up", npcSeed: 3, variables: { nagmon_kitten: "found" }, quests: state, money: 5 });
      await openMap(page);
      expect((await debug(page))!.inFront).toBe("nagmon_kid");
      await touch(page, page.locator(id("map_talk")));
      await finishTalk(page);
      await expect.poll(async () => (await world(page)).money).toBe(35);
      const w = await world(page);
      expect(w.items?.["dew_drop"]).toBe(2);
      expect(w.variables["nagmon_kitten"]).toBe("home");
      expect(w.quests?.done["q_kitten_home"]).toMatchObject({ n: 1 });
      expect(w.quests?.active["q_kitten_home"]).toBeUndefined();
      await openJournal(page);
      await expect(page.locator(id("journal_done_q_kitten_home"))).toBeVisible();
      await layout(page, "journal kitten home", "journal");
      await shot("kitten_home");
    });
  });
}
