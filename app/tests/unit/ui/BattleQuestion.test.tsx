import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { LearningEngine, LearnerState, PyRandom, type ContentLibrary } from "../../../src/core/learning";
import { makeChoice, makeQuestion, type Question, trueFalseChoices } from "../../../src/core/learning/model";
import { QuizSession } from "../../../src/core/world/quiz";
import { BattleQuestion, presentationFor } from "../../../src/ui/battle/BattleQuestion";
import { shipped } from "../game/helpers";

let content: ContentLibrary;
beforeAll(() => {
  content = shipped();
});
afterEach(cleanup);

const base = { item_id: "t:1", skill_id: "test.skill", subject: "english", prompt_he: "שאלה", explanation_he: "הסבר." };
const order = () => makeQuestion({ ...base, kind: "order", answer: ["b", "a", "c"], choices: [makeChoice("a", "שני"), makeChoice("b", "ראשון"), makeChoice("c", "שלישי")] });
const letters = () =>
  makeQuestion({ ...base, kind: "letters", answer: "cat", choices: [makeChoice("t0", "t", "t"), makeChoice("t1", "c", "c"), makeChoice("t2", "a", "a"), makeChoice("t3", "z", "z")] });
const trueFalse = () => makeQuestion({ ...base, kind: "true_false", answer: "true", choices: trueFalseChoices() });
const many = (n: number, image: string | null = null) =>
  makeQuestion({ ...base, kind: "choice", answer: "a", choices: Array.from({ length: n }, (_, i) => makeChoice(String.fromCharCode(97 + i), `תשובה ${i}`, null, image)) });

function open(q: Question) {
  const engine = new LearningEngine(content, new LearnerState({ grade: 3, age: 9 }), { rng: new PyRandom(1), clock: () => 1_760_000_000 });
  engine.nextQuestion = () => q;
  const session = new QuizSession(engine, { topic: "english", context: "battle", maxChoices: null, kinds: ["order", "letters"] }, () => 0, () => {});
  const results: boolean[] = [];
  const view = render(<BattleQuestion session={session} text={(id) => id} subjectTitle={(s) => s} onResult={(o) => results.push(o.correct)} onClose={() => {}} />);
  const el = (id: string) => view.container.querySelector<HTMLButtonElement>(`[data-id=${id}]`)!;
  const tap = async (id: string) => act(async () => el(id).click());
  return { session, results, el, tap, root: view.container };
}

describe("order: tap the cards in order", () => {
  it("shows every card, numbers the ones tapped, and takes the answer on 'check'", async () => {
    const m = open(order());
    expect(presentationFor(m.session)).toBe("order");
    expect(m.root.querySelectorAll(".quiz-tiles .tile")).toHaveLength(3);
    expect(m.el("quiz_check").disabled).toBe(true);
    await m.tap("quiz_tile_b");
    await m.tap("quiz_tile_a");
    expect(m.el("quiz_tile_b").querySelector(".tile-n")!.textContent).toBe("1");
    expect(m.el("quiz_tile_a").querySelector(".tile-n")!.textContent).toBe("2");
    expect(m.el("quiz_check").disabled).toBe(true);
    await m.tap("quiz_tile_c");
    expect(m.el("quiz_check").disabled).toBe(false);
    await m.tap("quiz_check");
    expect(m.results).toEqual([true]);
  });

  it("a tapped card taps back off, and erase takes the last one", async () => {
    const m = open(order());
    await m.tap("quiz_tile_a");
    await m.tap("quiz_tile_b");
    await m.tap("quiz_tile_a");
    expect(m.el("quiz_tile_a").dataset["picked"]).toBe("false");
    expect(m.el("quiz_tile_b").querySelector(".tile-n")!.textContent).toBe("1");
    await m.tap("quiz_key_back");
    expect(m.root.querySelectorAll("[data-picked=true]")).toHaveLength(0);
    expect(m.el("quiz_key_back").disabled).toBe(true);
  });

  it("a wrong order is a wrong answer, never a stuck screen", async () => {
    const m = open(order());
    for (const id of ["a", "b", "c"]) await m.tap(`quiz_tile_${id}`);
    await m.tap("quiz_check");
    expect(m.results).toEqual([false]);
  });
});

describe("letters: spell the word from tiles", () => {
  it("shows the word as it grows and takes it on 'check'", async () => {
    const m = open(letters());
    expect(presentationFor(m.session)).toBe("letters");
    expect(m.el("quiz_typed")?.textContent ?? m.root.querySelector("[data-id=quiz_typed]")!.textContent).toBe("_");
    await m.tap("quiz_tile_t1");
    await m.tap("quiz_tile_t2");
    await m.tap("quiz_tile_t0");
    expect(m.root.querySelector("[data-id=quiz_typed]")!.textContent).toBe("cat");
    await m.tap("quiz_check");
    expect(m.results).toEqual([true]);
  });

  it("a wrong word is wrong; erase takes the last letter", async () => {
    const m = open(letters());
    await m.tap("quiz_tile_t3");
    await m.tap("quiz_key_back");
    expect(m.root.querySelector("[data-id=quiz_typed]")!.textContent).toBe("_");
    await m.tap("quiz_tile_t3");
    await m.tap("quiz_check");
    expect(m.results).toEqual([false]);
  });
});

describe("true or false: two big thumbs", () => {
  it("shows a thumb up and a thumb down, and a tap answers", async () => {
    const m = open(trueFalse());
    expect(presentationFor(m.session)).toBe("thumbs");
    expect(m.el("quiz_choice_true").textContent).toContain("👍");
    expect(m.el("quiz_choice_false").textContent).toContain("👎");
    expect(m.root.querySelectorAll(".thumb")).toHaveLength(2);
    await m.tap("quiz_choice_true");
    expect(m.results).toEqual([true]);
  });
});

describe("more answers, a calm layout", () => {
  it("up to four float around the creature", () => {
    const m = open(many(4));
    expect(presentationFor(m.session)).toBe("cards");
    expect(m.root.querySelector(".answer-ring")).not.toBeNull();
  });

  it("six are a still list at the side, with the right one among them", async () => {
    const m = open(many(8));
    expect(presentationFor(m.session)).toBe("list");
    expect(m.root.querySelector(".answer-ring")).toBeNull();
    expect(m.root.querySelectorAll(".quiz-tiles .tile")).toHaveLength(6);
    await m.tap("quiz_choice_a");
    expect(m.results).toEqual([true]);
  });

  it("picture answers are picture tiles", () => {
    const m = open(many(3, "apple"));
    expect(presentationFor(m.session)).toBe("pictures");
    expect(m.root.querySelector(".answer-ring")!.getAttribute("data-look")).toBe("pictures");
    expect(m.root.querySelectorAll(".answer-ring img")).toHaveLength(3);
  });
});
