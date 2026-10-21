import { type StampCard as Card } from "../../core/game/lessons";
import { t } from "../../i18n";

/** A five-point star, the stamp. */
function Star() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8z" />
    </svg>
  );
}

/**
 * The institute's stamp card: a circle for each lesson, an empty ring
 * until the lesson is passed and a stamp after (it never expires).
 * `fresh` is the lesson just stamped: its stamp lands with a small pop.
 */
export function StampCardView({ card, fresh }: { card: Card; fresh?: string | null }) {
  return (
    <div className="stamp-card" data-id="stamp_card" data-done={card.done} data-total={card.total} role="img" aria-label={t("tutorStamps", { done: card.done, total: card.total })}>
      {card.stamps.map((s) => (
        <span key={s.id} className="stamp" data-stamped={s.done} data-fresh={s.id === fresh} data-lesson={s.id}>
          {s.done && <Star />}
        </span>
      ))}
    </div>
  );
}
