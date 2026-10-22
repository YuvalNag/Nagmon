import type { CSSProperties } from "react";
import type { Lesson, StampCard } from "../../core/game/lessons";
import { itemText, t } from "../../i18n";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";
import { CoinIcon, CoinPill } from "./icons";
import { StampCardView } from "./StampCard";
import "../../i18nEvolution";

export interface Passed {
  lesson: Lesson;
  coins: number;
  /** The first pass of the lesson: a new stamp. */
  first: boolean;
  /** One more note charge was given (the first pass). */
  gift: number;
  /** An Evolution Card the tutor gave (every Nth first pass in a subject): the item's id, or null. */
  giftCard: string | null;
  card: StampCard;
  /** The child's coins after the award. */
  total: number;
}

/**
 * The practice was passed: the coins fly up (the same little coins as the
 * map's counter), the stamp lands on the stamp card, and "סיום" goes back
 * to the list. A repeat says what it paid, or that today's repeat coins
 * were given already (once a day, so it is no farm).
 */
export function LessonResult({ passed, onDone }: { passed: Passed; onDone: () => void }) {
  const { coins, first } = passed;
  const pays = coins > 0 ? (first ? t("tutorCoinsFirst", { coins }) : t("tutorCoinsRepeat", { coins })) : t("tutorCoinsNone");
  return (
    <ScreenTime key="tutor-result">
      <section className="tutor tutor-result" data-screen="tutor-result" data-lesson={passed.lesson.id} data-coins={coins} data-first={first} role="dialog" aria-label={t("tutorPassed")}>
        <CoinPill coins={passed.total} />
        <h2 className="title" data-id="tutor_passed">
          {t("tutorPassed")}
        </h2>
        {coins > 0 && (
          <div className="coin-burst" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} style={{ "--i": i } as CSSProperties}>
                <CoinIcon />
              </span>
            ))}
          </div>
        )}
        <p className="tutor-pays" data-id="tutor_pays" role="status">
          {pays}
        </p>
        <StampCardView card={passed.card} fresh={first ? passed.lesson.id : null} />
        <p className="tutor-stamp-line">
          {passed.card.total > 0 && passed.card.done === passed.card.total ? t("tutorAllStamps") : first ? t("tutorNewStamp") : ""}
        </p>
        {passed.gift > 0 && <p className="tutor-gift">{t("tutorNoteGift")}</p>}
        {passed.giftCard && (
          <p className="tutor-gift" data-id="tutor_card_gift">
            {t("evoTutorGift", { name: itemText(passed.giftCard, "name") })}
          </p>
        )}
        <Tap id="tutor_done" className="primary" onTap={onDone}>
          {t("tutorDone")}
        </Tap>
      </section>
    </ScreenTime>
  );
}

/** A wrong practice answer: no cost, the tutor says to look at the cards again. */
export function LessonAgain({ lesson, onGo, onBack }: { lesson: Lesson; onGo: () => void; onBack: () => void }) {
  return (
    <ScreenTime key="tutor-again">
      <section className="tutor tutor-again" data-screen="tutor-again" data-lesson={lesson.id} role="dialog" aria-label={t("tutorLookAgain")}>
        <p className="tutor-says" data-id="tutor_again">
          {t("tutorLookAgain")}
        </p>
        <div className="row">
          <Tap id="tutor_again_go" className="primary" onTap={onGo}>
            {t("tutorAgainOne")}
          </Tap>
          <Tap id="tutor_again_back" onTap={onBack}>
            {t("tutorBack")}
          </Tap>
        </div>
      </section>
    </ScreenTime>
  );
}

/** The practice had no question to ask (none could be made): nothing is paid, nothing is lost. */
export function LessonNoQuestion({ onBack }: { onBack: () => void }) {
  return (
    <ScreenTime key="tutor-noq">
      <section className="tutor tutor-again" data-screen="tutor-noquestion" role="dialog" aria-label={t("tutorNoQuestion")}>
        <p className="tutor-says" data-id="tutor_no_question">
          {t("tutorNoQuestion")}
        </p>
        <Tap id="tutor_noq_back" className="primary" onTap={onBack}>
          {t("tutorBack")}
        </Tap>
      </section>
    </ScreenTime>
  );
}
