import type { JsonObject } from "../../platform/storage";

/** "גן", "כיתה א" ... "כיתה ט": index is the grade (0 is kindergarten). */
export const GRADE_NAMES_HE: readonly string[] = [
  "גן",
  "כיתה א",
  "כיתה ב",
  "כיתה ג",
  "כיתה ד",
  "כיתה ה",
  "כיתה ו",
  "כיתה ז",
  "כיתה ח",
  "כיתה ט",
];

export interface GradeDefaults {
  grade: number;
  languageLevel: number;
  settings: JsonObject;
}

/**
 * What a new child starts with, from their grade (nagmon/game_flow.py
 * defaults_for_grade). The parent can change all of it later.
 * - Hebrew only before reading age, then English step by step.
 * - No timer under grade 3: time pressure helps no one young.
 * - Questions read aloud until grade 2; fewer choices for the youngest.
 */
export function defaultsForGrade(grade: number): GradeDefaults {
  // not a number (a bad screen value): the youngest settings, as the safe guess
  const g = Number.isNaN(grade) ? 0 : Math.max(0, Math.min(9, Math.trunc(grade)));
  const languageLevel = g <= 1 ? 0 : g <= 3 ? 1 : g <= 6 ? 2 : 3;
  return {
    grade: g,
    languageLevel,
    settings: {
      learning: { timer: g >= 3, max_choices: g <= 1 ? 3 : 4 },
      tts: { auto_read_questions: g <= 2 },
      questions_per_battle: g <= 1 ? 3 : 5,
      // coins a tutor's lesson pays (core/game/lessons.ts); the parent can change both
      lessons: { first_pass_coins: 40, repeat_coins: 10 },
    },
  };
}
