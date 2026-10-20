import { t } from "../../../i18n";
import { Tap } from "../../Tap";
import { Bar } from "./Bar";

interface Props {
  busy: boolean;
  onChildren: () => void;
  onPin: () => void;
  onGithub: () => void;
  onShareLog: () => void;
  onBack: () => void;
}

/** The parents' area: four big doors and the way out. */
export function ParentsHome({ busy, onChildren, onPin, onGithub, onShareLog, onBack }: Props) {
  return (
    <main className="screen parents-page" data-screen="parents">
      <Bar title={t("parentsTitle")} onBack={onBack} />
      <div className="parents-body">
        <div className="parents-menu">
          <Tap id="parents_children" disabled={busy} onTap={onChildren}>
            {t("parentsChildren")}
          </Tap>
          <Tap id="parents_pin" disabled={busy} onTap={onPin}>
            {t("parentsPin")}
          </Tap>
          <Tap id="parents_github" disabled={busy} onTap={onGithub}>
            {t("parentsGithub")}
          </Tap>
          <Tap id="share_log" disabled={busy} onTap={onShareLog}>
            {t("parentsShareLog")}
          </Tap>
        </div>
      </div>
    </main>
  );
}
