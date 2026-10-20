import { avatarImage } from "../../core/family/avatars";
import { MAX_PROFILES, type Profile } from "../../core/family/profiles";
import { t } from "../../i18n";
import { Tap } from "../Tap";

interface Props {
  children: readonly Profile[];
  onPick: (id: string) => void;
  onNewChild: () => void;
  onParents: () => void;
  /** While the app checks something (the code's lockout): one tap only. */
  busy?: boolean;
}

/**
 * "Who is playing today?": a card per child in one row that shrinks to
 * fit (up to 8), then the two tools, always on the screen.
 */
export function WhoPlays({ children, onPick, onNewChild, onParents, busy = false }: Props) {
  // the limit is said here, before the parent types the code for nothing
  const full = children.length >= MAX_PROFILES;
  return (
    <main className="screen" data-screen="who-plays">
      <h1 className="title">{t("whoPlays")}</h1>
      {children.length > 0 && (
        <div className={children.length >= 6 ? "cards many" : "cards"}>
          {children.map((p) => (
            <Tap key={p.id} id={`child_${p.id}`} className="card" disabled={busy} onTap={() => onPick(p.id)}>
              <img src={avatarImage(p.avatar)} alt="" draggable={false} />
              <span>{p.name}</span>
            </Tap>
          ))}
        </div>
      )}
      <div className="row tools">
        <Tap id="new_child" className="primary" disabled={busy || full} onTap={onNewChild}>
          {t("newPlayer")}
        </Tap>
        <Tap id="parents" disabled={busy} onTap={onParents}>
          {t("parents")}
        </Tap>
        {full && <p className="hint">{t("tooMany")}</p>}
      </div>
    </main>
  );
}
