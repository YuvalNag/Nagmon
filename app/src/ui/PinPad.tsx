import { useState } from "react";
import { t } from "../i18n";
import { Tap } from "./Tap";

export const PIN_LENGTH = 4;

interface Props {
  title: string;
  hint: string;
  /** A short message above the dots, e.g. after a wrong code. */
  message?: string;
  /** Which try this is; a new try gets a new, empty pad. */
  attempt?: number;
  /** Called with the 4 digits as soon as the last one is tapped. */
  onDone: (pin: string) => void;
  onCancel: () => void;
}

/**
 * The parent code: big digit keys only, the digits shown as dots
 * (never as numbers, never logged). The old app showed Hebrew letters
 * here and parents took it for the child's name.
 */
export function PinPad({ title, hint, message, attempt = 0, onDone, onCancel }: Props) {
  const [digits, setDigits] = useState("");
  // checking a code takes a moment (PBKDF2): taps meanwhile would go into
  // the next try, so the keys wait for the answer
  const [waiting, setWaiting] = useState(false);

  function add(d: string) {
    if (waiting) return;
    const next = (digits + d).slice(0, PIN_LENGTH);
    setDigits(next);
    if (next.length === PIN_LENGTH) {
      setWaiting(true);
      onDone(next);
    }
  }

  return (
    <main className="screen pin" data-screen="pin" data-attempt={attempt} data-waiting={waiting}>
      <section className="pin-side">
        <h1 className="title">{title}</h1>
        <p className="hint">{hint}</p>
        <p className="message" role="alert">
          {message ?? ""}
        </p>
        <div className="dots" data-id="pin_dots" data-count={digits.length} aria-label={`${digits.length} מתוך ${PIN_LENGTH}`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span key={i} className={i < digits.length ? "dot full" : "dot"} />
          ))}
        </div>
        {/* the answer would land on whatever screen is next: stay for it */}
        <Tap id="pin_cancel" className="quiet" disabled={waiting} onTap={onCancel}>
          {t("back")}
        </Tap>
      </section>
      <div className="pad" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Tap key={d} id={`key_${d}`} className="key" disabled={waiting} onTap={() => add(d)}>
            {d}
          </Tap>
        ))}
        <span />
        <Tap id="key_0" className="key" disabled={waiting} onTap={() => add("0")}>
          0
        </Tap>
        <Tap id="key_delete" className="key delete" disabled={waiting} onTap={() => setDigits(digits.slice(0, -1))}>
          {t("delete")}
        </Tap>
      </div>
    </main>
  );
}
