import { beforeAll, describe, expect, it } from "vitest";
import type { ContentLibrary } from "../../../src/core/learning";
import { type HelperBag, type HelperKind, QuizSession } from "../../../src/core/world/quiz";
import { engineFor, shipped } from "../game/helpers";

let content: ContentLibrary;
beforeAll(() => {
  content = shipped();
});

function bag(have: Partial<Record<HelperKind, number>>) {
  const used: string[] = [];
  const b: HelperBag = {
    count: (k) => have[k] ?? 0,
    spend: (k) => {
      if ((have[k] ?? 0) < 1) return false;
      have[k]! -= 1;
      return true;
    },
    used: (k) => used.push(k),
  };
  return { b, used, have };
}

/** A session on a question with at least three choices (or on the number pad). */
function session(helpers: HelperBag, pad = false, seed = 3, onAnswer: () => void = () => {}) {
  const engine = engineFor(content, 3, seed);
  for (let i = 0; i < 200; i++) {
    const s = new QuizSession(engine, { topic: "math", context: "battle", maxChoices: null, helpers }, () => 0, onAnswer);
    if (!s.question) continue;
    // a worked example is not rated: look for a plain question
    if (s.question.meta["worked_example"]) {
      s.exampleDone();
      s.dontKnow();
      continue;
    }
    if (pad ? s.usesPad : !s.usesPad && s.choices.length > 2) return { s, engine };
    // answer this one to get on to another question
    s.dontKnow();
  }
  throw new Error("no question of that kind");
}

describe("helpers on the question screen", () => {
  it("only helpers in the Bag are offered, and none without a Bag", () => {
    const { s } = session(bag({}).b);
    expect(s.helpersOwned()).toEqual([]);
    const withBag = session(bag({ fifty: 2, pass: 1 }).b).s;
    expect(withBag.helpersOwned()).toEqual([
      { kind: "fifty", count: 2 },
      { kind: "pass", count: 1 },
    ]);
    const engine = engineFor(content, 3, 1);
    const none = new QuizSession(engine, { topic: "math", context: "map", maxChoices: null }, () => 0, () => {});
    expect(none.helpersOwned()).toEqual([]);
    expect(none.useHelper("fifty")).toBe(false);
  });

  it("50/50 takes two wrong choices away, keeps the right one, uses up one clover and is logged", () => {
    const h = bag({ fifty: 1 });
    const { s } = session(h.b);
    const before = s.choices.length;
    expect(s.useHelper("fifty")).toBe(true);
    expect(s.choices.length).toBe(Math.max(2, before - 2));
    expect(s.choices.some((c) => c.id === String(s.question!.answer))).toBe(true);
    expect(h.have.fifty).toBe(0);
    expect(h.used).toEqual(["fifty"]);
  });

  it("only one helper for each question: a second asks for nothing and costs nothing", () => {
    const h = bag({ fifty: 2, hint: 2 });
    const { s } = session(h.b);
    expect(s.useHelper("fifty")).toBe(true);
    expect(s.useHelper("hint")).toBe(false);
    expect(s.useHelper("fifty")).toBe(false);
    expect(h.have).toEqual({ fifty: 1, hint: 2 });
    expect(s.helpersOwned()).toEqual([]);
  });

  it("the feather shows the first step, never the answer, on a choice question and on the pad", () => {
    for (const pad of [false, true]) {
      const h = bag({ hint: 1 });
      const { s } = session(h.b, pad);
      expect(s.useHelper("hint")).toBe(true);
      expect(s.hintText).toBeTruthy();
      expect(h.used).toEqual(["hint"]);
    }
  });

  it("a helper that is not in the Bag does nothing", () => {
    const { s } = session(bag({}).b);
    expect(s.useHelper("fifty")).toBe(false);
    expect(s.useHelper("pass")).toBe(false);
    expect(s.hidden.size).toBe(0);
  });

  it("the pass swaps the question: no answer is given, no rating changes, no reward", () => {
    const h = bag({ pass: 1 });
    let answers = 0;
    const { s, engine } = session(h.b, false, 3, () => answers++);
    answers = 0;
    const theta = [...engine.learner.skills.values()].map((k) => k.theta);
    const total = engine.learner.answers_total;
    expect(s.useHelper("pass")).toBe(true);
    expect(s.phase).toBe("passed");
    expect(s.passed).toBe(true);
    expect(answers).toBe(0);
    expect(engine.learner.answers_total).toBe(total);
    expect([...engine.learner.skills.values()].map((k) => k.theta)).toEqual(theta);
    expect(s.choose(s.question!.choices[0]!.id)).toBe(false);
    expect(s.dontKnow()).toBe(false);
    expect(h.have.pass).toBe(0);
  });

  it("a right answer after a helper moves the child's rating half as much as the same answer without one", () => {
    const run = (helper: boolean) => {
      const { s, engine } = session(bag({ fifty: 1 }).b, false, 7);
      const skill = s.question!.skill_id;
      const before = engine.learner.skills.get(skill)?.theta ?? 0;
      if (helper) s.useHelper("fifty");
      s.choose(String(s.question!.answer));
      return { change: engine.learner.skills.get(skill)!.theta - before, out: s.outcome! };
    };
    const plain = run(false);
    const helped = run(true);
    expect(plain.change).toBeGreaterThan(0);
    expect(helped.change).toBeGreaterThan(0);
    // half weight, and no speed bonus on top
    expect(helped.change).toBeLessThan(plain.change * 0.7);
    // no speed bonus, and the coins are halved
    expect(helped.out.quality).not.toBe("super");
    expect(helped.out.coins).toBeLessThanOrEqual(plain.out.coins);
  });
});
