// @vitest-environment node
/** Rating stays about knowledge, not reflexes: in a battle the Elo speed bonus is off. */
import { beforeAll, describe, expect, it } from "vitest";
import { LearningEngine } from "../../../src/core/learning/engine";
import { LearnerState } from "../../../src/core/learning/learner";
import { PyRandom } from "../../../src/core/learning/random";
import { FakeClock, library } from "./helpers";

function engine(timer: boolean): LearningEngine {
  const learner = new LearnerState({ learner_id: "t", name: "ת", grade: 5, age: 10 });
  learner.settings["worked_examples"] = false;
  learner.settings["timer"] = timer;
  return new LearningEngine(library(), learner, { rng: new PyRandom(3), clock: new FakeClock().call });
}

/** The rating after one right answer in `seconds`. */
function thetaAfter(eng: LearningEngine, seconds: number, speedBonus?: boolean): number {
  const q = eng.nextQuestion({ skill_id: "math.add.within_20" });
  const out = eng.submit(q, q.answer, { elapsed_s: seconds, ...(speedBonus === undefined ? {} : { speed_bonus: speedBonus }) });
  expect(out.correct).toBe(true);
  return eng.learner.skills.get(q.skill_id)!.theta;
}

describe("the Elo speed bonus", () => {
  beforeAll(() => void library(), 120_000);

  it("is on by default with the timer on: an instant right answer moves the rating more", () => {
    expect(thetaAfter(engine(true), 0.5)).toBeGreaterThan(thetaAfter(engine(true), 600));
  });

  it("is off when asked: a fast right answer and a slow one move the rating the same", () => {
    expect(thetaAfter(engine(true), 0.5, false)).toBeCloseTo(thetaAfter(engine(true), 600, false), 10);
  });

  it("off, the rating is exactly what the timer being off gives", () => {
    expect(thetaAfter(engine(true), 0.5, false)).toBeCloseTo(thetaAfter(engine(false), 0.5), 10);
  });

  it("a slow answer is never punished either way", () => {
    expect(thetaAfter(engine(true), 600, false)).toBeCloseTo(thetaAfter(engine(true), 600, true), 10);
  });
});
