import { beforeAll, describe, expect, it } from "vitest";
import type { ContentLibrary } from "../../../src/core/learning";
import { QuizSession } from "../../../src/core/world/quiz";
import { engineFor, shipped } from "../game/helpers";

let content: ContentLibrary;
beforeAll(() => {
  content = shipped();
});

/** A plain choice question, answered right: how far the rating moved, and the outcome. */
function run(notes: boolean) {
  const engine = engineFor(content, 3, 7);
  for (let i = 0; i < 200; i++) {
    const s = new QuizSession(engine, { topic: "math", context: "map", maxChoices: null }, () => 0, () => {});
    if (!s.question || s.question.meta["worked_example"] || s.usesPad) {
      s.dontKnow();
      continue;
    }
    const skill = s.question.skill_id;
    const before = engine.learner.skills.get(skill)?.theta ?? 0;
    if (notes) s.notesOpened();
    s.choose(String(s.question.answer));
    return { change: engine.learner.skills.get(skill)!.theta - before, out: s.outcome!, s };
  }
  throw new Error("no question");
}

describe("the Notes sheet on a question", () => {
  it("a right answer after opening the notes counts half in the rating, like a helper (4.17)", () => {
    const plain = run(false);
    const noted = run(true);
    expect(noted.change).toBeGreaterThan(0);
    expect(noted.change).toBeLessThan(plain.change * 0.7);
    expect(noted.out.quality).not.toBe("super");
  });

  it("does not use up the hint: the notes and the hint are separate", () => {
    const engine = engineFor(content, 3, 7);
    for (let i = 0; i < 100; i++) {
      const s = new QuizSession(engine, { topic: "math", context: "map", maxChoices: null }, () => 0, () => {});
      if (s.phase !== "question") {
        s.dontKnow();
        continue;
      }
      s.notesOpened();
      expect(s.canHint).toBe(true);
      return;
    }
    throw new Error("no question");
  });
});
