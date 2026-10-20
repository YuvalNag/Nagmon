import { useState } from "react";
import { MAX_NAME_LEN } from "../core/family/profiles";
import { t } from "../i18n";
import { Tap } from "./Tap";

/** The Hebrew letters in alphabet order, each final form after its letter. */
export const HEBREW_KEYS: readonly string[] = [
  ..."אבגדהוזחטיכךלמםנןסעפףצץקרשת",
];

interface Props {
  title: string;
  initial?: string;
  message?: string;
  onDone: (text: string) => void;
  onCancel: () => void;
}

/**
 * A board of big Hebrew letters for a child's name: no autocorrect, no
 * emoji, no system keyboard to hide the screen. "מחק" (delete) sits at
 * the far end of the name bar, a full row away from the letters and
 * across the board from "סיום" (next to the letters in the old app, it
 * erased names).
 */
export function LetterBoard({ title, initial = "", message, onDone, onCancel }: Props) {
  const [text, setText] = useState(initial);
  // a message is about the name as it was: any change answers it
  const [note, setNote] = useState(message);

  function change(next: string) {
    setText(next);
    setNote(undefined);
  }

  function add(c: string) {
    if ([...text].length >= MAX_NAME_LEN) setNote(t("nameFull"));
    else change(text + c);
  }

  function space() {
    // refused as typed, so the name is never wrong only at "done"
    if (text === "" || text.endsWith(" ")) setNote(t("spaceAfterLetter"));
    else add(" ");
  }

  return (
    <main className="screen board" data-screen="letters">
      <header className="board-top">
        <Tap id="board_cancel" className="quiet" onTap={onCancel}>
          {t("back")}
        </Tap>
        <h1 className="title">{title}</h1>
        <output className="typed" data-id="typed">
          {text}
          <span className="caret" />
        </output>
        <Tap id="board_delete" className="key delete" onTap={() => change(text.slice(0, -1))}>
          {t("delete")}
        </Tap>
      </header>
      <p className="message" role="alert">
        {note ?? ""}
      </p>
      <div className="letters">
        {HEBREW_KEYS.map((c) => (
          <Tap key={c} id={`letter_${c}`} className="key" onTap={() => add(c)}>
            {c}
          </Tap>
        ))}
        <Tap id="board_space" className="key space" onTap={space}>
          {t("space")}
        </Tap>
        <Tap id="board_done" className="key done" disabled={text.trim() === ""} onTap={() => onDone(text)}>
          {t("done")}
        </Tap>
      </div>
    </main>
  );
}
