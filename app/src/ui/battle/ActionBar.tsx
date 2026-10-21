import type { Beat, Legal } from "../../core/game/battleBeats";
import { t } from "../../i18n";
import { Tap } from "../Tap";

export interface ActionBarProps {
  /** A question was already asked in this meeting (the Power-up's id then reads "next"; the tests read it). */
  asked: boolean;
  /** The creature is calm: the Net is the next step and the three cards rest. */
  calm: boolean;
  /** A net can be thrown now. */
  canNet: boolean;
  /** Which of the three cards are open now (src/core/game/battleBeats.ts). */
  legal: Legal;
  /** The friend's assists left in this battle. */
  assistsLeft: number;
  /** The fog is at its floor: the Power-up pulses (nothing is forced). */
  nudge?: boolean;
  onBeat: (beat: Beat) => void;
  onNet: () => void;
  onBag: () => void;
  onFriends: () => void;
  onLeave: () => void;
}

/**
 * The beat menu (docs/app/BATTLE.md, 4.1): three big cards, Move (free),
 * Power-up (the only question) and the friend's assist (free, a few in a
 * battle), and four small buttons, Net, Bag, Friends and Leave. When the
 * meter is full, Special takes Move's place. A card that cannot be picked
 * now (a question just asked) rests and says why; Leave is always free.
 * The order is the DOM order: in Hebrew (right to left) it runs from the
 * right edge inward.
 */
export function ActionBar(p: ActionBarProps) {
  const rest = !p.calm && !p.legal.power;
  return (
    <div className="action-bar" role="toolbar" aria-label={t("battleActions")} data-calm={p.calm}>
      {p.legal.special ? (
        <Tap id="battle_special" className="card special pulse" onTap={() => p.onBeat("special")}>
          <span className="act-icon" aria-hidden="true">
            ✨
          </span>
          {t("battleSpecial")}
        </Tap>
      ) : (
        <Tap id="battle_move" className="card" disabled={p.calm || !p.legal.move} onTap={() => p.onBeat("move")}>
          <span className="act-icon" aria-hidden="true">
            🏃
          </span>
          {t("battleMove")}
        </Tap>
      )}
      <Tap id={p.asked ? "battle_next" : "battle_fight"} className={`card primary${p.nudge && p.legal.power ? " pulse" : ""}`} disabled={p.calm || !p.legal.power} onTap={() => p.onBeat("power")}>
        <span className="act-icon" aria-hidden="true">
          ⚡
        </span>
        {t("battlePower")}
        {rest && <small className="card-note">{t("battlePowerRest")}</small>}
      </Tap>
      <Tap id="battle_friend" className="card" disabled={p.calm || !p.legal.assist} onTap={() => p.onBeat("assist")}>
        <span className="act-icon" aria-hidden="true">
          🤝
        </span>
        {t("battleAssist")}
        <small className="card-note">{t("battleAssistLeft", { n: p.assistsLeft })}</small>
      </Tap>
      <Tap id="battle_net" className={`small${p.canNet ? " pulse" : ""}`} disabled={!p.canNet} onTap={p.onNet}>
        <span className="act-icon" aria-hidden="true">
          🥅
        </span>
        {t("battleNet")}
      </Tap>
      <Tap id="battle_bag" className="small" onTap={p.onBag}>
        <span className="act-icon" aria-hidden="true">
          🎒
        </span>
        {t("battleBag")}
      </Tap>
      <Tap id="battle_friends" className="small" onTap={p.onFriends}>
        <span className="act-icon" aria-hidden="true">
          🐾
        </span>
        {t("battleFriends")}
      </Tap>
      <Tap id="battle_run" className="small" onTap={p.onLeave}>
        <span className="act-icon" aria-hidden="true">
          👣
        </span>
        {t("battleLeave")}
      </Tap>
    </div>
  );
}
