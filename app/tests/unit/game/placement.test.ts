import { beforeAll, describe, expect, it } from "vitest";
import type { ContentLibrary } from "../../../src/core/learning";
import { Placement } from "../../../src/core/game/placement";
import { answerRight, answerWrong, engineFor, shipped } from "./helpers";

let content: ContentLibrary;
beforeAll(() => {
  content = shipped();
});

function run(grade: number, right: (i: number) => boolean, opts: { seed?: number; subjects?: string[] } = {}) {
  const engine = engineFor(content, grade, opts.seed ?? 1);
  let t = 0;
  const p = new Placement(engine, { grade, clock: () => (t += 1000), maxChoices: null, ...(opts.subjects ? { subjects: opts.subjects } : {}) });
  const asked: { subject: string; skillGrade: number }[] = [];
  for (let i = 0; !p.finished; i++) {
    const s = p.next();
    if (!s) break;
    asked.push({ subject: s.question!.subject, skillGrade: content.get(s.question!.skill_id)!.grade });
    if (right(i)) answerRight(s);
    else answerWrong(s);
    p.answered(s);
  }
  return { p, engine, asked };
}

describe("the owl's placement", () => {
  it("asks six questions in six different subjects, the first at the parent's grade", () => {
    const { asked, p } = run(3, () => true);
    expect(asked).toHaveLength(6);
    expect(new Set(asked.map((a) => a.subject)).size).toBe(6);
    expect(asked[0]).toMatchObject({ subject: "math", skillGrade: 3 });
    expect(p.finished).toBe(true);
  });

  it("goes up a grade after a right answer and down after a wrong one", () => {
    const { p } = run(4, (i) => i % 2 === 0);
    expect(p.history.map((h) => h.level)).toEqual([4, 5, 4, 5, 4, 5]);
  });

  it("asks a form that is not a coin toss when the skill has one: true-or-false is rare", () => {
    const kinds: string[] = [];
    for (let seed = 1; seed <= 25; seed++) {
      const engine = engineFor(content, 4, seed);
      let t = 0;
      const p = new Placement(engine, { grade: 4, clock: () => (t += 1000), maxChoices: null });
      for (let s = p.next(); s; s = p.next()) {
        kinds.push(s.question!.kind);
        answerRight(s);
        p.answered(s);
      }
    }
    expect(kinds.length).toBe(150);
    expect(kinds.filter((k) => k === "true_false").length / kinds.length).toBeLessThan(0.05);
  });

  it("never goes more than one grade above the parent's grade, or two below it", () => {
    const up = run(3, () => true).p.history.map((h) => h.level);
    expect(Math.max(...up)).toBe(4);
    const down = run(3, () => false).p.history.map((h) => h.level);
    expect(Math.min(...down)).toBe(1);
    expect(run(1, () => false).p.history.map((h) => h.level).at(-1)).toBe(0);
  });

  it("a wrong answer blocks nothing: all wrong still finishes, with a start level for every subject", () => {
    const { p } = run(3, () => false);
    expect(p.finished).toBe(true);
    const levels = p.result().levels;
    expect(Object.keys(levels).sort()).toEqual(["english", "geometry", "hebrew", "logic", "math", "science"]);
    for (const v of Object.values(levels)) expect(v).toBeGreaterThanOrEqual(0);
  });

  it("each subject starts at the level it was asked at when right, one below when wrong", () => {
    const { p } = run(4, (i) => i !== 1);
    const [math, second] = p.history;
    expect(p.result().levels[math!.subject]).toBe(4);
    // asked at 5, not right: starts at 4
    expect(second!.level).toBe(5);
    expect(p.result().levels[second!.subject]).toBe(4);
    expect(second!.correct).toBe(false);
  });

  it("Hebrew now has content to grade 9, so a grade-6 child who answers right starts it at their own level, not at grade 2", () => {
    const { p } = run(6, () => true);
    const hebrew = p.result().levels["hebrew"]!;
    expect(hebrew).toBeGreaterThanOrEqual(6);
    expect(hebrew).toBeLessThanOrEqual(9);
  });

  it("apply() sets each subject's start level on the learner, and the parent's grade stays", () => {
    const { p, engine } = run(3, () => true);
    p.apply();
    expect(engine.learner.grade).toBe(3);
    for (const [subject, level] of Object.entries(p.result().levels)) expect(engine.learner.gradeIn(subject)).toBe(level);
  });

  it("shows no worked example (the placement is not a lesson)", () => {
    const engine = engineFor(content, 3);
    const p = new Placement(engine, { grade: 3, clock: () => 0, maxChoices: null });
    for (let i = 0; i < 6; i++) {
      const s = p.next()!;
      expect(s.phase).toBe("question");
      answerRight(s);
      p.answered(s);
    }
  });

  it("only the subjects the parent turned on", () => {
    const engine = engineFor(content, 3, 1, { subjects: ["math", "english"] });
    const p = new Placement(engine, { grade: 3, clock: () => 0, maxChoices: null });
    const subjects: string[] = [];
    while (!p.finished) {
      const s = p.next()!;
      subjects.push(s.question!.subject);
      answerRight(s);
      p.answered(s);
    }
    expect(subjects.sort()).toEqual(["english", "math"]);
  });

  it("the answers are the child's real ratings: a question answered moves that skill", () => {
    const { engine } = run(3, () => true);
    expect(engine.learner.answers_total).toBe(6);
  });
});
