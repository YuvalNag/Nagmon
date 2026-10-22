import { t } from "../../../i18n";
import { Tap } from "../../Tap";
import { Bar } from "./Bar";

interface Props {
  busy: boolean;
  /** Reports from the game's "something is wrong" button, waiting on the phone. */
  waiting: number;
  /** Text-review decisions waiting to be sent. */
  reviewWaiting?: number;
  onSendReports: () => void;
  onChildren: () => void;
  onPin: () => void;
  onGithub: () => void;
  onShareLog: () => void;
  onReport: () => void;
  onReview: () => void;
  onBack: () => void;
}

/** The parents' area: four big doors and the way out. */
export function ParentsHome({ busy, waiting, reviewWaiting = 0, onSendReports, onChildren, onPin, onGithub, onShareLog, onReport, onReview, onBack }: Props) {
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
          <Tap id="parents_report" disabled={busy} onTap={onReport}>
            {t("parentsReport")}
          </Tap>
          <Tap id="parents_review" disabled={busy} onTap={onReview}>
            {t("parentsReview")}
          </Tap>
        </div>
        {reviewWaiting > 0 && (
          <p className="parents-status" role="status" data-id="review_waiting">
            {t("reviewHomeWaiting", { count: reviewWaiting })}
          </p>
        )}
        {waiting > 0 && (
          <div className="parents-row" data-id="reports_waiting">
            <span role="status">{waiting === 1 ? t("reportsWaitingOne") : t("reportsWaiting", { count: waiting })}</span>
            <Tap id="parents_send_reports" className="primary" disabled={busy} onTap={onSendReports}>
              {t("reportsSend")}
            </Tap>
          </div>
        )}
      </div>
    </main>
  );
}
