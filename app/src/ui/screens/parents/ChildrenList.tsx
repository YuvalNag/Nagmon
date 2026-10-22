import { heroes } from "../../../core/family/heroes";
import type { Profile } from "../../../core/family/profiles";
import { t } from "../../../i18n";
import { Tap } from "../../Tap";
import { Bar } from "./Bar";

interface Props {
  /** null while they are read. */
  children: readonly Profile[] | null;
  onPick: (id: string) => void;
  onBack: () => void;
}

/** The children, as on who-plays: a card each, to change one. */
export function ChildrenList({ children, onPick, onBack }: Props) {
  return (
    <main className="screen parents-page" data-screen="parents-children" aria-busy={children === null}>
      <Bar title={t("childrenTitle")} onBack={onBack} />
      <div className="parents-body">
        {children !== null && children.length === 0 && <p className="hint">{t("childrenNone")}</p>}
        {children !== null && children.length > 0 && (
          <div className={children.length >= 6 ? "cards many" : "cards"}>
            {children.map((p) => (
              <Tap key={p.id} id={`edit_${p.id}`} className="card" onTap={() => onPick(p.id)}>
                <img src={heroes.faceUrl(p.avatar)} alt="" draggable={false} />
                <span>{p.name}</span>
              </Tap>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
