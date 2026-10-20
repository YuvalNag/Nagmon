import { t } from "../../i18n";
import { Tap } from "../Tap";

export interface ActionBarProps {
  /** A question was already asked in this meeting (the first button then says "next question"). */
  asked: boolean;
  /** The creature is calm: the Net is the next step and Ask rests. */
  calm: boolean;
  /** A net can be thrown now. */
  canNet: boolean;
  onAsk: () => void;
  onNet: () => void;
  onBag: () => void;
  onFriends: () => void;
  onLeave: () => void;
}

/**
 * The battle's five buttons across the bottom of the screen
 * (docs/app/FEATURES.md §4.5): Ask (twice as wide, at the start edge,
 * under the thumb), Net, Bag, Friends and Leave. Each is at least
 * 120x72 CSS px (src/styles.css, .action-bar). Leave is always free.
 * The order is the DOM order: in Hebrew (right to left) it runs from
 * the right edge inward.
 */
export function ActionBar(p: ActionBarProps) {
  return (
    <div className="action-bar" role="toolbar" aria-label={t("battleActions")} data-calm={p.calm}>
      <Tap id={p.asked ? "battle_next" : "battle_fight"} className="primary wide" disabled={p.calm} onTap={p.onAsk}>
        <span className="act-icon" aria-hidden="true">
          ⚡
        </span>
        {p.asked ? t("battleNext") : t("battleAsk")}
      </Tap>
      <Tap id="battle_net" className={p.canNet ? "pulse" : ""} disabled={!p.canNet} onTap={p.onNet}>
        <span className="act-icon" aria-hidden="true">
          🥅
        </span>
        {t("battleNet")}
      </Tap>
      <Tap id="battle_bag" onTap={p.onBag}>
        <span className="act-icon" aria-hidden="true">
          🎒
        </span>
        {t("battleBag")}
      </Tap>
      <Tap id="battle_friends" onTap={p.onFriends}>
        <span className="act-icon" aria-hidden="true">
          🐾
        </span>
        {t("battleFriends")}
      </Tap>
      <Tap id="battle_run" onTap={p.onLeave}>
        <span className="act-icon" aria-hidden="true">
          👣
        </span>
        {t("battleLeave")}
      </Tap>
    </div>
  );
}
