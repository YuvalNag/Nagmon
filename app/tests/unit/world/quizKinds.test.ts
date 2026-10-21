// @vitest-environment node
/** The kinds the battle draws its own input for: order (tap in order) and letters (tiles). Others stay blocked. */
import { beforeAll, describe, expect, it } from "vitest";
import { LearningEngine, LearnerState, PyRandom, type ContentLibrary } from "../../../src/core/learning";
import { makeChoice, makeQuestion, type Question, trueFalseChoices } from "../../../src/core/learning/model";
import { QuizSession, type QuizRequest } from "../../../src/core/world/quiz";
import { shipped } from "../game/helpers";

let content: ContentLibrary;
beforeAll(() => {
  content = shipped();
});

const base = { item_id: "t:1", skill_id: "test.skill", subject: "english", prompt_he: "שאלה", explanation_he: "הסבר." };

const order = (): Question =>
  makeQuestion({ ...base, kind: "order", answer: ["b", "a", "c"], choices: [makeChoice("a", "שני"), makeChoice("b", "ראשון"), makeChoice("c", "שלישי")] });
const letters = (): Question =>
  makeQuestion({ ...base, kind: "letters", answer: "cat", choices: [makeChoice("t0", "t"), makeChoice("t1", "c"), makeChoice("t2", "a"), makeChoice("t3", "z")] });
const trueFalse = (): Question => makeQuestion({ ...base, kind: "true_false", answer: "true", choices: trueFalseChoices() });

function open(q: Question, request: Partial<QuizRequest> = {}) {
  const engine = new LearningEngine(content, new LearnerState({ grade: 3, age: 9 }), { rng: new PyRandom(1), clock: () => 1_760_000_000 });
  engine.nextQuestion = () => q;
  const warnings: string[] = [];
  const s = new QuizSession(engine, { topic: "english", context: "battle", maxChoices: null, ...request }, () => 0, () => {}, (m) => warnings.push(m));
  return { s, engine, warnings };
}

describe("order and letters questions", () => {
  it.each([order, letters])("stay blocked unless the screen says it draws them (the figures guard's way)", (make) => {
    const { s, warnings } = open(make());
    expect(s.question).toBeNull();
    expect(warnings.join()).toMatch(/cannot be answered/);
  });

  it("the battle's request lists them, and then they are questions", () => {
    expect(open(order(), { kinds: ["order", "letters"] }).s.question?.kind).toBe("order");
    expect(open(letters(), { kinds: ["order", "letters"] }).s.question?.kind).toBe("letters");
    expect(open(order(), { kinds: ["letters"] }).s.question).toBeNull();
    expect(open(letters(), { kinds: ["order"] }).s.question).toBeNull();
  });

  it("one with no cards or tiles is still no question", () => {
    const q = makeQuestion({ ...base, kind: "order", answer: ["a"], choices: [] });
    expect(open(q, { kinds: ["order"] }).s.question).toBeNull();
  });

  it("the input is named for the screen", () => {
    expect(open(order(), { kinds: ["order"] }).s.input).toBe("order");
    expect(open(letters(), { kinds: ["letters"] }).s.input).toBe("letters");
    expect(open(trueFalse()).s.input).toBe("choice");
  });
});

describe("tapping the cards in order", () => {
  it("the right order is right, graded by the engine", () => {
    const { s } = open(order(), { kinds: ["order"] });
    expect(s.arrange(["b", "a", "c"])).toBe(true);
    expect(s.outcome?.correct).toBe(true);
  });

  it("another order is wrong, and is counted like any wrong answer", () => {
    const { s, engine } = open(order(), { kinds: ["order"] });
    expect(s.arrange(["a", "b", "c"])).toBe(true);
    expect(s.outcome?.correct).toBe(false);
    expect(engine.learner.answers_total).toBe(1);
  });

  it("only a complete list of the cards counts: a short one, a repeat or a stranger is no answer", () => {
    const { s } = open(order(), { kinds: ["order"] });
    expect(s.arrange(["b", "a"])).toBe(false);
    expect(s.arrange(["b", "b", "c"])).toBe(false);
    expect(s.arrange(["b", "a", "x"])).toBe(false);
    expect(s.outcome).toBeNull();
  });

  it("a card cannot be 'chosen' alone: one tap would always be wrong", () => {
    const { s } = open(order(), { kinds: ["order"] });
    expect(s.choose("b")).toBe(false);
    expect(s.spell("cat")).toBe(false);
  });

  it("the 50/50 clover does not work on it (it would take cards away)", () => {
    const { s } = open(order(), { kinds: ["order"], helpers: { count: () => 1, spend: () => true } });
    expect(s.helpersOwned().map((h) => h.kind)).not.toContain("fifty");
    expect(s.useHelper("fifty")).toBe(false);
  });
});

describe("spelling from letter tiles", () => {
  it("the right word is right, and a wrong one is wrong", () => {
    const right = open(letters(), { kinds: ["letters"] }).s;
    expect(right.spell("cat")).toBe(true);
    expect(right.outcome?.correct).toBe(true);
    const wrong = open(letters(), { kinds: ["letters"] }).s;
    expect(wrong.spell("cta")).toBe(true);
    expect(wrong.outcome?.correct).toBe(false);
  });

  it("an empty word is no answer, and cards cannot be tapped in order here", () => {
    const { s } = open(letters(), { kinds: ["letters"] });
    expect(s.spell("  ")).toBe(false);
    expect(s.arrange(["t0"])).toBe(false);
    expect(s.outcome).toBeNull();
  });

  it("'I don't know' still works", () => {
    const { s } = open(letters(), { kinds: ["letters"] });
    expect(s.dontKnow()).toBe(true);
    expect(s.outcome?.correct).toBe(false);
  });
});

describe("true or false", () => {
  it("is still taken as a choice between the two cards", () => {
    const { s } = open(trueFalse());
    expect(s.choices.map((c) => c.id)).toEqual(["true", "false"]);
    expect(s.choose("true")).toBe(true);
    expect(s.outcome?.correct).toBe(true);
  });
});
