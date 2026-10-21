/// <reference types="node" />
/**
 * The parents' learning pages: the report (read only) and the learning
 * settings (subjects, start grade, show levels, questions per battle, the
 * two lesson coin amounts), through the real area behind the code.
 */
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../../src/App";
import { openServices } from "../../../src/app/services";
import { defaultsForGrade } from "../../../src/core/family/gradeDefaults";
import { LearnerState } from "../../../src/core/learning";
import { makeLogEntry } from "../../../src/core/learning/learner";
import { t } from "../../../src/i18n";
import { MemoryFileStore } from "../../../src/platform/storage";
import { shipped } from "../game/helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settle = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)));

/** The game's data as the app fetches it, from the build's files. */
function stubGameFiles() {
  vi.stubGlobal("fetch", async (url: string) => {
    try {
      return new Response(readFileSync(`public/${url}`, "utf8"));
    } catch {
      return new Response("", { status: 404 });
    }
  });
}

async function start(grade = 2) {
  stubGameFiles();
  const services = await openServices(new MemoryFileStore());
  await services.parent.setPin("1234");
  const child = await services.profiles.create({ name: "דנה", avatar: "girl_teal", grade, settings: defaultsForGrade(grade).settings });
  let back: (() => void) | null = null;
  const { container } = render(<App services={services} backButton={(h) => ((back = h), () => (back = null))} />);
  await settle();
  const el = (id: string) => container.querySelector(`[data-id="${id}"]`) as HTMLButtonElement | null;
  const screen = () => container.querySelector("[data-screen]")!.getAttribute("data-screen");
  const text = () => container.querySelector("[data-screen]")!.textContent ?? "";
  const press = async (id: string) => {
    const b = el(id);
    if (!b) throw new Error(`no button ${id} on ${screen()}`);
    fireEvent.click(b, { detail: 0 });
    await settle();
  };
  const waitScreen = (name: string) => vi.waitFor(() => expect(screen()).toBe(name), { timeout: 8000 });
  await press("parents");
  for (const d of "1234") await press(`key_${d}`);
  await settle(20);
  await waitScreen("parents");
  await press("parents_children");
  await waitScreen("parents-children");
  await press(`edit_${child.id}`);
  await waitScreen("parents-child");
  const saved = async () => (await services.profiles.get(child.id)).settings as Record<string, any>;
  const androidBack = async () => {
    act(() => back!());
    await settle();
  };
  return { services, child, el, press, screen, text, waitScreen, saved, androidBack, container };
}

describe("the child's page", () => {
  it("has the report and the learning settings next to the rest", async () => {
    const app = await start();
    expect(app.el("child_report")!.textContent).toBe(t("dashEntry"));
    expect(app.el("child_learning")!.textContent).toBe(t("learningEntry"));
  });
});

describe("the learning settings", () => {
  async function open() {
    const app = await start();
    await app.press("child_learning");
    await app.waitScreen("parents-learning");
    return app;
  }

  it("shows the defaults: all subjects, levels shown, 5 questions", async () => {
    const app = await open();
    expect(app.text()).toContain(t("learningSubjects", { on: 6, total: 6 }));
    expect(app.text()).toContain(t("learningLevels", { state: t("learningLevelsShown") }));
    expect(app.text()).toContain(t("learningQuestions", { n: 5 }));
  });

  it("levels for the child can be hidden, and shown again", async () => {
    const app = await open();
    await app.press("learning_levels");
    expect(app.text()).toContain(t("learningLevels", { state: t("learningLevelsHidden") }));
    expect((await app.saved())["learning"].show_levels).toBe(false);
    await app.press("learning_levels");
    expect((await app.saved())["learning"].show_levels).toBe(true);
  });

  it("questions per battle: steps of one from 3 to 10, saved with the child, the other settings kept", async () => {
    const app = await open();
    await app.press("learning_questions_less");
    await app.press("learning_questions_less");
    expect(app.text()).toContain(t("learningQuestions", { n: 3 }));
    expect(app.el("learning_questions_less")!.disabled).toBe(true);
    expect((await app.saved())["questions_per_battle"]).toBe(3);
    for (let i = 0; i < 7; i++) await app.press("learning_questions_more");
    expect(app.text()).toContain(t("learningQuestions", { n: 10 }));
    expect(app.el("learning_questions_more")!.disabled).toBe(true);
    const s = await app.saved();
    expect(s["questions_per_battle"]).toBe(10);
    expect(s["tts"]).toBeDefined();
    expect(s["lessons"]).toEqual({ first_pass_coins: 40, repeat_coins: 10 });
  });

  it("subjects on and off: an off subject is saved out, and the last one cannot be turned off", async () => {
    const app = await open();
    await app.press("learning_subjects");
    await app.waitScreen("parents-learning-subjects");
    await app.press("subject_math");
    expect(app.el("subject_math")!.getAttribute("aria-pressed")).toBe("false");
    const list = (await app.saved())["learning"].subjects as string[];
    expect(list).not.toContain("math");
    expect(list).toHaveLength(5);
    for (const s of list.slice(1)) await app.press(`subject_${s}`);
    expect(app.el(`subject_${list[0]}`)!.disabled).toBe(true);
    expect((await app.saved())["learning"].subjects).toEqual([list[0]]);
    // all on again is "all" (no list)
    await app.press("subject_math");
    for (const s of list.slice(1)) await app.press(`subject_${s}`);
    expect((await app.saved())["learning"].subjects).toBeUndefined();
    await app.androidBack();
    expect(app.screen()).toBe("parents-learning");
    expect(app.text()).toContain(t("learningSubjects", { on: 6, total: 6 }));
  });

  it("the start grade of a subject: the child's grade until the parent steps it", async () => {
    const app = await open();
    await app.press("learning_start");
    await app.waitScreen("parents-learning-start");
    expect(app.text()).toContain(t("learningStartDefault", { subject: "חשבון", grade: "כיתה ב" }));
    await app.press("start_math_more");
    await app.press("start_math_more");
    expect(app.text()).toContain(t("learningStartRow", { subject: "חשבון", grade: "כיתה ד" }));
    expect((await app.saved())["learning"].start_grade).toEqual({ math: 4 });
    await app.press("start_logic_less");
    await app.press("start_logic_less");
    await app.press("start_logic_less");
    expect((await app.saved())["learning"].start_grade).toEqual({ math: 4, logic: 0 });
    expect(app.el("start_logic_less")!.disabled).toBe(true);
  });

  it("the two coin amounts of a lesson", async () => {
    const app = await open();
    await app.press("learning_coins");
    await app.waitScreen("parents-learning-coins");
    expect(app.text()).toContain(t("learningCoinsFirst", { n: 40 }));
    await app.press("coins_first_more");
    await app.press("coins_repeat_less");
    expect((await app.saved())["lessons"]).toEqual({ first_pass_coins: 50, repeat_coins: 5 });
    expect(app.text()).toContain(t("learningCoinsFirst", { n: 50 }));
    await app.androidBack();
    expect(app.screen()).toBe("parents-learning");
    await app.androidBack();
    expect(app.screen()).toBe("parents-child");
  });
});

describe("the learning report", () => {
  it("one card for each subject: the level now with its arrow, the grade chosen, and a line for every number", async () => {
    const app = await start(3);
    // a week of answers: the child is doing well at grade 4 maths
    const content = shipped();
    const grade4 = content.bySubject("math").find((s) => s.grade === 4)!;
    const learner = new LearnerState({ grade: 3, age: 9 });
    const now = Date.now() / 1000;
    for (let i = 0; i < 8; i++) {
      learner.logAnswer(makeLogEntry({ ts: now - 3600 - i, skill: grade4.id, item: `x${i}`, subject: "math", correct: i < 7, quality: "correct", elapsed: 6 }));
    }
    await app.services.profiles.saveLearnerDict(app.child.id, learner.toDict() as never);
    await app.press("child_report");
    await app.waitScreen("parents-report");
    expect(app.container.querySelectorAll(".subject-card")).toHaveLength(6);
    const level = app.el("level_math")!;
    expect(level.textContent).toContain("חשבון: כיתה ד׳");
    expect(level.querySelector("svg")!.getAttribute("data-trend")).toBe("up");
    expect(app.el("chosen_math")!.textContent).toBe(t("dashChosen", { grade: "כיתה ג׳" }));
    expect(app.el("accuracy_math")!.textContent).toContain("88%");
    expect(app.el("accuracy_math")!.querySelector(".note")!.textContent).toMatch(/7 נכונות מתוך 8/);
    expect(app.el("helpers_math")).not.toBeNull();
    // a subject with no answers: no percentage, the start level, an arrow that is level
    expect(app.el("accuracy_logic")!.textContent).toContain(t("dashNoPercent"));
    expect(app.el("level_logic")!.querySelector("svg")!.getAttribute("data-trend")).toBe("same");
    // every stat has its own line
    for (const stat of app.container.querySelectorAll(".stat")) expect(stat.querySelector(".note")!.textContent!.length).toBeGreaterThan(8);
    expect(app.el("report_weak")).not.toBeNull();
    expect(app.el("week_days")!.textContent).toContain(t("dashWeekDays", { active: 1 }));
    // the name is on the page (it is the parents' area), and back goes to the child
    await app.androidBack();
    expect(app.screen()).toBe("parents-child");
  });

  it("is read only: looking at it changes neither the child's settings nor the learner", async () => {
    const app = await start(2);
    const before = JSON.stringify(await app.saved());
    const learnerBefore = JSON.stringify(await app.services.profiles.loadLearnerDict(app.child.id));
    await app.press("child_report");
    await app.waitScreen("parents-report");
    expect(JSON.stringify(await app.saved())).toBe(before);
    expect(JSON.stringify(await app.services.profiles.loadLearnerDict(app.child.id))).toBe(learnerBefore);
  });

  it("a subject switched off has no card", async () => {
    const app = await start(2);
    await app.press("child_learning");
    await app.waitScreen("parents-learning");
    await app.press("learning_subjects");
    await app.waitScreen("parents-learning-subjects");
    await app.press("subject_english");
    await app.androidBack();
    await app.androidBack();
    await app.waitScreen("parents-child");
    await app.press("child_report");
    await app.waitScreen("parents-report");
    expect(app.container.querySelectorAll(".subject-card")).toHaveLength(5);
    expect(app.el("level_english")).toBeNull();
  });
});
