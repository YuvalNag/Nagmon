import { Tap } from "../Tap";

interface Props {
  text: string;
  onNext: () => void;
}

/** One message and one button. */
export function Notice({ text, onNext }: Props) {
  return (
    <main className="screen" data-screen="notice">
      <p className="notice">{text}</p>
      <Tap id="next" className="primary" onTap={onNext}>
        המשך
      </Tap>
    </main>
  );
}
