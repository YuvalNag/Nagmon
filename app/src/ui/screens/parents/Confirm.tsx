import type { ReactNode } from "react";
import { t } from "../../../i18n";
import { Tap } from "../../Tap";

interface Props {
  screen: string;
  children: ReactNode;
  yes: string;
  /** A red "yes": the answer deletes something. */
  danger?: boolean;
  busy?: boolean;
  onYes: () => void;
  onNo: () => void;
}

/** A question on its own page: what will happen, then yes or "ביטול". Never `confirm()`. */
export function Confirm({ screen, children, yes, danger = false, busy = false, onYes, onNo }: Props) {
  return (
    <main className="screen" data-screen={screen} data-busy={busy}>
      {children}
      <div className="parents-row">
        <Tap id="confirm_yes" className={danger ? "danger" : "primary"} disabled={busy} onTap={onYes}>
          {yes}
        </Tap>
        <Tap id="confirm_no" onTap={onNo}>
          {t("cancel")}
        </Tap>
      </div>
    </main>
  );
}
