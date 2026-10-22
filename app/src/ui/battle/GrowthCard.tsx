import type { MonsterTable } from "../../core/game/monsters";
import { t } from "../../i18n";
import { MonsterPic } from "../MonsterPic";
import { Tap } from "../Tap";

interface Props {
  monsters: MonsterTable;
  species: string;
  level: number;
  /** A catalogue name for a species. */
  name: (species: string) => string;
  /** What it learned at this level (the line under the title), or empty. */
  learned?: string;
  onClose: () => void;
}

/**
 * The level-up card: a full-screen "well done", closed by a tap. (Evolution has its own scene, a choice of the child:
 * ui/evolution/EvolutionScene.tsx; growth alone never changes a creature's species.)
 */
export function GrowthCard({ monsters, species, level, name, learned, onClose }: Props) {
  const title = t("cardLevelUp", { name: name(species), level });
  return (
    <section className="growth-card" data-screen="growth-card" data-kind="level" role="dialog" aria-label={title}>
      <div className="growth-pics" aria-hidden="true">
        <MonsterPic monsters={monsters} species={species} height={0.34} />
      </div>
      <h2 className="title" data-id="growth_title">
        {title}
      </h2>
      {learned && (
        <p className="growth-learned" data-id="growth_learned">
          {learned}
        </p>
      )}
      <Tap id="growth_close" className="primary" onTap={onClose}>
        {t("cardContinue")}
      </Tap>
    </section>
  );
}
