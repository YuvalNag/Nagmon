// @vitest-environment node
/** L1-L3 and E8: learner state, serialization and migration (test_learning_learner.py). */
import { describe, expect, it } from "vitest";
import { LearnerState, LOG_MAX, makeLogEntry, migrate, SCHEMA_VERSION } from "../../../src/core/learning/learner";
import v0 from "./fixtures/learner_v0.json";
import { FakeClock } from "./helpers";

function makeState(clock: FakeClock): LearnerState {
  const s = new LearnerState({ learner_id: "p1", name: "אורי", grade: 4, age: 9 });
  const st = s.skill("math.mul.facts_all", 3);
  st.theta = 0.7;
  st.n = 3;
  st.correct = 2;
  st.recent.push(1, 0, 1);
  st.misconceptions["table_neighbor"] = 1;
  s.item("arithmetic.mul_facts:7x8").b_offset = -0.2;
  s.srs.review("arithmetic.mul_facts:7x8", "math.mul.facts_all", 42, true);
  s.mastered.set("math.add.within_20", clock.now);
  s.stars.set("math", 1);
  s.words.set("dog", clock.now);
  s.worked_examples.add("math.mul.facts_all");
  s.logAnswer(
    makeLogEntry({
      ts: clock.now,
      skill: "math.mul.facts_all",
      item: "arithmetic.mul_facts:7x8",
      subject: "math",
      correct: true,
      quality: "correct",
      elapsed: 3.5,
      context: "battle",
    }),
  );
  s.settings["focus"] = ["math.mul"];
  return s;
}

describe("learner", () => {
  it("l1 roundtrip", () => {
    const s = makeState(new FakeClock());
    const d = s.toDict();
    expect(d.schema_version).toBe(SCHEMA_VERSION);
    const text = JSON.stringify(d);
    const again = LearnerState.fromDict(JSON.parse(text) as Record<string, unknown>);
    expect(again.toDict()).toEqual(d);
    expect(again.skills.get("math.mul.facts_all")!.theta).toBeCloseTo(0.7, 12);
    expect(again.log[again.log.length - 1]!.item).toBe("arithmetic.mul_facts:7x8");
  });

  it("l2 migration from v0", () => {
    const raw = v0 as Record<string, unknown>;
    const migrated = migrate(raw);
    expect(migrated["schema_version"]).toBe(SCHEMA_VERSION);
    const s = LearnerState.fromDict(raw);
    expect(s.name).toBe("נועה");
    expect(s.grade).toBe(3);
    const theta = s.skills.get("math.add.within_20")!.theta;
    expect(theta).toBeCloseTo((200 * Math.log(10)) / 400, 12);
    expect(s.skills.get("math.mul.facts_all")!.theta).toBeLessThan(0);
    const card = s.srs.get("arithmetic.mul_facts:7x8");
    expect(card).toBeDefined();
    expect(card!.box).toBe(3);
    expect(card!.skill_id).toBe("math.mul.facts_all");
    expect(Object.fromEntries(s.stars)).toEqual({ math: 2 });
    expect(s.coins_total).toBe(57);
    expect(s.log.length).toBe(2);
    expect(s.log[0]!.correct).toBe(true);
    expect(s.log[1]!.context).toBe("shop");
    expect(s.answers_total).toBe(2);
    expect(s.correct_total).toBe(1);
    expect(s.settings["subjects"]).toEqual(["math", "geometry"]);
  });

  it("l3 future version", () => {
    expect(() => LearnerState.fromDict({ schema_version: SCHEMA_VERSION + 1 })).toThrow();
  });

  it("e8 log ring buffer", () => {
    const s = new LearnerState();
    for (let i = 0; i < LOG_MAX + 50; i++) {
      s.logAnswer(makeLogEntry({ ts: i, skill: "math.x", item: `i${i}`, subject: "math", correct: true, quality: "correct", elapsed: 1.0 }));
    }
    expect(LOG_MAX).toBe(5000);
    expect(s.log.length).toBe(LOG_MAX);
    expect(s.log[0]!.item).toBe("i50");
  });

  it("settings defaults by age", () => {
    const young = new LearnerState({ age: 6, grade: 1 });
    const old = new LearnerState({ age: 10, grade: 5 });
    expect(young.timerOn).toBe(false);
    expect(old.timerOn).toBe(true);
    expect(young.targetFrontier).toBeCloseTo(0.875, 12);
    expect(old.targetFrontier).toBeCloseTo(0.8, 12);
    expect(young.targetReview).toBeCloseTo(0.9, 12);
    old.settings["timer"] = false;
    old.settings["target_frontier"] = 0.7;
    expect(old.timerOn).toBe(false);
    expect(old.targetFrontier).toBeCloseTo(0.7, 12);
  });

  it("item store bounded", () => {
    const s = new LearnerState();
    for (let i = 0; i < 4100; i++) s.item(`x:${i}`).last = i;
    s.pruneItems();
    expect(s.items.size).toBeLessThanOrEqual(4000);
    expect(s.items.has("x:4099")).toBe(true);
    expect(s.items.has("x:0")).toBe(false);
  });
});
