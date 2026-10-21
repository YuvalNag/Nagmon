import { type ChildReport, gradeLabel, type SubjectCard, type Trend } from "../../../core/learning/parentReport";
import { t } from "../../../i18n";
import { Bar } from "./Bar";

const TREND_TEXT = { up: "dashTrendUp", down: "dashTrendDown", same: "dashTrendSame" } as const;

/** A small arrow: up, down or level; the word is its name for a screen reader. */
function Arrow({ trend }: { trend: Trend }) {
  const d = trend === "up" ? "M12 19V6M6 11l6-6 6 6" : trend === "down" ? "M12 5v13M6 13l6 6 6-6" : "M5 12h14M14 7l5 5-5 5";
  return (
    <svg className="trend" data-trend={trend} viewBox="0 0 24 24" role="img" aria-label={t(TREND_TEXT[trend])}>
      <path d={d} />
    </svg>
  );
}

function minutesText(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (seconds > 0 && m === 0) return t("dashUnderMinute");
  return m === 1 ? t("dashMinuteOne") : t("dashMinutes", { minutes: m });
}

/** One number, what it is called, and one line that says what it means. */
function Stat({ id, value, name, note }: { id: string; value: string; name: string; note: string }) {
  return (
    <div className="stat" data-id={id}>
      <p className="stat-top">
        <b>{value}</b> <span>{name}</span>
      </p>
      <p className="note">{note}</p>
    </div>
  );
}

function Card({ c }: { c: SubjectCard }) {
  const pct = c.accuracy.value === null ? t("dashNoPercent") : `${Math.round(c.accuracy.value * 100)}%`;
  return (
    <article className="subject-card" data-subject={c.subject} data-trend={c.level.trend} data-level={c.level.current}>
      <h2 data-id={`level_${c.subject}`}>
        {c.title}: {gradeLabel(c.level.current)} <Arrow trend={c.level.trend} />
      </h2>
      <p className="chosen" data-id={`chosen_${c.subject}`}>
        {t("dashChosen", { grade: gradeLabel(c.level.start) })}
      </p>
      <p className="note">{c.level.note}</p>
      <Stat id={`accuracy_${c.subject}`} value={pct} name={t("dashAccuracy")} note={c.accuracy.note} />
      <Stat id={`time_${c.subject}`} value={minutesText(c.time.seconds)} name={t("dashTime")} note={c.time.note} />
      <Stat id={`helpers_${c.subject}`} value={t("dashHelpersCount", { count: c.helpers.hints + c.helpers.dontKnow })} name={t("dashHelpers")} note={c.helpers.note} />
    </article>
  );
}

/**
 * What a parent reads about one child: a card for each subject (the level
 * the child works at now, with a small arrow against the grade chosen,
 * then accuracy, time and helpers), the skills worth practising, the
 * week and the creature book. Read only; every number has its line. This
 * page scrolls, as the creature book does: there is more than one screen.
 */
export function ReportPage({ report, name, onBack }: { report: ChildReport; name: string; onBack: () => void }) {
  return (
    <main className="screen parents-page report-page" data-screen="parents-report">
      <Bar title={t("dashTitle", { name })} onBack={onBack} />
      <div className="report-body">
        <div className="report-grid">
          {report.subjects.map((c) => (
            <Card key={c.subject} c={c} />
          ))}
        </div>
        <section className="report-section" data-id="report_weak">
          <h2>{t("dashWeakTitle")}</h2>
          {report.weakest.length === 0 ? (
            <p className="note">{t("dashWeakNone")}</p>
          ) : (
            <ol>
              {report.weakest.map((w) => (
                <li key={w.skill} data-skill={w.skill}>
                  <b>{w.title}</b> <span className="chosen">({w.subjectTitle})</span>
                  <p className="note">{w.note}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="report-section" data-id="report_week">
          <h2>{t("dashWeekTitle")}</h2>
          <p className="week-days" aria-hidden="true">
            {report.week.days.map((on, i) => (
              <i key={i} data-on={on} />
            ))}
          </p>
          <Stat id="week_days" value={t("dashWeekDays", { active: report.week.active })} name="" note={report.week.note} />
        </section>
        <section className="report-section" data-id="report_book">
          <h2>{t("dashBookTitle")}</h2>
          <Stat id="book_count" value={t("dashBook", { caught: report.bestiary.caught, seen: report.bestiary.seen })} name="" note={report.bestiary.note} />
        </section>
      </div>
    </main>
  );
}
