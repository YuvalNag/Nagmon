/// <reference types="node" />
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createRef, type MutableRefObject } from "react";
import { afterEach, describe, expect, it } from "vitest";
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

const tripDoc = {
  id: "solar",
  title_he: "מערכת השמש",
  zones: [
    { id: "moon", title_he: "הירח", map: "space_moon", start: { x: 4, y: 9 }, cost: 10, monsters: ["agnite"] },
    { id: "sun", title_he: "ליד השמש", map: "space_sun", unlock_level: 20, monsters: ["kroki"] },
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
async function start({ grade = 2, settings = defaultsForGrade(2).settings as JsonObject, world = null as JsonObject | null, menuFirst = false, fresh = false, trips = false } = {}) {
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
  const load = async () =>
    ({
      startMap: (o: MapOptions) => {
        opts = o;
        setTimeout(() => {
          o.onMap?.(city);
          o.onReady?.();
        }, 0);
        return {
          pause: (why: string) => calls.push(`pause ${why}`),
          resume: (why: string) => calls.push(`resume ${why}`),
          paused: false,
          destroy: () => calls.push("destroy"),
          debug: () => null,
          goTo: (map: string, at: unknown) => (calls.push(`goTo ${map} ${JSON.stringify(at)}`), true),
        };
      },
    }) as unknown as typeof import("../../../src/game/mapGame");
  const backRef = createRef<() => void>() as MutableRefObject<(() => void) | null>;
  const { container } = render(
    <MapScreen
      profile={profile}
      profiles={profiles}
      backRef={backRef}
      onExit={() => calls.push("exit")}
      load={load}
      openPlay={async (o) => {
        // the child opens the menu before the play has loaded
        if (menuFirst) await new Promise((r) => setTimeout(r, 60));
        return openPlay({ ...o, fetchJson: trips ? tripFetch : fetchJson, seed: 3 });
      }}
    />,
  );
  if (menuFirst) {
    for (let i = 0; i < 100 && !container.querySelector("[data-map=ready]"); i++) await settle(5);
    await act(async () => backRef.current?.());
  }
  for (let i = 0; i < 400 && !container.querySelector("[data-play=ready][data-map=ready]"); i++) await settle(25);
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
  return { fs, profiles, profile, calls, backRef, q, el, press, face, read, quiz, container, opts: () => opts };
}

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

/** Answers the question showing: right (typed or the right card), or "don't know". */
async function answerQuestion(m: Awaited<ReturnType<typeof start>>, right: boolean) {
  if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
  if (!right) await m.press("quiz_dont_know");
  else if (m.quiz()!.kind === "number") {
    for (const k of m.quiz()!.answer) await m.press(`quiz_key_${k}`);
    await m.press("quiz_check");
  } else await m.press(`quiz_choice_${m.quiz()!.answer}`);
  await m.press("quiz_continue");
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
  const withPartner = { creatures: [{ id: "c1", species: "agnite", level: 6, xp: 0 }], seen: ["agnite"], caught: ["agnite"] };

  async function grass() {
    localStorage.setItem("nagmon.encounter.always", "1");
    const m = await start({ world: withPartner });
    await act(async () => {
      m.opts().onMap?.(route);
    });
    await settle(20);
    return m;
  }
  afterEach(() => localStorage.removeItem("nagmon.encounter.always"));

  it("a step in the grass meets one; the map holds still, and a step on the road does not", async () => {
    const m = await grass();
    await act(async () => m.opts().onStep?.(0, 0));
    expect(m.q("[data-screen=battle]")).toBeNull();
    await act(async () => m.opts().onStep?.(5, 8));
    expect(m.q("[data-screen=battle]")?.dataset.view).toBe("meet");
    expect(m.calls).toContain("pause talk");
    expect(m.el("battle_fight")).not.toBeNull();
    expect(m.el("battle_run")).not.toBeNull();
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

  it("wrong answers hurt nobody; right ones win, and the creature becomes a friend, saved", async () => {
    const m = await grass();
    await act(async () => m.opts().onStep?.(5, 8));
    const wildSpecies = m.q("[data-screen=battle]")!.dataset.wild!;
    await m.press("battle_fight");
    // a wrong answer: no damage
    if (m.quiz()!.phase === "example") await m.press("quiz_example_done");
    await m.press("quiz_dont_know");
    await m.press("quiz_continue");
    const full = Number(m.q("[data-screen=battle]")!.dataset.hp);
    expect(m.q("[data-screen=battle]")?.dataset.view).toBe("turn");
    expect(m.el("battle_message")?.textContent).toContain("אף אחד לא נפגע");
    // right answers until it is won
    for (let i = 0; i < 12 && m.q("[data-screen=battle]")?.dataset.view !== "won"; i++) {
      await m.press("battle_next");
      await answerQuestion(m, true);
      await settle(5);
    }
    expect(m.q("[data-screen=battle]")?.dataset.view).toBe("won");
    expect(Number(m.q("[data-screen=battle]")!.dataset.hp)).toBe(0);
    expect(full).toBeGreaterThan(0);
    expect(m.el("battle_message")?.textContent).toMatch(/חבר/);
    await m.press("battle_done");
    expect(m.q("[data-screen=battle]")).toBeNull();
    await pendingWrites(m.fs);
    const world = await m.profiles.loadWorldDict(m.profile.id);
    expect((world["creatures"] as { species: string }[]).map((c) => c.species)).toEqual(["agnite", wildSpecies]);
    expect(world["caught"]).toContain(wildSpecies);
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
  const partner = { creatures: [{ id: "c1", species: "agnite", level: 6, xp: 0 }], seen: ["agnite"], caught: ["agnite"] };

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

  it("the bestiary shows what was met by name and the rest as unknown", async () => {
    const m = await start({ world: partner });
    await m.press("map_menu");
    await m.press("map_bestiary");
    expect(m.el("bestiary_count")?.textContent).toMatch(/נתפסו 1/);
    expect(m.container.querySelector('[data-species="agnite"]')?.textContent).toContain("אגנייט");
    expect(m.container.querySelector('[data-species="kroki"]')?.className).toContain("unknown");
    await m.press("bestiary_close");
    expect(m.q("[data-screen=map-menu]")).not.toBeNull();
  });
});
