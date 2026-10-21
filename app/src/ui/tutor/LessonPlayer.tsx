import type { Lesson, LessonCard } from "../../core/game/lessons";
import { t } from "../../i18n";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";

interface Props {
  lesson: Lesson;
  /** The card showing, from 0. */
  index: number;
  /** One tap anywhere: the next card, or after the last one the practice. */
  onNext: () => void;
  /** The back arrow: the card before, or the list from the first. */
  onBack: () => void;
}

/** The card's line with its key word marked. */
function Line({ card }: { card: LessonCard }) {
  const at = card.highlight ? card.text.indexOf(card.highlight) : -1;
  if (!card.highlight || at < 0) return <>{card.text}</>;
  return (
    <>
      {card.text.slice(0, at)}
      <mark>{card.highlight}</mark>
      {card.text.slice(at + card.highlight.length)}
    </>
  );
}

/**
 * One card of a lesson: a big picture and at most one short line. The
 * whole screen is the "continue" button (a child taps anywhere); the back
 * arrow is always there. Each card is its own screen (ScreenTime), so the
 * tap that turned the page presses nothing on the next one.
 */
export function LessonPlayer({ lesson, index, onNext, onBack }: Props) {
  const card = lesson.cards[index];
  if (!card) return null;
  const last = index === lesson.cards.length - 1;
  return (
    <ScreenTime key={`tutor-card-${lesson.id}-${index}`}>
      <section className="tutor tutor-card" data-screen="tutor-card" data-lesson={lesson.id} data-card={index} data-last={last} aria-label={lesson.title}>
        <Tap id="lesson_next" className="lesson-tap" aria-label={last ? t("tutorQuestionTime") : t("tutorTapOn")} onTap={onNext}>
          {card.emoji && <img className="lesson-picture" src={`game/emoji/${card.emoji}.svg`} alt="" draggable={false} />}
          <span className="lesson-line" data-id="lesson_line">
            <Line card={card} />
          </span>
          <span className="lesson-dots" aria-hidden="true">
            {lesson.cards.map((_, i) => (
              <i key={i} data-on={i <= index} />
            ))}
          </span>
        </Tap>
        <Tap id="lesson_back" className="lesson-back quiet" aria-label={t("tutorBack")} onTap={onBack}>
          {t("tutorBack")}
        </Tap>
        <p className="lesson-count" role="status">
          {t("tutorCardOf", { n: index + 1, total: lesson.cards.length })}
        </p>
      </section>
    </ScreenTime>
  );
}
