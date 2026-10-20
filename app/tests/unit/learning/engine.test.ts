// @vitest-environment node
/** E1-E11: LearningEngine.submit / hint / progress (test_learning_engine.py). */
import { beforeAll, describe, expect, it } from "vitest";
import { LearningEngine, superThresholdS } from "../../../src/core/learning/engine";
import { MISCONCEPTIONS } from "../../../src/core/learning/generators/misconceptions";
import { LearnerState } from "../../../src/core/learning/learner";
import { checkAnswer, displayAnswer, makeChoice, makeQuestion, type Question } from "../../../src/core/learning/model";
import { PyRandom } from "../../../src/core/learning/random";
import { DAY } from "../../../src/core/learning/srs";
import { FakeClock, library } from "./helpers";

function makeEngine(clock: FakeClock, opts: { age?: number; grade?: number; seed?: number } & Record<string, unknown> = {}): LearningEngine {
  const { age = 10, grade = 5, seed = 1, ...settings } = opts;
  const learner = new LearnerState({ learner_id: "t", name: "ת", grade, age });
  learner.settings["worked_examples"] = false;
  Object.assign(learner.settings, settings);
  return new LearningEngine(library(), learner, { rng: new PyRandom(seed), clock: clock.call });
}

function wrongGiven(q: Question): string {
  if (q.kind === "number") return "999999";
  return q.choices.find((c) => c.id !== q.answer)!.id;
}

function customQ(skillId: string, subject: string, difficulty: number, item: string): Question {
  return makeQuestion({
    item_id: `test:${item}`,
    skill_id: skillId,
    subject,
    kind: "number",
    prompt_he: "כמה זה 2 ועוד 2?",
    prompt_en: null,
    answer: "4",
    explanation_he: "2 ועוד 2 זה 4.",
    difficulty,
  });
}

describe("engine", () => {
  beforeAll(() => void library(), 120_000);

  it("e1 quality with timer", () => {
    const eng = makeEngine(new FakeClock(), { age: 10 });
    let q = eng.nextQuestion({ skill_id: "math.add.within_20" });
    let out = eng.submit(q, q.answer, { elapsed_s: 1.0 });
    expect([out.quality, out.power_multiplier]).toEqual(["super", 2.0]);
    expect(out.correct && out.coins > 0).toBe(true);
    q = eng.nextQuestion({ skill_id: "math.add.within_20" });
    out = eng.submit(q, q.answer, { elapsed_s: 120.0 });
    expect([out.quality, out.power_multiplier]).toEqual(["correct", 1.5]);
    q = eng.nextQuestion({ skill_id: "math.add.within_20" });
    out = eng.submit(q, wrongGiven(q), { elapsed_s: 2.0 });
    expect([out.quality, out.power_multiplier]).toEqual(["wrong", 1.0]);
    expect(out.coins).toBe(0);
    expect(out.correct).toBe(false);
    expect(out.correct_answer).toBe(displayAnswer(q));
    expect(out.explanation_he).toBeTruthy();
  });

  it("e1b no super under nine", () => {
    const eng = makeEngine(new FakeClock(), { age: 6, grade: 1 });
    for (let i = 0; i < 5; i++) {
      const q = eng.nextQuestion({ skill_id: "math.add.within_10" });
      const out = eng.submit(q, q.answer, { elapsed_s: 0.5 });
      expect(out.quality).toBe("correct");
      expect(out.power_multiplier).toBe(1.5);
    }
  });

  it("e1c timer setting overrides", () => {
    const eng = makeEngine(new FakeClock(), { age: 10, timer: false });
    const q = eng.nextQuestion({ skill_id: "math.add.within_20" });
    expect(eng.submit(q, q.answer, { elapsed_s: 0.5 }).quality).toBe("correct");
  });

  it("e2 super threshold by age", () => {
    expect(superThresholdS("choice", 9)).toBeGreaterThan(superThresholdS("choice", 11));
    expect(superThresholdS("number", 11)).toBeGreaterThan(superThresholdS("choice", 11));
  });

  it("e3 hint", () => {
    const clock = new FakeClock();
    const eng = makeEngine(clock, { age: 10, max_choices: null });
    const q = eng.nextQuestion({ skill_id: "math.add.within_100", max_choices: 4 });
    expect(q.kind).toBe("choice");
    const h = eng.hint(q);
    expect(h.eliminate.length).toBe(1);
    expect(h.eliminate[0]).not.toBe(q.answer);
    expect(q.choices.map((c) => c.id)).toContain(h.eliminate[0]);
    expect(h.text_he).toBeTruthy();
    const base = makeEngine(clock, { age: 10 });
    const plain = base.submit(q, q.answer, { elapsed_s: 30 });
    eng.submit(q, q.answer, { elapsed_s: 30 }); // streak 1
    const out = eng.submit(q, q.answer, { elapsed_s: 1, hint_used: true });
    expect(out.correct && out.quality === "correct").toBe(true);
    expect((1 <= out.coins && out.coins < plain.coins) || plain.coins === 1).toBe(true);
    expect(out.streak).toBe(2);
    const nq = eng.nextQuestion({ skill_id: "math.add.within_100", max_choices: null });
    if (nq.kind !== "choice") expect(eng.hint(nq).text_he).toBeTruthy();
  });

  it("e3b dont know", () => {
    const clock = new FakeClock();
    const eng = makeEngine(clock);
    let q = eng.nextQuestion({ skill_id: "math.add.within_100" });
    eng.submit(q, q.answer, { elapsed_s: 3 });
    const thetaBefore = eng.learner.skills.get(q.skill_id)!.theta;
    q = eng.nextQuestion({ skill_id: "math.add.within_100" });
    const out = eng.submit(q, null, { elapsed_s: 5 });
    expect(out.correct).toBe(false);
    expect(out.quality).toBe("wrong");
    expect(out.misconception).toBeNull();
    expect(out.coins).toBe(0);
    expect(out.streak).toBe(0);
    expect(out.explanation_he).toBe(q.explanation_he);
    expect(out.correct_answer).toBe(displayAnswer(q));
    const dropDk = thetaBefore - eng.learner.skills.get(q.skill_id)!.theta;
    const eng2 = makeEngine(clock);
    const q2 = eng2.nextQuestion({ skill_id: "math.add.within_100" });
    eng2.submit(q2, q2.answer, { elapsed_s: 3 });
    const before2 = eng2.learner.skills.get(q2.skill_id)!.theta;
    eng2.submit(q, wrongGiven(q), { elapsed_s: 5 });
    const dropWrong = before2 - eng2.learner.skills.get(q.skill_id)!.theta;
    expect(dropDk).toBeGreaterThan(0);
    expect(dropDk).toBeLessThan(dropWrong);
    const out2 = eng.submit(q, "x", { elapsed_s: 1, dont_know: true });
    expect(out2.quality).toBe("wrong");
    expect(out2.misconception).toBeNull();
  });

  it("e4 coins", () => {
    const lib = library();
    const clock = new FakeClock();
    let eng = makeEngine(clock, { timer: false });
    eng.learner.skill("math.add.within_100", 2).theta = 0.0;
    const easy = eng.submit(customQ("math.add.within_100", "math", -3.0, "e"), "4", { elapsed_s: 5 });
    eng.learner.skill("math.add.within_100").theta = 0.0;
    const hard = eng.submit(customQ("math.add.within_100", "math", 2.5, "h"), "4", { elapsed_s: 5 });
    expect(hard.coins).toBeGreaterThan(easy.coins);
    // Weak subject: geometry far behind math.
    eng = makeEngine(clock, { timer: false, subjects: ["math", "geometry"] });
    const mathSkills = lib
      .bySubject("math")
      .filter((s) => s.grade <= 5)
      .slice(0, 20)
      .map((s) => s.id);
    for (const sid of mathSkills) eng.learner.mastered.set(sid, clock.now);
    const g = lib.bySubject("geometry")[0]!;
    const m = lib.bySubject("math").at(-1)!;
    eng.learner.skill(g.id, g.grade).theta = 0.0;
    eng.learner.skill(m.id, m.grade).theta = 0.0;
    const gq = eng.submit(customQ(g.id, "geometry", 0.0, "g"), "4", { elapsed_s: 5 });
    const mq = eng.submit(customQ(m.id, "math", 0.0, "m"), "4", { elapsed_s: 5 });
    expect(gq.coins).toBe(mq.coins + 2);
  });

  it("e5 session streak", () => {
    const eng = makeEngine(new FakeClock());
    const streaks: number[] = [];
    for (let i = 0; i < 5; i++) {
      const q = eng.nextQuestion({ skill_id: "math.add.within_20" });
      const given = i !== 3 ? q.answer : wrongGiven(q);
      streaks.push(eng.submit(q, given, { elapsed_s: 4 }).streak);
    }
    expect(streaks).toEqual([1, 2, 3, 0, 1]);
    expect("streak" in eng.learner.toDict()).toBe(false);
  });

  it("e6 mastery and stars", () => {
    const clock = new FakeClock();
    const eng = makeEngine(clock, { age: 6, grade: 1 });
    const sid = "math.add.within_10";
    let masteredAt: number | null = null;
    const newly: string[] = [];
    for (let i = 0; i < 60; i++) {
      const q = eng.nextQuestion({ skill_id: sid });
      const out = eng.submit(q, q.answer, { elapsed_s: 4 });
      newly.push(...out.newly_mastered);
      if (out.newly_mastered.length && masteredAt === null) masteredAt = i + 1;
      clock.advance(30);
    }
    const rule = library().skill(sid).mastery;
    expect(masteredAt).not.toBeNull();
    expect(masteredAt!).toBeGreaterThanOrEqual(rule.min_attempts);
    expect(newly).toEqual([sid]);
    expect(eng.learner.stars.get("math")).toBe(1);
    expect(eng.learner.mastered.has(sid)).toBe(true);
  });

  it("e7 misconception", () => {
    const eng = makeEngine(new FakeClock());
    let q: Question | null = null;
    for (let seed = 0; seed < 50; seed++) {
      q = eng.nextQuestion({ skill_id: "math.sub.within_100" });
      if (Object.keys(q.misconceptions).length) break;
    }
    const [key, tag] = Object.entries(q!.misconceptions)[0]!;
    const out = eng.submit(q!, key, { elapsed_s: 5 });
    expect(out.misconception).toBe(tag);
    expect(out.explanation_he).toContain(MISCONCEPTIONS[tag]!.hint_he);
    expect(eng.learner.skills.get(q!.skill_id)!.misconceptions[tag]).toBe(1);
    expect(eng.learner.log.at(-1)!.mis).toBe(tag);
  });

  it("e9 subject progress", () => {
    const clock = new FakeClock();
    const eng = makeEngine(clock, { age: 6, grade: 0 });
    const p0 = eng.subjectProgress("math");
    expect(p0.stars).toBe(0);
    expect(p0.mastery).toBe(0.0);
    expect(p0.frontier_skills.length).toBeGreaterThan(0);
    const sid = p0.frontier_skills[0]!;
    eng.learner.mastered.set(sid, clock.now);
    eng.learner.stars.set("math", 1);
    const p1 = eng.subjectProgress("math");
    expect(p1.mastery).toBeGreaterThan(0);
    expect(p1.stars).toBe(1);
    expect(p1.mastered_skills).toContain(sid);
    expect(p1.frontier_skills).not.toContain(sid);
  });

  it("e10 performance", { timeout: 60_000 }, () => {
    // As the Python (< 5 ms per question on average), after a JIT warm-up
    // and taking the best of three rounds, so parallel test files on the
    // same CPU do not make it flaky.
    const eng = makeEngine(new FakeClock(), { age: 9, grade: 4 });
    const rng = new PyRandom(5);
    const round = (n: number): number => {
      let total = 0;
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        const q = eng.nextQuestion();
        total += performance.now() - t0;
        eng.submit(q, rng.random() < 0.8 ? q.answer : null, { elapsed_s: 5 });
      }
      return total / n;
    };
    round(50);
    const best = Math.min(round(100), round(100), round(100));
    expect(best).toBeLessThan(5); // ms
  });

  it("e11 leitner card", () => {
    const lib = library();
    const clock = new FakeClock();
    const eng = makeEngine(clock, { age: 9, grade: 3 });
    const q = eng.nextQuestion({ skill_id: "math.mul.facts_all" });
    eng.submit(q, q.answer, { elapsed_s: 4 });
    const card = eng.learner.srs.get(q.item_id);
    expect(card).toBeDefined();
    expect(card!.box).toBe(2);
    const regen = lib.generate(card!.skill_id, new PyRandom(card!.seed!));
    expect(regen.item_id).toBe(q.item_id);
    clock.advance(4 * DAY);
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const nq = eng.nextQuestion({ subject: "math" });
      if (nq.meta["bucket"] === "review") seen.add(nq.item_id);
    }
    expect(seen.has(q.item_id)).toBe(true);
  });

  it("unknown skill question", () => {
    const eng = makeEngine(new FakeClock());
    const q = makeQuestion({
      item_id: "ai:1",
      skill_id: "english.vocab.animals",
      subject: "english",
      kind: "choice",
      prompt_he: "מה זה dog?",
      prompt_en: "What is a dog?",
      answer: "a",
      choices: [makeChoice("a", "כלב", "dog"), makeChoice("b", "חתול", "cat")],
      explanation_he: "dog זה כלב.",
      source: "ai",
      meta: { word: "dog" },
    });
    const out = eng.submit(q, "a", { elapsed_s: 3 });
    expect(out.correct).toBe(true);
    expect(eng.learner.words.has("dog")).toBe(true);
    expect(checkAnswer(q, "a").correct).toBe(true);
  });

  it("save and restore keep the state (persist after every answer)", () => {
    const clock = new FakeClock();
    const eng = makeEngine(clock);
    for (let i = 0; i < 5; i++) {
      const q = eng.nextQuestion({ skill_id: "math.add.within_20" });
      eng.submit(q, q.answer, { elapsed_s: 4 });
    }
    const json = JSON.stringify(eng.save());
    const again = LearningEngine.restore(library(), JSON.parse(json) as Record<string, unknown>, { clock: clock.call, rng: new PyRandom(2) });
    expect(again.save()).toEqual(eng.save());
    expect(again.learner.answers_total).toBe(5);
  });
});
