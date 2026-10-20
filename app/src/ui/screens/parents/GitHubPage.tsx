import { t } from "../../../i18n";
import { Tap } from "../../Tap";
import { Bar } from "./Bar";

interface Props {
  /** The saved token as it may be shown ("***abcd"); null when none; undefined while read. */
  masked: string | null | undefined;
  status: string;
  /** Whether the status is good news (connected, or not checked yet). */
  good: boolean;
  /** Checking or sending: the actions wait. */
  busy: boolean;
  onPaste: () => void;
  onRemove: () => void;
  onCheck: () => void;
  onSendLog: () => void;
  onSendProgress: () => void;
  onSendCrash: () => void;
  onBack: () => void;
}

/** "שליחת נתונים למפתח (GitHub)": the token, its check, and the three uploads. */
export function GitHubPage(p: Props) {
  const busy = p.busy || p.masked === undefined;
  return (
    <main className="screen parents-page" data-screen="parents-github" data-connected={Boolean(p.masked)} data-busy={busy}>
      <Bar title={t("parentsGithub")} onBack={p.onBack} />
      <div className="parents-body">
        <p className="parents-status" role="status" data-id="gh_status" data-good={p.good}>
          {p.status}
        </p>
        {p.masked ? (
          <div className="parents-row">
            <span>
              {t("ghToken")} <span className="masked" data-id="gh_masked">{p.masked}</span>
            </span>
            <Tap id="gh_replace" disabled={busy} onTap={p.onPaste}>
              {t("ghReplace")}
            </Tap>
            <Tap id="gh_remove" disabled={busy} onTap={p.onRemove}>
              {t("ghRemove")}
            </Tap>
            <Tap id="gh_check" className="primary" disabled={busy} onTap={p.onCheck}>
              {t("ghCheck")}
            </Tap>
          </div>
        ) : (
          <Tap id="gh_paste" className="primary" disabled={busy} onTap={p.onPaste}>
            {t("ghPaste")}
          </Tap>
        )}
        {p.masked && (
          <div className="parents-row">
            <Tap id="gh_send_logs" disabled={busy} onTap={p.onSendLog}>
              {t("ghSendLog")}
            </Tap>
            <Tap id="gh_send_progress" disabled={busy} onTap={p.onSendProgress}>
              {t("ghSendProgress")}
            </Tap>
            <Tap id="gh_send_crashes" disabled={busy} onTap={p.onSendCrash}>
              {t("ghSendCrash")}
            </Tap>
          </div>
        )}
      </div>
    </main>
  );
}
