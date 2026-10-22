import type { MonsterTable } from "../../core/game/monsters";
import { t } from "../../i18n";
import { MonsterPic } from "../MonsterPic";
import { Tap } from "../Tap";
import "../../i18nEvolution";

interface Props {
  monsters: MonsterTable;
  species: string;
  /** The friend's name (the child's own, or the species'). */
  name: string;
  onEvolve: () => void;
  onLater: () => void;
}

/**
 * "Heliobud feels something warm" (docs/app/BATTLE_V3.md 7.1): every gate is met, the fight is over, and the child
 * chooses: a big Evolve and a small Later. Never in the middle of a fight; "Later" asks again after the next one
 * (the "Keep small" ribbon in the Friends screen stops the question).
 */
export function EvolveOffer({ monsters, species, name, onEvolve, onLater }: Props) {
  const title = t("evoWarm", { name });
  return (
    <section className="growth-card evolve-offer" data-screen="evolve-offer" role="dialog" aria-label={title}>
      <div className="growth-pics offer-glow" aria-hidden="true">
        <MonsterPic monsters={monsters} species={species} height={0.34} />
      </div>
      <h2 className="title" data-id="evolve_offer_title">
        {title}
      </h2>
      <Tap id="evolve_go" className="primary" onTap={onEvolve}>
        {t("evoGo")}
      </Tap>
      <Tap id="evolve_later" className="evolve-later" onTap={onLater}>
        {t("evoLater")}
      </Tap>
    </section>
  );
}
