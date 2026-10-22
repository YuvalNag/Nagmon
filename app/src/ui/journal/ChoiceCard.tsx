import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";
import { t } from "../../i18n";

/**
 * A choice of a quest (docs/app/WORLD_V2.md 7): the offer ("gladly" / "not now"), a kindness scene, a book's shelf. Each
 * option is a big button with its words; "later" (or Android's back) closes the card with no answer and nothing
 * is lost. The order of the options is the quest engine's.
 */
export function ChoiceCard({ speaker, prompt, options, onChoose }: { speaker: string; prompt: string; options: readonly { id: string; label: string }[]; onChoose: (id: string | null) => void }) {
  return (
    <ScreenTime>
      <div className="map-overlay world-card choice-card" data-screen="choice" role="dialog" aria-label={prompt}>
        {speaker && <span className="choice-from">{speaker}</span>}
        <strong role="status" data-id="choice_prompt">
          {prompt}
        </strong>
        <div className="topic-chips">
          {options.map((o) => (
            <Tap key={o.id} id={`choice_${o.id}`} className="topic-chip choice-opt" onTap={() => onChoose(o.id)}>
              <span>{o.label}</span>
            </Tap>
          ))}
        </div>
        <Tap id="choice_later" className="quiet" onTap={() => onChoose(null)}>
          {t("choiceLater")}
        </Tap>
      </div>
    </ScreenTime>
  );
}
