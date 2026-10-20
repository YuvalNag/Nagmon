// @vitest-environment node
/** SEL1-SEL10: next-question selection (test_learning_selector.py). */
import { beforeAll, describe, expect, it } from "vitest";
import { LearningEngine } from "../../../src/core/learning/engine";
import { LearnerState } from "../../../src/core/learning/learner";
import type { Question } from "../../../src/core/learning/model";
import { PyRandom } from "../../../src/core/learning/random";
import { pCorrect, questionGuess } from "../../../src/core/learning/rating";
import { DAY } from "../../../src/core/learning/srs";
import { FakeClock, library } from "./helpers";

function engine(clock: FakeClock, opts: { age?: number; grade?: number; seed?: number; worked?: boolean } & Record<string, unknown> = {}): LearningEngine {
  const { age = 9, grade = 3, seed = 3, worked = false, ...st } = opts;
  const learner = new LearnerState({ learner_id: "s", grade, age });
  learner.settings["worked_examples"] = worked;
  Object.assign(learner.settings, st);
  return new LearningEngine(library(), learner, { rng: new PyRandom(seed), clock: clock.call });
}

export function wrongGiven(q: Question): string {
  if (q.kind === "number") return "999999";
  return q.choices.find((c) => c.id !== q.answer)!.id;
}

function seedDueCards(eng: LearningEngine, clock: FakeClock, n = 300): void {
  const lib = library();
  const skill = lib.skill("math.mul.facts_all");
  const rng = new PyRandom(9);
  for (let i = 0; i < n; i++) {
    const s = rng.getrandbits(32);
    const q = lib.generate(skill.id, new PyRandom(s));
    eng.learner.srs.review(q.item_id, skill.id, s, true, { now: clock.now - 10 * DAY });
  }
}

function counter(xs: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

describe("selector", () => {
  beforeAll(() => void library(), 120_000);

  it("sel1 distribution 70/20/10", { timeout: 60_000 }, () => {
    const clock = new FakeClock();
    const eng = engine(clock);
    seedDueCards(eng, clock);
    const n = 3000;
    const buckets: string[] = [];
    for (let i = 0; i < n; i++) buckets.push(eng.nextQuestion({ context: "practice" }).meta["bucket"] as string);
    const counts = counter(buckets);
    expect(Math.abs((counts.get("frontier") ?? 0) / n - 0.7)).toBeLessThan(0.05);
    expect(Math.abs((counts.get("review") ?? 0) / n - 0.2)).toBeLessThan(0.05);
    expect(Math.abs((counts.get("stretch") ?? 0) / n - 0.1)).toBeLessThan(0.05);
  });

  it("sel2 subject filters", () => {
    const clock = new FakeClock();
    let eng = engine(clock);
    for (let i = 0; i < 100; i++) expect(eng.nextQuestion({ subject: "geometry" }).subject).toBe("geometry");
    eng = engine(clock, { subjects: ["logic"] });
    for (let i = 0; i < 100; i++) expect(eng.nextQuestion().subject).toBe("logic");
  });

  it("sel3 focus", { timeout: 60_000 }, () => {
    const eng = engine(new FakeClock(), { focus: ["math.mul"] });
    const n = 500;
    let hits = 0;
    for (let i = 0; i < n; i++) if (eng.nextQuestion().skill_id.startsWith("math.mul")) hits++;
    expect(hits / n).toBeGreaterThanOrEqual(0.55);
  });

  it("sel4 no recent repeat", () => {
    const eng = engine(new FakeClock());
    const items: string[] = [];
    for (let i = 0; i < 200; i++) items.push(eng.nextQuestion({ skill_id: "math.add.within_100" }).item_id);
    for (let i = 0; i < items.length; i++) expect(items.slice(Math.max(0, i - 8), i)).not.toContain(items[i]);
  });

  it.each([
    [10, 1.0, 0.8],
    [10, 1.8, 0.8],
    [6, 2.6, 0.875],
  ])("sel5 targets: age %d theta %d -> %d", (age, theta, target) => {
    const eng = engine(new FakeClock(), { age, grade: 3 });
    expect(eng.learner.targetFrontier).toBeCloseTo(target, 12);
    expect(eng.learner.targetReview).toBeCloseTo(0.9, 12);
    const sid = "math.add.within_1000";
    const exp: number[] = [];
    for (let i = 0; i < 200; i++) {
      eng.learner.skill(sid, 3).theta = theta;
      const q = eng.nextQuestion({ skill_id: sid });
      exp.push(q.meta["expected"] as number);
      const st = eng.learner.skills.get(sid)!;
      expect(Math.abs((q.meta["expected"] as number) - pCorrect(st.theta, q.difficulty, questionGuess(q)))).toBeLessThan(1e-6);
    }
    const mean = exp.reduce((a, b) => a + b, 0) / exp.length;
    expect(Math.abs(mean - target)).toBeLessThan(0.07);
  });

  it("sel5 settings override", () => {
    const eng = engine(new FakeClock(), { target_frontier: 0.7, target_review: 0.95 });
    expect(eng.learner.targetFrontier).toBeCloseTo(0.7, 12);
    expect(eng.learner.targetReview).toBeCloseTo(0.95, 12);
  });

  it("sel6 locked not chosen", { timeout: 60_000 }, () => {
    const lib = library();
    const eng = engine(new FakeClock(), { age: 6, grade: 1 });
    const grade0 = new Set([...lib.skills.values()].filter((s) => s.grade === 0).map((s) => s.id));
    for (let i = 0; i < 500; i++) {
      const q = eng.nextQuestion();
      const skill = lib.skill(q.skill_id);
      for (const p of skill.prereq) expect(grade0.has(p) || eng.learner.mastered.has(p), `${q.skill_id} ${String(q.meta["bucket"])}`).toBe(true);
    }
  });

  it("sel7 simulated success rate", { timeout: 60_000 }, () => {
    const lib = library();
    const clock = new FakeClock();
    const eng = engine(clock, { age: 9, grade: 3, seed: 11 });
    const rng = new PyRandom(4);
    const trueTheta = new Map<string, number>();
    for (const s of lib.skills.values()) trueTheta.set(s.id, 1.0 * (3 - s.grade) + rng.uniform(-0.5, 0.5));
    const results: boolean[] = [];
    for (let i = 0; i < 600; i++) {
      const q = eng.nextQuestion();
      const p = pCorrect(trueTheta.get(q.skill_id)!, q.difficulty, questionGuess(q));
      const ok = rng.random() < p;
      // A real wrong answer ("I don't know" is half-weight by design).
      eng.submit(q, ok ? q.answer : wrongGiven(q), { elapsed_s: 6 });
      results.push(ok);
      clock.advance(20);
    }
    const rate = results.slice(-300).filter(Boolean).length / 300;
    expect(rate).toBeGreaterThanOrEqual(0.7);
    expect(rate).toBeLessThanOrEqual(0.9);
  });

  it("sel8 battle interleave", { timeout: 60_000 }, () => {
    const lib = library();
    const clock = new FakeClock();
    const eng = engine(clock, { grade: 3 });
    const seen = lib
      .bySubject("math")
      .filter((s) => s.grade <= 2)
      .slice(0, 6)
      .map((s) => s.id);
    for (const sid of seen) {
      const st = eng.learner.skill(sid, lib.skill(sid).grade);
      st.n = 5;
      st.last = clock.now - 3 * DAY;
    }
    const buckets: string[] = [];
    for (let i = 0; i < 500; i++) {
      const q = eng.nextQuestion({ context: "battle", subject: "math" });
      buckets.push(q.meta["bucket"] as string);
      if (q.meta["bucket"] === "interleave") expect(eng.learner.skills.get(q.skill_id)!.n).toBeGreaterThan(0);
    }
    expect((counter(buckets).get("interleave") ?? 0) / 500).toBeGreaterThanOrEqual(0.1);
  });

  it("sel9 boss", () => {
    const eng = engine(new FakeClock(), { worked: true });
    const ids = ["math.add.within_100", "math.sub.within_100", "math.mul.intro"];
    const counts = new Map<string, number>();
    for (let i = 0; i < 9; i++) {
      const q = eng.nextQuestion({ context: "boss", skill_ids: ids });
      expect(ids).toContain(q.skill_id);
      expect(q.meta["worked_example"]).toBeFalsy();
      counts.set(q.skill_id, (counts.get(q.skill_id) ?? 0) + 1);
      const vals = ids.map((id) => counts.get(id) ?? 0);
      expect(Math.max(...counts.values()) - Math.min(...vals)).toBeLessThanOrEqual(1);
    }
    expect(new Set(counts.values())).toEqual(new Set([3]));
  });

  it("sel10 worked example once", () => {
    const eng = engine(new FakeClock(), { worked: true });
    const sid = "math.mul.facts_all";
    const q1 = eng.nextQuestion({ skill_id: sid });
    expect(q1.meta["worked_example"]).toBe(true);
    const out = eng.submit(q1, q1.answer, { elapsed_s: 3 });
    expect(out.correct).toBe(true);
    const st = eng.learner.skills.get(sid);
    expect(st === undefined || st.n === 0).toBe(true);
    const q2 = eng.nextQuestion({ skill_id: sid });
    expect(q2.meta["worked_example"]).toBeFalsy();
    expect(eng.learner.worked_examples.has(sid)).toBe(true);
  });
});
