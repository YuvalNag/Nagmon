import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Play } from "../../../src/app/play";
import { SEED_KEY } from "../../../src/app/playConfig";
import type { ContentLibrary } from "../../../src/core/learning";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { type Lesson, loadLessons } from "../../../src/core/game/lessons";
import { WorldState } from "../../../src/core/world/worldState";
import { TutorScreen } from "../../../src/ui/tutor/TutorScreen";
import { economy } from "../../../src/core/game/items";
import { engineFor, gameJson, shipped } from "../game/helpers";

const eco = economy(gameJson("economy.json"));

let content: ContentLibrary;
let lessons: Lesson[];
beforeAll(async () => {
  content = shipped();
  lessons = await loadLessons(async (p) => gameJson(p));
});
beforeEach(() => localStorage.setItem(SEED_KEY, "3"));
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function setup(opts: { grade?: number; world?: (w: WorldState) => void; settings?: Record<string, unknown>; institute?: string; every?: number } = {}) {
  const grade = opts.grade ?? 4;
  const world = new WorldState();
  world.addMoney(7);
  opts.world?.(world);
  const lines: string[] = [];
  const engine = engineFor(content, grade, 3);
  const play = {
    engine,
    world,
    profile: { grade, settings: opts.settings ?? {} },
    field: new FieldLog({ info: (m) => lines.push(m) }),
    text: (id: string) => id,
    subjects: { title: (s: string) => s },
    maxChoices: null,
    today: () => "2026-10-20",
    saveLearner: vi.fn(async () => {}),
    saveWorld: vi.fn(async () => {}),
    logAnswer: vi.fn(),
    economy: eco,
    // the shipped rules, with the tutor's gift as often as the test wants (the data says every 4th)
    battle: { rules: { evolution: { find: { tutor_every: opts.every ?? 4 } } } },
  } as unknown as Play;
  let closed = 0;
  let changed = 0;
  const r = render(<TutorScreen play={play} lessons={lessons} institute={opts.institute ?? "all"} onClose={() => void closed++} onChanged={() => void changed++} />);
  const q = (id: string) => r.container.querySelector<HTMLButtonElement>(`[data-id=${id}]`);
  const press = async (id: string) => {
    const b = q(id);
    if (!b) throw new Error(`no ${id}`);
    await act(async () => b.click());
  };
  const screen = () => r.container.querySelector("[data-screen]")?.getAttribute("data-screen");
  return { play, world, lines, q, press, screen, closed: () => closed, changed: () => changed, r };
}

/** The question on the screen (the test seed lets the tests read it). */
const probe = () => (window as unknown as { __nagmonQuiz: () => { phase: string; kind: string; answer: string } }).__nagmonQuiz();

/** Taps through the cards to the practice. */
async function toPractice(m: ReturnType<typeof setup>, id = "moon") {
  await m.press(`lesson_${id}`);
  while (m.screen() === "tutor-card") await m.press("lesson_next");
}

/** Answers the practice: right, or "don't know". */
async function answerPractice(m: ReturnType<typeof setup>, right: boolean) {
  if (probe().phase === "example") await m.press("quiz_example_done");
  const p = probe();
  if (!right) await m.press("quiz_dont_know");
  else if (p.kind === "number") {
    for (const k of p.answer) await m.press(`quiz_key_${k}`);
    await m.press("quiz_check");
  } else await m.press(`quiz_choice_${p.answer}`);
  expect(m.screen()).toBe("quiz");
}

describe("the lesson list", () => {
  it("shows a card for each lesson with an empty circle, and a lock only for skills far above the child", () => {
    const m = setup({ grade: 2 });
    expect(m.r.container.querySelectorAll(".lesson-card")).toHaveLength(3);
    expect(m.q("lesson_moon")!.disabled).toBe(false);
    expect(m.q("lesson_moon")!.getAttribute("data-done")).toBe("false");
    expect(m.q("lesson_solar_system")!.disabled).toBe(true);
    expect(m.q("lesson_stars")!.disabled).toBe(true);
    expect(m.q("stamp_card")!.getAttribute("data-total")).toBe("3");
    expect(m.q("stamp_card")!.getAttribute("data-done")).toBe("0");
    expect(m.q("coins")!.getAttribute("data-coins")).toBe("7");
  });

  it("a child at the lesson's level sees no lock; a passed lesson shows its stamp", () => {
    const m = setup({ grade: 5, world: (w) => (w.lessons = { done: ["moon"], repeatDay: null, charges: 0 }) });
    expect(m.r.container.querySelectorAll(".lesson-card:disabled")).toHaveLength(0);
    expect(m.q("lesson_moon")!.getAttribute("data-done")).toBe("true");
    expect(m.q("stamp_card")!.getAttribute("data-done")).toBe("1");
  });

  it("says so when an institute has no lessons, and 'back' leaves", async () => {
    const m = setup({ institute: "nowhere" });
    expect(m.q("tutor_none")).not.toBeNull();
    await m.press("tutor_close");
    expect(m.closed()).toBe(1);
  });
});

describe("a lesson", () => {
  it("plays its cards one tap at a time, then asks the practice on the quiz screen", async () => {
    const m = setup();
    await m.press("lesson_moon");
    expect(m.screen()).toBe("tutor-card");
    const moon = lessons.find((l) => l.id === "moon")!;
    for (let i = 0; i < moon.cards.length; i++) {
      expect(m.r.container.querySelector("[data-screen=tutor-card]")!.getAttribute("data-card")).toBe(String(i));
      expect(m.q("lesson_line")!.textContent).toBe(moon.cards[i]!.text);
      await m.press("lesson_next");
    }
    expect(m.screen()).toBe("quiz");
    expect(m.lines).toContain("LESSON open id=moon");
  });

  it("the back arrow goes to the card before, and from the first card to the list", async () => {
    const m = setup();
    await m.press("lesson_moon");
    await m.press("lesson_next");
    await m.press("lesson_back");
    expect(m.r.container.querySelector("[data-screen=tutor-card]")!.getAttribute("data-card")).toBe("0");
    await m.press("lesson_back");
    expect(m.screen()).toBe("tutor-list");
  });

  it("a right answer pays 40 coins, stamps the lesson, gives a note charge, saves and is logged without a name", async () => {
    const m = setup();
    await toPractice(m);
    await answerPractice(m, true);
    await m.press("quiz_continue");
    expect(m.screen()).toBe("tutor-result");
    expect(m.q("tutor_pays")!.textContent).toContain("40");
    expect(m.world.money).toBe(47);
    expect(m.world.lessons).toEqual({ done: ["moon"], repeatDay: null, charges: 1 });
    expect(m.changed()).toBe(1);
    expect(m.play.saveWorld).toHaveBeenCalled();
    expect(m.play.saveLearner).toHaveBeenCalled();
    expect(m.q("coins")!.getAttribute("data-coins")).toBe("47");
    expect(m.q("stamp_card")!.getAttribute("data-done")).toBe("1");
    expect(m.lines.filter((l) => l.startsWith("LESSON"))).toEqual(["LESSON open id=moon", "LESSON practice id=moon ok=1", "LESSON pass id=moon ok=1 coins=40 first=1"]);
    await m.press("tutor_done");
    expect(m.screen()).toBe("tutor-list");
    expect(m.q("lesson_moon")!.getAttribute("data-done")).toBe("true");
  });

  it("every Nth lesson passed for the first time in a subject, the tutor gives that subject's Evolution Card (the data's N); a repeat gives none", async () => {
    const none = setup();
    await toPractice(none);
    await answerPractice(none, true);
    await none.press("quiz_continue");
    expect(none.world.items.size).toBe(0);
    expect(none.q("tutor_card_gift")).toBeNull();
    cleanup();
    const m = setup({ every: 1 });
    await toPractice(m);
    await answerPractice(m, true);
    await m.press("quiz_continue");
    expect(m.world.items.get("subject_card_science")).toBe(1);
    expect(m.q("tutor_card_gift")!.textContent).toContain("כרטיס התפתחות מדעים");
    expect(m.lines.some((l) => l.startsWith("CARD_FOUND item=subject_card_science"))).toBe(true);
    await m.press("tutor_done");
    await toPractice(m);
    await answerPractice(m, true);
    await m.press("quiz_continue");
    expect(m.world.items.get("subject_card_science")).toBe(1);
  });

  it("a wrong answer costs and pays nothing: the tutor says to look again and the cards replay", async () => {
    const m = setup();
    await toPractice(m);
    await answerPractice(m, false);
    await m.press("quiz_continue");
    expect(m.screen()).toBe("tutor-again");
    expect(m.world.money).toBe(7);
    expect(m.world.lessons.done).toEqual([]);
    await m.press("tutor_again_go");
    expect(m.r.container.querySelector("[data-screen=tutor-card]")!.getAttribute("data-card")).toBe("0");
    // and a second try can pass
    while (m.screen() === "tutor-card") await m.press("lesson_next");
    await answerPractice(m, true);
    await m.press("quiz_continue");
    expect(m.world.money).toBe(47);
  });

  it("a repeat pays 10 once a day, then nothing, and no new stamp or charge", async () => {
    const m = setup({ world: (w) => (w.lessons = { done: ["moon"], repeatDay: null, charges: 0 }) });
    await toPractice(m);
    await answerPractice(m, true);
    await m.press("quiz_continue");
    expect(m.q("tutor_pays")!.textContent).toContain("10");
    expect(m.world.money).toBe(17);
    expect(m.world.lessons).toEqual({ done: ["moon"], repeatDay: "2026-10-20", charges: 0 });
    await m.press("tutor_done");
    await toPractice(m);
    await answerPractice(m, true);
    await m.press("quiz_continue");
    expect(m.world.money).toBe(17);
    expect(m.screen()).toBe("tutor-result");
    expect(m.q("tutor_pays")!.textContent).not.toMatch(/\d/);
  });

  it("uses the parent's two amounts", async () => {
    const m = setup({ settings: { lessons: { first_pass_coins: 55, repeat_coins: 3 } } });
    await toPractice(m);
    await answerPractice(m, true);
    await m.press("quiz_continue");
    expect(m.world.money).toBe(62);
  });

  it("has no Notes button in its own practice", async () => {
    const m = setup({ world: (w) => (w.lessons = { done: ["moon"], repeatDay: null, charges: 2 }) });
    await toPractice(m);
    if (probe().phase === "example") await m.press("quiz_example_done");
    expect(m.q("notes_open")).toBeNull();
  });
});
