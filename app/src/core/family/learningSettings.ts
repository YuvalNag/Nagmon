/**
 * The parents' learning switches, kept in the child's settings (the way
 * `effects.ts` keeps the battle's):
 *
 * - `settings.learning.subjects`: the subjects that are on (none listed: all).
 * - `settings.learning.start_grade`: `{ subject: grade }`, where a subject
 *   begins (none: the child's grade, or what the owl's placement found).
 * - `settings.learning.show_levels`: whether the child sees levels.
 * - `settings.questions_per_battle`: 3-10 (the battle caps it by age on top).
 * - `settings.lessons.first_pass_coins` / `repeat_coins`: what a tutor's lesson pays.
 *
 * The learning engine reads `settings.learning` as it always did
 * (`learnerFor`); lenient: anything else in the file reads as the defaults.
 */
import type { JsonObject } from "../../platform/storage";
import { FIRST_PASS_COINS, REPEAT_COINS } from "../game/lessons";
import type { LearnerState } from "../learning/learner";

export const QUESTIONS_MIN = 3;
export const QUESTIONS_MAX = 10;
export const COIN_MAX = 1000;
export const GRADE_MAX = 9;

export interface LearningSettings {
  /** The subjects that are on; null is all of them. */
  subjects: string[] | null;
  /** Subject to the grade it starts at; a subject not here starts at the child's grade. */
  startGrade: Record<string, number>;
  showLevels: boolean;
  questionsPerBattle: number;
  firstPassCoins: number;
  repeatCoins: number;
}

const isDict = (v: unknown): v is JsonObject => typeof v === "object" && v !== null && !Array.isArray(v);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.trunc(n)));
const whole = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : fallback);

/** The questions in a battle a new child gets: three for the youngest. */
export const defaultQuestions = (grade: number): number => (grade <= 1 ? 3 : 5);

export function learningFrom(settings: unknown, grade: number): LearningSettings {
  const root = isDict(settings) ? settings : {};
  const learning = isDict(root["learning"]) ? root["learning"] : {};
  const lessons = isDict(root["lessons"]) ? root["lessons"] : {};
  const listed = Array.isArray(learning["subjects"]) ? learning["subjects"].filter((s): s is string => typeof s === "string") : [];
  const startGrade: Record<string, number> = {};
  const raw = learning["start_grade"];
  if (isDict(raw)) {
    for (const [subject, g] of Object.entries(raw)) {
      if (typeof g === "number" && Number.isFinite(g) && g >= 0 && g <= GRADE_MAX) startGrade[subject] = Math.trunc(g);
    }
  }
  return {
    subjects: listed.length ? listed : null,
    startGrade,
    showLevels: typeof learning["show_levels"] === "boolean" ? learning["show_levels"] : true,
    questionsPerBattle: whole(root["questions_per_battle"], QUESTIONS_MIN, QUESTIONS_MAX, defaultQuestions(grade)),
    firstPassCoins: whole(lessons["first_pass_coins"], 0, COIN_MAX, FIRST_PASS_COINS),
    repeatCoins: whole(lessons["repeat_coins"], 0, COIN_MAX, REPEAT_COINS),
  };
}

export interface LearningPatch {
  subjects?: string[] | null;
  /** Subjects to set; merged into the ones already set. */
  startGrade?: Record<string, number>;
  showLevels?: boolean;
  questionsPerBattle?: number;
  firstPassCoins?: number;
  repeatCoins?: number;
}

/**
 * The settings with one thing changed; the rest stays as it is, and the
 * input is not touched. `every` is all the subjects there are: a list
 * with every one of them is saved as "all".
 */
export function withLearning(settings: JsonObject, patch: LearningPatch, every: readonly string[] = []): JsonObject {
  const learning: JsonObject = isDict(settings["learning"]) ? { ...settings["learning"] } : {};
  const lessons: JsonObject = isDict(settings["lessons"]) ? { ...settings["lessons"] } : {};
  const out: JsonObject = { ...settings };
  if (patch.subjects !== undefined) {
    const all = patch.subjects === null || (every.length > 0 && every.every((s) => patch.subjects!.includes(s)));
    if (all) delete learning["subjects"];
    else learning["subjects"] = [...patch.subjects!];
  }
  if (patch.startGrade) {
    const now = learningFrom(settings, 0).startGrade;
    for (const [subject, g] of Object.entries(patch.startGrade)) now[subject] = clamp(g, 0, GRADE_MAX);
    learning["start_grade"] = now;
  }
  if (patch.showLevels !== undefined) learning["show_levels"] = patch.showLevels;
  if (patch.questionsPerBattle !== undefined) out["questions_per_battle"] = clamp(patch.questionsPerBattle, QUESTIONS_MIN, QUESTIONS_MAX);
  if (patch.firstPassCoins !== undefined) lessons["first_pass_coins"] = clamp(patch.firstPassCoins, 0, COIN_MAX);
  if (patch.repeatCoins !== undefined) lessons["repeat_coins"] = clamp(patch.repeatCoins, 0, COIN_MAX);
  out["learning"] = learning;
  out["lessons"] = lessons;
  return out;
}

/** The parent's start grades are where those subjects begin (over the owl's placement): the learner's level in each. */
export function applyStartGrades(learner: LearnerState, settings: unknown): void {
  for (const [subject, g] of Object.entries(learningFrom(settings, learner.grade).startGrade)) learner.subject_grade.set(subject, g);
}
