/**
 * Tutor lessons (docs/app/FEATURES.md 4.17): each institute's tutor teaches
 * one skill of the question bank in 2-4 picture cards and a tiny practice.
 * A passed lesson means the skill is "learned": its notes card may be shown
 * in a quiz (never the answer), and the first pass pays coins, a repeat pays
 * a little once a day. Pure logic, no screens.
 *
 * The file is `mods/nagmon/lessons/<id>.yaml`, built to
 * `game/lessons/<id>.json` (tools/app/lessons.py):
 *
 *     id: moon
 *     skill: science.space.moon        # a skill id of the bank
 *     institute: station
 *     title_he: הירח                    [title]
 *     cards:                           # 2-4
 *       - {emoji: 1f319, he: ..., en: ..., highlight: ...}
 *     notes: {emoji: 1f311, he: ..., en: ...}   # the idea, never the answer
 *     practice: {bank: sci.space.013}  # a bank question, or
 *                                      # {inline: {prompt_he, prompt_en, choices: [{he, en, correct}]}}
 *
 * With no file there are no lessons and the tutor offers nothing.
 * The coin amounts are the child's settings `lessons.first_pass_coins` and
 * `lessons.repeat_coins` (the parent changes them); the defaults are here.
 */
import type { LessonSave } from "../world/worldState";

export const FIRST_PASS_COINS = 40;
export const REPEAT_COINS = 10;
const MAX_COINS = 1000;
/** The lesson files the game looks for under `game/lessons/`. */
export const LESSON_FILES: readonly string[] = ["moon", "solar_system", "stars"];

export interface LessonCard {
  /** A picture code (the emoji folder), or null. */
  emoji: string | null;
  text: string;
  textEn: string | null;
  highlight: string | null;
}

export interface LessonNote {
  emoji: string | null;
  text: string;
  textEn: string | null;
}

export interface InlineChoice {
  text: string;
  textEn: string | null;
  correct: boolean;
}

export type Practice =
  | { kind: "bank"; id: string }
  | { kind: "inline"; prompt: string; promptEn: string | null; choices: InlineChoice[] };

export interface Lesson {
  id: string;
  skill: string;
  institute: string;
  title: string;
  cards: LessonCard[];
  note: LessonNote | null;
  practice: Practice | null;
}

export type { LessonSave };
export const noLessonSave = (): LessonSave => ({ done: [], repeatDay: null, charges: 0 });

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (...vs: unknown[]): string | null => {
  for (const v of vs) if (typeof v === "string" && v.trim()) return v.trim();
  return null;
};

function cardOf(raw: unknown): LessonCard | null {
  if (!isDict(raw)) return null;
  const text = str(raw["he"], raw["text_he"], raw["text"]);
  if (!text) return null;
  const hi = str(raw["highlight"]);
  return { emoji: str(raw["emoji"], raw["image"]), text, textEn: str(raw["en"], raw["text_en"]), highlight: hi && text.includes(hi) ? hi : null };
}

function practiceOf(raw: unknown): Practice | null {
  if (!isDict(raw)) return null;
  const bank = str(raw["bank"]);
  if (bank) return { kind: "bank", id: bank };
  const inline = raw["inline"];
  if (!isDict(inline) || !Array.isArray(inline["choices"])) return null;
  const prompt = str(inline["prompt_he"], inline["prompt"]);
  const choices = inline["choices"].flatMap((c): InlineChoice[] => {
    if (!isDict(c)) return [];
    const text = str(c["he"], c["text"]);
    return text ? [{ text, textEn: str(c["en"]), correct: c["correct"] === true }] : [];
  });
  // exactly one right answer, or it is not a question
  if (!prompt || choices.length < 2 || choices.filter((c) => c.correct).length !== 1) return null;
  return { kind: "inline", prompt, promptEn: str(inline["prompt_en"]), choices };
}

/** A lesson from its parsed file; null when it is not one (no skill, fewer than two cards). */
export function parseLesson(doc: unknown, fallbackId = ""): Lesson | null {
  if (!isDict(doc)) return null;
  const skill = str(doc["skill"]);
  const id = str(doc["id"], fallbackId);
  if (!skill || !id || !Array.isArray(doc["cards"])) return null;
  const cards = doc["cards"].map(cardOf).filter((c): c is LessonCard => c !== null).slice(0, 4);
  if (cards.length < 2) return null;
  const n = cardOf(doc["notes"]);
  return {
    id,
    skill,
    institute: str(doc["institute"]) ?? "station",
    title: str(doc["title_he"], doc["title"]) ?? id,
    cards,
    note: n ? { emoji: n.emoji, text: n.text, textEn: n.textEn } : null,
    practice: practiceOf(doc["practice"]),
  };
}

/** The lessons of the build; a missing or unreadable file is no lesson. */
export async function loadLessons(fetchJson: (path: string) => Promise<unknown>, files: readonly string[] = LESSON_FILES): Promise<Lesson[]> {
  const out: Lesson[] = [];
  for (const f of files) {
    let doc: unknown;
    try {
      doc = await fetchJson(`lessons/${f}.json`);
    } catch {
      continue;
    }
    const lesson = parseLesson(doc, f);
    if (lesson) out.push(lesson);
  }
  return out;
}

export const lessonForSkill = (lessons: readonly Lesson[], skill: string): Lesson | null => lessons.find((l) => l.skill === skill) ?? null;

export const isLearned = (state: LessonSave, lessonId: string): boolean => state.done.includes(lessonId);

/** The skill ids the child has learned (a passed lesson), for the engine. */
export function learnedSkills(lessons: readonly Lesson[], state: LessonSave): string[] {
  return lessons.filter((l) => isLearned(state, l.id)).map((l) => l.skill);
}

/**
 * The notes card for a question of `skill`: only once its lesson is passed,
 * and only if the lesson has one. It explains the idea, never the answer.
 */
export function notesFor(lessons: readonly Lesson[], state: LessonSave, skill: string): LessonNote | null {
  const lesson = lessonForSkill(lessons, skill);
  return lesson && isLearned(state, lesson.id) ? lesson.note : null;
}

export interface Rewards {
  firstPass: number;
  repeat: number;
}

const coinAmount = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(MAX_COINS, Math.trunc(v))) : fallback;

/** The two amounts from a child's settings (`lessons.first_pass_coins`, `lessons.repeat_coins`); the defaults if absent or bad. */
export function lessonRewards(settings: unknown): Rewards {
  const l = isDict(settings) && isDict(settings["lessons"]) ? settings["lessons"] : {};
  return { firstPass: coinAmount(l["first_pass_coins"], FIRST_PASS_COINS), repeat: coinAmount(l["repeat_coins"], REPEAT_COINS) };
}

export interface Award {
  coins: number;
  /** This was the first pass of the lesson. */
  first: boolean;
  state: LessonSave;
}

/**
 * What passing the practice of `lessonId` pays. The first pass pays once;
 * a repeat pays once a day (`today` is `YYYY-MM-DD`), whichever lesson.
 * Never changes `state`: the new one is returned.
 */
export function awardFor(lessonId: string, state: LessonSave, today: string, rewards: Rewards = { firstPass: FIRST_PASS_COINS, repeat: REPEAT_COINS }): Award {
  if (!isLearned(state, lessonId)) return { coins: rewards.firstPass, first: true, state: { ...state, done: [...state.done, lessonId] } };
  if (state.repeatDay === today) return { coins: 0, first: false, state: { ...state, done: [...state.done] } };
  return { coins: rewards.repeat, first: false, state: { ...state, done: [...state.done], repeatDay: today } };
}

export const addCharges = (state: LessonSave, n: number): LessonSave => ({ ...state, done: [...state.done], charges: Math.max(0, state.charges + Math.trunc(n)) });

export interface NoteUse {
  ok: boolean;
  /** The use was the battle's free one. */
  free: boolean;
  state: LessonSave;
}

/**
 * Opening the notes in a battle: free once (`freeUsed` false), then one
 * charge. With no charge left, `ok` is false and nothing changes; the
 * child just answers without the notes.
 */
export function useNote(state: LessonSave, freeUsed: boolean): NoteUse {
  if (!freeUsed) return { ok: true, free: true, state };
  if (state.charges > 0) return { ok: true, free: false, state: addCharges(state, -1) };
  return { ok: false, free: false, state };
}
