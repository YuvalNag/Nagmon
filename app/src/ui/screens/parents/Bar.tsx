import { t } from "../../../i18n";
import { Tap } from "../../Tap";

/** A page's top: "חזרה" first, then its title. */
export function Bar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="bar">
      <Tap id="back" className="quiet" onTap={onBack}>
        {t("back")}
      </Tap>
      <h1 className="title">{title}</h1>
    </header>
  );
}
