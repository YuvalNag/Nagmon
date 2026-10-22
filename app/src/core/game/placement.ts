/**
 * The owl's placement: five or six questions, each in a different
 * subject, that only set where each subject starts. A wrong answer never
 * blocks or punishes anything: it moves the next question one grade down
 * and the subject's start one grade below the question's.
 *
 * - It starts at the grade the parent chose, and moves one grade up
 *   after a right answer and one down after a wrong one (kept within
 *   three grades below and two above the parent's grade).
 * - Each question is a real answer to the learning engine (the child's
 *   rating of that skill moves), but is never a lesson: no worked example.
 * - The result is a start level per subject, put on the learner
 *   (`subject_grade`); the learner's own grade stays the parent's.
 */
import type { LearningEngine } from "../learning/engine";
import type { Skill } from "../learning/content";
import { QuizSession } from "../world/quiz";

export const PLACEMENT_QUESTIONS = 6;
const MAX_GRADE = 9;
/** How many grades above and below the parent's grade the placement may go. */
export const UP = 1;
export const DOWN = 2;
/** Skills tried for a subject before it is left out (a kind the screen cannot answer yet). */
const TRIES = 6;
/** Draws of one skill, looking for a form that is not true-or-false. */
const FORM_TRIES = 4;

/** The order subjects are asked in: the young start with Hebrew; for the others it stays last (the order is kept so the placement a child met before does not change). */
export function subjectOrder(grade: number): string[] {
  return grade <= 2 ? ["math", "hebrew", "english", "science", "logic", "geometry"] : ["math", "english", "science", "geometry", "logic", "hebrew"];
}

export interface PlacementOptions {
  /** The grade the parent chose. */
  grade: number;
  clock: () => number;
  maxChoices: number | null;
  /** Subjects to ask, in order; the default is every subject the learner has on, in {@link subjectOrder}. */
  subjects?: readonly string[];
  count?: number;
  warn?: (message: string) => void;
}

export interface Asked {
  subject: string;
  /** The grade the question was asked at. */
  level: number;
  skill: string;
  correct: boolean;
}

export interface PlacementResult {
  /** The start level of each subject. */
  levels: Record<string, number>;
  /** Where the running level ended. */
  level: number;
}

export class Placement {
  readonly history: Asked[] = [];
  private level: number;
  private readonly subjects: string[];
  private readonly count: number;
  private cursor = 0;
  private open: { subject: string; level: number; session: QuizSession } | null = null;

  constructor(
    private readonly engine: LearningEngine,
    private readonly opts: PlacementOptions,
  ) {
    this.level = opts.grade;
    const have = new Set(engine.content.subjects());
    const enabled = engine.learner.enabledSubjects;
    const wanted = opts.subjects ?? subjectOrder(opts.grade);
    this.subjects = wanted.filter((s) => have.has(s) && engine.content.bySubject(s).length > 0 && (!enabled || enabled.includes(s)));
    this.count = Math.min(opts.count ?? PLACEMENT_QUESTIONS, this.subjects.length);
  }

  get finished(): boolean {
    return this.history.length >= this.count;
  }

  private clamp(level: number): number {
    const g = this.opts.grade;
    return Math.max(Math.max(0, g - DOWN), Math.min(Math.min(MAX_GRADE, g + UP), level));
  }

  /** Skills of a subject, the grade nearest `level` first (the lower grade on a tie). */
  private candidates(subject: string, level: number): Skill[] {
    return [...this.engine.content.bySubject(subject)].sort((a, b) => Math.abs(a.grade - level) - Math.abs(b.grade - level) || a.grade - b.grade);
  }

  /** The next question, or null when the placement is over. */
  next(): QuizSession | null {
    if (this.open) return this.open.session;
    while (!this.finished && this.cursor < this.subjects.length) {
      const subject = this.subjects[this.cursor++]!;
      const nearest = this.candidates(subject, this.level);
      // among the skills at the nearest grade the engine's own picker chooses one
      const lowest = nearest[0] ? Math.abs(nearest[0].grade - this.level) : 0;
      const pool = nearest.filter((s) => Math.abs(s.grade - this.level) === lowest);
      const shuffled = [...pool];
      this.engine.rng.shuffle(shuffled);
      const order = [...shuffled, ...nearest.filter((s) => !pool.includes(s))].slice(0, TRIES);
      for (const skill of order) {
        // the placement is not a lesson: no worked example
        this.engine.learner.worked_examples.add(skill.id);
        // a right-or-wrong question is a coin toss: ask another form of the skill, when it has one
        let session: QuizSession | null = null;
        for (let t = 0; t < FORM_TRIES; t++) {
          const s = new QuizSession(
            this.engine,
            { topic: skill.id, context: "placement", maxChoices: this.opts.maxChoices },
            this.opts.clock,
            () => {},
            this.opts.warn,
          );
          if (!s.question) break;
          session = s;
          if (s.question.kind !== "true_false") break;
        }
        if (session?.question) {
          this.open = { subject, level: this.level, session };
          return session;
        }
      }
    }
    return null;
  }

  /** The question just asked was answered (or given up on): moves the level. */
  answered(session: QuizSession): void {
    const open = this.open;
    if (!open || open.session !== session) return;
    this.open = null;
    const correct = session.outcome?.correct === true;
    this.history.push({ subject: open.subject, level: open.level, skill: session.question!.skill_id, correct });
    this.level = this.clamp(open.level + (correct ? 1 : -1));
  }

  /** A start level for every subject the learner has. */
  result(): PlacementResult {
    const levels: Record<string, number> = {};
    for (const subject of this.engine.content.subjects()) {
      const skills = this.engine.content.bySubject(subject);
      if (!skills.length) continue;
      const top = Math.max(...skills.map((s) => s.grade));
      const asked = this.history.find((h) => h.subject === subject);
      const start = asked ? (asked.correct ? asked.level : Math.max(0, asked.level - 1)) : this.level;
      levels[subject] = Math.max(0, Math.min(start, top));
    }
    return { levels, level: this.level };
  }

  /** Puts the result on the learner. */
  apply(): PlacementResult {
    const r = this.result();
    for (const [subject, level] of Object.entries(r.levels)) this.engine.learner.subject_grade.set(subject, level);
    return r;
  }
}
