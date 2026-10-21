/**
 * What a parent reads about one child (the parents' dashboard): for each
 * subject the level the child works at now (the adaptive level, with its
 * trend against the grade it started at), accuracy, time and helpers of
 * the last week; the three weakest skills in plain words; the days played
 * this week; the creature book. Every number has one short line that
 * says what it means. Pure: no names, no ids of the child.
 *
 * The level is read from the answers, not guessed: the highest grade at
 * which the child answered at least 70% right over at least 5 answers in
 * the last 60 days. Too few answers: the start level, and the line says so.
 */
import { buildDashboard, SUBJECT_HE } from "./dashboard";
import type { ContentLibrary } from "./content";
import { MISCONCEPTIONS } from "./generators/misconceptions";
import type { LearnerState, LogEntry } from "./learner";
import { DAY } from "./srs";

export const LEVEL_MIN_ANSWERS = 5;
export const LEVEL_PASS = 0.7;
export const LEVEL_DAYS = 60;
export const WEAK_MIN_TRIES = 3;
export const WEAK_BELOW = 0.8;

export type Trend = "up" | "down" | "same";

export interface LevelCard {
  /** The grade the child works at now, 0 (kindergarten) to 9. */
  current: number;
  /** The grade the subject started at (the child's grade, the owl's placement or the parent's choice). */
  start: number;
  trend: Trend;
  /** There are enough answers to say; otherwise `current` is the start level. */
  enough: boolean;
  note: string;
}

export interface SubjectCard {
  subject: string;
  title: string;
  level: LevelCard;
  accuracy: { value: number | null; note: string };
  answered: { value: number };
  time: { seconds: number; note: string };
  helpers: { hints: number; dontKnow: number; note: string };
}

export interface WeakSkill {
  skill: string;
  title: string;
  subject: string;
  subjectTitle: string;
  tried: number;
  right: number;
  note: string;
}

export interface ChildReport {
  subjects: SubjectCard[];
  weakest: WeakSkill[];
  week: { days: boolean[]; active: number; note: string };
  bestiary: { seen: number; caught: number; note: string };
}

export interface ReportInput {
  learner: LearnerState;
  content: ContentLibrary;
  /** Seconds since the epoch (the engine's clock). */
  now: number;
  world: { seen: Iterable<string>; caught: Iterable<string> };
  /** A timestamp's day in the phone's time, `YYYY-MM-DD`. */
  localDay: (ts: number) => string;
}

/** Hebrew grade names with a geresh: "כיתה ג׳"; 0 is "גן". */
const LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
export function gradeLabel(g: number): string {
  return g <= 0 ? "גן" : `כיתה ${LETTERS[g - 1] ?? g}׳`;
}

const titleOf = (subject: string) => SUBJECT_HE[subject] ?? subject;

function levelOf(learner: LearnerState, content: ContentLibrary, subject: string, now: number): LevelCard {
  const start = learner.gradeIn(subject);
  const from = now - LEVEL_DAYS * DAY;
  const byGrade = new Map<number, { n: number; c: number }>();
  let total = 0;
  for (const e of learner.log) {
    if (e.subject !== subject || e.ts < from || e.worked) continue;
    const skill = content.get(e.skill);
    if (!skill) continue;
    const g = byGrade.get(skill.grade) ?? { n: 0, c: 0 };
    g.n++;
    if (e.correct) g.c++;
    byGrade.set(skill.grade, g);
    total++;
  }
  if (total < LEVEL_MIN_ANSWERS) {
    return { current: start, start, trend: "same", enough: false, note: `עוד אין מספיק תשובות כדי לדעת (צריך לפחות ${LEVEL_MIN_ANSWERS}). עד אז הרמה היא כיתת ההתחלה, ${gradeLabel(start)}.` };
  }
  const solid = [...byGrade.entries()].filter(([, v]) => v.n >= LEVEL_MIN_ANSWERS).sort((a, b) => a[0] - b[0]);
  const good = solid.filter(([, v]) => v.c / v.n >= LEVEL_PASS);
  let current: number;
  if (good.length) current = good[good.length - 1]![0];
  else if (solid.length) current = Math.max(0, solid[0]![0] - 1);
  else current = start;
  const trend: Trend = current > start ? "up" : current < start ? "down" : "same";
  const note =
    trend === "up"
      ? `ב־${LEVEL_DAYS} הימים האחרונים עונה נכון ברוב השאלות ברמת ${gradeLabel(current)}, מעל כיתת ההתחלה (${gradeLabel(start)}).`
      : trend === "down"
        ? `בשאלות של ${gradeLabel(start)} יש עוד קשיים, אז המשחק מתרגל עכשיו ברמה נמוכה יותר (${gradeLabel(current)}). זה זמני ואפשר לעלות שוב.`
        : `הרמה יציבה: עונה נכון ברוב השאלות ברמת כיתת ההתחלה, ${gradeLabel(start)}.`;
  return { current, start, trend, enough: true, note };
}

function weakest(learner: LearnerState, content: ContentLibrary): WeakSkill[] {
  const rows: (WeakSkill & { acc: number })[] = [];
  for (const [id, st] of learner.skills) {
    if (learner.mastered.has(id)) continue;
    const skill = content.get(id);
    const recent = st.recent.slice(-10);
    if (!skill || recent.length < WEAK_MIN_TRIES) continue;
    const right = recent.reduce((a, b) => a + b, 0);
    const acc = right / recent.length;
    if (acc >= WEAK_BELOW) continue;
    const top = Object.entries(st.misconceptions).sort((a, b) => b[1] - a[1])[0];
    const slip = top && MISCONCEPTIONS[top[0]] ? ` טעות חוזרת: ${MISCONCEPTIONS[top[0]]!.parent_he}.` : " כדאי לתרגל עוד קצת.";
    rows.push({
      skill: id,
      title: skill.title_he,
      subject: skill.subject,
      subjectTitle: titleOf(skill.subject),
      tried: recent.length,
      right,
      acc,
      note: `${right} מתוך ${recent.length} נכונות בתשובות האחרונות.${slip}`,
    });
  }
  rows.sort((a, b) => a.acc - b.acc || b.tried - a.tried);
  return rows.slice(0, 3).map(({ acc: _acc, ...w }) => w);
}

export function buildChildReport({ learner, content, now, world, localDay }: ReportInput): ChildReport {
  const dash = buildDashboard(learner, content, now);
  const last7: LogEntry[] = learner.log.filter((e) => e.ts >= now - 7 * DAY);
  const on = learner.enabledSubjects ?? content.subjects();
  const subjects: SubjectCard[] = content.subjects().filter((s) => on.includes(s)).map((subject) => {
    const stats = dash.subjects[subject]!;
    const mine = last7.filter((e) => e.subject === subject);
    const hints = mine.filter((e) => e.hint).length;
    const dontKnow = mine.filter((e) => e.dk).length;
    return {
      subject,
      title: stats.title_he,
      level: levelOf(learner, content, subject, now),
      accuracy: { value: stats.accuracy_7d.value, note: stats.accuracy_7d.explanation_he },
      answered: { value: stats.answered_7d.value },
      time: { seconds: stats.time_7d_s.value, note: stats.time_7d_s.explanation_he },
      helpers: {
        hints,
        dontKnow,
        note: `${hints} פעמים עם רמז או עזר, ו־${dontKnow} פעמים "לא יודע/ת" ב־7 הימים האחרונים. זה חלק רגיל מהלמידה, לא ציון.`,
      },
    };
  });

  const activeDays = new Set(learner.log.map((e) => localDay(e.ts)));
  const days: boolean[] = [];
  for (let back = 6; back >= 0; back--) days.push(activeDays.has(localDay(now - back * DAY)));
  const active = days.filter(Boolean).length;

  const caught = new Set(world.caught);
  const seen = new Set([...world.seen, ...caught]);
  return {
    subjects,
    weakest: weakest(learner, content),
    week: { days, active, note: `יום נחשב פעיל אם נענתה בו לפחות שאלה אחת: ${active} מתוך 7 הימים האחרונים.` },
    bestiary: { seen: seen.size, caught: caught.size, note: `נתפסו ${caught.size} חיות ונראו ${seen.size} (חיה שנתפסה נחשבת גם כנראית).` },
  };
}
