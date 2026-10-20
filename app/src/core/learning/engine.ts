/**
 * LearningEngine: the contract from SDD_ARCHITECTURE section 4, a port of
 * `engine.py`. The screens call `nextQuestion`, `hint`, `submit`, and
 * `save` after every answer (the learner state as JSON).
 */
import type { ContentLibrary, Skill } from "./content";
import { buildDashboard, type DashboardData } from "./dashboard";
import { MISCONCEPTIONS } from "./generators/misconceptions";
import { ITEMS_MAX, type LearnerData, LearnerState, makeLogEntry } from "./learner";
import { checkAnswer, type CheckResult, displayAnswer, type Given, type Question } from "./model";
import { floorDiv, pyRound, pyRoundInt, strip } from "./py";
import { PyRandom, randomSeed } from "./random";
import { ageFactor, deadlineS, eloUpdate, logit, pCorrect, questionGuess } from "./rating";
import { QuestionSelector, type SelectOptions, type SelectorConfig } from "./selector";
import { type Clock, systemClock } from "./srs";

export type Quality = "super" | "correct" | "wrong";
export const MULTIPLIER: Readonly<Record<Quality, number>> = { super: 2.0, correct: 1.5, wrong: 1.0 };
export const WEAK_SUBJECT_BONUS = 2;
export const SUPER_BONUS = 1;

/** Seconds for an 11-year-old; scaled by age (x1 .. x2). */
export const BASE_SUPER_S: Readonly<Record<string, number>> = {
  choice: 6.0,
  true_false: 4.0,
  number: 8.0,
  order: 12.0,
  letters: 12.0,
  tap_figure: 6.0,
};

export function superThresholdS(kind: string, age: number | null | undefined): number {
  return (BASE_SUPER_S[kind] ?? 6.0) * ageFactor(age);
}

export interface AnswerOutcome {
  readonly correct: boolean;
  readonly quality: Quality;
  readonly misconception: string | null;
  readonly explanation_he: string;
  readonly coins: number;
  readonly newly_mastered: readonly string[];
  readonly streak: number;
  readonly power_multiplier: number;
  readonly correct_answer: string;
  readonly expected: number;
  readonly worked_example: boolean;
}

export interface SubjectProgress {
  readonly subject: string;
  /** Mastered / skills up to the learner's grade, 0..1. */
  readonly mastery: number;
  readonly stars: number;
  readonly frontier_skills: readonly string[];
  readonly mastered_skills: readonly string[];
  readonly skills_total: number;
}

export interface Hint {
  readonly text_he: string;
  /** Choice ids the UI may grey out. */
  readonly eliminate: readonly string[];
}

export interface SubmitOptions {
  elapsed_s: number;
  context?: string;
  hint_used?: boolean;
  dont_know?: boolean;
}

export interface EngineOptions {
  rng?: PyRandom;
  clock?: Clock;
  config?: Partial<SelectorConfig>;
}

const FIRST_STEP = /^(.*?)(?::|\.\s)/;

export class LearningEngine {
  readonly content: ContentLibrary;
  readonly learner: LearnerState;
  readonly rng: PyRandom;
  readonly clock: Clock;
  readonly selector: QuestionSelector;
  /** In-session combo, never persisted. */
  streak = 0;

  constructor(content: ContentLibrary, learner: LearnerState, opts: EngineOptions = {}) {
    this.content = content;
    this.learner = learner;
    this.rng = opts.rng ?? new PyRandom(randomSeed());
    this.clock = opts.clock ?? systemClock;
    learner.srs.clock = this.clock;
    this.selector = new QuestionSelector(content, learner, this.rng, this.clock, opts.config);
  }

  /** An engine for a saved learner (`save()` output, or an old `learning.json`). */
  static restore(content: ContentLibrary, saved: Readonly<Record<string, unknown>>, opts: EngineOptions = {}): LearningEngine {
    return new LearningEngine(content, LearnerState.fromDict(saved), opts);
  }

  /** The learner state to write to `learning.json` after every answer. */
  save(): LearnerData {
    return this.learner.toDict();
  }

  // -- questions -----------------------------------------------------------------
  nextQuestion(opts: SelectOptions = {}): Question {
    return this.selector.select(opts);
  }

  expectedSuccess(q: Question): number {
    return this.selector.expected(q);
  }

  /** A first step: drop one wrong choice, or the first worked step. */
  hint(q: Question): Hint {
    if ((q.kind === "choice" || q.kind === "tap_figure") && q.choices.length > 2) {
      const wrong = q.choices.filter((c) => c.id !== q.answer);
      const plainAll = wrong.filter((c) => !(c.id in q.misconceptions));
      const drop = this.rng.choice(plainAll.length ? plainAll : wrong);
      return { text_he: `אפשר לפסול את התשובה "${drop.text_he}".`, eliminate: [drop.id] };
    }
    let text = q.meta["hint_he"] as string | undefined;
    if (!text) {
      const m = FIRST_STEP.exec(q.explanation_he || "");
      const step = m ? strip(m[1]!) : "";
      const answer = displayAnswer(q);
      if (step && !step.includes(answer)) text = `רמז: ${step}.`;
      else text = "רמז: קראו שוב את השאלה, ונסו צעד אחד בכל פעם.";
    }
    return { text_he: text, eliminate: [] };
  }

  // -- answers -------------------------------------------------------------------
  /** Check, rate, schedule, log and reward one answer. `given` null = "I don't know". */
  submit(q: Question, given: Given, opts: SubmitOptions): AnswerOutcome {
    const elapsedS = opts.elapsed_s;
    const context = opts.context ?? "battle";
    const hintUsed = opts.hint_used ?? false;
    const now = this.clock();
    const learner = this.learner;
    const dk = (opts.dont_know ?? false) || given === null || given === undefined;
    const res: CheckResult = dk ? { correct: false, normalized: null, misconception: null } : checkAnswer(q, given);
    const correct = res.correct;
    const mis = dk ? null : res.misconception;
    const skill = this.content.get(q.skill_id);
    const worked = Boolean(q.meta["worked_example"]);
    const st = learner.skill(q.skill_id, skill ? skill.grade : null);
    const it = learner.item(q.item_id);
    const bEff = q.difficulty + it.b_offset;
    const guess = questionGuess(q);
    const expected = pCorrect(st.theta, bEff, guess);
    const timer = learner.timerOn;

    let newly: string[] = [];
    if (!worked) {
      const weight = dk || (hintUsed && correct) ? 0.5 : 1.0;
      const upd = eloUpdate(st.theta, bEff, correct, {
        guess,
        nLearner: st.n,
        nItem: it.n,
        elapsedS,
        deadlineS: deadlineS(q.kind, learner.age),
        timer: timer && !hintUsed,
        weight,
      });
      st.theta = upd.theta;
      it.b_offset = upd.b - q.difficulty;
      it.n += 1;
      it.last = now;
      st.n += 1;
      st.correct += correct ? 1 : 0;
      st.push(correct);
      st.last = now;
      if (mis) st.misconceptions[mis] = (st.misconceptions[mis] ?? 0) + 1;
      if ((skill !== undefined && skill.srs) || q.source === "bank") {
        const seed = q.meta["seed"];
        learner.srs.review(q.item_id, q.skill_id, typeof seed === "number" ? seed : null, correct, { hinted: hintUsed, now });
      }
      if (learner.items.size > ITEMS_MAX + 200) learner.pruneItems();
      if (skill !== undefined && this.masteredNow(skill)) {
        learner.mastered.set(skill.id, now);
        learner.stars.set(skill.subject, (learner.stars.get(skill.subject) ?? 0) + 1);
        newly = [skill.id];
      }
    }

    let quality: Quality;
    if (correct) {
      const fast = elapsedS <= superThresholdS(q.kind, learner.age);
      quality = timer && fast && !hintUsed && !worked ? "super" : "correct";
    } else {
      quality = "wrong";
    }
    const coins = this.coins(q, correct, quality, expected, hintUsed, worked);
    this.streak = correct ? this.streak + 1 : 0;

    const word = q.meta["word"];
    if (correct && word && !learner.words.has(String(word))) learner.words.set(String(word), now);
    learner.logAnswer(
      makeLogEntry({
        ts: now,
        skill: q.skill_id,
        item: q.item_id,
        subject: q.subject,
        correct,
        quality,
        elapsed: Number(elapsedS),
        context,
        mis,
        hint: hintUsed,
        dk,
        worked,
      }),
    );
    learner.answers_total += 1;
    learner.correct_total += correct ? 1 : 0;
    learner.coins_total += coins;
    learner.time_total_s += Number(elapsedS);

    let explanation = q.explanation_he;
    if (mis && mis in MISCONCEPTIONS) explanation = strip(`${MISCONCEPTIONS[mis]!.hint_he} ${explanation}`);
    return {
      correct,
      quality,
      misconception: mis,
      explanation_he: explanation,
      coins,
      newly_mastered: newly,
      streak: this.streak,
      power_multiplier: MULTIPLIER[quality],
      correct_answer: displayAnswer(q),
      expected: pyRound(expected, 4),
      worked_example: worked,
    };
  }

  private masteredNow(skill: Skill): boolean {
    if (this.learner.mastered.has(skill.id)) return false;
    const st = this.learner.skills.get(skill.id)!;
    const rule = skill.mastery;
    const acc = st.recentAccuracy(10);
    return st.n >= rule.min_attempts && st.theta >= logit(rule.threshold) && acc !== null && acc >= rule.threshold;
  }

  private coins(q: Question, correct: boolean, quality: Quality, expected: number, hintUsed: boolean, worked: boolean): number {
    if (!correct) return 0;
    if (worked) return 1;
    let coins = 1 + pyRoundInt(3 * (1 - expected));
    if (this.weakSubjects().includes(q.subject)) coins += WEAK_SUBJECT_BONUS;
    if (quality === "super") coins += SUPER_BONUS;
    if (hintUsed) coins = Math.max(1, floorDiv(coins, 2));
    return coins;
  }

  // -- progress ------------------------------------------------------------------
  private relevant(subject: string): Skill[] {
    const skills = this.content.bySubject(subject);
    const rel = skills.filter((s) => s.grade <= this.learner.grade);
    if (rel.length) return rel;
    const low = skills.length ? Math.min(...skills.map((x) => x.grade)) : 0;
    return skills.filter((s) => s.grade === low);
  }

  masteryFraction(subject: string): number {
    const rel = this.relevant(subject);
    if (!rel.length) return 0.0;
    const done = rel.filter((s) => this.learner.mastered.has(s.id)).length;
    return done / rel.length;
  }

  /** Subjects within 2 points of the lowest mastery, when the spread is 5 points or more. */
  weakSubjects(): string[] {
    const all = this.learner.enabledSubjects ?? this.content.subjects();
    const subjects = all.filter((s) => this.content.bySubject(s).length);
    if (subjects.length < 2) return [];
    const fr = new Map(subjects.map((s) => [s, this.masteryFraction(s)] as const));
    const values = [...fr.values()];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    if (hi - lo < 0.05) return [];
    return [...fr.entries()].filter(([, v]) => v <= lo + 0.02).map(([s]) => s);
  }

  subjectProgress(subject: string): SubjectProgress {
    const skills = this.content.bySubject(subject);
    return {
      subject,
      mastery: pyRound(this.masteryFraction(subject), 4),
      stars: this.learner.stars.get(subject) ?? 0,
      frontier_skills: this.selector.frontierSkills(subject),
      mastered_skills: skills.filter((s) => this.learner.mastered.has(s.id)).map((s) => s.id),
      skills_total: skills.length,
    };
  }

  dashboard(): DashboardData {
    return buildDashboard(this.learner, this.content, this.clock());
  }
}
