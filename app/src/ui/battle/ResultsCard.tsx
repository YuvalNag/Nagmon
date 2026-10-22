import type { Reward } from "../../core/game/battle";
import { t } from "../../i18n";

interface Props {
  reward: Reward;
  /** Names of friends that fell asleep in this fight (they need rest). */
  asleep: string[];
  /** The line that opens the card: the creature is calm. */
  line: string;
  /** What the creature left (an Evolution Card), as a sentence, or null. */
  found?: string | null;
}

/**
 * The results card (docs/app/BATTLE_V3.md, 6.5 and 9.1 T16): the stars (Calm
 * always; Steady when nobody fell asleep; Bright for two Brilliant hits),
 * the coins and the growth points. A star that is missing takes nothing away.
 */
export function ResultsCard({ reward, asleep, line, found }: Props) {
  const stars: ["calm" | "steady" | "bright", boolean][] = [
    ["calm", true],
    ["steady", reward.stars.steady],
    ["bright", reward.stars.bright],
  ];
  return (
    <div className="results" data-id="battle_results" data-coins={reward.coins}>
      <p className="results-line">{line}</p>
      <ul className="results-stars" aria-label={t("resultsStars")}>
        {stars.map(([id, on]) => (
          <li key={id} data-star={id} data-on={on}>
            <span aria-hidden="true">{on ? "⭐" : "☆"}</span>
            <span>{t(`star_${id}` as const)}</span>
          </li>
        ))}
      </ul>
      <p className="results-pay">
        {t("resultsCoins", { coins: reward.coins })} · {t("resultsPoints", { n: reward.points })}
      </p>
      {found && (
        <p className="results-found" data-id="battle_found">
          <span aria-hidden="true">🎁 </span>
          {found}
        </p>
      )}
      {asleep.length > 0 && (
        <p className="results-asleep" data-id="battle_asleep">
          {t("resultsAsleep", { names: asleep.join(", ") })}
        </p>
      )}
    </div>
  );
}
