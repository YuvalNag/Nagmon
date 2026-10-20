import { t } from "../../i18n";
import { Tap } from "../Tap";

interface Props {
  text: string;
  onNext: () => void;
}

/** One message and one button. */
export function Notice({ text, onNext }: Props) {
  return (
    <main className="screen" data-screen="notice">
      {/* the message is the screen's heading: a screen reader starts there */}
      <h1 className="notice">{text}</h1>
      <Tap id="next" className="primary" onTap={onNext}>
        {t("next")}
      </Tap>
    </main>
  );
}
