/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadLibrary, type FetchJson } from "../../../src/app/play";
import { LearnerState, LearningEngine, PyRandom } from "../../../src/core/learning";

const fetchJson: FetchJson = async (path) => JSON.parse(readFileSync(`public/game/${path}`, "utf8"));

describe("a level of its own in each subject", () => {
  it("is the learner's grade until a subject is placed", () => {
    const l = new LearnerState({ grade: 3 });
    expect(l.gradeIn("math")).toBe(3);
    l.subject_grade.set("math", 1);
    expect(l.gradeIn("math")).toBe(1);
    expect(l.gradeIn("english")).toBe(3);
  });

  it("is saved only when set, and comes back", () => {
    const l = new LearnerState({ grade: 3 });
    expect(l.toDict()).not.toHaveProperty("subject_grade");
    l.subject_grade.set("english", 5);
    const again = LearnerState.fromDict(l.toDict() as unknown as Record<string, unknown>);
    expect(again.gradeIn("english")).toBe(5);
    expect(again.gradeIn("math")).toBe(3);
  });

  it("lower in one subject: the skills the grade would have assumed are asked, in that subject only", async () => {
    const content = await loadLibrary(fetchJson);
    const mathLow = content.bySubject("math").filter((s) => s.grade === 2 && s.prereq.every((p) => (content.get(p)?.grade ?? 0) < 2));
    expect(mathLow.length).toBeGreaterThan(0);
    const plain = new LearningEngine(content, new LearnerState({ grade: 4 }), { rng: new PyRandom(1) });
    const placed = new LearnerState({ grade: 4 });
    placed.subject_grade.set("math", 2);
    const low = new LearningEngine(content, placed, { rng: new PyRandom(1) });
    const grade2 = mathLow[0]!;
    // a grade-4 child is assumed to know a grade-2 skill; one placed at grade 2 in math is not
    expect(plain.selector.assumed(grade2)).toBe(true);
    expect(low.selector.assumed(grade2)).toBe(false);
    expect(low.selector.isFrontier(grade2)).toBe(true);
    // and the rating starts as a grade-2 child's would, not a grade-4 child's
    expect(low.selector.thetaOf(grade2.id)).toBeLessThan(plain.selector.thetaOf(grade2.id));
    expect(low.selector.thetaOf(grade2.id)).toBe(0);
    // another subject keeps the grade
    const other = content.bySubject("english").find((s) => s.grade === 2)!;
    expect(low.selector.assumed(other)).toBe(plain.selector.assumed(other));
  });
});
