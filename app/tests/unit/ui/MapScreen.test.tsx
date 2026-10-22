import "../../../src/ui/BattleScreen"; // loaded once up front: the map imports it lazily
/// <reference types="node" />
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createRef, type MutableRefObject } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { appLogText, installAppLog, uninstallAppLog } from "../../../src/platform/appLog";
import { openPlay, type FetchJson } from "../../../src/app/play";
import { defaultsForGrade } from "../../../src/core/family/gradeDefaults";
import { ProfileStore } from "../../../src/core/family/profiles";
import { readMap, type TiledMap } from "../../../src/core/world/mapData";
import type { MapOptions } from "../../../src/game/mapGame";
import { type JsonObject, MemoryFileStore, pendingWrites } from "../../../src/platform/storage";
import { MapScreen } from "../../../src/ui/screens/MapScreen";

const fetchJson: FetchJson = async (path) => {
  // the built game has a trip file now; these tests are about the game without one
  if (path.startsWith("trips/")) throw new Error("404");
  return JSON.parse(readFileSync(`public/game/${path}`, "utf8"));
};
const route = readMap("classic_route_1", JSON.parse(readFileSync("public/game/maps/classic_route_1.json", "utf8")) as TiledMap);
const city = readMap("classic_hearthrock_city", JSON.parse(readFileSync("public/game/maps/classic_hearthrock_city.json", "utf8")) as TiledMap);

const readBuilt = (name: string) => readMap(name, JSON.parse(readFileSync(`public/game/maps/${name}.json`, "utf8")) as TiledMap);
const shop = readBuilt("nagmon_shop");
const restCenter = readBuilt("nagmon_rest_center");
const home = readBuilt("nagmon_home");

const tripDoc = {
  id: "solar",
  title_he: "מערכת השמש",
  zones: [
    { id: "moon", title_he: "הירח", map: "space_moon", start: { x: 4, y: 9 }, cost: 10, monsters: ["heliobud"] },
    { id: "sun", title_he: "ליד השמש", map: "space_sun", unlock_level: 20, monsters: ["lunibble"] },
  ],
};
/** The game's data, with a trip file and one zone's map built (the other is "coming soon"). */
const tripFetch: FetchJson = async (path) => {
  if (path === "trips/solar.json") return tripDoc;
  if (path === "maps/space_moon.json") return {};
  if (path.startsWith("maps/space_")) throw new Error("404");
  return fetchJson(path);
};

afterEach(cleanup);

const settle = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)));

/** The map with a stand-in scene: it opens Hearthrock and reports who stands in front. */
async function start({ grade = 2, settings = defaultsForGrade(2).settings as JsonObject, world = null as JsonObject | null, menuFirst = false, fresh = false, trips = false, inside = null as null | typeof city, stallWhenPaused = false, neverReady = false, openWait = undefined as number | undefined } = {}) {
  // the test seed: the question showing can be read (window.__nagmonQuiz)
  localStorage.setItem("nagmon.quiz.seed", "3");
  const fs = new MemoryFileStore();
  const profiles = new ProfileStore(fs);
  // a made-up name
  const profile = await profiles.create({ name: "תמר", avatar: "girl_teal", grade, settings });
  // a child who has had the owl's intro, unless the test is about it
  const saved = fresh
    ? world
    : { schema_version: 1, money: 0, ...(world ?? {}), variables: { ...((world?.["variables"] as JsonObject | undefined) ?? {}), nagmon_intro_done: "yes" } };
  if (saved) await profiles.saveWorldDict(profile.id, saved);
  const calls: string[] = [];
  let opts!: MapOptions;
  let resumed: unknown = "never asked";
  const load = async () =>
    ({
      startMap: (o: MapOptions) => {
        opts = o;
        void Promise.resolve(o.resume?.()).then((r) => (resumed = r));
        // the real scene loads its map in the game loop: asleep, it never opens
        const held = new Set<string>();
        const open = () => {
          if (neverReady) return;
          if (stallWhenPaused && held.size) return void setTimeout(open, 5);
          o.onMap?.(inside ?? city);
          o.onReady?.();
        };
        setTimeout(open, stallWhenPaused ? 100 : 0);
        return {
          pause: (why: string) => (held.add(why), calls.push(`pause ${why}`)),
          resume: (why: string) => (held.delete(why), calls.push(`resume ${why}`)),
          paused: false,
          destroy: () => calls.push("destroy"),
          debug: () => null,
          goTo: (map: string, at: unknown) => (calls.push(`goTo ${map} ${JSON.stringify(at)}`), true),
        };
      },
    }) as unknown as typeof import("../../../src/game/mapGame");
  const logs: string[] = [];
  const backRef = createRef<() => void>() as MutableRefObject<(() => void) | null>;
  const { container } = render(
    <MapScreen
      profile={profile}
      profiles={profiles}
      backRef={backRef}
      onExit={() => calls.push("exit")}
      load={load}
      openWaitMs={openWait}
      openPlay={async (o) => {
        // the child opens the menu before the play has loaded
        if (menuFirst) await new Promise((r) => setTimeout(r, 60));
        const log = o.log ?? { info: () => {}, warning: () => {}, error: () => {} };
        return openPlay({ ...o, log: { ...log, info: (m: string) => (logs.push(m), log.info(m)) }, fetchJson: trips ? tripFetch : fetchJson, seed: 3 });
      }}
    />,
  );
  if (menuFirst) {
    for (let i = 0; i < 100 && !container.querySelector("[data-map=ready]"); i++) await settle(5);
    await act(async () => backRef.current?.());
  }
  for (let i = 0; i < 400 && !neverReady && !container.querySelector("[data-play=ready][data-map=ready]"); i++) await settle(25);
  const q = (s: string) => container.querySelector(s) as HTMLElement | null;
  const el = (id: string) => q(`[data-id="${id}"]`) as HTMLButtonElement | null;
  // a keyboard or switch press (no pointer): ScreenTime does not apply
  const press = async (id: string) => {
    const b = el(id);
    if (!b) throw new Error(`no ${id}`);
    await act(async () => void fireEvent.click(b, { detail: 0 }));
    await settle();
  };
  const face = async (who: string | null) => {
    await act(async () => opts.onFacing?.(who));
  };
  /** Taps through the dialog showing; its texts. */
  const read = async () => {
    const out: string[] = [];
    while (q("[data-screen=dialog]")) {
      out.push(el("dialog")!.getAttribute("aria-label")!);
      // the whole page first, if it is still typing; then the next
      if (q("[data-screen=dialog]")!.dataset.full !== "true") await press("dialog");
      await press("dialog");
    }
    return out;
  };
  const quiz = () => (window as unknown as { __nagmonQuiz?: () => { phase: string; kind: string; answer: string; skill: string } }).__nagmonQuiz?.();
  return { fs, profiles, profile, resumed: () => resumed, calls, logs, backRef, q, el, press, face, read, quiz, container, opts: () => opts };
}

describe("a new child's first map", () => {
  it("opens under the owl's intro: the map is not held still before it is ready (the loop is asleep, so it would never load)", async () => {
    const m = await start({ fresh: true, grade: 0, stallWhenPaused: true });
    expect(m.q("[data-screen=play][data-map=ready]")).not.toBeNull();
    expect(m.q("[data-screen=dialog]")).not.toBeNull();
    // the owl holds it once it is open
    expect(m.calls).toContain("pause talk");
  });

  it("a map that does not open in 10 s says so, logs why, and offers a retry", async () => {
    uninstallAppLog();
    await installAppLog(new MemoryFileStore());
    const m = await start({ neverReady: true, openWait: 30 });
    await settle(80);
    expect(m.q("[data-screen=map-failed]")).not.toBeNull();
    expect(m.el("map_retry")).not.toBeNull();
    expect(appLogText()).toContain("The map did not open within");
    uninstallAppLog();
    await m.press("map_retry");
    expect(m.q("[data-map=loading]")).not.toBeNull();
  });
});

describe("the shop, from the shopkeeper", () => {
  it("talk: the greeting, then the shop with its shelves; a purchase is saved and logged; back goes to the map", async () => {
    const m = await start({ grade: 3, inside: shop, world: { money: 100 } });
    await m.face("nagmon_house_shopkeeper");
    expect(m.el("map_talk")).not.toBeNull();
    await m.press("map_talk");
    await m.read();
    expect(m.q("[data-screen=shop]")).not.toBeNull();
    expect(m.el("shop_item_magic_net")!.textContent).toContain("30");
    await m.press("shop_buy");
    await m.press("pay_coin_20");
    await m.press("pay_coin_10");
    await m.press("pay_go");
    // the two coins are counted aloud first
    for (let i = 0; i < 40 && !m.q("[data-id=shop_bought]"); i++) await settle(100);
    expect(m.q("[data-id=shop_bought]")).not.toBeNull();
    // the world is saved with the coins and the Bag
    await settle(30);
    const saved = (await m.profiles.loadWorldDict(m.profile.id)) as { money: number; items?: Record<string, number> };
    expect(saved.money).toBe(73);
    expect(saved.items).toEqual({ magic_net: 1 });
    expect(m.logs.some((l) => l.startsWith("BUY what=magic_net"))).toBe(true);
    // Android's back: out of the bought card to the shelves, then to the map
    await act(async () => m.backRef.current?.());
    expect(m.q("[data-screen=shop][data-mode=browse]")).not.toBeNull();
    await act(async () => m.backRef.current?.());
    await settle();
    expect(m.q("[data-screen=shop]")).toBeNull();
    expect(m.q("[data-screen=play]")).not.toBeNull();
  });

  it("the map holds still while the shop is open", async () => {
    const m = await start({ inside: shop });
    await m.face("nagmon_house_shopkeeper");
    await m.press("map_talk");
    await m.read();
    expect(m.calls).toContain("pause talk");
    await m.press("shop_close");
    expect(m.calls).toContain("resume talk");
  });
});

describe("the Rest Center, from the nurse", () => {
  it("talk: the greeting, then the desk with the friends resting; the daily gift is saved and not given twice", async () => {
    const creatures = ["heliobud", "lunibble", "terrabub"].map((species, i) => ({ id: `c${i + 1}`, species, level: 5, xp: 0 }));
    const m = await start({ grade: 3, inside: restCenter, world: { creatures, seen: ["heliobud"], caught: ["heliobud"] } });
    await m.face("nagmon_house_nurse");
    await m.press("map_talk");
    await m.read();
    expect(m.q("[data-screen=rest]")).not.toBeNull();
    expect(m.el("rest_friend_c1")).not.toBeNull();
    await m.press("rest_gift");
    expect(m.q("[data-id=rest_gift_card]")).not.toBeNull();
    await settle(30);
    const saved = (await m.profiles.loadWorldDict(m.profile.id)) as { money: number; items?: Record<string, number>; variables: Record<string, string> };
    expect(Object.keys(saved.variables).some((k) => k === "nagmon_daily_rest_gift")).toBe(true);
    expect(saved.money + Object.values(saved.items ?? {}).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    await m.press("rest_gift_ok");
    expect((m.el("rest_gift") as HTMLButtonElement).disabled).toBe(true);
    // Android's back leaves to the map
    await act(async () => m.backRef.current?.());
    await settle();
    expect(m.q("[data-screen=rest]")).toBeNull();
  });
});

describe("the home: the daily chest and the egg nest", () => {
  type Mounted = Awaited<ReturnType<typeof start>>;
  /** Answers the chest's question: right, or "don't know"; closes the feedback. */
  const answer = async (m: Mounted, right: boolean) => {
    expect(m.q("[data-screen=quiz]")).not.toBeNull();
    if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
    const q = m.quiz()!;
    if (!right) await m.press("quiz_dont_know");
    else if (q.kind === "number") {
      for (const k of String(q.answer)) await m.press(`quiz_key_${k}`);
      await m.press("quiz_check");
    } else await m.press(`quiz_choice_${q.answer}`);
    await m.press("quiz_continue");
  };
  const world = (extra: JsonObject = {}) => ({ money: 0, creatures: [{ id: "c1", species: "heliobud", level: 5, xp: 0 }], seen: ["heliobud"], caught: ["heliobud"], ...extra });

  it("the chest: a question, a right answer opens it, the prize is saved; it is shut for the rest of the day", async () => {
    const m = await start({ grade: 3, inside: home, world: world() });
    await m.face("nagmon_chest_home");
    expect(m.el("map_talk")).not.toBeNull();
    await m.press("map_talk");
    await answer(m, true);
    expect(m.q("[data-screen=found]")?.dataset.how).toBe("chest");
    expect(m.el("found_text")!.textContent).toContain("30");
    await settle(30);
    expect(((await m.profiles.loadWorldDict(m.profile.id)) as { money: number }).money).toBe(30);
    await m.press("found_ok");
    expect(m.el("coins")?.dataset.coins).toBe("30");
    // again today: kindly shut, no question
    await m.press("map_talk");
    expect(await m.read()).toEqual(["הארגז ריק עכשיו. מחר יהיה בו משהו חדש!"]);
    expect(m.q("[data-screen=quiz]")).toBeNull();
    expect(m.logs.some((l) => l.startsWith("FOUND how=chest coins=30"))).toBe(true);
  });

  it("a wrong answer takes nothing: try again, or a small gift; the gift closes the chest for today", async () => {
    const m = await start({ grade: 3, inside: home, world: world() });
    await m.face("nagmon_chest_home");
    await m.press("map_talk");
    await answer(m, false);
    expect(m.q("[data-screen=chest-wrong]")).not.toBeNull();
    expect(m.el("coins")?.dataset.coins).toBe("0");
    await m.press("chest_again");
    await answer(m, false);
    await m.press("chest_gift");
    expect(m.q("[data-screen=found]")?.dataset.how).toBe("consolation");
    expect(m.el("coins")?.dataset.coins).toBe("5");
    await m.press("found_ok");
  });

  it("Android's back from the wrong-answer card leaves the chest as it was", async () => {
    const m = await start({ grade: 3, inside: home, world: world() });
    await m.face("nagmon_chest_home");
    await m.press("map_talk");
    await answer(m, false);
    await act(async () => m.backRef.current?.());
    await settle();
    expect(m.q("[data-screen=chest-wrong]")).toBeNull();
    expect(m.el("coins")?.dataset.coins).toBe("0");
    expect(m.el("map_talk")).not.toBeNull();
  });

  it("the nest takes the egg from the Bag, and right answers anywhere warm it until a friend hatches", async () => {
    const m = await start({ grade: 3, inside: home, world: world({ items: { mystery_egg: 1 }, eggs: [] }) });
    await m.face("nagmon_nest_home");
    await m.press("map_talk");
    expect(await m.read()).toEqual(["הביצה במקום חם! כל תשובה נכונה מחממת אותה קצת."]);
    await settle(30);
    const saved = (await m.profiles.loadWorldDict(m.profile.id)) as { eggs?: { got: number; need: number }[]; items?: Record<string, number> };
    expect(saved.eggs).toHaveLength(1);
    expect(saved.items).toBeUndefined();
  });

  it("an egg one answer from hatching: the chest's right answer hatches it, and the child is told when the card is closed", async () => {
    const m = await start({ grade: 3, inside: home, world: world({ eggs: [{ id: "e1", table: "nagmon_route1", got: 9, need: 10 }] }) });
    await m.face("nagmon_chest_home");
    await m.press("map_talk");
    await answer(m, true);
    await m.press("found_ok");
    await settle();
    const text = (await m.read()).join(" ");
    expect(text).toContain("הביצה בקעה");
    await settle(30);
    const saved = (await m.profiles.loadWorldDict(m.profile.id)) as { creatures: unknown[]; eggs?: unknown[] };
    expect(saved.creatures).toHaveLength(2);
    expect(saved.eggs).toBeUndefined();
  });
});

describe("talking on the map", () => {
  it("shows the talk button only facing the cashier, beside a coin count", async () => {
    const m = await start();
    expect(m.el("coins")?.dataset.coins).toBe("0");
    expect(m.el("map_talk")).toBeNull();
    await m.face("nagmon_owl");
    expect(m.el("map_talk")).toBeNull();
    await m.face("nagmon_cashier");
    expect(m.el("map_talk")?.textContent).toBe("לדבר");
    await m.face(null);
    expect(m.el("map_talk")).toBeNull();
  });

  it("the cashier end to end: hello, a question, the right answer, 20 coins saved", async () => {
    const m = await start();
    await m.face("nagmon_cashier");
    await m.press("map_talk");
    // the map holds still, its d-pad and menu are gone under the words
    expect(m.calls).toContain("pause talk");
    expect(m.el("dpad")).toBeNull();
    expect(m.el("map_menu")).toBeNull();
    expect(await m.read()).toEqual(["המוכר אבי: שלום! אני סופר את הכסף בקופה.", "אפשר לעזור לי עם חשבון קטן?"]);
    expect(m.q("[data-screen=quiz]")).not.toBeNull();
    if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
    const { answer } = m.quiz()!;
    await m.press(`quiz_choice_${answer}`);
    expect(m.q("[data-screen=quiz]")?.dataset.phase).toBe("feedback");
    expect(m.el("quiz_headline")?.textContent).toMatch(/נכון/);
    // the learner is on disk before "continue"
    await pendingWrites(m.fs);
    expect((await m.profiles.loadLearnerDict(m.profile.id))["answers_total"]).toBe(1);
    await m.press("quiz_continue");
    expect(m.el("coins")?.dataset.coins).toBe("20");
    expect((await m.read()).join(" ")).toContain("הנה 20 מטבעות");
    expect(m.calls.at(-1)).toBe("resume talk");
    expect(m.el("map_talk")).not.toBeNull();
    await pendingWrites(m.fs);
    expect((await m.profiles.loadWorldDict(m.profile.id))["money"]).toBe(20);
  });

  it("the hint takes a choice away; 'don't know' shows the answer and how, kindly, with no coins", async () => {
    const m = await start();
    await m.face("nagmon_cashier");
    await m.press("map_talk");
    await m.read();
    if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
    const before = m.container.querySelectorAll(".quiz-choice").length;
    await m.press("quiz_hint");
    expect(m.container.querySelectorAll(".quiz-choice").length).toBe(before - 1);
    expect(m.el("quiz_hint_text")?.textContent).toMatch(/[א-ת]/);
    expect(m.el("quiz_hint")?.disabled).toBe(true);
    await m.press("quiz_dont_know");
    expect(m.el("quiz_headline")?.textContent).toBe("זה בסדר לא לדעת! ככה פותרים:");
    expect(m.el("quiz_answer")?.textContent).toMatch(/התשובה: .*\d/);
    expect(m.el("quiz_explanation")?.textContent).not.toBe("");
    await m.press("quiz_continue");
    expect((await m.read()).join(" ")).toContain("כמעט!");
    expect(m.el("coins")?.dataset.coins).toBe("0");
  });

  it("a number question on the pad, with erase, and the check only once something is typed", async () => {
    const m = await start({ grade: 3, settings: { learning: { answer_mode: "number" } } });
    await m.face("nagmon_cashier");
    await m.press("map_talk");
    await m.read();
    if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
    expect(m.quiz()!.kind).toBe("number");
    expect(m.el("quiz_check")?.disabled).toBe(true);
    await m.press("quiz_key_9");
    await m.press("quiz_key_back");
    expect(m.el("quiz_typed")?.textContent).toBe("_");
    for (const k of m.quiz()!.answer) await m.press(`quiz_key_${k}`);
    expect(m.el("quiz_typed")?.textContent).toBe(m.quiz()!.answer);
    await m.press("quiz_check");
    expect(m.el("quiz_headline")?.textContent).toMatch(/נכון|סופר/);
  });

  it("Android's back: on in the dialog, out of the question with nothing counted, then the menu", async () => {
    const m = await start();
    await m.face("nagmon_cashier");
    await m.press("map_talk");
    const back = async () => {
      await act(async () => m.backRef.current?.());
      await settle();
    };
    const dialog = () => m.q("[data-screen=dialog]");
    if (dialog()!.dataset.full !== "true") await back(); // the whole first page
    expect(dialog()?.dataset.full).toBe("true");
    await back(); // the second page
    expect(dialog()?.dataset.page).toBe("1");
    if (dialog()!.dataset.full !== "true") await back();
    await back(); // closed
    expect(m.q("[data-screen=quiz]")).not.toBeNull();
    await back(); // out of the question
    expect(m.q("[data-screen=quiz]")).toBeNull();
    expect(m.q("[data-screen=map-menu]")).toBeNull();
    await pendingWrites(m.fs);
    expect((await m.profiles.loadLearnerDict(m.profile.id))["answers_total"] ?? 0).toBe(0);
    expect(m.calls.at(-1)).toBe("resume talk");
    await back();
    expect(m.q("[data-screen=map-menu]")).not.toBeNull();
    expect(m.calls).not.toContain("exit");
  });

  it("an answer saved before a kill is paid as the map opens, and the talk button comes back after", async () => {
    const m = await start({ world: { schema_version: 1, money: 0, variables: { nagmon_cashier_q: "correct" } } });
    await m.face("nagmon_cashier");
    expect(m.q("[data-screen=dialog]")).not.toBeNull();
    expect(m.el("map_talk")).toBeNull();
    expect((await m.read()).join(" ")).toContain("הנה 20 מטבעות");
    expect(m.el("coins")?.dataset.coins).toBe("20");
    await settle(10);
    expect(m.el("map_talk")).not.toBeNull();
  });

  it("the pause menu, opened as the map came up, stays on top of a dialog that starts under it", async () => {
    const m = await start({ world: { schema_version: 1, money: 0, variables: { nagmon_cashier_q: "wrong" } }, menuFirst: true });
    for (let i = 0; i < 400 && !m.q("[data-play=ready]"); i++) await settle(25);
    expect(m.q("[data-screen=map-menu]")).not.toBeNull();
    expect(m.q("[data-screen=dialog]")).toBeNull();
    // back closes the menu first; then the cashier's words show
    await act(async () => m.backRef.current?.());
    await settle();
    expect(m.q("[data-screen=map-menu]")).toBeNull();
    expect((await m.read()).join(" ")).toContain("כמעט!");
  });
});

/** The answer's line shows (when the round's order puts the enemy first it comes a beat later), and a tap after a moment closes it. */
async function closeResult(m: Awaited<ReturnType<typeof start>>) {
  for (let i = 0; i < 400 && m.q("[data-screen=battle]")?.dataset.flow !== "result"; i++) await settle(5);
  expect(m.q("[data-screen=battle]")?.dataset.flow).toBe("result");
  await settle(330);
  await m.press("battle_skip");
}

/** The round plays out (a beat of ours, a beat of the enemy's), and the menu is back. */
async function roundEnds(m: Awaited<ReturnType<typeof start>>) {
  for (let i = 0; i < 600 && m.q("[data-screen=battle]")?.dataset.turn === "playing"; i++) await settle(5);
  expect(m.q("[data-screen=battle]")?.dataset.turn).toBe("idle");
}

/** The first move card that is open: its question opens (the question is the cast). */
async function castFirst(m: Awaited<ReturnType<typeof start>>) {
  const card = m.container.querySelector<HTMLButtonElement>(".move-card:not(:disabled)");
  if (!card) throw new Error("no open move card");
  await m.press(card.dataset.id!);
}

/** Answers the question showing: right (typed or the right card), or "don't know". */
async function answerQuestion(m: Awaited<ReturnType<typeof start>>, right: boolean, inBattle = false) {
  if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
  if (!right) await m.press("quiz_dont_know");
  else if (m.quiz()!.kind === "number") {
    for (const k of m.quiz()!.answer) await m.press(`quiz_key_${k}`);
    await m.press("quiz_check");
  } else await m.press(`quiz_choice_${m.quiz()!.answer}`);
  if (inBattle) {
    await closeResult(m);
    if (m.q("[data-screen=battle]")) await roundEnds(m);
  } else await m.press("quiz_continue");
  // a level-up card may come after a right answer in a battle: tap it away
  if (m.el("growth_close")) await m.press("growth_close");
}

describe("the owl's intro", () => {
  async function intro(right: (i: number) => boolean) {
    const m = await start({ fresh: true, grade: 3, settings: defaultsForGrade(3).settings as JsonObject });
    // the map holds still, and the owl talks first
    expect(m.calls).toContain("pause talk");
    expect(m.el("dpad")).toBeNull();
    expect((await m.read()).length).toBeGreaterThan(1);
    const subjects: string[] = [];
    for (let i = 0; m.q("[data-screen=intro-ask]") !== null || m.q("[data-screen=quiz]") !== null; i++) {
      expect(i).toBeLessThan(10);
      subjects.push(m.q("[data-screen=quiz]")!.getAttribute("aria-label") ? m.quiz()!.skill!.split(".")[0]! : "");
      await answerQuestion(m, right(i));
      await settle(5);
      if (m.q("[data-screen=dialog]")) break;
    }
    return { m, subjects };
  }

  it("asks six questions in different subjects, then the owl, then three creatures to choose from", async () => {
    const { m, subjects } = await intro(() => true);
    expect(subjects).toHaveLength(6);
    expect(new Set(subjects).size).toBe(6);
    // the owl introduces the choice
    expect((await m.read()).length).toBeGreaterThan(0);
    const cards = [...m.container.querySelectorAll("[data-id^=starter_]")];
    expect(cards).toHaveLength(3);
    // choosing one: the owl says well done, and the world opens
    await m.press((cards[1] as HTMLElement).dataset.id!);
    expect((await m.read()).join(" ")).toContain("בחירה מצוינת");
    await settle(10);
    expect(m.el("map_menu")).not.toBeNull();
    expect(m.q("[data-screen=intro-starters]")).toBeNull();
    // all of it is saved: the creature, the intro's end, and each subject's start
    await pendingWrites(m.fs);
    const world = await m.profiles.loadWorldDict(m.profile.id);
    expect((world["creatures"] as unknown[]).length).toBe(1);
    expect((world["variables"] as Record<string, string>)["nagmon_intro_done"]).toBe("yes");
    const learner = await m.profiles.loadLearnerDict(m.profile.id);
    expect(Object.keys(learner["subject_grade"] as object).length).toBeGreaterThanOrEqual(5);
    expect(learner["grade"]).toBe(3);
    expect(learner["answers_total"]).toBe(6);
  });

  it("all wrong answers: still six questions, still three creatures, and the world opens", async () => {
    const { m } = await intro(() => false);
    await m.read();
    expect(m.container.querySelectorAll("[data-id^=starter_]")).toHaveLength(3);
    await m.press((m.container.querySelector("[data-id^=starter_]") as HTMLElement).dataset.id!);
    await m.read();
    await settle(10);
    expect(m.el("map_menu")).not.toBeNull();
    await pendingWrites(m.fs);
    expect(((await m.profiles.loadWorldDict(m.profile.id))["creatures"] as unknown[]).length).toBe(1);
  });

  it("a child who has had it goes straight to the map", async () => {
    const m = await start();
    expect(m.q("[data-screen=intro-ask]")).toBeNull();
    expect(m.el("map_menu")).not.toBeNull();
  });
});

describe("a wild creature in the grass", () => {
  const withPartner = { creatures: [{ id: "c1", species: "heliobud", level: 6, xp: 0 }], seen: ["heliobud"], caught: ["heliobud"] };

  async function grass() {
    localStorage.setItem("nagmon.encounter.always", "1");
    // the round's beats are short here, and the enemy's draws are the same every run
    localStorage.setItem("nagmon.battle.timescale", "0.02");
    localStorage.setItem("nagmon.battle.seed", "7");
    const m = await start({ world: withPartner });
    await act(async () => {
      m.opts().onMap?.(route);
    });
    await settle(20);
    return m;
  }
  afterEach(() => {
    localStorage.removeItem("nagmon.encounter.always");
    localStorage.removeItem("nagmon.battle.timescale");
    localStorage.removeItem("nagmon.battle.seed");
  });

  it("a step in the grass meets one; the map holds still, and a step on the road does not", async () => {
    const m = await grass();
    await act(async () => m.opts().onStep?.(0, 0));
    expect(m.q("[data-screen=battle]")).toBeNull();
    await act(async () => m.opts().onStep?.(5, 8));
    await settle(20);
    expect(m.q("[data-screen=battle]")?.dataset.view).toBe("meet");
    expect(m.calls).toContain("pause talk");
    // the four move cards (the question is the cast), the friends strip, Net, Bag and Run
    expect(m.container.querySelectorAll(".move-card")).toHaveLength(4);
    expect(m.container.querySelectorAll(".portrait")).toHaveLength(1);
    expect(m.el("battle_run")).not.toBeNull();
    expect(m.el("battle_fight")).toBeNull();
    expect(m.q("[data-id=wild_hp]")).not.toBeNull();
    expect(m.q("[data-id=partner_pep]")).not.toBeNull();
    expect(m.q("[data-id=battle_intent]")).not.toBeNull();
    expect(m.el("dpad")).toBeNull();
  });

  it("going on one's way costs nothing, and the grass is quiet again for a while", async () => {
    const m = await grass();
    await act(async () => m.opts().onStep?.(5, 8));
    await m.press("battle_run");
    expect(m.q("[data-screen=battle]")).toBeNull();
    expect(m.el("map_menu")).not.toBeNull();
    await pendingWrites(m.fs);
    expect(((await m.profiles.loadWorldDict(m.profile.id))["creatures"] as unknown[]).length).toBe(1);
  });

  it("wrong answers hurt nobody; right ones calm it; a net and a seal answer make it a friend, saved", async () => {
    localStorage.setItem("nagmon.encounter.always", "1");
    localStorage.setItem("nagmon.battle.timescale", "0.02");
    localStorage.setItem("nagmon.battle.seed", "7");
    const m = await grass();
    await act(async () => m.opts().onStep?.(5, 8));
    const wildSpecies = m.q("[data-screen=battle]")!.dataset.wild!;
    const fog0 = Number(m.q("[data-screen=battle]")!.dataset.hp);
    await castFirst(m);
    // a wrong answer: the move is weak (a little fog, at least 1), nobody is hurt in a lasting way, nothing is taken
    expect(m.q("[data-screen=battle]")?.dataset.view).toBe("question");
    if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
    // the move being cast heads the question
    expect(m.q("[data-screen=battle-ask] .cast-chip")).not.toBeNull();
    await m.press("quiz_dont_know");
    expect(m.q("[data-screen=quiz]")).toBeNull();
    expect(m.el("quiz_continue")).toBeNull();
    await closeResult(m);
    await roundEnds(m);
    const fog1 = Number(m.q("[data-screen=battle]")!.dataset.hp);
    expect(fog1).toBeLessThan(fog0);
    expect(fog1).toBeGreaterThan(fog0 - 12);
    expect(m.q("[data-screen=battle]")?.dataset.view).toBe("turn");
    expect((m.el("battle_net") as HTMLButtonElement).disabled).toBe(true);
    expect(m.logs.some((l) => /^MOVE n=1 move=\w+ subject=\w+ tier=\w ok=0 dmg=\d+ /.test(l))).toBe(true);
    // right answers until it is calm
    for (let i = 0; i < 20 && m.q("[data-screen=battle]")?.dataset.view !== "calm"; i++) {
      await castFirst(m);
      await answerQuestion(m, true, true);
      await settle(5);
    }
    expect(m.q("[data-screen=battle]")?.dataset.view).toBe("calm");
    expect(Number(m.q("[data-screen=battle]")!.dataset.hp)).toBe(0);
    // the results card: the stars and the coins
    expect(m.q("[data-id=battle_results]")).not.toBeNull();
    expect(m.q("[data-star=calm]")?.getAttribute("data-on")).toBe("true");
    expect(Number(m.q("[data-id=battle_results]")!.getAttribute("data-coins"))).toBeGreaterThanOrEqual(5 + 3);
    expect(m.el("battle_message")?.textContent).toMatch(/נרגע/);
    expect((m.el("battle_net") as HTMLButtonElement).disabled).toBe(false);
    // no friend joined by itself
    await pendingWrites(m.fs);
    expect(((await m.profiles.loadWorldDict(m.profile.id))["creatures"] as unknown[]).length).toBe(1);
    // the net, a seal question: a wrong answer only means another try
    await m.press("battle_net");
    expect(m.q("[data-screen=battle-ask]")?.dataset.seal).toBe("true");
    if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
    await m.press("quiz_dont_know");
    await closeResult(m);
    expect(m.q("[data-screen=battle]")?.dataset.view).toBe("calm");
    expect(m.el("battle_message")?.textContent).toMatch(/אפשר לנסות שוב/);
    // a grown-up creature needs three seal answers: right ones until it is caught
    for (let i = 0; i < 3 && !m.q("[data-screen=battle-caught]"); i++) {
      await m.press("battle_net");
      await answerQuestion(m, true, true);
    }
    expect(m.q("[data-screen=battle-caught]")).not.toBeNull();
    // a name or skip
    await m.press("battle_skip");
    expect(m.q("[data-screen=battle]")).toBeNull();
    await pendingWrites(m.fs);
    const world = await m.profiles.loadWorldDict(m.profile.id);
    expect((world["creatures"] as { species: string; name?: string }[]).map((c) => c.species)[1]).toBe(wildSpecies);
    expect((world["creatures"] as { name?: string }[])[1]!.name).toBeUndefined();
    expect(world["caught"]).toContain(wildSpecies);
    expect((world["items"] as Record<string, number>)["magic_net"]).toBe(2);
    // the log of the fight: moves, rounds, and one end line with questions, turns and seconds
    expect(m.logs.filter((l) => l.startsWith("MOVE ")).length).toBeGreaterThanOrEqual(2);
    expect(m.logs.filter((l) => l.startsWith("ROUND ")).length).toBeGreaterThanOrEqual(2);
    expect(m.logs.some((l) => /^BATTLE end result=caught questions=\d+ correct=\d+ ms=\d+ turns=\d+ secs=\d+$/.test(l))).toBe(true);
  });

  it("the owl's pass in a battle: a new question, nothing answered or counted, the pass used up and logged", async () => {
    localStorage.setItem("nagmon.encounter.always", "1");
    const m = await start({ world: { ...withPartner, items: { owl_pass: 1 }, variables: { nagmon_kit: "yes" } } });
    await act(async () => {
      m.opts().onMap?.(route);
    });
    await settle(20);
    await act(async () => m.opts().onStep?.(5, 8));
    await castFirst(m);
    if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
    expect(m.el("quiz_helper_pass")).not.toBeNull();
    await m.press("quiz_helper_pass");
    // another question, on the same screen, with no helper left to offer
    expect(m.q("[data-screen=battle-ask]")).not.toBeNull();
    expect(m.el("quiz_helper_pass")).toBeNull();
    await pendingWrites(m.fs);
    const world = await m.profiles.loadWorldDict(m.profile.id);
    expect(world["items"]).toBeUndefined();
    expect(m.logs.some((l) => /^HELPER use kind=pass skill=/.test(l))).toBe(true);
  });

  it("a name picked from the three, kept in the save", async () => {
    const m = await grass();
    await act(async () => m.opts().onStep?.(5, 8));
    for (let i = 0; i < 20 && m.q("[data-screen=battle]")?.dataset.view !== "calm"; i++) {
      await castFirst(m);
      await answerQuestion(m, true, true);
      await settle(5);
    }
    for (let i = 0; i < 3 && !m.q("[data-screen=battle-caught]"); i++) {
      await m.press("battle_net");
      await answerQuestion(m, true, true);
    }
    await m.press("battle_suggest_0");
    await pendingWrites(m.fs);
    const world = await m.profiles.loadWorldDict(m.profile.id);
    expect(typeof (world["creatures"] as { name?: string }[])[1]!.name).toBe("string");
  });

  it("Android's back goes on one's way, from the meeting and from a question", async () => {
    const m = await grass();
    await act(async () => m.opts().onStep?.(5, 8));
    await act(async () => m.backRef.current?.());
    await settle();
    expect(m.q("[data-screen=battle]")).toBeNull();
    expect(m.q("[data-screen=map-menu]")).toBeNull();
  });

  it("no creature of the child's own yet: no battle", async () => {
    localStorage.setItem("nagmon.encounter.always", "1");
    const m = await start();
    await act(async () => {
      m.opts().onMap?.(route);
    });
    await settle(20);
    await act(async () => m.opts().onStep?.(5, 8));
    expect(m.q("[data-screen=battle]")).toBeNull();
  });
});

describe("Mila's vehicle and the bestiary", () => {
  const partner = { creatures: [{ id: "c1", species: "heliobud", level: 6, xp: 0 }], seen: ["heliobud"], caught: ["heliobud"] };

  it("with no trip file there is no vehicle in the menu, and the bestiary is there", async () => {
    const m = await start({ world: partner });
    await m.press("map_menu");
    expect(m.el("map_trips")).toBeNull();
    expect(m.el("map_bestiary")).not.toBeNull();
    expect(m.el("menu_progress")).toBeNull();
  });

  it("lists the zones: open with a price, locked by level, coming soon; the menu shows the progress", async () => {
    const m = await start({ world: partner, trips: true });
    await m.press("map_menu");
    expect(m.el("menu_progress")?.textContent).toContain("0%");
    await m.press("map_trips");
    expect(m.el("zone_moon")?.dataset.state).toBe("open");
    expect(m.el("zone_moon")?.textContent).toContain("10 מטבעות");
    expect(m.el("zone_sun")?.dataset.state).toBe("soon");
    expect(m.el("zone_sun")?.disabled).toBe(true);
  });

  it("too few coins: told how many are missing, nothing taken, nowhere to go", async () => {
    const m = await start({ world: { ...partner, money: 4 }, trips: true });
    await m.press("map_menu");
    await m.press("map_trips");
    await m.press("zone_moon");
    expect(m.el("trips_message")?.textContent).toContain("6");
    expect(m.calls.some((c) => c.startsWith("goTo"))).toBe(false);
    expect(m.el("trips_coins")?.textContent).toContain("4");
  });

  it("with the coins: pays, saves, logs the purchase, closes the menu and goes", async () => {
    const m = await start({ world: { ...partner, money: 25 }, trips: true });
    await m.press("map_menu");
    await m.press("map_trips");
    await m.press("zone_moon");
    await settle(10);
    expect(m.calls).toContain('goTo space_moon {"x":4,"y":9}');
    expect(m.q("[data-screen=map-menu]")).toBeNull();
    await pendingWrites(m.fs);
    const world = await m.profiles.loadWorldDict(m.profile.id);
    expect(world["money"]).toBe(15);
    expect((world["trips"] as { visited: string[] }).visited).toEqual(["solar/moon"]);
  });

  it("the Friends screen from the menu: the party, details, and choosing the partner (saved)", async () => {
    const two = { creatures: [{ id: "c1", species: "heliobud", level: 6, xp: 1, name: "אורי" }, { id: "c2", species: "lunibble", level: 7, xp: 0, name: "נוגה" }], seen: ["heliobud", "lunibble"], caught: ["heliobud", "lunibble"] };
    const m = await start({ world: two });
    await m.press("map_menu");
    await m.press("map_friends");
    expect(m.container.querySelectorAll("[data-id^=friend_c]").length).toBe(2);
    expect(m.el("friend_partner")!.disabled).toBe(true);
    await m.press("friend_c2");
    expect(m.el("friend_detail")?.textContent).toContain("נוגה");
    expect(m.el("friend_level")?.textContent).toContain("7");
    expect(m.el("friend_good")?.textContent).toMatch(/טוב ב/);
    await m.press("friend_partner");
    expect(m.el("friend_said")).not.toBeNull();
    await pendingWrites(m.fs);
    const world = await m.profiles.loadWorldDict(m.profile.id);
    expect((world["creatures"] as { id: string }[]).map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(m.logs).toContain("PARTNER species=lunibble");
  });

  it("the bestiary shows what was met by name and the rest as unknown", async () => {
    const m = await start({ world: partner });
    await m.press("map_menu");
    await m.press("map_bestiary");
    expect(m.el("bestiary_count")?.textContent).toMatch(/נתפסו 1/);
    expect(m.container.querySelector('[data-species="heliobud"]')?.textContent).toContain("שמשון");
    expect(m.container.querySelector('[data-species="lunibble"]')?.className).toContain("unknown");
    // by zone: the Route's header counts what was caught and seen
    const zone = m.container.querySelector('[data-species="heliobud"]')!.closest("[data-zone]") as HTMLElement;
    expect(zone.dataset.caught).toBe("1");
    expect(m.el(`zone_${zone.dataset.zone}`)?.textContent).toMatch(/נתפסו 1, נראו 1 מתוך/);
    expect(m.container.querySelectorAll("[data-zone]").length).toBeGreaterThan(1);
    await m.press("bestiary_close");
    expect(m.q("[data-screen=map-menu]")).not.toBeNull();
  });
});

describe("coming back to the same place", () => {
  const saved = async (m: Awaited<ReturnType<typeof start>>) => (await m.profiles.loadWorldDict(m.profile.id))["place"];

  it("saves the tile on a map change, holds steps back for two seconds, and writes the last one on leaving", async () => {
    const m = await start();
    await act(async () => m.opts().onMap?.(city, { map: "classic_hearthrock_city", x: 7, y: 8, facing: "left" }));
    await settle(20);
    expect(await saved(m)).toEqual({ map: "classic_hearthrock_city", x: 7, y: 8, facing: "left" });
    await act(async () => m.opts().onStep?.(7, 9, "down"));
    await settle(20);
    expect(await saved(m)).toEqual({ map: "classic_hearthrock_city", x: 7, y: 8, facing: "left" });
    // the screen goes away (the menu's exit, Android back)
    cleanup();
    await settle(20);
    expect(await saved(m)).toEqual({ map: "classic_hearthrock_city", x: 7, y: 9, facing: "down" });
  });

  it("asks the map to open on the saved place, but not for a child still in the intro", async () => {
    const place = { map: "classic_hearthrock_city", x: 3, y: 4, facing: "right" };
    const m = await start({ world: { place } });
    expect(m.resumed()).toEqual(place);
    const fresh = await start({ world: { place, variables: {} }, fresh: true });
    expect(fresh.resumed()).toBeNull();
  });
});
