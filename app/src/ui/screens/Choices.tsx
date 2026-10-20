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
}

/** A question with big answers to tap: the grade, the character. */
export function Choices({ screen, title, choices, onPick, onBack }: Props) {
  return (
    <main className="screen" data-screen={screen}>
      <header className="bar">
        <Tap id="back" className="quiet" onTap={onBack}>
          חזרה
        </Tap>
        <h1 className="title">{title}</h1>
      </header>
      <div className={choices.some((c) => c.image) ? "cards" : "grid"}>
        {choices.map((c) => (
          <Tap key={c.id} id={`choice_${c.id}`} className={c.image ? "card" : "choice"} onTap={() => onPick(c.id)}>
            {c.image && <img src={c.image} alt="" draggable={false} />}
            <span>{c.label}</span>
          </Tap>
        ))}
      </div>
    </main>
  );
}
