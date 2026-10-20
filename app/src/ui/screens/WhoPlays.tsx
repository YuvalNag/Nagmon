import { avatarImage } from "../../core/family/avatars";
import type { Profile } from "../../core/family/profiles";
import { t } from "../../i18n";
import { Tap } from "../Tap";

interface Props {
  children: readonly Profile[];
  onPick: (id: string) => void;
  onNewChild: () => void;
  onParents: () => void;
}

/** "Who is playing today?": a big card per child, then the two tools. */
export function WhoPlays({ children, onPick, onNewChild, onParents }: Props) {
  return (
    <main className="screen" data-screen="who-plays">
      <h1 className="title">{t("whoPlays")}</h1>
      {children.length > 0 && (
        <div className="cards">
          {children.map((p) => (
            <Tap key={p.id} id={`child_${p.id}`} className="card" onTap={() => onPick(p.id)}>
              <img src={avatarImage(p.avatar)} alt="" draggable={false} />
              <span>{p.name}</span>
            </Tap>
          ))}
        </div>
      )}
      <div className="row">
        <Tap id="new_child" className="primary" onTap={onNewChild}>
          {t("newPlayer")}
        </Tap>
        <Tap id="parents" onTap={onParents}>
          {t("parents")}
        </Tap>
      </div>
    </main>
  );
}
