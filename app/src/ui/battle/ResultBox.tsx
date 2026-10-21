import type { AnswerOutcome } from "../../core/learning/engine";
import { isolateMath } from "../../core/learning/text";
import { t } from "../../i18n";
import { Tap } from "../Tap";

interface Props {
  outcome: AnswerOutcome;
  text: (msgid: string) => string;
  /** "why?" was tapped: the explanation shows and the box stays until a tap. */
  why: boolean;
  onWhy: () => void;
  /** A tap anywhere on the screen. */
  onSkip: () => void;
  /** Names of the skills just mastered, for the star line. */
  stars: string[];
}

/**
 * The message box at the bottom (instead of the old "Continue" page): the
 * right or "oops" line, about 1.5 s, closing by itself. "Why?" is one tap
 * away and never needed; a tap anywhere skips the wait. Gentle words and
 * colours: a wrong answer is never red.
 */
export function ResultBox({ outcome, text, why, onWhy, onSkip, stars }: Props) {
  const line = outcome.correct ? (outcome.quality === "super" ? text("nagmon_feedback_super") : text("nagmon_feedback_correct")) : t("battleOops");
  return (
    <>
      <Tap id="battle_skip" className="skip-layer" aria-label={t("battleSkip")} onTap={onSkip} />
      <aside className="message-box result" data-correct={outcome.correct} data-why={why} role="status">
        <p className="msg-line" data-id="battle_result">
          <span className="msg-icon" aria-hidden="true">
            {outcome.correct ? "✓" : "~"}
          </span>
          {line}
        </p>
        {!outcome.correct && outcome.correct_answer && (
          <p className="msg-answer" data-id="quiz_answer">
            {text("nagmon_feedback_answer").replace("{answer}", isolateMath(outcome.correct_answer))}
          </p>
        )}
        {stars.length > 0 && <p className="msg-star">{text("nagmon_feedback_star").replace("{skill}", stars.join(", "))}</p>}
        {why && outcome.explanation_he && (
          <p className="msg-why" data-id="quiz_explanation">
            {isolateMath(outcome.explanation_he)}
          </p>
        )}
        {!why && outcome.explanation_he && (
          <Tap id="battle_why" className="chip" onTap={onWhy}>
            {t("battleWhy")}
          </Tap>
        )}
        <span className="msg-more" aria-hidden="true">
          ▼
        </span>
      </aside>
    </>
  );
}
