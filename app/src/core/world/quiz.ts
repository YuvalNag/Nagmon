/**
 * One question asked on the map (the old QuizState,
 * mods/nagmon/states/nagmon_quiz.py), as a state machine with no screen:
 *
 *     example? -> question -> feedback
 *
 * - The question comes from the learning engine's selector, for this
 *   child, on the script's topic (a subject, or a skill id with a dot).
 * - On a skill's first meeting the owl shows a worked example first;
 *   then the same question is asked.
 * - "רמז" once per question: one wrong choice goes, or a first step is
 *   shown. "לא יודע/ת" is an answer too (counted at half weight).
 * - The answer is given to `onAnswer` at once, before the feedback is
 *   read: the caller saves the learner then, so a kill right after the
 *   answer loses nothing.
 * - The engine's own coin count is not paid here: on the map the script
 *   pays (the cashier's 20, under the daily cap).
 */
import { crumb } from "../game/breadcrumb";
import type { AnswerOutcome, LearningEngine } from "../learning/engine";
import { type Choice, DRAWN_FIGURE_KINDS, type Given, type Question } from "../learning/model";
import { NumberPad } from "../learning/quiz_flow";
import type { QuizWord } from "./events";

export type QuizPhase = "none" | "example" | "question" | "feedback" | "passed";

/** The helpers of the Bag that work on a question (items.ts): the feather, the clover and the owl's pass. */
export type HelperKind = "hint" | "fifty" | "pass";

/** The child's helpers as the question sees them: how many, using one up, and the log. */
export interface HelperBag {
  count(kind: HelperKind): number;
  /** Uses one up; false when there is none. */
  spend(kind: HelperKind): boolean;
  /** A helper was used on this question (the field log). */
  used?(kind: HelperKind, question: Question): void;
}

export interface QuizRequest {
  topic: string;
  context: string;
  /** The youngest are held to a few choices (gradeDefaults); null leaves it to the engine. */
  maxChoices: number | null;
  /** The Bag's helpers, where they may be used (a battle); none on the map. */
  helpers?: HelperBag;
}

/** Answered on the number pad. */
const PAD_KINDS = new Set(["number"]);
/** Answered by tapping one choice. "order" and "letters" need their own input (M6). */
const CHOICE_KINDS = new Set(["choice", "true_false", "tap_figure"]);

/** What the script sees for an answer (ask_quiz.result_word). */
export function resultWord(outcome: AnswerOutcome): QuizWord {
  if (outcome.quality === "super") return "super";
  return outcome.correct ? "correct" : "wrong";
}

/** At most this many characters on the number pad (the old NumberPad). */
export const PAD_MAX = 10;

export class QuizSession {
  readonly question: Question | null;
  phase: QuizPhase;
  /** The hint's text once asked for. */
  hintText: string | null = null;
  readonly hidden = new Set<string>();
  readonly pad = new NumberPad(PAD_MAX);
  outcome: AnswerOutcome | null = null;
  /** The answer was "don't know". */
  gaveUp = false;
  /** How long the answer took, ms (the game's clock). */
  elapsedMs = 0;
  private hintUsed = false;
  /** One helper of the Bag for each question. */
  private helperUsed = false;
  /** The Notes sheet was opened on this question. */
  private noteUsed = false;
  private started: number;

  constructor(
    private readonly engine: LearningEngine,
    private readonly request: QuizRequest,
    /** Milliseconds, for how long the answer took (the game's clock). */
    private readonly clock: () => number,
    private readonly onAnswer: (outcome: AnswerOutcome, word: QuizWord) => void,
    warn: (message: string) => void = () => {},
  ) {
    let q: Question | null = null;
    try {
      const { topic, context, maxChoices } = request;
      // a question that needs a picture the app does not draw yet (a robot on a grid) would show a "?" card: ask another
      for (let tries = 0; tries < 12; tries++) {
        q = engine.nextQuestion({
          ...(topic.includes(".") ? { skill_id: topic } : { subject: topic }),
          context,
          max_choices: maxChoices,
        });
        if (!q.figure || DRAWN_FIGURE_KINDS.has(q.figure.kind)) break;
        warn(`A ${q.figure.kind} figure is not drawn yet (M6): ${q.item_id}`);
        q = null;
      }
    } catch (e) {
      // a typo in a script's skill, a broken generator: no question, not a crash
      warn(`No question for ${request.topic}: ${String(e)}`);
    }
    this.question = q;
    if (q && !PAD_KINDS.has(q.kind) && !CHOICE_KINDS.has(q.kind)) {
      // one tap would always be graded wrong and mark a right-thinking child down
      warn(`A ${q.kind} question cannot be answered here yet (M6): ${q.item_id}`);
      this.question = null;
    } else if (q && CHOICE_KINDS.has(q.kind) && q.choices.length === 0) {
      warn(`A ${q.kind} question has no choices: ${q.item_id}`);
      this.question = null;
    }
    // for a parent's "something is wrong": which question is on the screen
    crumb.question(this.question);
    this.phase = this.question === null ? "none" : this.question.meta["worked_example"] ? "example" : "question";
    this.started = clock();
  }

  /** Answered on the number pad (otherwise by a choice). */
  get usesPad(): boolean {
    return this.question !== null && PAD_KINDS.has(this.question.kind);
  }

  /** The choices still shown (a hint takes one away). */
  get choices(): readonly Choice[] {
    return (this.question?.choices ?? []).filter((c) => !this.hidden.has(c.id));
  }

  /** Whether the hint can still be asked for. */
  get canHint(): boolean {
    return this.phase === "question" && !this.hintUsed;
  }

  /**
   * The Notes sheet (a passed lesson's idea card) was opened on this
   * question: a right answer counts half in the rating, as with a hint
   * (docs/app/FEATURES.md 4.17). It does not use up the hint.
   */
  notesOpened(): void {
    if (this.phase === "question") this.noteUsed = true;
  }

  /** The helpers of the Bag still usable on this question (one for each question), with their counts. */
  helpersOwned(): { kind: HelperKind; count: number }[] {
    const bag = this.request.helpers;
    if (!bag || this.phase !== "question" || this.helperUsed) return [];
    const fiftyOk = !this.usesPad && this.choices.length > 2;
    return (["hint", "fifty", "pass"] as const).flatMap((kind) => {
      const count = kind === "fifty" && !fiftyOk ? 0 : bag.count(kind);
      return count > 0 ? [{ kind, count }] : [];
    });
  }

  /** The question was swapped by the owl's pass: it was not answered, rated or paid. */
  get passed(): boolean {
    return this.phase === "passed";
  }

  /**
   * Uses a helper of the Bag. The feather shows the first step and the
   * clover takes two wrong choices away; either one makes the answer
   * count half in the rating (the same as a hint). The pass swaps the
   * question for a new one (the caller asks it): nothing is answered,
   * rated or paid. False, and nothing used up, when there is none or one
   * was used on this question already.
   */
  useHelper(kind: HelperKind): boolean {
    const bag = this.request.helpers;
    const q = this.question;
    if (!bag || !q || this.phase !== "question" || this.helperUsed || bag.count(kind) < 1) return false;
    if (kind === "fifty" && (this.usesPad || this.choices.length <= 2)) return false;
    if (!bag.spend(kind)) return false;
    this.helperUsed = true;
    bag.used?.(kind, q);
    if (kind === "pass") {
      this.phase = "passed";
      return true;
    }
    this.hintUsed = true;
    if (kind === "fifty") {
      const wrong = this.choices.filter((c) => c.id !== String(q.answer));
      // the same two for the same question
      let h = 0;
      for (const ch of q.item_id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      const start = h % wrong.length;
      const drop = Math.min(2, this.choices.length - 2);
      for (let i = 0; i < drop; i++) this.hidden.add(wrong[(start + i) % wrong.length]!.id);
    } else {
      this.hintText = this.firstStep(q);
    }
    return true;
  }

  /** The first solution step, never the answer; the engine's own hint text when there is no step to show. */
  private firstStep(q: Question): string {
    const step = (q.explanation_he || "").split(/(?<=[.:!?])\s|\n/)[0]?.trim() ?? "";
    const answer = String(q.answer);
    if (step && step.length < 140 && !step.includes(answer)) return `רמז: ${step.replace(/[.:]$/, "")}.`;
    const own = q.meta["hint_he"];
    return typeof own === "string" && own ? own : "רמז: קראו שוב את השאלה, ונסו צעד אחד בכל פעם.";
  }

  /** The script's word for the answer, once there is one. */
  get word(): QuizWord | null {
    return this.outcome ? resultWord(this.outcome) : null;
  }

  /** A skill's name for the child ("a new star in ..."). */
  skillTitle(id: string): string {
    return this.engine.content.get(id)?.title_he ?? id;
  }

  /** "Got it, let's try": the worked example is read, the question starts. */
  exampleDone(): void {
    if (this.phase !== "example") return;
    this.phase = "question";
    this.started = this.clock();
  }

  hint(): void {
    if (!this.canHint || !this.question) return;
    const h = this.engine.hint(this.question);
    this.hintUsed = true;
    this.hintText = h.text_he;
    for (const id of h.eliminate) this.hidden.add(id);
  }

  /** A key of the number pad: a digit, "-", ".", "/" or "back". */
  press(key: string): void {
    if (this.phase === "question" && this.usesPad) this.pad.press(key);
  }

  /** "בדיקה" on the pad: answers with what was typed (nothing typed does nothing). */
  check(): boolean {
    if (this.phase !== "question" || !this.usesPad || !this.pad.text) return false;
    return this.answer(this.pad.text, false);
  }

  choose(id: string): boolean {
    if (this.phase !== "question" || this.usesPad || !this.choices.some((c) => c.id === id)) return false;
    return this.answer(id, false);
  }

  dontKnow(): boolean {
    if (this.phase !== "question") return false;
    return this.answer(null, true);
  }

  private answer(given: Given, dontKnow: boolean): boolean {
    const q = this.question;
    if (!q || this.outcome) return false;
    this.elapsedMs = Math.max(0, this.clock() - this.started);
    const elapsed = this.elapsedMs / 1000;
    this.outcome = this.engine.submit(q, given, {
      elapsed_s: elapsed,
      context: this.request.context,
      hint_used: this.hintUsed || this.noteUsed,
      dont_know: dontKnow,
    });
    this.gaveUp = dontKnow;
    this.phase = "feedback";
    this.onAnswer(this.outcome, resultWord(this.outcome));
    return true;
  }
}
