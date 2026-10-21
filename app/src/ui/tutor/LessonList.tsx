import type { Lesson, LessonSave } from "../../core/game/lessons";
import { isLearned, stampCard } from "../../core/game/lessons";
import { t } from "../../i18n";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";
import { CheckIcon, CoinPill } from "./icons";
import { StampCardView } from "./StampCard";

export interface LessonRow {
  lesson: Lesson;
  /** A skill far above the child's level: a lock, no tap. */
  locked: boolean;
}

interface Props {
  rows: readonly LessonRow[];
  save: LessonSave;
  coins: number;
  onPick: (lesson: Lesson) => void;
  onClose: () => void;
}

/** The picture of a lesson in the list: its note's, or its first card's. */
export const lessonPicture = (l: Lesson): string | null => l.note?.emoji ?? l.cards[0]?.emoji ?? null;

function Lock() {
  return (
    <svg className="lesson-lock" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" />
    </svg>
  );
}

/**
 * The tutor's lesson list: a card for each lesson with its skill's
 * picture, a stamp or an empty circle, and a lock only for a skill far
 * above the child's level. The stamp card of the institute is on top.
 */
export function LessonList({ rows, save, coins, onPick, onClose }: Props) {
  const card = stampCard(rows.map((r) => r.lesson), save);
  return (
    <ScreenTime key="tutor-list">
      <section className="tutor tutor-list" data-screen="tutor-list" aria-label={t("tutorTitle")}>
        <header className="tutor-top">
          <Tap id="tutor_close" className="quiet" onTap={onClose}>
            {t("tutorBack")}
          </Tap>
          <h2 className="title">{t("tutorTitle")}</h2>
          <StampCardView card={card} />
          <CoinPill coins={coins} />
        </header>
        {rows.length === 0 ? (
          <p className="tutor-none" data-id="tutor_none">
            {t("tutorNone")}
          </p>
        ) : (
          <ul className="lesson-cards">
            {rows.map(({ lesson, locked }) => {
              const done = isLearned(save, lesson.id);
              const pic = lessonPicture(lesson);
              return (
                <li key={lesson.id}>
                  <Tap
                    id={`lesson_${lesson.id}`}
                    className="lesson-card"
                    data-done={done}
                    data-locked={locked}
                    disabled={locked}
                    aria-label={`${lesson.title}. ${locked ? t("tutorLocked") : done ? t("tutorStamped") : t("tutorNotYet")}`}
                    onTap={() => onPick(lesson)}
                  >
                    {pic && <img src={`game/emoji/${pic}.svg`} alt="" draggable={false} />}
                    <span className="lesson-title">{lesson.title}</span>
                    {locked ? (
                      <Lock />
                    ) : (
                      <span className="lesson-mark" data-stamped={done} aria-hidden="true">
                        {done && <CheckIcon />}
                      </span>
                    )}
                  </Tap>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </ScreenTime>
  );
}
