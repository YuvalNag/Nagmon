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
import type { AnswerOutcome, LearningEngine } from "../learning/engine";
import type { Choice, Given, Question } from "../learning/model";
import { NumberPad } from "../learning/quiz_flow";
import type { QuizWord } from "./events";

export type QuizPhase = "none" | "example" | "question" | "feedback";

export interface QuizRequest {
  topic: string;
  context: string;
  /** The youngest are held to a few choices (gradeDefaults); null leaves it to the engine. */
  maxChoices: number | null;
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
      q = engine.nextQuestion({
        ...(topic.includes(".") ? { skill_id: topic } : { subject: topic }),
        context,
        max_choices: maxChoices,
      });
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
      hint_used: this.hintUsed,
      dont_know: dontKnow,
    });
    this.gaveUp = dontKnow;
    this.phase = "feedback";
    this.onAnswer(this.outcome, resultWord(this.outcome));
    return true;
  }
}
