import type { TryResult } from "../../core/game/befriendTry";
import type { MonsterTable } from "../../core/game/monsters";
import { itemText, t } from "../../i18n";
import { MonsterPic } from "../MonsterPic";
import { Tap } from "../Tap";

interface Props {
  monsters: MonsterTable;
  species: string;
  /** The wild creature's name in the game's words. */
  name: string;
  r: TryResult;
  /** The parent's switch: false leaves no free names. */
  canName: boolean;
  onNext: () => void;
  /** The one-tap "Name it" chip: names are never asked for in the way (8.6). */
  onName: () => void;
}

/**
 * The result card of a befriended creature (docs/app/BATTLE_V3.md 8.6): the new friend, where it went, the coins,
 * "another friend of the same kind" with its small gift, one big Next, and a quiet "Name it" chip (no letter board
 * in the way). Nothing here can be wrong.
 */
export function BefriendResult({ monsters, species, name, r, canName, onNext, onName }: Props) {
  return (
    <section className="name-card befriend-result" data-screen="battle-caught" data-view="caught" aria-label={t("battleNewFriend", { name })}>
      <div className="name-pic">
        <MonsterPic monsters={monsters} species={species} height={0.36} />
      </div>
      <div className="name-side">
        <h2 className="title" data-id="battle_new_friend">
          {t("battleNewFriend", { name })}
        </h2>
        <p className="name-line" role="status">
          {r.toMeadow ? t("battleToMeadow") : t("battleJoined")}
          {r.another && <span> {t("befriendAnother")}</span>}
          {r.giftItem && <span> {t("befriendRepeatGift", { item: itemText(r.giftItem, "name") })}</span>}
          {r.coins > 0 && <span> {t("battleSealCoins", { coins: r.coins })}</span>}
        </p>
        <div className="name-chips">
          <Tap id="battle_befriend_next" className="primary" onTap={onNext}>
            {t("next")}
          </Tap>
          {canName && (
            <Tap id="battle_name_chip" className="quiet" onTap={onName}>
              {t("befriendNameIt")}
            </Tap>
          )}
        </div>
      </div>
    </section>
  );
}
