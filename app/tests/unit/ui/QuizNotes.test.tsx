import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { ContentLibrary } from "../../../src/core/learning";
import { type Lesson, type LessonSave, loadLessons } from "../../../src/core/game/lessons";
import { QuizSession } from "../../../src/core/world/quiz";
import { QuizScreen } from "../../../src/ui/QuizScreen";
import { engineFor, gameJson, shipped } from "../game/helpers";

let content: ContentLibrary;
let lessons: Lesson[];
beforeAll(async () => {
  content = shipped();
  lessons = await loadLessons(async (p) => gameJson(p));
});
afterEach(cleanup);

/** A question screen on the Moon skill, past any worked example. */
function setup(save: LessonSave) {
  const state = { save };
  const uses: string[] = [];
  const engine = engineFor(content, 4, 5);
  let session: QuizSession | null = null;
  for (let i = 0; i < 40 && !session?.question; i++) {
    session = new QuizSession(engine, { topic: "science.space.moon", context: "map", maxChoices: null }, () => 0, () => {});
  }
  if (session!.phase === "example") session!.exampleDone();
  const r = render(
    <QuizScreen
      session={session!}
      text={(id) => id}
      subjectTitle={(s) => s}
      onClose={() => {}}
      notes={{ lessons, save: () => state.save, onUse: (u, skill) => (state.save = u.state, uses.push(`${skill}:${u.free}`)) }}
    />,
  );
  const q = (id: string) => r.container.querySelector<HTMLButtonElement>(`[data-id=${id}]`);
  const press = async (id: string) => act(async () => q(id)!.click());
  return { session: session!, q, press, uses, state };
}

const learned: LessonSave = { done: ["moon"], repeatDay: null, charges: 0 };

describe("the Notes button on the quiz screen", () => {
  it("is not there before the lesson is passed", () => {
    const m = setup({ done: [], repeatDay: null, charges: 0 });
    expect(m.q("notes_open")).toBeNull();
  });

  it("is there after it, shows the lesson's idea (not the answer) in a sheet, free once, and it closes", async () => {
    const m = setup(learned);
    expect(m.q("notes_open")).not.toBeNull();
    await m.press("notes_open");
    const note = lessons.find((l) => l.id === "moon")!.note!;
    expect(m.q("notes_text")!.textContent).toBe(note.text);
    // the question is still on the screen under the sheet
    expect(m.q("quiz_prompt")).not.toBeNull();
    expect(m.uses).toEqual(["science.space.moon:true"]);
    expect(m.state.save.charges).toBe(0);
    await m.press("notes_close");
    expect(m.q("notes_text")).toBeNull();
    // the sheet is gone and the question can still be answered
    await m.press("quiz_dont_know");
    expect(m.session.outcome).not.toBeNull();
  });
});
