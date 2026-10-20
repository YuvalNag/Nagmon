/**
 * The progress snapshot (port of nagmon/field_data/snapshot.py;
 * docs/kids/SDD_FIELD_DATA.md §2.3): what each child practised, as
 * numbers, so a problem can be found without the child's data leaving the
 * phone.
 *
 * Only fields chosen here go in; nothing is copied wholesale. Out stay
 * names and profile ids (children are `child-1`, `child-2`... in the
 * order of who-plays), free text, the answer log, the PIN, keys and the
 * exact place (the city stays: it sets Shabbat times).
 *
 * Not yet in this app, so not in the snapshot: minutes played per day and
 * practice days (screen time, M8) and the AI settings (M7).
 */
import { type ParentSettings, limitsFor, weeklyDaysFor } from "../family/parent";
import type { Profile } from "../family/profiles";
import { type JsonObject, type JsonValue, isJsonObject } from "../../platform/storage";

export const SCHEMA_VERSION = 1;

export interface SnapshotInput {
  /** In the order of who-plays. */
  profiles: readonly Profile[];
  /** learning.json of a profile ({} when none). */
  learner: (id: string) => Promise<JsonObject>;
  settings: ParentSettings;
  build: { version: string; build: string };
  now: Date;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** A day in the family's time zone, from seconds since the epoch. */
function day(seconds: number, tz: string): string | null {
  if (seconds <= 0) return null;
  try {
    // en-CA writes YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(seconds * 1000),
    );
  } catch {
    return new Date(seconds * 1000).toISOString().slice(0, 10);
  }
}

interface Subject {
  attempts: number;
  correct: number;
  mastered: number;
  stars: number;
  success: number | null;
  skills: Record<string, JsonObject>;
}

function subjects(learner: JsonObject, tz: string): Record<string, Subject> {
  const out: Record<string, Subject> = Object.create(null);
  const subject = (sid: string): Subject =>
    (out[sid] ??= { attempts: 0, correct: 0, mastered: 0, stars: 0, success: null, skills: {} });
  const skills = isJsonObject(learner.skills) ? learner.skills : {};
  for (const [skillId, stats] of Object.entries(skills)) {
    if (!isJsonObject(stats)) continue;
    const n = Math.trunc(num(stats.n));
    const correct = Math.trunc(num(stats.correct));
    const entry = subject(skillId.split(".")[0]!);
    entry.attempts += n;
    entry.correct += correct;
    entry.skills[skillId] = {
      attempts: n,
      success: n ? round3(correct / n) : null,
      rating: round3(num(stats.theta)),
      last: day(num(stats.last), tz),
    };
  }
  const mastered = isJsonObject(learner.mastered) ? learner.mastered : {};
  for (const skillId of Object.keys(mastered)) subject(skillId.split(".")[0]!).mastered += 1;
  const stars = isJsonObject(learner.stars) ? learner.stars : {};
  for (const [sid, count] of Object.entries(stars)) subject(sid).stars = Math.trunc(num(count));
  for (const entry of Object.values(out)) entry.success = entry.attempts ? round3(entry.correct / entry.attempts) : null;
  return { ...out };
}

function age(p: Profile, now: Date): number | null {
  return p.birthYear === null ? null : now.getUTCFullYear() - p.birthYear;
}

/** The family's progress as JSON, without names or ids. */
export async function progressSnapshot(input: SnapshotInput): Promise<JsonObject> {
  const s = input.settings;
  const tz = s.location.tz;
  const children: JsonValue[] = [];
  for (const [i, p] of input.profiles.entries()) {
    const learner = await input.learner(p.id).catch(() => ({}) as JsonObject);
    children.push({
      child: `child-${i + 1}`,
      grade: p.grade,
      language_level: p.languageLevel,
      subjects: subjects(learner, tz) as unknown as JsonObject,
      answers_total: Math.trunc(num(learner.answers_total)),
      correct_total: Math.trunc(num(learner.correct_total)),
      limits: structuredClone(limitsFor(s, p.id)),
      weekly_days_target: weeklyDaysFor(s, p.id, age(p, input.now)),
    });
  }
  return {
    schema_version: SCHEMA_VERSION,
    created: input.now.toISOString().replace(/\.\d+Z$/, "Z"),
    app: { version: input.build.version, build: input.build.build },
    settings: {
      city: s.location.cityHe,
      tz,
      candle_minutes: s.location.candleMinutes,
      shabbat_mode: s.shabbatMode,
      holiday_mode: s.holidayMode,
      shabbat_stop_before_minutes: s.shabbatStopBeforeMinutes,
      default_limits: structuredClone(s.defaultLimits),
      values: {
        kindness_quests: s.values.kindnessQuests,
        gentle_battle_wording: s.values.gentleBattleWording,
        modesty_filter: s.values.modestyFilter,
        emphasis: [...s.values.emphasis],
      },
      ai_provider: s.ai.provider,
    },
    children,
  };
}
