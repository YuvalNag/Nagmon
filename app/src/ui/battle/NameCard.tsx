import type { MonsterTable } from "../../core/game/monsters";
import { t } from "../../i18n";
import { MonsterPic } from "../MonsterPic";
import { Tap } from "../Tap";

interface Props {
  monsters: MonsterTable;
  species: string;
  title: string;
  line: string;
  coins: number;
  suggestions: string[];
  /** The parent's switch: false leaves only the suggestions. */
  freeNames: boolean;
  onPick: (name: string) => void;
  onOwn: () => void;
  onSkip: () => void;
}

/**
 * "New friend!": the picture, three names to pick, "my own name" (the
 * letter board) and, far from the rest, "skip". Names stay on the phone.
 */
export function NameCard({ monsters, species, title, line, coins, suggestions, freeNames, onPick, onOwn, onSkip }: Props) {
  return (
    <section className="name-card" data-screen="battle-caught" data-view="caught" aria-label={title}>
      <div className="name-pic">
        <MonsterPic monsters={monsters} species={species} height={0.36} />
      </div>
      <div className="name-side">
        <h2 className="title" data-id="battle_new_friend">
          {title}
        </h2>
        <p className="name-line" role="status">
          {line}
          {coins > 0 && <span> {t("battleSealCoins", { coins })}</span>}
        </p>
        <div className="name-chips">
          {suggestions.map((n, i) => (
            <Tap key={n} id={`battle_suggest_${i}`} onTap={() => onPick(n)}>
              {n}
            </Tap>
          ))}
          {freeNames && (
            <Tap id="battle_name_own" className="primary" onTap={onOwn}>
              {t("nameOwn")}
            </Tap>
          )}
        </div>
        <Tap id="battle_skip" className="quiet name-skip" onTap={onSkip}>
          {t("nameSkip")}
        </Tap>
      </div>
    </section>
  );
}
