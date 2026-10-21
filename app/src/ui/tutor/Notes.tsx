import { useState } from "react";
import { type LessonNote, type LessonSave, type NoteUse, useNote as spendNote } from "../../core/game/lessons";
import { t } from "../../i18n";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";
import "./tutor.css";

export interface NotesProps {
  /** The note of the question's skill (`notesFor`: its lesson is passed); null shows nothing at all. */
  note: LessonNote | null;
  /** The question's skill (for the log, which the parent of this component writes). */
  skill: string;
  /** Names the question: opening the sheet again on the same question costs nothing more. */
  questionKey: string;
  /** The child's lessons save now (the charges). */
  save: LessonSave;
  /** The free use of this battle or quiz is gone. */
  freeUsed: boolean;
  /** The sheet was opened by a use that is allowed: the new save, and whether it was the free one. The caller keeps them. */
  onUse: (use: NoteUse) => void;
  /** Notes are off (the lesson's own practice). */
  disabled?: boolean;
}

/** The picture of a note card: an emoji of the game's folder. */
function Picture({ code }: { code: string | null }) {
  return code ? <img className="notes-picture" src={`game/emoji/${code}.svg`} alt="" draggable={false} /> : null;
}

/**
 * The Notes button (a book) and its bottom sheet (docs/app/FEATURES.md
 * 4.17): the lower 45% of the box it sits in, the question left in view
 * above. It shows the lesson's idea card, never the answer. Free once per
 * battle or quiz, then one Note charge each; with none left the button is
 * off and the child just answers. Closed by a tap outside or the X.
 *
 * Mount it anywhere inside a box that has `position: relative` or
 * `absolute` (the question screen, the battle's arena): the sheet fills
 * the bottom of that box. The parent owns the saved state: it gets
 * `onUse` with the new save and writes it, logs it, and tells the quiz
 * session that the notes were opened (`QuizSession.notesOpened`).
 */
export function Notes({ note, skill, questionKey, save, freeUsed, onUse, disabled = false }: NotesProps) {
  // the question the sheet is open on (none: closed), and the ones already paid for
  const [open, setOpen] = useState<string | null>(null);
  const [paid, setPaid] = useState<ReadonlySet<string>>(new Set());
  if (!note) return null;
  const isOpen = open === questionKey;
  const spent = freeUsed && paid.has(questionKey) === false;
  const none = spent && save.charges < 1;

  const press = () => {
    if (paid.has(questionKey)) {
      setOpen(questionKey);
      return;
    }
    const use = spendNote(save, freeUsed);
    if (!use.ok) return;
    setPaid(new Set([...paid, questionKey]));
    onUse(use);
    setOpen(questionKey);
  };

  return (
    <>
      <Tap
        id="notes_open"
        className="notes-button"
        disabled={disabled || none}
        aria-label={t("notesButton")}
        data-skill={skill}
        onTap={press}
      >
        <span aria-hidden="true">📖</span>
        <span>{t("notesButton")}</span>
        {spent && !none && <small>{t("notesLeft", { charges: save.charges })}</small>}
      </Tap>
      {isOpen && (
        <ScreenTime key={`notes-${questionKey}`}>
          <div className="notes-layer" data-screen="notes">
            <Tap id="notes_outside" className="notes-outside" aria-label={t("notesClose")} onTap={() => setOpen(null)} />
            <section className="notes-sheet" role="dialog" aria-label={t("notesTitle")}>
              <Tap id="notes_close" className="notes-x" aria-label={t("notesClose")} onTap={() => setOpen(null)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </Tap>
              <Picture code={note.emoji} />
              <p className="notes-text" data-id="notes_text">
                {note.text}
              </p>
            </section>
          </div>
        </ScreenTime>
      )}
    </>
  );
}
