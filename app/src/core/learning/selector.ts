/**
 * Next-question selection (SDD_LEARNING section 6), a port of
 * `selector.py`: 70% frontier, 20% review, 10% stretch, plus parent focus,
 * interleaving in battle, balanced boss tests and a worked example on a
 * skill's first appearance.
 */
import type { ContentLibrary, Skill } from "./content";
import { genContext, type GenContext } from "./generators/common";
import type { LearnerState } from "./learner";
import type { Question } from "./model";
import { pyRound } from "./py";
import { PyRandom } from "./random";
import { initialTheta, pCorrect, questionGuess } from "./rating";
import { type Clock, DAY, systemClock } from "./srs";

export const FRONTIER = "frontier";
export const REVIEW = "review";
export const STRETCH = "stretch";
export const INTERLEAVE = "interleave";
export const FOCUS = "focus";
export const BOSS = "boss";
export const FORCED = "forced";
export const ANY = "any";

export interface SelectorConfig {
  frontier: number;
  review: number;
  stretch: number;
  interleave_in_battle: number;
  focus_share: number;
  focus_weight: number;
  candidates: number;
  recent_n: number;
  stale_days: number;
  target_jitter: number;
  struggling_min_n: number;
  struggling_acc: number;
  remedial_min_n: number;
  closeness_floor: number;
}

export const DEFAULT_SELECTOR_CONFIG: Readonly<SelectorConfig> = {
  frontier: 0.7,
  review: 0.2,
  stretch: 0.1,
  interleave_in_battle: 0.3,
  focus_share: 0.6,
  focus_weight: 4.0,
  candidates: 8,
  recent_n: 8,
  stale_days: 14.0,
  target_jitter: 0.025,
  struggling_min_n: 5,
  struggling_acc: 0.5,
  remedial_min_n: 4,
  closeness_floor: 0.05,
};

export interface SelectOptions {
  subject?: string | null;
  skill_id?: string | null;
  skill_ids?: readonly string[] | null;
  /** "battle" | "practice" | "boss" | "shop"... */
  context?: string;
  max_choices?: number | null;
  difficulty_bias?: number;
}

/** A recent-items window of fixed length (Python's `deque(maxlen=n)`). */
class Recent {
  private readonly items: string[] = [];

  constructor(
    private readonly maxlen: number,
    init: readonly string[],
  ) {
    for (const i of init) this.push(i);
  }

  push(item: string): void {
    if (this.maxlen <= 0) return;
    this.items.push(item);
    if (this.items.length > this.maxlen) this.items.shift();
  }

  has(item: string): boolean {
    return this.items.includes(item);
  }
}

export class QuestionSelector {
  readonly content: ContentLibrary;
  readonly learner: LearnerState;
  readonly rng: PyRandom;
  readonly clock: Clock;
  readonly config: SelectorConfig;
  private readonly recent: Recent;
  private bossKey: readonly string[] = [];
  private bossCounts = new Map<string, number>();

  constructor(content: ContentLibrary, learner: LearnerState, rng: PyRandom, clock: Clock = systemClock, config?: Partial<SelectorConfig>) {
    this.content = content;
    this.learner = learner;
    this.rng = rng;
    this.clock = clock;
    this.config = { ...DEFAULT_SELECTOR_CONFIG, ...(config ?? {}) };
    const n = Math.trunc(Number(learner.settings["recent_n"] ?? this.config.recent_n));
    this.recent = new Recent(n, n > 0 ? learner.log.slice(-n).map((e) => e.item) : []);
  }

  // -- skill status ----------------------------------------------------------
  attempted(skillId: string): boolean {
    const st = this.learner.skills.get(skillId);
    return st !== undefined && st.n > 0;
  }

  mastered(skillId: string): boolean {
    return this.learner.mastered.has(skillId);
  }

  struggling(skillId: string): boolean {
    const st = this.learner.skills.get(skillId);
    if (st === undefined || st.n < this.config.struggling_min_n) return false;
    const acc = st.recentAccuracy(10);
    return acc !== null && acc < this.config.struggling_acc;
  }

  /** Below the learner's grade and no sign of difficulty. */
  assumed(skill: Skill): boolean {
    return skill.grade < this.learner.gradeIn(skill.subject) && !this.struggling(skill.id);
  }

  ok(skillId: string): boolean {
    if (this.mastered(skillId)) return true;
    const skill = this.content.get(skillId);
    return skill !== undefined && this.assumed(skill);
  }

  unlocked(skill: Skill): boolean {
    return skill.prereq.every((p) => this.ok(p));
  }

  isFrontier(skill: Skill): boolean {
    return (
      this.unlocked(skill) &&
      !this.mastered(skill.id) &&
      !this.assumed(skill) &&
      (skill.grade <= this.learner.gradeIn(skill.subject) || this.attempted(skill.id))
    );
  }

  isNew(skill: Skill): boolean {
    return (
      this.unlocked(skill) && !this.mastered(skill.id) && !this.assumed(skill) && !this.attempted(skill.id) && skill.grade > this.learner.gradeIn(skill.subject)
    );
  }

  eligible(subject: string | null = null, skillIds: readonly string[] | null = null): Skill[] {
    const enabled = this.learner.enabledSubjects;
    if (skillIds && skillIds.length) return skillIds.filter((s) => this.content.skills.has(s)).map((s) => this.content.skills.get(s)!);
    const out: Skill[] = [];
    for (const s of this.content.skills.values()) {
      if (subject !== null && s.subject !== subject) continue;
      if (subject === null && enabled && !enabled.includes(s.subject)) continue;
      out.push(s);
    }
    return out;
  }

  frontierSkills(subject: string): string[] {
    return this.content
      .bySubject(subject)
      .filter((s) => this.isFrontier(s))
      .map((s) => s.id);
  }

  // -- targets -----------------------------------------------------------------
  /** Current theta without creating stats for an unseen skill. */
  thetaOf(skillId: string): number {
    const st = this.learner.skills.get(skillId);
    if (st !== undefined) return st.theta;
    const skill = this.content.get(skillId);
    const own = this.learner.gradeIn(skill?.subject);
    return initialTheta(own, skill ? skill.grade : own);
  }

  theta(skill: Skill): number {
    return this.thetaOf(skill.id);
  }

  private jitter(target: number): number {
    const j = this.config.target_jitter;
    return Math.min(0.98, Math.max(0.3, target + this.rng.uniform(-j, j)));
  }

  private closeness(skill: Skill, target: number): number {
    const p0 = 1.0 / (1.0 + Math.exp(-this.theta(skill)));
    const st = this.learner.skills.get(skill.id);
    const mis = st ? Object.values(st.misconceptions).reduce((a, b) => a + b, 0) : 0;
    const w = this.config.closeness_floor + Math.exp(-(((p0 - target) / 0.15) ** 2));
    return w * (1.0 + 0.5 * Math.min(mis, 4));
  }

  private isFocus(skill: Skill): boolean {
    return this.learner.focus.some((f) => skill.id.startsWith(f));
  }

  private weighted(skills: readonly Skill[], weights: readonly number[]): Skill {
    return this.rng.choices(skills, weights, 1)[0]!;
  }

  // -- item choice -------------------------------------------------------------
  private ctx(skill: Skill, maxChoices: number | null): GenContext {
    return genContext({
      skill_id: skill.id,
      subject: skill.subject,
      grade: this.learner.gradeIn(skill.subject),
      age: this.learner.age,
      max_choices: maxChoices,
      prefer_kind: (this.learner.settings["answer_mode"] as string | undefined) ?? null,
    });
  }

  /** P(correct) for this learner, with the item's per-child offset. */
  expected(q: Question, bias = 0.0): number {
    const it = this.learner.items.get(q.item_id);
    const bv = q.difficulty + (it ? it.b_offset : 0.0);
    return pCorrect(this.thetaOf(q.skill_id), bv + bias, questionGuess(q));
  }

  /** Of `candidates` seeds, the item whose expected P is closest to `target`, skipping recent items. */
  bestItem(skill: Skill, target: number, maxChoices: number | null, bias: number): Question {
    const ctx = this.ctx(skill, maxChoices);
    let best: [number, Question] | null = null;
    let fallback: [number, Question] | null = null;
    const tries = this.config.candidates;
    let i = 0;
    while (i < tries || (best === null && i < tries * 4)) {
      const seed = this.rng.getrandbits(32);
      let q = this.content.generate(skill.id, new PyRandom(seed), ctx);
      q = { ...q, meta: { ...q.meta, seed } };
      const gap = Math.abs(this.expected(q, bias) - target);
      if (this.recent.has(q.item_id)) {
        if (fallback === null || gap < fallback[0]) fallback = [gap, q];
      } else if (best === null || gap < best[0]) {
        best = [gap, q];
        if (gap < 0.015) break;
      }
      i += 1;
    }
    const chosen = best ?? fallback;
    if (chosen === null) throw new Error(`no question for ${skill.id}`);
    return chosen[1];
  }

  // -- buckets -----------------------------------------------------------------
  /** Evidence that a frontier skill is out of reach for now. */
  tooHard(skill: Skill, target: number): boolean {
    const st = this.learner.skills.get(skill.id);
    if (st === undefined || st.n < this.config.remedial_min_n) return false;
    const acc = st.recentAccuracy(8) || 0.0;
    const p0 = 1.0 / (1.0 + Math.exp(-st.theta));
    return acc < target - 0.2 || p0 < target - 0.3;
  }

  private pickFrontier(pool: readonly Skill[], target: number): Skill | null {
    const cands = pool.filter((s) => this.isFrontier(s));
    if (!cands.length) return null;
    // Step back: prerequisites of a skill that is too hard right now.
    const names = new Set(cands.map((s) => s.id));
    for (const s of [...cands]) {
      if (!this.tooHard(s, target)) continue;
      for (const pid of s.prereq) {
        const pre = this.content.get(pid);
        if (pre !== undefined && !names.has(pid) && !this.mastered(pid)) {
          cands.push(pre);
          names.add(pid);
        }
      }
    }
    const weights = cands.map((s) => this.closeness(s, target) * (this.isFocus(s) ? this.config.focus_weight : 1.0));
    return this.weighted(cands, weights);
  }

  private pickInterleave(pool: readonly Skill[], target: number): Skill | null {
    const now = this.clock();
    const cands = pool.filter((s) => this.attempted(s.id));
    if (cands.length < 2) return null;
    const weights = cands.map((s) => {
      const days = (now - this.learner.skills.get(s.id)!.last) / DAY;
      return (1.0 + Math.min(Math.max(days, 0.0), 14.0)) * this.closeness(s, target);
    });
    return this.weighted(cands, weights);
  }

  private pickStretch(pool: readonly Skill[]): Skill | null {
    let cands = pool.filter((s) => this.isNew(s));
    if (!cands.length) return null;
    const low = Math.min(...cands.map((s) => s.grade));
    cands = cands.filter((s) => s.grade === low);
    return this.rng.choice(cands);
  }

  private pickReview(pool: readonly Skill[], maxChoices: number | null): Question | null {
    const ids = new Set(pool.map((s) => s.id));
    for (const card of this.learner.srs.due(this.clock(), (sid) => ids.has(sid))) {
      if (this.recent.has(card.item_id)) continue;
      const skill = this.content.skills.get(card.skill_id)!;
      const ctx = this.ctx(skill, maxChoices);
      if (card.seed === null || card.seed === undefined) return this.bestItem(skill, this.learner.targetReview, maxChoices, 0.0);
      const q = this.content.generate(skill.id, new PyRandom(card.seed), ctx);
      return { ...q, meta: { ...q.meta, seed: card.seed } };
    }
    const now = this.clock();
    const stale = pool.filter(
      (s) => this.mastered(s.id) && now - (this.learner.skills.get(s.id)?.last ?? 0.0) > this.config.stale_days * DAY,
    );
    if (stale.length) {
      const skill = this.rng.choice(stale);
      return this.bestItem(skill, this.learner.targetReview, maxChoices, 0.0);
    }
    return null;
  }

  // -- main entry ----------------------------------------------------------------
  /** The next question, with `meta.bucket`, `meta.expected` and maybe `meta.worked_example`. */
  select(opts: SelectOptions = {}): Question {
    const subject = opts.subject ?? null;
    const skillId = opts.skill_id ?? null;
    const skillIds = opts.skill_ids ?? null;
    const context = opts.context ?? "battle";
    const maxChoices = opts.max_choices ?? null;
    const targetF = this.learner.targetFrontier;
    const bias = opts.difficulty_bias ?? 0.0;
    let q: Question;
    let bucket = ANY;
    let workedOk = true;

    if (skillId !== null) {
      const skill = this.content.skill(skillId);
      q = this.bestItem(skill, this.jitter(targetF), maxChoices, bias);
      bucket = FORCED;
    } else if (context === "boss" && skillIds && skillIds.length) {
      if (skillIds.length !== this.bossKey.length || skillIds.some((s, i) => s !== this.bossKey[i])) {
        this.bossKey = [...skillIds];
        this.bossCounts = new Map();
      }
      const valid = skillIds.filter((s) => this.content.skills.has(s));
      const count = (s: string): number => this.bossCounts.get(s) ?? 0;
      const low = Math.min(...valid.map(count));
      const sid = this.rng.choice(valid.filter((s) => count(s) === low));
      this.bossCounts.set(sid, count(sid) + 1);
      q = this.bestItem(this.content.skill(sid), this.jitter(targetF), maxChoices, bias);
      bucket = BOSS;
      workedOk = false;
    } else {
      let pool = this.eligible(subject, skillIds);
      if (!pool.length) pool = this.eligible(null, null);
      const focus = pool.filter((s) => this.isFocus(s));
      if (focus.length && this.rng.random() < this.config.focus_share) {
        const weights = focus.map((s) => this.closeness(s, targetF));
        const skill = this.weighted(focus, weights);
        q = this.bestItem(skill, this.jitter(targetF), maxChoices, bias);
        bucket = FOCUS;
      } else {
        [q, bucket] = this.bucketed(pool, context, targetF, maxChoices, bias);
        workedOk = bucket !== REVIEW;
      }
    }
    return this.finish(q, bucket, workedOk);
  }

  private bucketed(pool: readonly Skill[], context: string, targetF: number, maxChoices: number | null, bias: number): [Question, string] {
    const c = this.config;
    const r = this.rng.random();
    let order: string[];
    if (r < c.frontier) order = [FRONTIER, REVIEW, STRETCH];
    else if (r < c.frontier + c.review) order = [REVIEW, FRONTIER, STRETCH];
    else order = [STRETCH, FRONTIER, REVIEW];
    for (const bucket of order) {
      if (bucket === FRONTIER) {
        if (context === "battle" && this.rng.random() < c.interleave_in_battle) {
          const skill = this.pickInterleave(pool, targetF);
          if (skill !== null) return [this.bestItem(skill, this.jitter(targetF), maxChoices, bias), INTERLEAVE];
        }
        const skill = this.pickFrontier(pool, targetF);
        if (skill !== null) return [this.bestItem(skill, this.jitter(targetF), maxChoices, bias), FRONTIER];
      } else if (bucket === REVIEW) {
        const q = this.pickReview(pool, maxChoices);
        if (q !== null) return [q, REVIEW];
      } else {
        const skill = this.pickStretch(pool);
        if (skill !== null) return [this.bestItem(skill, this.jitter(targetF), maxChoices, bias), STRETCH];
      }
    }
    const openAll = pool.filter((s) => this.unlocked(s) && !this.mastered(s.id));
    const open = openAll.length ? openAll : [...pool];
    const low = Math.min(...open.map((s) => s.grade));
    const near = open.filter((s) => s.grade <= Math.max(low, this.learner.gradeIn(s.subject)));
    const skill = this.rng.choice(near.length ? near : open);
    return [this.bestItem(skill, this.jitter(targetF), maxChoices, bias), ANY];
  }

  private finish(q: Question, bucket: string, workedOk: boolean): Question {
    const meta: Record<string, unknown> = { ...q.meta, bucket, expected: pyRound(this.expected(q), 6) };
    const learner = this.learner;
    if (
      workedOk &&
      learner.workedExamplesOn &&
      !learner.worked_examples.has(q.skill_id) &&
      !this.attempted(q.skill_id) &&
      q.explanation_he
    ) {
      meta["worked_example"] = true;
      learner.worked_examples.add(q.skill_id);
    }
    this.recent.push(q.item_id);
    return { ...q, meta };
  }
}
