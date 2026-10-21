/// <reference types="node" />
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { type ContentLibrary, displayAnswer, LearningEngine, LearnerState, loadContent, PyRandom } from "../../../src/core/learning";
import type { AnswerOutcome } from "../../../src/core/learning/engine";
import { DRAWN_FIGURE_KINDS } from "../../../src/core/learning/model";
import { QuizSession, resultWord } from "../../../src/core/world/quiz";
import type { QuizWord } from "../../../src/core/world/events";

/** The content as the app ships it (public/game/content, from the build). */
function shipped(): ContentLibrary {
  const dir = "public/game/content";
  const index = JSON.parse(readFileSync(`${dir}/index.json`, "utf8")) as { files: { file: string }[] };
  const docs: Record<string, unknown> = {};
  for (const f of index.files) docs[f.file] = JSON.parse(readFileSync(`${dir}/${f.file}`, "utf8"));
  return loadContent(docs);
}

let content: ContentLibrary;
beforeAll(() => {
  content = shipped();
});

/** A clock the test moves by hand, ms. */
function clock(start = 1000) {
  let t = start;
  return { now: () => t, add: (ms: number) => (t += ms) };
}

function session(
  { grade = 2, topic = "math.money.change_20", seed = 1, workedExamples = false, maxChoices = null as number | null } = {},
) {
  const learner = new LearnerState({ grade, age: grade ? grade + 6 : 5, settings: { worked_examples: workedExamples } });
  const engine = new LearningEngine(content, learner, { rng: new PyRandom(seed), clock: () => 1_760_000_000 });
  const answers: { outcome: AnswerOutcome; word: QuizWord }[] = [];
  const c = clock();
  const s = new QuizSession(engine, { topic, context: "shop", maxChoices }, c.now, (outcome, word) => answers.push({ outcome, word }));
  return { s, engine, learner, answers, clock: c };
}

/** The first seed whose question is of `kind`. */
function seedFor(kind: string, opts: Parameters<typeof session>[0] = {}): number {
  for (let seed = 0; seed < 200; seed++) if (session({ ...opts, seed }).s.question?.kind === kind) return seed;
  throw new Error(`no ${kind} question in 200 seeds`);
}

describe("the cashier's question", () => {
  it("comes from the selector on the script's skill, for this child", () => {
    const { s } = session();
    expect(s.question?.skill_id).toBe("math.money.change_20");
    expect(s.phase).toBe("question");
  });

  it("on a subject, the selector picks the child's own level (kindergarten: few choices)", () => {
    const { s } = session({ grade: 0, topic: "math", maxChoices: 3 });
    expect(s.question?.subject).toBe("math");
    expect(content.get(s.question!.skill_id)!.grade).toBeLessThanOrEqual(1);
    expect(s.choices.length).toBeLessThanOrEqual(3);
  });

  it("a skill that does not exist is no question, not a crash", () => {
    const warnings: string[] = [];
    const learner = new LearnerState({ grade: 2 });
    const engine = new LearningEngine(content, learner, { rng: new PyRandom(1) });
    const s = new QuizSession(engine, { topic: "math.no_such_skill", context: "shop", maxChoices: null }, () => 0, () => {}, (m) => warnings.push(m));
    expect(s.question).toBeNull();
    expect(s.phase).toBe("none");
    expect(s.dontKnow()).toBe(false);
    expect(warnings).toHaveLength(1);
  });
});

describe("a question this screen cannot take yet", () => {
  it.each(["order", "letters"])("a %s question is no question (one tap would always be wrong), and says so", (kind) => {
    const warnings: string[] = [];
    const fake = { nextQuestion: () => ({ kind, item_id: "x", choices: [{ id: "a" }], meta: {} }) } as unknown as LearningEngine;
    const s = new QuizSession(fake, { topic: "english", context: "quest", maxChoices: null }, () => 0, () => {}, (m) => warnings.push(m));
    expect(s.question).toBeNull();
    expect(s.phase).toBe("none");
    expect(warnings.join()).toMatch(/M6/);
  });
});

describe("a choice question", () => {
  const seed = () => seedFor("choice");

  it("a right choice is counted at once, with the learner, and the script hears 'correct'", () => {
    const { s, learner, answers } = session({ seed: seed() });
    const right = s.question!.answer as string;
    expect(s.choose(right)).toBe(true);
    expect(s.phase).toBe("feedback");
    expect(answers.map((a) => a.word)).toEqual(["correct"]);
    expect(s.outcome?.correct).toBe(true);
    expect(learner.answers_total).toBe(1);
    expect(learner.correct_total).toBe(1);
    // one answer per question
    expect(s.choose(right)).toBe(false);
    expect(s.dontKnow()).toBe(false);
    expect(answers).toHaveLength(1);
  });

  it("a wrong choice gets the right answer and an explanation", () => {
    const { s, answers } = session({ seed: seed() });
    const wrong = s.question!.choices.find((c) => c.id !== s.question!.answer)!;
    s.choose(wrong.id);
    expect(answers[0]!.word).toBe("wrong");
    expect(s.outcome!.correct_answer).toMatch(/\d/);
    expect(s.outcome!.explanation_he).toMatch(/[א-ת]/);
  });

  it("'don't know' is an answer: wrong for the script, half weight for the rating", () => {
    const { s, answers, learner } = session({ seed: seed() });
    expect(s.dontKnow()).toBe(true);
    expect(s.gaveUp).toBe(true);
    expect(answers[0]!.word).toBe("wrong");
    expect(learner.log.at(-1)!.dk).toBe(true);
    expect(s.outcome!.explanation_he).not.toBe("");
  });

  it("the hint takes one wrong choice away, once", () => {
    const { s } = session({ seed: seed() });
    const before = s.choices.length;
    s.hint();
    expect(s.hintText).toMatch(/[א-ת]/);
    expect(s.choices.length).toBe(before - 1);
    expect(s.choices.some((c) => c.id === s.question!.answer)).toBe(true);
    expect(s.canHint).toBe(false);
    s.hint();
    expect(s.choices.length).toBe(before - 1);
    // a hidden choice cannot be chosen
    expect(s.choose([...s.hidden][0]!)).toBe(false);
  });

  it("an answer after a hint is logged with the hint", () => {
    const { s, learner } = session({ seed: seed() });
    s.hint();
    s.choose(s.question!.answer as string);
    expect(learner.log.at(-1)!.hint).toBe(true);
  });

  it("how long the answer took comes from the clock given", () => {
    const { s, learner, clock: c } = session({ seed: seed() });
    c.add(4500);
    s.choose(s.question!.answer as string);
    expect(learner.log.at(-1)!.elapsed).toBeCloseTo(4.5);
  });
});

describe("a number question", () => {
  const seed = () => seedFor("number", { grade: 4 });

  it("is typed on the pad and checked; nothing typed checks nothing", () => {
    const { s, answers } = session({ grade: 4, seed: seed() });
    expect(s.usesPad).toBe(true);
    expect(s.check()).toBe(false);
    for (const k of String(s.question!.answer)) s.press(k);
    expect(s.pad.text).toBe(String(s.question!.answer));
    expect(s.choose("a")).toBe(false);
    expect(s.check()).toBe(true);
    expect(answers[0]!.word).toMatch(/correct|super/);
  });

  it("the pad erases, and stops at 10 characters", () => {
    const { s } = session({ grade: 4, seed: seed() });
    for (let i = 0; i < 12; i++) s.press("7");
    expect(s.pad.text).toBe("7777777777");
    s.press("back");
    expect(s.pad.text).toBe("777777777");
  });

  it("a wrong number is 'wrong' with the right answer shown", () => {
    const { s, answers } = session({ grade: 4, seed: seed() });
    s.press("9");
    s.press("9");
    s.press("9");
    s.check();
    expect(answers[0]!.word).toBe("wrong");
    expect(s.outcome!.correct_answer).toBe(String(s.question!.answer));
  });

  it("the hint shows a first step and takes nothing away", () => {
    const { s } = session({ grade: 4, seed: seed() });
    s.hint();
    expect(s.hintText).toMatch(/רמז/);
    expect(s.hidden.size).toBe(0);
  });
});

describe("the owl's worked example", () => {
  it("comes first on a skill's first meeting, then the same question is asked", () => {
    const { s, answers, clock: c, learner } = session({ workedExamples: true });
    expect(s.phase).toBe("example");
    expect(s.question!.meta["worked_example"]).toBe(true);
    // no answer while the example shows
    expect(s.dontKnow()).toBe(false);
    expect(s.canHint).toBe(false);
    c.add(20_000);
    s.exampleDone();
    expect(s.phase).toBe("question");
    c.add(2000);
    s.dontKnow();
    expect(answers).toHaveLength(1);
    // the time counts from the question, not from the example
    expect(learner.log.at(-1)!.elapsed).toBeCloseTo(2);
  });
});

describe("the owl's example is another item of the skill", () => {
  it("shows a sibling with its own answer and steps; the question that follows is not the example", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { s } = session({ workedExamples: true, seed });
      expect(s.phase).toBe("example");
      const ex = s.example!;
      expect(ex).not.toBeNull();
      expect(ex.item_id).not.toBe(s.question!.item_id);
      expect(ex.prompt_he).not.toBe(s.question!.prompt_he);
      expect(ex.answer_he).not.toBe(displayAnswer(s.question!));
      expect(ex.steps_he).toMatch(/[א-ת]/);
      // what the example shows is never the asked question's own explanation
      expect(ex.steps_he).not.toBe(s.question!.explanation_he);
    }
  });

  it("no sibling, no example: the question comes at once, rated as any other", () => {
    const only = { ...session({ seed: 1 }).s.question!, meta: { worked_example: true } };
    const fake = { nextQuestion: () => only, content } as unknown as LearningEngine;
    const s = new QuizSession(fake, { topic: "math.money.change_20", context: "shop", maxChoices: null }, () => 0, () => {});
    expect(s.example).toBeNull();
    expect(s.phase).toBe("question");
  });

  it("the example is no question: nothing can be answered while it shows", () => {
    const { s } = session({ workedExamples: true, seed: 2 });
    expect(s.phase).toBe("example");
    expect(s.choose(s.question!.choices[0]!.id)).toBe(false);
    expect(s.check()).toBe(false);
    expect(s.dontKnow()).toBe(false);
  });

  it("the feather and the hint name the idea and do not give the answer", () => {
    const { s } = session({ grade: 4, seed: 3 });
    s.hint();
    const answer = displayAnswer(s.question!);
    expect(s.hintText).toMatch(/רמז/);
    expect(s.hintText!.split(/\s+/)).not.toContain(answer);
  });
});

describe("the script's word", () => {
  it("is super, correct or wrong, as ask_quiz wrote it", () => {
    const o = (quality: "super" | "correct" | "wrong") => ({ quality, correct: quality !== "wrong" }) as AnswerOutcome;
    expect(resultWord(o("super"))).toBe("super");
    expect(resultWord(o("correct"))).toBe("correct");
    expect(resultWord(o("wrong"))).toBe("wrong");
  });
});

describe("questions that need a picture", () => {
  it("the robot-on-a-grid question is asked again now that its grid is drawn", () => {
    const kinds = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const q = session({ grade: 4, topic: "logic.robot.path_end", seed }).s.question;
      if (q) kinds.add(q.figure?.kind ?? "none");
    }
    expect([...kinds]).toEqual(["grid_path"]);
  });

  it("are never asked when the app cannot draw them: a '?' card where the grid should be cannot be answered", () => {
    // the robot-on-a-grid question needs its grid; logic, geometry and clocks are full of figures
    for (const topic of ["logic.robot.path_end", "logic.robot.loops", "logic", "geometry", "math"]) {
      for (let seed = 0; seed < 150; seed++) {
        const { s } = session({ grade: 4, topic, seed });
        const kind = s.question?.figure?.kind;
        if (kind) expect(DRAWN_FIGURE_KINDS.has(kind), `${topic} seed ${seed}: ${kind}`).toBe(true);
      }
    }
  });

  it("still finds a question for a subject whose generators mostly draw figures", () => {
    const asked = Array.from({ length: 40 }, (_, seed) => session({ grade: 4, topic: "geometry", seed }).s.question).filter(Boolean);
    expect(asked.length).toBeGreaterThan(20);
  });
});
