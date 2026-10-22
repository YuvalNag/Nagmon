import type { MonsterTable } from "../../core/game/monsters";
import { t } from "../../i18n";
import { MonsterPic } from "../MonsterPic";
import { Tap } from "../Tap";

interface Props {
  monsters: MonsterTable;
  /** The friend's species before it grew. */
  before: string;
  /** The species it evolved into, or null for a plain level-up. */
  evolvedTo: string | null;
  level: number;
  /** A catalogue name for a species. */
  name: (species: string) => string;
  /** What it learned at this level (the line under the title), or empty. */
  learned?: string;
  onClose: () => void;
}

/**
 * The level-up card and the evolution card: a full-screen "well done",
 * closed by a tap. An evolution shows the old creature, an arrow and
 * the new one.
 */
export function GrowthCard({ monsters, before, evolvedTo, level, name, learned, onClose }: Props) {
  const title = evolvedTo ? t("cardEvolved", { old: name(before), name: name(evolvedTo) }) : t("cardLevelUp", { name: name(before), level });
  return (
    <section className="growth-card" data-screen="growth-card" data-kind={evolvedTo ? "evolution" : "level"} role="dialog" aria-label={title}>
      <div className="growth-pics" aria-hidden="true">
        <MonsterPic monsters={monsters} species={before} height={0.34} />
        {evolvedTo && (
          <>
            <span className="growth-arrow">➜</span>
            <MonsterPic monsters={monsters} species={evolvedTo} height={0.34} />
          </>
        )}
      </div>
      <h2 className="title" data-id="growth_title">
        {title}
      </h2>
      {evolvedTo && <p className="growth-level">{t("cardLevelUp", { name: name(evolvedTo), level })}</p>}
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
