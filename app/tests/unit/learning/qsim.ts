/// <reference types="node" />
/**
 * A headless child for the question audit (docs/app/QUESTION_AUDIT.md): draws questions
 * through the same QuizSession the battle uses and answers them the way a child of a
 * given grade would, so the variety, level and quality of what is served can be measured
 * and held by tests.
 */
import { Placement } from "../../../src/core/game/placement";
import { LearningEngine } from "../../../src/core/learning/engine";
import { LearnerState } from "../../../src/core/learning/learner";
import type { Question } from "../../../src/core/learning/model";
import { PyRandom } from "../../../src/core/learning/random";
import { pCorrect, questionGuess } from "../../../src/core/learning/rating";
import { QuizSession } from "../../../src/core/world/quiz";
import { FakeClock, library } from "./helpers";

export interface Served {
  i: number;
  skill: string;
  subject: string;
  skillGrade: number;
  /** The child's level in this subject when the question was drawn. */
  level: number;
  kind: string;
  prompt: string;
  /** The prompt with its numbers and quoted words normalised away. */
  shape: string;
  item: string;
  /** The generator or bank template the item came from. */
  template: string;
  bucket: string;
  expected: number;
  correct: boolean;
  q: Question;
}

export interface SimOptions {
  grade: number;
  /** One subject (a battle with a creature of that family), or null for all the subjects in turn. */
  subject: string | null;
  seed: number;
  n?: number;
  /** Run the owl's six placement questions first and start from what it found. */
  placement?: boolean;
  /** How the child's real level compares to the grade (in grades). */
  skill?: number;
  /** Subjects to rotate through when `subject` is null. */
  subjects?: readonly string[];
}

/** A child whose real level is this many grades above the grade the parent chose: right about 3 in 4 on the grade's own questions. */
export const ABILITY = 1.25;

export const BATTLE_SUBJECTS = ["math", "english", "science", "geometry", "logic", "hebrew"] as const;

/** Numbers, Latin words in quotes and spacing away: two prompts that differ only in those are the same shape. */
export function shapeOf(prompt: string): string {
  return prompt
    .replace(/[‎‏‪-‮⁦-⁩]/g, "")
    .replace(/\d+([.,/]\d+)?/g, "#")
    .replace(/["'״׳][^"'״׳]{1,40}["'״׳]/g, "'_'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The family of items an id belongs to (a generator, or a bank skill). */
export function templateOf(q: Question): string {
  if (q.source === "bank") return q.item_id.startsWith(q.skill_id) ? q.skill_id : `bank:${q.skill_id}`;
  const m = /^([^:]+)/.exec(q.item_id);
  return `${m ? m[1] : q.item_id}`;
}

export function childEngine(grade: number, seed: number, clock = new FakeClock()): LearningEngine {
  const learner = new LearnerState({ learner_id: `sim${grade}`, grade, age: grade + 6 });
  Object.assign(learner.settings, { timer: grade >= 3, ...(grade <= 1 ? { max_choices: 3 } : {}) });
  return new LearningEngine(library(), learner, { rng: new PyRandom(seed), clock: clock.call });
}

/** Answers a session right or wrong through the real input path. */
export function answer(session: QuizSession, right: boolean): void {
  const q = session.question!;
  if (session.phase === "example") session.exampleDone();
  if (q.kind === "number") {
    for (const ch of right ? String(q.answer) : "7777") session.press(ch);
    session.check();
  } else if (q.kind === "order") {
    const ans = [...(q.answer as readonly string[])];
    session.arrange(right ? ans : ans.reverse().length > 1 && ans.join() !== (q.answer as string[]).join() ? ans : [...ans.slice(1), ans[0]!]);
  } else if (q.kind === "letters") {
    session.spell(right ? String(q.answer) : "x");
  } else {
    const wrong = q.choices.find((c) => c.id !== String(q.answer));
    session.choose(right ? String(q.answer) : wrong!.id);
  }
  if (!session.outcome) session.dontKnow();
}

/** P(right) of a child whose real level is `grade + skill` on a question. */
export function childChance(grade: number, skillOffset: number, q: Question, skillGrade: number): number {
  const theta = 0.8 * (grade + skillOffset - skillGrade);
  return pCorrect(theta, q.difficulty, questionGuess(q));
}

export function simulate(o: SimOptions): { served: Served[]; placement: Record<string, number> | null } {
  const clock = new FakeClock();
  const eng = childEngine(o.grade, o.seed, clock);
  const lib = eng.content;
  const rnd = new PyRandom(o.seed * 7919 + 13);
  const ms = () => clock.now * 1000;
  const maxChoices = o.grade <= 1 ? 3 : null;
  let levels: Record<string, number> | null = null;
  const real = (q: Question, g: number) => rnd.random() < childChance(o.grade, o.skill ?? ABILITY, q, g);
  if (o.placement) {
    const p = new Placement(eng, { grade: o.grade, clock: ms, maxChoices });
    for (let s = p.next(); s; s = p.next()) {
      answer(s, real(s.question!, lib.get(s.question!.skill_id)!.grade));
      clock.now += 8;
      p.answered(s);
    }
    levels = p.apply().levels;
  }
  const subjects = o.subjects ?? BATTLE_SUBJECTS;
  const served: Served[] = [];
  const n = o.n ?? 300;
  for (let i = 0; i < n; i++) {
    const subject = o.subject ?? subjects[Math.floor(i / 5) % subjects.length]!;
    const session = new QuizSession(eng, { topic: subject, context: "battle", maxChoices, speed: false, kinds: ["order", "letters"] }, ms, () => {});
    const q = session.question;
    if (!q) continue;
    const skill = lib.get(q.skill_id)!;
    const level = eng.learner.gradeIn(skill.subject);
    const ok = real(q, skill.grade);
    served.push({
      i,
      skill: q.skill_id,
      subject: q.subject,
      skillGrade: skill.grade,
      level,
      kind: q.kind,
      prompt: q.prompt_he,
      shape: shapeOf(q.prompt_he),
      item: q.item_id,
      template: templateOf(q),
      bucket: String(q.meta["bucket"]),
      expected: Number(q.meta["expected"]),
      correct: ok,
      q,
    });
    answer(session, ok);
    clock.now += 8;
  }
  return { served, placement: levels };
}

export interface Metrics {
  n: number;
  /** Share of questions whose shape equals one of the previous 20. */
  repeatShape20: number;
  /** Share whose item id equals one of the previous 20. */
  repeatItem20: number;
  /** Mean distinct skills / templates in each window of 20. */
  skillsPer20: number;
  templatesPer20: number;
  /** Most times one skill was served twice-or-more in a row. */
  maxSkillRun: number;
  /** Share of the questions in a row of 3 or more of the same skill. */
  skillRun3: number;
  /** Served level minus the child's level: share below, at, above. */
  below: number;
  at: number;
  above: number;
  /** Largest gap, in grades, either way. */
  maxAbove: number;
  maxBelow: number;
  /** Share two or more grades off the level, where the subject has content nearer (not counting a subject whose content ends below the level). */
  offBand: number;
  kinds: Record<string, number>;
  subjects: Record<string, number>;
}

/** The grades a subject has skills for. */
export function gradeSpan(subject: string): { lo: number; hi: number } {
  const gs = library().bySubject(subject).map((k) => k.grade);
  return { lo: Math.min(...gs), hi: Math.max(...gs) };
}

export function metrics(s: readonly Served[]): Metrics {
  const n = s.length;
  let off = 0;
  let rs = 0;
  let ri = 0;
  let run = 1;
  let maxRun = 1;
  let inRun3 = 0;
  const kinds: Record<string, number> = {};
  const subjects: Record<string, number> = {};
  let below = 0;
  let at = 0;
  let above = 0;
  let maxAbove = 0;
  let maxBelow = 0;
  for (let i = 0; i < n; i++) {
    const x = s[i]!;
    const prev = s.slice(Math.max(0, i - 20), i);
    if (prev.some((p) => p.shape === x.shape && p.subject === x.subject)) rs++;
    if (prev.some((p) => p.item === x.item)) ri++;
    run = i > 0 && s[i - 1]!.skill === x.skill ? run + 1 : 1;
    maxRun = Math.max(maxRun, run);
    kinds[x.kind] = (kinds[x.kind] ?? 0) + 1;
    subjects[x.subject] = (subjects[x.subject] ?? 0) + 1;
    const d = x.skillGrade - x.level;
    if (d < 0) below++;
    else if (d === 0) at++;
    else above++;
    maxAbove = Math.max(maxAbove, d);
    maxBelow = Math.min(maxBelow, d);
    const span = gradeSpan(x.subject);
    const level = Math.max(span.lo, Math.min(span.hi, x.level));
    if (Math.abs(x.skillGrade - level) >= 2) off++;
  }
  // runs of 3+ of one skill
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && s[j + 1]!.skill === s[i]!.skill) j++;
    if (j - i + 1 >= 3) inRun3 += j - i + 1;
    i = j + 1;
  }
  let sk = 0;
  let tp = 0;
  let w = 0;
  for (let i = 0; i + 20 <= n; i += 20) {
    const win = s.slice(i, i + 20);
    sk += new Set(win.map((x) => x.skill)).size;
    tp += new Set(win.map((x) => x.template)).size;
    w++;
  }
  return {
    n,
    repeatShape20: rs / n,
    repeatItem20: ri / n,
    skillsPer20: sk / (w || 1),
    templatesPer20: tp / (w || 1),
    maxSkillRun: maxRun,
    skillRun3: inRun3 / n,
    below: below / n,
    at: at / n,
    above: above / n,
    maxAbove,
    maxBelow,
    offBand: off / n,
    kinds,
    subjects,
  };
}
