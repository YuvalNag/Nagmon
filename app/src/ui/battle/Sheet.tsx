import type { ReactNode } from "react";
import { t } from "../../i18n";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";

/** A panel over the battle's arena (the Bag, the Friends, the nets), closed by "back". */
export function Sheet({ title, onClose, children, id }: { title: string; onClose: () => void; children: ReactNode; id?: string }) {
  return (
    <ScreenTime>
      <div className="sheet" role="dialog" aria-label={title} data-screen={id ?? "sheet"}>
        <header className="sheet-top">
          <h2 className="sheet-title">{title}</h2>
          <Tap id="sheet_close" onTap={onClose}>
            {t("tripsBack")}
          </Tap>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </ScreenTime>
  );
}
