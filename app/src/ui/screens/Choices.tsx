import { t } from "../../i18n";
import { Tap } from "../Tap";

export interface Choice {
  id: string;
  label: string;
  image?: string;
}

interface Props {
  screen: string;
  title: string;
  choices: readonly Choice[];
  onPick: (id: string) => void;
  onBack: () => void;
  /** While the answer is being saved: one pick only, and no way back. */
  busy?: boolean;
}

/** A question with big answers to tap: the grade, the character. */
export function Choices({ screen, title, choices, onPick, onBack, busy = false }: Props) {
  return (
    <main className="screen" data-screen={screen} data-busy={busy}>
      <header className="bar">
        <Tap id="back" className="quiet" disabled={busy} onTap={onBack}>
          {t("back")}
        </Tap>
        <h1 className="title">{title}</h1>
      </header>
      <div className={choices.some((c) => c.image) ? "cards" : "grid"}>
        {choices.map((c) => (
          <Tap key={c.id} id={`choice_${c.id}`} className={c.image ? "card" : "choice"} disabled={busy} onTap={() => onPick(c.id)}>
            {c.image && <img src={c.image} alt="" draggable={false} />}
            <span>{c.label}</span>
          </Tap>
        ))}
      </div>
    </main>
  );
}
