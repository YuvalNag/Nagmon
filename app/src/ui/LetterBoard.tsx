import { useState } from "react";
import { MAX_NAME_LEN } from "../core/family/profiles";
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
 * emoji, no system keyboard to hide the screen. "מחק" (delete) is in its
 * own row, red and away from the letters (it sat next to them in the old
 * app and erased names).
 */
export function LetterBoard({ title, initial = "", message, onDone, onCancel }: Props) {
  const [text, setText] = useState(initial);
  const add = (c: string) => setText((t) => (t.length < MAX_NAME_LEN ? t + c : t));

  return (
    <main className="screen board" data-screen="letters">
      <header className="board-top">
        <Tap id="board_cancel" className="quiet" onTap={onCancel}>
          חזרה
        </Tap>
        <h1 className="title">{title}</h1>
        <output className="typed" data-id="typed">
          {text}
          <span className="caret" />
        </output>
      </header>
      <p className="message" role="alert">
        {message ?? ""}
      </p>
      <div className="letters">
        {HEBREW_KEYS.map((c) => (
          <Tap key={c} id={`letter_${c}`} className="key" onTap={() => add(c)}>
            {c}
          </Tap>
        ))}
      </div>
      <div className="actions">
        <Tap id="board_done" className="key done" disabled={text.trim() === ""} onTap={() => onDone(text)}>
          סיום
        </Tap>
        <Tap id="board_space" className="key space" onTap={() => add(" ")}>
          רווח
        </Tap>
        <Tap id="board_delete" className="key delete" onTap={() => setText((t) => t.slice(0, -1))}>
          מחק
        </Tap>
      </div>
    </main>
  );
}
