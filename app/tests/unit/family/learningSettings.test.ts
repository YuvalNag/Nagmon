import { describe, expect, it } from "vitest";
import { defaultsForGrade } from "../../../src/core/family/gradeDefaults";
import {
  applyStartGrades,
  COIN_MAX,
  learningFrom,
  QUESTIONS_MAX,
  QUESTIONS_MIN,
  withLearning,
} from "../../../src/core/family/learningSettings";
import { LearnerState } from "../../../src/core/learning";

describe("learningFrom: what the parent has set, with the defaults", () => {
  it("a new child: every subject on, the child's grade, levels shown, questions and coins by the defaults", () => {
    const s = learningFrom(defaultsForGrade(3).settings, 3);
    expect(s).toEqual({ subjects: null, startGrade: {}, showLevels: true, questionsPerBattle: 5, firstPassCoins: 40, repeatCoins: 10 });
    expect(learningFrom(defaultsForGrade(0).settings, 0).questionsPerBattle).toBe(3);
  });

  it("reads saved values and ignores bad ones", () => {
    const s = learningFrom(
      {
        learning: { subjects: ["math", "science", 7], start_grade: { math: 4, english: "x", logic: 12, hebrew: -1 }, show_levels: false },
        questions_per_battle: 8,
        lessons: { first_pass_coins: 60, repeat_coins: 0 },
      },
      2,
    );
    expect(s).toEqual({ subjects: ["math", "science"], startGrade: { math: 4 }, showLevels: false, questionsPerBattle: 8, firstPassCoins: 60, repeatCoins: 0 });
  });

  it("clamps the questions to 3-10 and the coins to 0-1000, and takes junk as the defaults", () => {
    expect(learningFrom({ questions_per_battle: 99 }, 2).questionsPerBattle).toBe(QUESTIONS_MAX);
    expect(learningFrom({ questions_per_battle: 1 }, 2).questionsPerBattle).toBe(QUESTIONS_MIN);
    expect(learningFrom({ questions_per_battle: "x" }, 2).questionsPerBattle).toBe(5);
    expect(learningFrom({ lessons: { first_pass_coins: 5000 } }, 2).firstPassCoins).toBe(COIN_MAX);
    expect(learningFrom(null, 2).firstPassCoins).toBe(40);
    // an empty subject list means all of them (as the engine reads it)
    expect(learningFrom({ learning: { subjects: [] } }, 2).subjects).toBeNull();
  });
});

describe("withLearning: changes one thing and keeps the rest", () => {
  const base = defaultsForGrade(2).settings;

  it("subjects, the start grade of one subject, show levels, questions and the two coin amounts", () => {
    let s = withLearning(base, { subjects: ["math", "logic"] });
    s = withLearning(s, { startGrade: { math: 4 } });
    s = withLearning(s, { startGrade: { english: 1 } });
    s = withLearning(s, { showLevels: false, questionsPerBattle: 7, firstPassCoins: 60, repeatCoins: 5 });
    expect(learningFrom(s, 2)).toEqual({ subjects: ["math", "logic"], startGrade: { math: 4, english: 1 }, showLevels: false, questionsPerBattle: 7, firstPassCoins: 60, repeatCoins: 5 });
    // what the engine reads is where it always was (settings.learning), and the other settings stay
    expect((s["learning"] as Record<string, unknown>)["subjects"]).toEqual(["math", "logic"]);
    expect((s["learning"] as Record<string, unknown>)["timer"]).toBe(false);
    expect((s["tts"] as Record<string, unknown>)["auto_read_questions"]).toBe(true);
  });

  it("does not change what it is given, and never writes a value out of range", () => {
    const before = JSON.stringify(base);
    withLearning(base, { questionsPerBattle: 99, firstPassCoins: -5 });
    expect(JSON.stringify(base)).toBe(before);
    const s = learningFrom(withLearning(base, { questionsPerBattle: 99, firstPassCoins: -5, startGrade: { math: 40 } }), 2);
    expect(s.questionsPerBattle).toBe(10);
    expect(s.firstPassCoins).toBe(0);
    expect(s.startGrade).toEqual({ math: 9 });
  });

  it("a list of every subject is saved as 'all' (no list), so a new subject later is on too", () => {
    const s = withLearning(base, { subjects: ["a", "b"] }, ["a", "b"]);
    expect(learningFrom(s, 2).subjects).toBeNull();
  });
});

describe("applyStartGrades: the parent's start grade is where the subject begins", () => {
  it("sets the subject's level, over a placement, and leaves the other subjects alone", () => {
    const learner = new LearnerState({ grade: 3 });
    learner.subject_grade.set("math", 1);
    learner.subject_grade.set("english", 2);
    applyStartGrades(learner, { learning: { start_grade: { math: 5 } } });
    expect(learner.gradeIn("math")).toBe(5);
    expect(learner.gradeIn("english")).toBe(2);
    expect(learner.gradeIn("logic")).toBe(3);
  });
  it("does nothing without the setting", () => {
    const learner = new LearnerState({ grade: 3 });
    applyStartGrades(learner, {});
    expect(learner.subject_grade.size).toBe(0);
  });
});
