/**
 * The owl's worked example, and the hint.
 *
 * The example shown BEFORE a question is a sibling item of the same skill:
 * the same generator (or the same bank), other numbers or words, another
 * answer, with its own solution text. It is never the asked item, so the
 * child cannot copy the answer off the screen. For a generated skill the
 * sibling comes from the generator with a seed derived from the asked
 * question, so it is reproducible; for a bank it is another item of the
 * bank. When no sibling exists (a bank of one item), there is no example.
 *
 * The explanation AFTER an answer stays specific to the asked item.
 */
import type { ContentLibrary } from "./content";
import type { GenContext } from "./generators/common";
import { DRAWN_FIGURE_KINDS, displayAnswer, type Figure, type Question } from "./model";
import { PyRandom } from "./random";

/** What the owl shows before the question: a solved sibling item. */
export interface WorkedExample {
  readonly item_id: string;
  readonly skill_id: string;
  readonly kind: string;
  readonly prompt_he: string;
  readonly prompt_en: string | null;
  readonly figure: Figure | null;
  /** The sibling's answer as text. */
  readonly answer_he: string;
  /** The picture of the right choice, when the choices are pictures. */
  readonly answer_image: string | null;
  /** The solution, step by step. */
  readonly steps_he: string;
  /** The idea this skill is about (its title). */
  readonly idea_he: string;
}

/** Siblings tried for one question before giving up. */
export const SIBLING_TRIES = 40;

const key = (v: unknown): string => JSON.stringify(v ?? null);

/** The picture of the right choice, if the choices are pictures. */
function answerImage(q: Question): string | null {
  return q.choices.find((c) => c.id === q.answer)?.image ?? null;
}

/** The words of a vocabulary item (its answer when the choices are only pictures). */
function wordOf(q: Question): string {
  const w = q.meta["word"];
  return typeof w === "string" ? w : "";
}

/** An answer, as text, picture and word: two items with the same one have the same answer. */
function answerKey(q: Question): string {
  return key([displayAnswer(q), answerImage(q), wordOf(q)]);
}

/** A seed for try `i` of the sibling of `q`: the same question always gets the same siblings. */
export function siblingSeed(q: Question, i: number): number {
  const base = q.meta["seed"];
  let h = typeof base === "number" ? base >>> 0 : 0x811c9dc5;
  for (const ch of q.item_id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  h = Math.imul(h ^ (i + 1), 2654435761) >>> 0;
  h ^= h >>> 15;
  return Math.imul(h, 2246822519) >>> 0;
}

/** Whether `s` is a different item from `q`: another id and another answer (the words or the picture differ with them). */
function isSibling(q: Question, s: Question): boolean {
  if (s.item_id === q.item_id) return false;
  if (answerKey(s) === answerKey(q)) return false;
  if (!s.explanation_he.trim() || s.explanation_he === q.explanation_he) return false;
  if (s.figure && !DRAWN_FIGURE_KINDS.has(s.figure.kind)) return false;
  return true;
}

/**
 * A solved sibling of `q`, or null when there is none to find in `tries`
 * attempts. Prefers one of the same kind and with a picture when `q` has one.
 */
export function siblingExample(content: ContentLibrary, q: Question, ctx: GenContext, tries: number = SIBLING_TRIES): WorkedExample | null {
  let loose: Question | null = null;
  let found: Question | null = null;
  for (let i = 0; i < tries && found === null; i++) {
    let s: Question;
    try {
      s = content.generate(q.skill_id, new PyRandom(siblingSeed(q, i)), ctx);
    } catch {
      continue;
    }
    if (!isSibling(q, s)) continue;
    if (s.kind === q.kind && Boolean(s.figure) === Boolean(q.figure)) found = s;
    else loose ??= s;
  }
  const s = found ?? loose;
  if (s === null) return null;
  return {
    item_id: s.item_id,
    skill_id: s.skill_id,
    kind: s.kind,
    prompt_he: s.prompt_he,
    prompt_en: s.prompt_en,
    figure: s.figure,
    answer_he: displayAnswer(s),
    answer_image: answerImage(s),
    steps_he: s.explanation_he,
    idea_he: content.get(q.skill_id)?.title_he ?? "",
  };
}

// ---------------------------------------------------------------------------
// the hint
// ---------------------------------------------------------------------------

/** `answer` as a token of its own in `text` ("5" is not found in "15"). */
export function mentionsAnswer(text: string, answer: string): boolean {
  const a = answer.trim();
  if (!a) return false;
  const esc = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const word = "0-9A-Za-z\u05D0-\u05EA";
  return new RegExp(`(?<![${word}])(?<![0-9][.,])${esc}(?![${word}])(?![.,][0-9])`).test(text);
}

/** The text up to the first ":" or ". " or line end outside math (a ":" inside an LTR isolate is a division). */
function firstSentence(text: string): string {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\u2066") depth++;
    else if (ch === "\u2069") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === ":" || ch === "\n" || (ch === "." && /\s/.test(text[i + 1] ?? "")))) return text.slice(0, i);
  }
  return text;
}

/** Characters that make a first step too long to be a hint. */
const STEP_MAX = 110;

/** The first step of a generated item's solution, when it does not give the answer away. */
function firstStep(q: Question, answer: string): string {
  // a bank item's explanation IS its answer ("the nest is a shelter"): no step to quote
  if (q.source === "bank") return "";
  const step = firstSentence((q.explanation_he || "").trim()).trim().replace(/[.:]$/, "");
  if (!step || step.length > STEP_MAX) return "";
  // the stricter test: any occurrence of the answer, not only a token of its own
  if (step.includes(answer) || mentionsAnswer(step, answer)) return "";
  return step;
}

/**
 * The hint: the idea of the skill and, for a generated item, the first
 * step, never the answer. A hint of a different kind than "rule out one
 * choice" (the engine's `hint`) is built around this.
 */
export function ideaHint(q: Question, ideaTitle: string | undefined): string {
  const answer = displayAnswer(q);
  const idea = ideaTitle && !mentionsAnswer(ideaTitle, answer) ? `חשבו על "${ideaTitle}"` : "";
  const step = firstStep(q, answer);
  const own = q.meta["hint_he"];
  const parts = [idea, typeof own === "string" && own ? own : step].filter(Boolean) as string[];
  if (!parts.length) return "רמז: קראו שוב את השאלה, ונסו צעד אחד בכל פעם.";
  const text = parts.map((p) => p.replace(/[.:]$/, "")).join(". ");
  return `רמז: ${text}.`;
}
