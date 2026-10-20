import { useRef, useState } from "react";
import { DEFAULT_REPO } from "../../../core/fieldData/github";
import { t } from "../../../i18n";
import { Tap } from "../../Tap";
import { Bar } from "./Bar";

interface Props {
  repo?: string;
  message?: string;
  busy: boolean;
  /** The pasted token; it goes to the secret store only, never to a log. */
  onSave: (token: string) => void;
  onBack: () => void;
}

/**
 * The one place with the system keyboard: a password field, where a long
 * press pastes the token copied from GitHub. Nothing here keeps it: it
 * goes from the field to the check, and to Android's secure storage.
 */
export function TokenPage({ repo = DEFAULT_REPO, message, busy, onSave, onBack }: Props) {
  // uncontrolled: the token is read from the field on save and the field
  // is cleared at once, so it never sits in a DOM `value` attribute
  const input = useRef<HTMLInputElement>(null);
  const [filled, setFilled] = useState(false);
  const save = () => {
    const field = input.current;
    const token = field?.value ?? "";
    if (busy || !token.trim()) return;
    field!.value = "";
    setFilled(false);
    onSave(token);
  };
  return (
    <main className="screen parents-page" data-screen="parents-token" data-busy={busy}>
      <Bar title={t("ghTokenTitle")} onBack={onBack} />
      <p className="hint">{t("ghTokenHint", { repo })}</p>
      <input
        className="token-input"
        data-id="gh_token_input"
        type="password"
        aria-label={t("ghTokenLabel")}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        ref={input}
        disabled={busy}
        onChange={(e) => setFilled(e.target.value.trim() !== "")}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
      />
      <p className={busy ? "message wait" : "message"} role="alert">
        {busy ? t("ghChecking") : (message ?? "")}
      </p>
      <Tap id="gh_token_save" className="primary" disabled={busy || !filled} onTap={save}>
        {t("ghTokenSave")}
      </Tap>
    </main>
  );
}
