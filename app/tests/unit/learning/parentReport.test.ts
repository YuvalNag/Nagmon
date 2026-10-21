import { beforeAll, describe, expect, it } from "vitest";
import { type ContentLibrary, LearnerState } from "../../../src/core/learning";
import { makeLogEntry, SkillStats } from "../../../src/core/learning/learner";
import { buildChildReport, LEVEL_MIN_ANSWERS } from "../../../src/core/learning/parentReport";
import { shipped } from "../game/helpers";

let content: ContentLibrary;
beforeAll(() => {
  content = shipped();
});

/** Noon on a made-up day (seconds, as the engine's clock). */
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0) / 1000;
const DAY = 86400;

/** A skill of `subject` at `grade` (the first one the content has). */
function skillAt(subject: string, grade: number, nth = 0): string {
  const found = content.bySubject(subject).filter((s) => s.grade === grade);
  if (found.length <= nth) throw new Error(`no ${subject} skill #${nth} at grade ${grade}`);
  return found[nth]!.id;
}

function answers(learner: LearnerState, skill: string, right: number, wrong: number, daysAgo = 1, extra: Partial<Parameters<typeof makeLogEntry>[0]> = {}) {
  const s = content.get(skill)!;
  for (let i = 0; i < right + wrong; i++) {
    learner.logAnswer(
      makeLogEntry({ ts: NOW - daysAgo * DAY + i, skill, item: `${skill}#${i}`, subject: s.subject, correct: i < right, quality: i < right ? "correct" : "wrong", elapsed: 10, ...extra }),
    );
  }
}

const learner = (grade = 3) => new LearnerState({ grade, age: grade + 6 });
const report = (l: LearnerState, world = { seen: [] as string[], caught: [] as string[] }) => buildChildReport({ learner: l, content, now: NOW, world, localDay: (ts) => new Date(ts * 1000).toISOString().slice(0, 10) });
const card = (l: LearnerState, subject: string) => report(l).subjects.find((c) => c.subject === subject)!;

describe("the level of a subject now", () => {
  it("with too few answers it is the start level, and says so", () => {
    const l = learner(3);
    answers(l, skillAt("math", 3), 2, 1);
    const c = card(l, "math");
    expect(c.level).toMatchObject({ current: 3, start: 3, trend: "same", enough: false });
    expect(c.level.note).toContain(String(LEVEL_MIN_ANSWERS));
  });

  it("goes up when most answers on a higher grade's skills are right", () => {
    const l = learner(3);
    answers(l, skillAt("math", 3), 6, 0);
    answers(l, skillAt("math", 4), 7, 1);
    const c = card(l, "math").level;
    expect(c).toMatchObject({ current: 4, start: 3, trend: "up", enough: true });
    expect(c.note).toMatch(/ד/);
  });

  it("goes down when the start grade's skills are mostly wrong and a lower grade's are right", () => {
    const l = learner(3);
    answers(l, skillAt("math", 3), 2, 6);
    answers(l, skillAt("math", 2), 7, 1);
    expect(card(l, "math").level).toMatchObject({ current: 2, start: 3, trend: "down" });
  });

  it("stays when the answers at the start grade are mostly right", () => {
    const l = learner(3);
    answers(l, skillAt("math", 3), 8, 2);
    expect(card(l, "math").level).toMatchObject({ current: 3, trend: "same", enough: true });
  });

  it("only counts the subject's own answers, and the last 60 days", () => {
    const l = learner(3);
    answers(l, skillAt("science", 5), 9, 0);
    answers(l, skillAt("math", 5), 9, 0, 90);
    expect(card(l, "math").level).toMatchObject({ current: 3, enough: false });
    expect(card(l, "science").level).toMatchObject({ current: 5, trend: "up" });
  });

  it("compares with the subject's own start grade (a placement or the parent's), not the child's grade", () => {
    const l = learner(3);
    l.subject_grade.set("math", 1);
    answers(l, skillAt("math", 2), 8, 0);
    expect(card(l, "math").level).toMatchObject({ current: 2, start: 1, trend: "up" });
  });
});

describe("the subject cards", () => {
  it("one for each subject that is on, with the Hebrew title", () => {
    const l = learner(3);
    expect(report(l).subjects.map((c) => c.subject)).toEqual(content.subjects());
    expect(card(l, "math").title).toBe("חשבון");
    l.settings["subjects"] = ["math", "logic"];
    expect(report(l).subjects.map((c) => c.subject)).toEqual(["math", "logic"]);
  });

  it("accuracy, time and helpers of the last week, each with its own line", () => {
    const l = learner(3);
    answers(l, skillAt("math", 3), 3, 1, 2);
    answers(l, skillAt("math", 3, 1), 2, 0, 3, { hint: true });
    answers(l, skillAt("math", 3), 0, 2, 4, { dk: true });
    answers(l, skillAt("math", 3), 5, 0, 20);
    const c = card(l, "math");
    expect(c.accuracy.value).toBeCloseTo(5 / 8);
    expect(c.accuracy.note).toContain("62%");
    expect(c.answered.value).toBe(8);
    expect(c.time.seconds).toBe(80);
    expect(c.time.note).toMatch(/דקות|דקה/);
    expect(c.helpers).toMatchObject({ hints: 2, dontKnow: 2 });
    for (const line of [c.accuracy.note, c.time.note, c.helpers.note, c.level.note]) expect(line.length).toBeGreaterThan(10);
  });

  it("with no answers there is no percentage, and the line says that", () => {
    const c = card(learner(3), "logic");
    expect(c.accuracy.value).toBeNull();
    expect(c.accuracy.note).toMatch(/אין/);
    expect(c.time.seconds).toBe(0);
  });
});

describe("the weakest skills", () => {
  function skillWith(l: LearnerState, id: string, recent: number[], mis: Record<string, number> = {}) {
    l.skills.set(id, new SkillStats({ n: recent.length, correct: recent.filter(Boolean).length, recent, misconceptions: mis }));
  }

  it("lists the three lowest with a plain line, the worst first; ones with few tries or mastered are left out", () => {
    const l = learner(3);
    const [a, b, c, d, e] = [skillAt("math", 2), skillAt("math", 3), skillAt("math", 4), skillAt("science", 3), skillAt("logic", 3)];
    skillWith(l, a, [0, 0, 1, 0, 0, 1, 0, 0]);
    skillWith(l, b, [1, 0, 1, 0, 1, 0]);
    skillWith(l, c, [1, 1, 0, 1, 0]);
    skillWith(l, d, [0, 0]);
    skillWith(l, e, [1, 1, 1, 1, 1]);
    const w = report(l).weakest;
    expect(w.map((x) => x.skill)).toEqual([a, b, c]);
    expect(w[0]).toMatchObject({ tried: 8, right: 2, subject: "math" });
    expect(w[0]!.note).toContain("2 מתוך 8");
    l.mastered.set(a, NOW);
    expect(report(l).weakest.map((x) => x.skill)).toEqual([b, c]);
  });

  it("names the repeated slip in plain words when there is one", () => {
    const l = learner(3);
    skillWith(l, skillAt("math", 3), [0, 0, 0, 1, 0], { off_by_one: 3 });
    expect(report(l).weakest[0]!.note).toContain("טעות של 1");
  });

  it("is empty when nothing is weak", () => {
    expect(report(learner(3)).weakest).toEqual([]);
  });
});

describe("the week and the book", () => {
  it("counts the days with an answer out of the last seven, today included", () => {
    const l = learner(3);
    answers(l, skillAt("math", 3), 2, 0, 0);
    answers(l, skillAt("math", 3), 2, 0, 2);
    answers(l, skillAt("math", 3), 2, 0, 2);
    answers(l, skillAt("math", 3), 2, 0, 6);
    answers(l, skillAt("math", 3), 2, 0, 7);
    const w = report(l).week;
    expect(w.active).toBe(3);
    expect(w.days).toHaveLength(7);
    expect(w.days[6]).toBe(true);
    expect(w.days[5]).toBe(false);
    expect(w.note).toContain("3 מתוך 7");
  });

  it("the bestiary: caught, and seen (a caught one was seen too)", () => {
    const r = report(learner(3), { seen: ["a", "b"], caught: ["b", "c"] });
    expect(r.bestiary).toMatchObject({ seen: 3, caught: 2 });
    expect(r.bestiary.note).toMatch(/נתפסו|נראו/);
  });

  it("has no names or ids of the child in it", () => {
    const l = new LearnerState({ grade: 3, name: "תמר", learner_id: "p00001" });
    answers(l, skillAt("math", 3), 3, 1);
    expect(JSON.stringify(report(l))).not.toMatch(/תמר|p00001/);
  });
});
