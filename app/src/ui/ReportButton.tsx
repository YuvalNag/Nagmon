import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { crumb } from "../core/game/breadcrumb";
import { collectContext } from "../core/report/context";
import { REPORT_CHIPS, type ReportChip, type ReportContext } from "../core/report/report";
import type { Reports } from "../core/report/reports";
import { currentMap } from "../game/current";
import { t, type TextKey } from "../i18n";
import { getLogger, saveAppLog } from "../platform/appLog";
import { takeScreenshot } from "../platform/screenshot";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";
import "./report.css";

const log = getLogger("nagmon.report");

/** How long the thank-you stays before the sheet closes. */
export const THANKS_MS = 1400;

const CHIP_TEXT: Record<ReportChip, TextKey> = {
  unclear: "reportChipUnclear",
  looks_wrong: "reportChipLooks",
  stuck: "reportChipStuck",
  other: "reportChipOther",
};

/** A speech bubble with an exclamation mark, drawn about 26 px, on a pale ring so it shows on the map. */
function Bubble() {
  return (
    <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true" focusable="false">
      <path
        d="M5 2.5h16a2.5 2.5 0 0 1 2.5 2.5v11a2.5 2.5 0 0 1-2.5 2.5h-8.2L7.5 23.5v-5H5A2.5 2.5 0 0 1 2.5 16V5A2.5 2.5 0 0 1 5 2.5z"
        fill="#17323a"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect x="12" y="6.2" width="2.2" height="6.4" rx="1.1" fill="#ffffff" />
      <circle cx="13.1" cy="15.1" r="1.4" fill="#ffffff" />
    </svg>
  );
}

interface SheetProps {
  thanksMs: number;
  /** Saves the report; rejects when it could not. */
  onSend: (chip: ReportChip | null, text: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * The bottom sheet: four big reasons (one tap on any, or none), a text
 * field if the parent wants one, "שליחה" and "ביטול". Nothing is required.
 * While the field has the keyboard, the sheet sits at the top of the
 * screen with only the field and the buttons, so the keyboard never
 * covers them (the parents' area does the same: the field is placed where
 * a keyboard that opens or closes moves nothing).
 */
function Sheet({ thanksMs, onSend, onCancel }: SheetProps) {
  const [chip, setChip] = useState<ReportChip | null>(null);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "thanks" | "failed">("idle");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function send() {
    if (state === "saving" || state === "thanks") return;
    setState("saving");
    try {
      await onSend(chip, text);
      if (alive.current) setState("thanks");
    } catch {
      if (alive.current) setState("failed");
    }
  }

  // the thank-you, then the sheet closes
  useEffect(() => {
    if (state !== "thanks") return;
    const timer = setTimeout(onCancel, thanksMs);
    return () => clearTimeout(timer);
  }, [state, onCancel, thanksMs]);

  const busy = state === "saving" || state === "thanks";
  return (
    <ScreenTime>
      <div className="report-layer" data-report-sheet="" data-typing={typing} role="dialog" aria-modal="true" aria-label={t("reportTitle")}>
        <div className="report-sheet">
          {state === "thanks" ? (
            <p className="report-thanks" role="status" data-id="report_thanks">
              {t("reportThanks")}
            </p>
          ) : (
            <>
              <h2 className="report-title">{t("reportTitle")}</h2>
              <div className="report-chips" role="group" aria-label={t("reportTitle")}>
                {REPORT_CHIPS.map((c) => (
                  <Tap key={c} id={`report_chip_${c}`} className="report-chip" aria-pressed={chip === c} disabled={busy} onTap={() => setChip(chip === c ? null : c)}>
                    {t(CHIP_TEXT[c])}
                  </Tap>
                ))}
              </div>
              <div className="report-entry">
                <textarea
                  className="report-text"
                  data-id="report_text"
                  aria-label={t("reportTextLabel")}
                  placeholder={t("reportTextLabel")}
                  rows={2}
                  maxLength={1000}
                  dir="auto"
                  autoComplete="off"
                  spellCheck={false}
                  value={text}
                  disabled={busy}
                  onChange={(e) => setText(e.target.value)}
                  onFocus={() => setTyping(true)}
                  // moving to a button of the sheet keeps the layout: only a keyboard that goes away restores it
                  onBlur={(e) => {
                    if (!e.relatedTarget) setTyping(false);
                  }}
                />
                <div className="report-buttons">
                  <Tap id="report_send" className="primary" disabled={busy} onTap={() => void send()}>
                    {t("reportSend")}
                  </Tap>
                  <Tap id="report_cancel" disabled={state === "saving"} onTap={onCancel}>
                    {t("cancel")}
                  </Tap>
                </div>
              </div>
              {state === "failed" && (
                <p className="report-failed" role="alert">
                  {t("errorTryAgain")}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </ScreenTime>
  );
}

interface Props {
  reports: Reports;
  /** The child playing (the profile's id). */
  child: string;
  /** Android's back: closes the sheet first; false when it is not open. */
  backRef?: MutableRefObject<(() => boolean) | null>;
  /** How long the thank-you stays (tests shorten it). */
  thanksMs?: number;
}

/**
 * "Something is wrong": a small round icon on every screen where a child
 * plays (App mounts it once, never on the code, the parents' area or
 * who-plays). A tap first takes the screenshot, then holds the game still
 * (the map's pause, with its own reason) and opens the sheet. Sending
 * writes the report on the phone (src/core/report/reports.ts); it leaves
 * the phone only from the parents' area, with the parent's confirmation.
 */
export function ReportButton({ reports, child, backRef, thanksMs = THANKS_MS }: Props) {
  const [sheet, setSheet] = useState<{ screen: string; context: ReportContext; shot: string | null } | null>(null);
  const taking = useRef(false);
  const open = sheet !== null;

  async function start() {
    if (taking.current || open) return;
    taking.current = true;
    try {
      // what the screen says, and its picture, before the sheet is there
      const facing = (() => {
        try {
          return currentMap()?.debug()?.player.facing ?? null;
        } catch {
          return null;
        }
      })();
      const { screen, context } = collectContext({ root: document, crumb, facing });
      const shot = await takeScreenshot();
      setSheet({ screen, context, shot });
    } finally {
      taking.current = false;
    }
  }

  // the game stands still while the sheet is open
  useEffect(() => {
    if (!open) return;
    const map = currentMap();
    map?.pause("report");
    return () => map?.resume("report");
  }, [open]);

  const close = useCallback(() => setSheet(null), []);

  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (!open) return false;
      close();
      return true;
    };
    return () => {
      backRef.current = null;
    };
  }, [backRef, open, close]);

  const send = useCallback(
    async (chip: ReportChip | null, text: string) => {
      if (!sheet) return;
      try {
        await reports.save({ child, chip, text, screen: sheet.screen, context: sheet.context, screenshot: sheet.shot });
      } catch (e) {
        log.error("Could not save the report", e);
        throw e;
      }
      // the line is in the saved log too
      await saveAppLog();
    },
    [reports, child, sheet],
  );

  return (
    <>
      <Tap id="report_open" className="report-button" aria-label={t("reportButton")} onTap={() => void start()}>
        <Bubble />
      </Tap>
      {sheet && <Sheet thanksMs={thanksMs} onSend={send} onCancel={close} />}
    </>
  );
}
