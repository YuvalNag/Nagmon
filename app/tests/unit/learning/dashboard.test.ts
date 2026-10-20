// @vitest-environment node
/** D1-D3: parent dashboard numbers with explanations (test_learning_dashboard.py). */
import { beforeAll, describe, expect, it } from "vitest";
import { LearningEngine } from "../../../src/core/learning/engine";
import { LearnerState } from "../../../src/core/learning/learner";
import { makeQuestion } from "../../../src/core/learning/model";
import { PyRandom } from "../../../src/core/learning/random";
import { DAY } from "../../../src/core/learning/srs";
import { FakeClock, library } from "./helpers";

function engine(clock: FakeClock): LearningEngine {
  const learner = new LearnerState({ learner_id: "d", grade: 3, age: 9 });
  learner.settings["worked_examples"] = false;
  return new LearningEngine(library(), learner, { rng: new PyRandom(2), clock: clock.call });
}

function answer(eng: LearningEngine, sid: string, ok: boolean, elapsed = 10.0): void {
  const q = eng.nextQuestion({ skill_id: sid });
  eng.submit(q, ok ? q.answer : null, { elapsed_s: elapsed });
}

describe("dashboard", () => {
  beforeAll(() => void library(), 120_000);

  it("d1 accuracy and time", () => {
    const clock = new FakeClock();
    const eng = engine(clock);
    // 20 days ago: 4 math answers, all wrong.
    for (let i = 0; i < 4; i++) answer(eng, "math.add.within_100", false);
    clock.advance(20 * DAY);
    // Now: 3 correct + 1 wrong math, 2 correct geometry.
    for (const ok of [true, true, true, false]) answer(eng, "math.add.within_100", ok, 15);
    for (let i = 0; i < 2; i++) answer(eng, "geometry.shapes.identify", true, 30);
    const d = eng.dashboard();
    const m = d.subjects["math"]!;
    expect(m.accuracy_7d.value).toBe(0.75);
    expect(m.accuracy_7d.explanation_he).toContain("3");
    expect(m.accuracy_7d.explanation_he).toContain("4");
    expect(m.answered_7d.value).toBe(4);
    expect(m.accuracy_30d.value).toBe(3 / 8);
    expect(m.time_7d_s.value).toBe(60);
    expect(d.time_7d_s.value).toBe(120);
    expect(d.subjects["geometry"]!.accuracy_7d.value).toBe(1.0);
    for (const s of Object.values(d.subjects)) {
      for (const stat of [s.accuracy_7d, s.accuracy_30d, s.answered_7d, s.time_7d_s, s.mastered, s.stars]) expect(stat.explanation_he).toBeTruthy();
    }
    expect(d.time_30d_s.explanation_he).toBeTruthy();
  });

  it("d2 struggling", () => {
    const eng = engine(new FakeClock());
    const sid = "math.sub.within_100";
    let tagged = 0;
    for (let i = 0; i < 10; i++) {
      const q = eng.nextQuestion({ skill_id: sid });
      const keys = Object.keys(q.misconceptions);
      if (keys.length && tagged < 3) {
        eng.submit(q, keys[0]!, { elapsed_s: 8 });
        tagged += 1;
      } else {
        eng.submit(q, i % 4 === 0 ? q.answer : null, { elapsed_s: 8 });
      }
    }
    const d = eng.dashboard();
    expect(d.struggling.map((s) => s.skill_id)).toContain(sid);
    const s = d.struggling.find((x) => x.skill_id === sid)!;
    expect(s.accuracy.value).toBeLessThan(0.6);
    expect(s.accuracy.explanation_he).toBeTruthy();
    if (tagged) {
      expect(s.misconceptions.length).toBeGreaterThan(0);
      expect(s.misconceptions[0]!.count).toBeGreaterThanOrEqual(1);
      expect(s.misconceptions[0]!.text_he).toBeTruthy();
    }
  });

  it("d3 english words", () => {
    const eng = engine(new FakeClock());
    const q = makeQuestion({
      item_id: "english.vocab:dog",
      skill_id: "english.vocab.animals",
      subject: "english",
      kind: "number",
      prompt_he: "?",
      prompt_en: null,
      answer: "1",
      explanation_he: "x",
      meta: { word: "dog" },
    });
    eng.submit(q, "1", { elapsed_s: 2 });
    const d = eng.dashboard();
    expect(d.new_english_words.value).toContain("dog");
    expect(d.new_english_words.explanation_he).toBeTruthy();
  });

  it("mastered list", () => {
    const clock = new FakeClock();
    const eng = engine(clock);
    eng.learner.mastered.set("math.add.within_10", clock.now);
    const d = eng.dashboard();
    expect(d.mastered_skills.map((m) => m.skill_id)).toEqual(["math.add.within_10"]);
    expect(d.mastered_skills[0]!.title_he).toBeTruthy();
  });
});
