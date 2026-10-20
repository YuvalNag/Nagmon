import { describe, expect, it } from "vitest";
import { defaultsForGrade, GRADE_NAMES_HE } from "../../../src/core/family/gradeDefaults";

/** Printed by nagmon/game_flow.py defaults_for_grade for -1..10. */
const PYTHON: Record<string, { grade: number; language_level: number; settings: unknown }> = {
  "-1": {"grade": 0, "language_level": 0, "settings": {"learning": {"timer": false, "max_choices": 3}, "tts": {"auto_read_questions": true}, "questions_per_battle": 3}},
  "0": {"grade": 0, "language_level": 0, "settings": {"learning": {"timer": false, "max_choices": 3}, "tts": {"auto_read_questions": true}, "questions_per_battle": 3}},
  "1": {"grade": 1, "language_level": 0, "settings": {"learning": {"timer": false, "max_choices": 3}, "tts": {"auto_read_questions": true}, "questions_per_battle": 3}},
  "2": {"grade": 2, "language_level": 1, "settings": {"learning": {"timer": false, "max_choices": 4}, "tts": {"auto_read_questions": true}, "questions_per_battle": 5}},
  "3": {"grade": 3, "language_level": 1, "settings": {"learning": {"timer": true, "max_choices": 4}, "tts": {"auto_read_questions": false}, "questions_per_battle": 5}},
  "4": {"grade": 4, "language_level": 2, "settings": {"learning": {"timer": true, "max_choices": 4}, "tts": {"auto_read_questions": false}, "questions_per_battle": 5}},
  "5": {"grade": 5, "language_level": 2, "settings": {"learning": {"timer": true, "max_choices": 4}, "tts": {"auto_read_questions": false}, "questions_per_battle": 5}},
  "6": {"grade": 6, "language_level": 2, "settings": {"learning": {"timer": true, "max_choices": 4}, "tts": {"auto_read_questions": false}, "questions_per_battle": 5}},
  "7": {"grade": 7, "language_level": 3, "settings": {"learning": {"timer": true, "max_choices": 4}, "tts": {"auto_read_questions": false}, "questions_per_battle": 5}},
  "8": {"grade": 8, "language_level": 3, "settings": {"learning": {"timer": true, "max_choices": 4}, "tts": {"auto_read_questions": false}, "questions_per_battle": 5}},
  "9": {"grade": 9, "language_level": 3, "settings": {"learning": {"timer": true, "max_choices": 4}, "tts": {"auto_read_questions": false}, "questions_per_battle": 5}},
  "10": {"grade": 9, "language_level": 3, "settings": {"learning": {"timer": true, "max_choices": 4}, "tts": {"auto_read_questions": false}, "questions_per_battle": 5}},
};

describe("defaultsForGrade", () => {
  it("matches the old app for every grade, and clamps outside 0..9", () => {
    for (let g = -1; g <= 10; g++) {
      const d = defaultsForGrade(g);
      // `lessons` is new in the app (the old game had no tutors): everything else matches
      const { lessons: _lessons, ...settings } = d.settings;
      expect({ grade: d.grade, language_level: d.languageLevel, settings }, `grade ${g}`).toEqual(PYTHON[String(g)]);
    }
  });

  it("starts the lesson rewards at 40 and 10 coins", () => {
    expect(defaultsForGrade(4).settings["lessons"]).toEqual({ first_pass_coins: 40, repeat_coins: 10 });
  });

  it("treats a grade that is not a number as kindergarten", () => {
    expect(defaultsForGrade(Number.NaN).grade).toBe(0);
    expect(defaultsForGrade(Number("x"))).toEqual(defaultsForGrade(0));
  });

  it("drops a fraction, as Python's int() would", () => {
    expect(defaultsForGrade(2.7).grade).toBe(2);
  });

  it("has a Hebrew name for each grade 0..9", () => {
    expect(GRADE_NAMES_HE).toHaveLength(10);
    expect(GRADE_NAMES_HE[0]).toBe("גן");
  });
});
