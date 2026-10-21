/// <reference types="node" />
/**
 * The owl's worked example is a SIBLING of the asked question, never the
 * question itself: same skill and structure, other numbers or words, other
 * answer, walked through step by step. The hint names the idea and the
 * first step, never the answer. Every skill of the shipped content, over
 * several seeds.
 */
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { type ContentLibrary, displayAnswer, LearningEngine, LearnerState, loadContent, PyRandom, type Question } from "../../../src/core/learning";
import { genContext } from "../../../src/core/learning/generators/common";
import { DRAWN_FIGURE_KINDS } from "../../../src/core/learning/model";
import { mentionsAnswer, siblingExample, type WorkedExample } from "../../../src/core/learning/worked_example";

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

const SEEDS = [1, 2, 3, 4, 5, 6];

/** The first question of a skill for a fresh child (worked examples on, as shipped). */
function firstQuestion(skillId: string, seed: number): { q: Question; engine: LearningEngine } {
  const skill = content.skill(skillId);
  const learner = new LearnerState({ grade: skill.grade, age: skill.grade + 6 });
  const engine = new LearningEngine(content, learner, { rng: new PyRandom(seed), clock: () => 1_760_000_000 });
  return { q: engine.nextQuestion({ skill_id: skillId, context: "quest" }), engine };
}

function exampleOf(q: Question): WorkedExample | null {
  return (q.meta["example"] as WorkedExample | undefined) ?? null;
}

/** `answer` as a token of its own in `text` (so "5" is not found in "15"). */
function hasToken(text: string, answer: string): boolean {
  return mentionsAnswer(text, answer);
}

const key = (v: unknown): string => JSON.stringify(v ?? null);

/** What makes an item this item: its words and numbers, its picture, its answer. */
function sameItem(a: { prompt_he: string; figure: unknown; answer: string }, b: { prompt_he: string; figure: unknown; answer: string }): boolean {
  return a.prompt_he === b.prompt_he && key(a.figure) === key(b.figure) && a.answer === b.answer;
}

describe("a worked example is a sibling item, never the asked one", () => {
  it("on every skill and several seeds: other item, other answer, a worked solution", () => {
    const problems: string[] = [];
    let flagged = 0;
    let total = 0;
    const skipped = new Set<string>();
    for (const skill of content.skills.values()) {
      for (const seed of SEEDS) {
        const { q } = firstQuestion(skill.id, seed);
        if (!q.explanation_he) continue;
        total++;
        const ex = exampleOf(q);
        const where = `${skill.id} seed ${seed}`;
        if (!q.meta["worked_example"]) {
          skipped.add(skill.id);
          if (ex) problems.push(`${where}: an example without the flag`);
          continue;
        }
        flagged++;
        if (!ex) {
          problems.push(`${where}: flagged without an example`);
          continue;
        }
        const asked = displayAnswer(q);
        if (ex.item_id === q.item_id) problems.push(`${where}: same item_id ${ex.item_id}`);
        if (ex.skill_id !== q.skill_id) problems.push(`${where}: another skill ${ex.skill_id}`);
        // a computed question with no picture is its numbers: they must differ
        if (q.meta["calc"] && !q.figure && ex.prompt_he === q.prompt_he) problems.push(`${where}: same prompt on a computed question`);
        if (q.meta["calc"] && q.figure && ex.prompt_he === q.prompt_he && key(ex.figure) === key(q.figure)) problems.push(`${where}: same prompt and figure`);
        if (ex.answer_he === asked && key(ex.answer_image) === key(q.choices.find((c) => c.id === q.answer)?.image ?? null)) {
          problems.push(`${where}: same answer ${asked}`);
        }
        if (ex.steps_he.trim().length < 6 || !/[A-Za-z\u05D0-\u05EA0-9]/.test(ex.steps_he)) problems.push(`${where}: no worked solution: ${ex.steps_he}`);
        if (ex.steps_he === q.explanation_he) problems.push(`${where}: the asked item's own explanation`);
        if (!ex.idea_he) problems.push(`${where}: no idea named`);
        if (ex.figure && !DRAWN_FIGURE_KINDS.has(ex.figure.kind)) problems.push(`${where}: a figure the app cannot draw (${ex.figure.kind})`);
        if (sameItem({ prompt_he: ex.prompt_he, figure: ex.figure, answer: ex.answer_he }, { prompt_he: q.prompt_he, figure: q.figure, answer: asked })) {
          problems.push(`${where}: identical item`);
        }
      }
    }
    expect(problems.slice(0, 15)).toEqual([]);
    // skipping is for items with no sibling, not a way out: nearly every skill gets its example
    expect(flagged / total).toBeGreaterThan(0.95);
    expect([...skipped].slice(0, 20)).toEqual([]);
  });

  it("is reproducible: the same child and seed see the same sibling", () => {
    for (const skill of content.skills.values()) {
      const a = exampleOf(firstQuestion(skill.id, 7).q);
      const b = exampleOf(firstQuestion(skill.id, 7).q);
      expect(key(a), skill.id).toBe(key(b));
    }
  });

  it("the sibling of the same skill differs between seeds (it is derived from the question, not a constant)", () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) seen.add(exampleOf(firstQuestion("math.add.within_100", seed).q)?.prompt_he ?? "none");
    expect(seen.size).toBeGreaterThan(2);
    expect(seen.has("none")).toBe(false);
  });
});

describe("siblingExample with fixed content", () => {
  const ctx = genContext({ skill_id: "x.fixed", subject: "science" });
  const item = (id: string, prompt: string, answer: string, expl = `הסבר של ${id}: שלב אחד, ואחריו שלב שני.`): Question => ({
    item_id: id,
    skill_id: "x.fixed",
    subject: "science",
    kind: "choice",
    prompt_he: prompt,
    prompt_en: null,
    answer: "a",
    choices: [
      { id: "a", text_he: answer, text_en: null, image: null },
      { id: "b", text_he: "אחר", text_en: null, image: null },
    ],
    figure: null,
    speak: {},
    explanation_he: expl,
    explanation_en: null,
    difficulty: 0,
    misconceptions: {},
    source: "bank",
    meta: {},
  });
  const stub = (pool: Question[]) => {
    const calls = { n: 0 };
    const lib = {
      generate: (_id: string, rng: PyRandom) => {
        calls.n++;
        return pool[rng.randint(0, pool.length - 1)]!;
      },
      get: () => ({ title_he: "נושא לדוגמה" }),
    };
    return { lib: lib as unknown as ContentLibrary, calls };
  };

  it("a bank with one item has no sibling: no example, after a capped number of tries", () => {
    const only = item("one", "שאלה", "תשובה");
    const { lib, calls } = stub([only]);
    expect(siblingExample(lib, only, ctx, 12)).toBeNull();
    expect(calls.n).toBeLessThanOrEqual(12);
  });

  it("another item of the bank is found, never the asked one", () => {
    const pool = [item("a", "שאלה א", "ראשונה"), item("b", "שאלה ב", "שנייה"), item("c", "שאלה ג", "שלישית")];
    for (const asked of pool) {
      const { lib } = stub(pool);
      const ex = siblingExample(lib, asked, ctx)!;
      expect(ex).not.toBeNull();
      expect(ex.item_id).not.toBe(asked.item_id);
      expect(ex.prompt_he).not.toBe(asked.prompt_he);
      expect(ex.answer_he).not.toBe(displayAnswer(asked));
    }
  });

  it("an item with the same words but another id, or the same answer, is not a sibling", () => {
    const asked = item("a", "שאלה", "תשובה");
    const twin = item("b", "שאלה", "תשובה");
    const sameAnswer = item("c", "שאלה אחרת", "תשובה");
    const { lib } = stub([twin, sameAnswer]);
    expect(siblingExample(lib, asked, ctx, 20)).toBeNull();
  });

  it("an item with no solution text is no example", () => {
    const asked = item("a", "שאלה", "תשובה");
    const bare = item("b", "שאלה אחרת", "אחרת", "");
    const { lib } = stub([bare]);
    expect(siblingExample(lib, asked, ctx, 20)).toBeNull();
  });
});

describe("the hint names the idea and the first step, never the answer", () => {
  it("on every skill and several seeds", () => {
    const problems: string[] = [];
    for (const skill of content.skills.values()) {
      for (const seed of SEEDS) {
        const { q, engine } = firstQuestion(skill.id, seed);
        const where = `${skill.id} seed ${seed}`;
        const text = engine.hint(q).text_he;
        const feather = engine.hintText(q);
        const answer = displayAnswer(q);
        for (const [name, h] of [["hint", text], ["feather", feather]] as const) {
          if (!/^רמז/.test(h)) problems.push(`${where}: ${name} does not start as a hint: ${h}`);
          if (hasToken(h, answer) && answer.length > 1) problems.push(`${where}: ${name} gives the answer "${answer}": ${h}`);
          if (!h.includes(skill.title_he) && !hasToken(skill.title_he, answer)) problems.push(`${where}: ${name} names no idea: ${h}`);
        }
      }
    }
    expect(problems.slice(0, 12)).toEqual([]);
  });

  it("a bank item's explanation is its answer, so its hint never quotes it", () => {
    const problems: string[] = [];
    for (const skill of content.skills.values()) {
      if (skill.generator !== "bank") continue;
      for (const seed of SEEDS) {
        const { q, engine } = firstQuestion(skill.id, seed);
        const first = q.explanation_he.split(/(?<=[.:!?])\s|\n/)[0]!.trim().replace(/[.:]$/, "");
        if (first.length > 12 && engine.hint(q).text_he.includes(first)) problems.push(`${skill.id} seed ${seed}`);
      }
    }
    expect(problems.slice(0, 10)).toEqual([]);
  });

  it("a choice question's hint still takes one wrong choice away", () => {
    const { q, engine } = firstQuestion("math.add.within_100", 3);
    expect(q.kind).toBe("choice");
    const h = engine.hint(q);
    expect(h.eliminate).toHaveLength(1);
    expect(h.eliminate[0]).not.toBe(q.answer);
    expect(h.text_he).toMatch(/רמז/);
  });
});
