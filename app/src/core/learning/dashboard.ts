/**
 * Parent dashboard: every number comes with a Hebrew explanation (a port
 * of `dashboard.py`).
 */
import type { ContentLibrary } from "./content";
import { MISCONCEPTIONS } from "./generators/misconceptions";
import type { LearnerState, LogEntry } from "./learner";
import { pyRoundInt } from "./py";
import { DAY } from "./srs";

export const SUBJECT_HE: Readonly<Record<string, string>> = {
  math: "חשבון",
  geometry: "גאומטריה",
  english: "אנגלית",
  science: "מדעים",
  logic: "חשיבה",
  hebrew: "עברית",
  family: "משפחה",
};
export const STRUGGLE_MIN_N = 6;
export const STRUGGLE_ACC = 0.6;

export interface Stat<T = unknown> {
  readonly value: T;
  readonly explanation_he: string;
}

export interface SubjectStats {
  readonly subject: string;
  readonly title_he: string;
  readonly accuracy_7d: Stat<number | null>;
  readonly accuracy_30d: Stat<number | null>;
  readonly answered_7d: Stat<number>;
  readonly time_7d_s: Stat<number>;
  readonly mastered: Stat<number>;
  readonly stars: Stat<number>;
}

export interface MisconceptionStat {
  readonly tag: string;
  readonly count: number;
  readonly text_he: string;
}

export interface StrugglingSkill {
  readonly skill_id: string;
  readonly title_he: string;
  readonly accuracy: Stat<number>;
  readonly misconceptions: readonly MisconceptionStat[];
}

export interface MasteredSkill {
  readonly skill_id: string;
  readonly title_he: string;
  readonly ts: number;
}

export interface DashboardData {
  readonly generated_at: number;
  readonly learner_name: string;
  readonly subjects: Readonly<Record<string, SubjectStats>>;
  readonly time_7d_s: Stat<number>;
  readonly time_30d_s: Stat<number>;
  readonly answered_total: Stat<number>;
  readonly mastered_skills: readonly MasteredSkill[];
  readonly struggling: readonly StrugglingSkill[];
  readonly new_english_words: Stat<readonly string[]>;
}

function minutes(seconds: number): string {
  const m = pyRoundInt(seconds / 60);
  if (seconds && m === 0) return "פחות מדקה";
  return m === 1 ? "דקה אחת" : `${m} דקות`;
}

function accuracy(entries: readonly LogEntry[], days: number): Stat<number | null> {
  const n = entries.length;
  if (n === 0) return { value: null, explanation_he: `אין עדיין תשובות ב־${days} הימים האחרונים.` };
  const c = entries.filter((e) => e.correct).length;
  const pct = pyRoundInt((100 * c) / n);
  return { value: c / n, explanation_he: `${pct}% הצלחה = ${c} נכונות מתוך ${n} ב־${days} הימים האחרונים.` };
}

function time(entries: readonly LogEntry[], days: number, what = ""): Stat<number> {
  const total = entries.reduce((a, e) => a + e.elapsed, 0);
  return {
    value: total,
    explanation_he: `${minutes(total)} של מענה על ${entries.length} שאלות` + `${what} ב־${days} הימים האחרונים (סכום זמני המענה).`,
  };
}

function since(log: readonly LogEntry[], now: number, days: number): LogEntry[] {
  const start = now - days * DAY;
  return log.filter((e) => e.ts >= start);
}

/** Counter.most_common(k): by count, ties in first-seen order. */
function mostCommon(xs: readonly string[], k: number): [string, number][] {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
}

export function buildDashboard(learner: LearnerState, content: ContentLibrary, now: number): DashboardData {
  const log = [...learner.log];
  const last7 = since(log, now, 7);
  const last30 = since(log, now, 30);
  const subjects = [...(learner.enabledSubjects ?? content.subjects())];
  for (const e of log) if (!subjects.includes(e.subject)) subjects.push(e.subject);
  const per: Record<string, SubjectStats> = {};
  for (const subj of subjects) {
    const s7 = last7.filter((e) => e.subject === subj);
    const s30 = last30.filter((e) => e.subject === subj);
    const title = SUBJECT_HE[subj] ?? subj;
    const nMastered = [...learner.mastered.keys()].filter((sid) => sid.split(".")[0] === subj).length;
    const stars = learner.stars.get(subj) ?? 0;
    per[subj] = {
      subject: subj,
      title_he: title,
      accuracy_7d: accuracy(s7, 7),
      accuracy_30d: accuracy(s30, 30),
      answered_7d: { value: s7.length, explanation_he: `${s7.length} שאלות ב${title} נענו ב־7 הימים האחרונים.` },
      time_7d_s: time(s7, 7, ` ב${title}`),
      mastered: {
        value: nMastered,
        explanation_he: `${nMastered} מיומנויות ב${title} ` + "נשלטו: דירוג גבוה, מספיק ניסיונות " + "ודיוק של 80% לפחות לאחרונה.",
      },
      stars: { value: stars, explanation_he: `${stars} כוכבי ידע ב${title}: כוכב אחד על כל מיומנות שנשלטה.` },
    };
  }
  const mastered = [...learner.mastered.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([sid, ts]) => ({ skill_id: sid, title_he: content.get(sid)?.title_he ?? sid, ts }));
  const struggling: StrugglingSkill[] = [];
  const bySkill = new Map<string, LogEntry[]>();
  for (const e of last30) {
    if (!bySkill.has(e.skill)) bySkill.set(e.skill, []);
    bySkill.get(e.skill)!.push(e);
  }
  for (const [sid, entries] of bySkill) {
    const n = entries.length;
    const c = entries.filter((e) => e.correct).length;
    if (n < STRUGGLE_MIN_N || c / n >= STRUGGLE_ACC) continue;
    const tags = mostCommon(
      entries.map((e) => e.mis).filter((m): m is string => !!m),
      3,
    );
    const mis = tags.map(([t, k]) => ({ tag: t, count: k, text_he: MISCONCEPTIONS[t]?.parent_he ?? t }));
    const title = content.get(sid)?.title_he ?? sid;
    let expl = `${c} נכונות מתוך ${n} ב־30 הימים האחרונים (${pyRoundInt((100 * c) / n)}%).`;
    if (mis.length) expl += ` טעות חוזרת: "${mis[0]!.text_he}" (${mis[0]!.count} ` + "פעמים). מומלץ תרגול ממוקד.";
    struggling.push({ skill_id: sid, title_he: title, accuracy: { value: c / n, explanation_he: expl }, misconceptions: mis });
  }
  struggling.sort((a, b) => a.accuracy.value - b.accuracy.value);
  const words = [...learner.words.entries()]
    .sort((a, b) => a[1] - b[1])
    .filter(([, ts]) => ts >= now - 7 * DAY)
    .map(([w]) => w);
  return {
    generated_at: now,
    learner_name: learner.name,
    subjects: per,
    time_7d_s: time(last7, 7),
    time_30d_s: time(last30, 30),
    answered_total: {
      value: learner.answers_total,
      explanation_he: `${learner.answers_total} שאלות מאז ההתחלה, ` + `${learner.correct_total} מהן נכונות.`,
    },
    mastered_skills: mastered,
    struggling,
    new_english_words: { value: words, explanation_he: `${words.length} מילים באנגלית שנענו נכון לראשונה ב־7 ` + "הימים האחרונים." },
  };
}
