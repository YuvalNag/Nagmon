// @vitest-environment node
/** M1-M10: question model and answer checking (test_learning_model.py). */
import { describe, expect, it } from "vitest";
import { Fraction } from "../../../src/core/learning/fraction";
import {
  checkAnswer,
  displayAnswer,
  makeChoice,
  makeQuestion,
  normalizeNumber,
  normalizeText,
  parseNumber,
  type Question,
  type QuestionInit,
  trueFalseChoices,
} from "../../../src/core/learning/model";

function numQ(answer: string, kw: Partial<QuestionInit> = {}): Question {
  return makeQuestion({ item_id: "t:1", skill_id: "math.test", subject: "math", kind: "number", prompt_he: "כמה זה?", prompt_en: null, answer, ...kw });
}

function choiceQ(): Question {
  return makeQuestion({
    item_id: "t:2",
    skill_id: "math.test",
    subject: "math",
    kind: "choice",
    prompt_he: "איזה פרי?",
    prompt_en: "Which fruit?",
    answer: "b",
    choices: [makeChoice("a", "כלב", "dog"), makeChoice("b", "תפוח", "Apple"), makeChoice("c", "כיסא", "chair")],
    misconceptions: { a: "animal_not_fruit" },
  });
}

describe("model", () => {
  it.each(["7", "07", " 7 ", "+7", "7.0", "‏7"])("m1 integer normalization %j", (given) => {
    const res = checkAnswer(numQ("7"), given);
    expect(res.correct).toBe(true);
    expect(res.normalized).toBe("7");
  });

  it.each([
    ["3.50", "3.5"],
    ["3,5", "3.5"],
    ["1,000", "1000"],
    ["12,500", "12500"],
    ["−3", "-3"],
    ["-0", "0"],
    [".5", "0.5"],
    ["12 ₪", "12"],
    ["40°", "40"],
    ["25%", "25"],
    ["2/4", "2/4"],
    ["1 1/2", "3/2"],
  ])("m2 normalize number %j -> %j", (raw, expected) => {
    expect(normalizeNumber(raw)).toBe(expected);
  });

  it("m2 decimal equal", () => {
    expect(checkAnswer(numQ("3.5"), "3.50").correct).toBe(true);
    expect(checkAnswer(numQ("1000"), "1,000").correct).toBe(true);
    expect(checkAnswer(numQ("-3"), "−3").correct).toBe(true);
  });

  it("m3 fraction value policy", () => {
    const q = numQ("1/2");
    expect(checkAnswer(q, "2/4").correct).toBe(true);
    expect(checkAnswer(q, "0.5").correct).toBe(true);
    expect(checkAnswer(q, "1/2").correct).toBe(true);
    expect(checkAnswer(q, "1/3").correct).toBe(false);
  });

  it("m4 fraction simplest policy", () => {
    const q = numQ("1/2", { meta: { fraction_form: "simplest" } });
    const res = checkAnswer(q, "2/4");
    expect(res.correct).toBe(false);
    expect(res.misconception).toBe("not_simplified");
    expect(checkAnswer(q, "1/2").correct).toBe(true);
  });

  it("m5 mixed number", () => {
    expect(checkAnswer(numQ("3/2"), "1 1/2").correct).toBe(true);
    expect(parseNumber("1 1/2")!.eq(new Fraction(3, 2))).toBe(true);
    expect(parseNumber("-1 1/2")!.eq(new Fraction(-3, 2))).toBe(true);
  });

  it("m6 choice by id and text", () => {
    const q = choiceQ();
    expect(checkAnswer(q, "b").correct).toBe(true);
    expect(checkAnswer(q, "תפוח").correct).toBe(true);
    expect(checkAnswer(q, "apple").correct).toBe(true);
    const res = checkAnswer(q, "a");
    expect(res.correct).toBe(false);
    expect(res.misconception).toBe("animal_not_fruit");
    expect(res.normalized).toBe("a");
    expect(checkAnswer(q, "כלב").misconception).toBe("animal_not_fruit");
  });

  it("m6 number misconception by value", () => {
    const q = numQ("8", { misconceptions: { "12": "add_instead_of_sub" } });
    expect(checkAnswer(q, "012").misconception).toBe("add_instead_of_sub");
  });

  it.each(["נכון", "true", "כן", "True", "yes"])("m7 true/false %j", (given) => {
    const q = makeQuestion({
      item_id: "t:3",
      skill_id: "logic.test",
      subject: "logic",
      kind: "true_false",
      prompt_he: "כל ריבוע הוא מלבן",
      prompt_en: null,
      answer: "true",
      choices: trueFalseChoices(),
    });
    expect(checkAnswer(q, given).correct).toBe(true);
    expect(checkAnswer(q, "לא נכון").correct).toBe(false);
  });

  it("m8 text trimming", () => {
    expect(normalizeText("  ‏שָׁלוֹם   עולם. ")).toBe("שלום עולם");
    const q = makeQuestion({
      item_id: "t:4",
      skill_id: "english.test",
      subject: "english",
      kind: "letters",
      prompt_he: "אייתו את המילה",
      prompt_en: null,
      answer: "Dog",
    });
    expect(checkAnswer(q, " dog ").correct).toBe(true);
    expect(checkAnswer(q, "DOG!").correct).toBe(true);
  });

  it("m9 order", () => {
    const q = makeQuestion({
      item_id: "t:5",
      skill_id: "science.test",
      subject: "science",
      kind: "order",
      prompt_he: "סדרו",
      prompt_en: null,
      answer: ["c", "a", "b"],
      choices: [makeChoice("a", "א"), makeChoice("b", "ב"), makeChoice("c", "ג")],
    });
    expect(checkAnswer(q, ["c", "a", "b"]).correct).toBe(true);
    expect(checkAnswer(q, ["a", "b", "c"]).correct).toBe(false);
    expect(checkAnswer(q, ["c", "a", "b"]).normalized).toEqual(["c", "a", "b"]);
  });

  it("m10 garbage number", () => {
    const res = checkAnswer(numQ("7"), "שבע?");
    expect(res.correct).toBe(false);
    expect(res.normalized).toBeNull();
    expect(checkAnswer(numQ("7"), null).correct).toBe(false);
  });

  it("display answer", () => {
    expect(displayAnswer(choiceQ())).toBe("תפוח");
    expect(displayAnswer(numQ("3.5"))).toBe("3.5");
  });
});
