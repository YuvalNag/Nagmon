import { useEffect, useReducer, useState } from "react";
import type { AnswerOutcome } from "../../core/learning/engine";
import { isolateMath } from "../../core/learning/text";
import type { QuizSession } from "../../core/world/quiz";
import { itemText, t } from "../../i18n";
import { Figure } from "../Figure";
import { Passage } from "../Passage";
import { HELPERS, label, PAD_KEYS, useQuizProbe } from "../QuizScreen";
import { QuizExample } from "../QuizExample";
import { ScreenTime } from "../screenTime";
import { Tap } from "../Tap";
import { pickOptions } from "./effects";
import { MAX_SHOWN, type Presentation, presentationOf } from "./presentation";

interface Props {
  session: QuizSession;
  text: (msgid: string) => string;
  subjectTitle: (subject: string) => string;
  /** The answer was given: the battle plays the result (once for each question). */
  onResult: (outcome: AnswerOutcome) => void;
  /** No question could be made, or the owl's pass was used: the battle goes on from here. */
  onClose: () => void;
}

/** The look of the question now open (the battle uses it to make room at the side). */
export function presentationFor(session: QuizSession): Presentation | null {
  const q = session.question;
  if (!q || session.phase === "none" || session.phase === "example") return null;
  const input = session.input;
  const shown = input === "choice" ? pickOptions(session.choices, String(q.answer), MAX_SHOWN) : session.choices;
  return presentationOf({ input, kind: q.kind, choices: shown });
}

/** The slots around the creature, in the order the answers take them (src/styles.css, .answer-ring). */
const SLOTS = ["a", "b", "c", "d"] as const;

/**
 * The question as a part of the battle (docs/app/BATTLE.md, "the parent's
 * direction"): the question in a panel at the top centre, the answers
 * floating around the wild creature (each a big button of its own, a
 * calm drift that stops for calm effects), a number pad at the bottom
 * end for typed answers, and at the bottom the hint, the helpers, the
 * owl's speech bubble and "I don't know". The creatures stay in view.
 * There is no feedback page: the answer goes to `onResult`.
 */
export function BattleQuestion({ session, text, subjectTitle, onResult, onClose }: Props) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // the tiles tapped so far (order: card ids; letters: tile numbers), for this question only
  const [tapped, setTapped] = useState<{ session: QuizSession; picks: string[] }>({ session, picks: [] });
  const picks = tapped.session === session ? tapped.picks : [];
  const setPicks = (next: string[]) => setTapped({ session, picks: next });
  useQuizProbe(session);
  const answered = session.phase === "feedback" ? session.outcome : null;
  useEffect(() => {
    if (answered) onResult(answered);
    // once for each answer; the callback is the battle's and changes with it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered]);
  const q = session.question;
  const act = (fn: () => unknown) => () => {
    fn();
    redraw();
  };

  if (session.phase === "feedback") return null;

  if (!q || session.phase === "none") {
    return (
      <ScreenTime key="none">
        <section className="quiz-top quiz-none" data-screen="quiz" data-phase="none" role="dialog" aria-label={text("nagmon_quiz_no_question")}>
          <p className="quiz-question">{text("nagmon_quiz_no_question")}</p>
          <Tap id="quiz_continue" className="primary" onTap={onClose}>
            {text("nagmon_continue")}
          </Tap>
        </section>
      </ScreenTime>
    );
  }

  const englishFirst = q.subject === "english";
  const prompt = (
    <div className="quiz-prompt">
      <Passage q={q} />
      {q.figure && <Figure figure={q.figure} />}
      <p className="quiz-question" data-id="quiz_prompt">
        {isolateMath(q.prompt_he)}
        {q.prompt_en && englishFirst && (
          <span className="quiz-en" lang="en" dir="ltr">
            {q.prompt_en}
          </span>
        )}
      </p>
    </div>
  );

  if (session.phase === "example") {
    return (
      <ScreenTime key="example">
        <section className="quiz-top quiz-example" data-screen="quiz" data-phase="example" role="dialog" aria-label={text("nagmon_owl_shows")}>
          <p className="quiz-owl">{text("nagmon_owl_shows")}</p>
          {session.example && <QuizExample example={session.example} englishFirst={englishFirst} />}
          <Tap id="quiz_example_done" className="primary" onTap={act(() => session.exampleDone())}>
            {text("nagmon_lets_try")}
          </Tap>
        </section>
      </ScreenTime>
    );
  }

  const pad = session.usesPad;
  const options = session.input === "choice" ? pickOptions(session.choices, String(q.answer), MAX_SHOWN) : [];
  const look = presentationFor(session)!;
  const tiles = look === "order" || look === "letters" || look === "list";
  const tile = (id: string) => q.choices.find((c) => c.id === id);
  // the word spelled so far, from the letter tiles tapped
  const word = look === "letters" ? picks.map((id) => (tile(id) ? label(tile(id)!, englishFirst) : "")).join("") : "";
  const complete = look === "order" ? picks.length === q.choices.length : picks.length > 0;
  const toggle = (id: string) => setPicks(picks.includes(id) ? picks.filter((x) => x !== id) : [...picks, id]);
  const send = () => {
    if (look === "order") session.arrange(picks);
    else session.spell(word);
    redraw();
  };

  const foot = (
    <div className="quiz-foot" data-pad={pad} data-tiles={tiles}>
      <Tap id="quiz_hint" disabled={!session.canHint} onTap={act(() => session.hint())}>
        {text("nagmon_hint")}
      </Tap>
      {session.helpersOwned().map((h) => (
        <Tap
          key={h.kind}
          id={`quiz_helper_${h.kind}`}
          className="quiz-helper"
          aria-label={`${itemText(HELPERS[h.kind].item, "name")}: ${itemText(HELPERS[h.kind].item, "desc")}`}
          onTap={() => {
            const passed = h.kind === "pass";
            session.useHelper(h.kind);
            if (passed) onClose();
            else redraw();
          }}
        >
          <span aria-hidden="true">{HELPERS[h.kind].icon}</span>
          <small>{h.count}</small>
        </Tap>
      ))}
      {/* the owl's speech bubble: the hint, or what to do */}
      <div className="owl-bubble" data-id="quiz_hint_text" data-hint={!!session.hintText} role="status">
        <span className="owl-face" aria-hidden="true" style={{ backgroundImage: "url(game/sprites/portraits/nagmon_owl.png)" }} />
        <span className="owl-line">{session.hintText ? isolateMath(session.hintText) : t("battlePick")}</span>
      </div>
      <span className="quiz-subject">{subjectTitle(q.subject)}</span>
      <Tap id="quiz_dont_know" onTap={act(() => session.dontKnow())}>
        {text("nagmon_dont_know")}
      </Tap>
    </div>
  );

  return (
    <ScreenTime key="question">
      <section className="quiz-top" data-screen="quiz" data-phase="question" data-kind={q.kind} data-look={look} role="dialog" aria-label={q.prompt_he}>
        {prompt}
        {pad && (
          <p className="quiz-typed" data-id="quiz_typed" aria-live="polite" dir="ltr">
            {session.pad.text || "_"}
          </p>
        )}
        {look === "letters" && (
          <p className="quiz-typed" data-id="quiz_typed" aria-live="polite" dir="ltr">
            {word || "_"}
          </p>
        )}
      </section>
      {session.input === "choice" && look !== "list" && (
        <div className="answer-ring" dir="ltr" data-count={options.length} data-look={look}>
          {options.map((c, i) => {
            // true or false: the thumbs sit in the top slots, "true" at the start of the reading (the right)
            const slot = look === "thumbs" ? (c.id === "true" ? "b" : "a") : SLOTS[i]!;
            return (
              <Tap
                key={c.id}
                id={`quiz_choice_${c.id}`}
                className={`quiz-choice float-${slot}${look === "thumbs" ? " thumb" : ""}`}
                style={{ gridArea: slot }}
                onTap={act(() => session.choose(c.id))}
              >
                {look === "thumbs" && (
                  <span className="thumb-icon" aria-hidden="true">
                    {c.id === "true" ? "👍" : "👎"}
                  </span>
                )}
                {c.image && <img src={`game/emoji/${c.image}.svg`} alt="" />}
                <span>{label(c, englishFirst)}</span>
              </Tap>
            );
          })}
        </div>
      )}
      {look === "list" && (
        <div className="quiz-tiles" data-look="list" dir="rtl">
          {options.map((c) => (
            <Tap key={c.id} id={`quiz_choice_${c.id}`} className="quiz-choice tile" onTap={act(() => session.choose(c.id))}>
              {c.image && <img src={`game/emoji/${c.image}.svg`} alt="" />}
              <span>{label(c, englishFirst)}</span>
            </Tap>
          ))}
        </div>
      )}
      {(look === "order" || look === "letters") && (
        <div className="quiz-tiles" data-look={look} dir={look === "letters" ? "ltr" : "rtl"}>
          {q.choices.map((c) => {
            const n = picks.indexOf(c.id);
            return (
              <Tap key={c.id} id={`quiz_tile_${c.id}`} className="tile" data-picked={n >= 0} aria-pressed={n >= 0} onTap={() => toggle(c.id)}>
                {look === "order" && n >= 0 && (
                  <b className="tile-n" aria-hidden="true">
                    {n + 1}
                  </b>
                )}
                <span>{label(c, englishFirst)}</span>
              </Tap>
            );
          })}
          <Tap id="quiz_key_back" className="key erase" disabled={picks.length === 0} onTap={() => setPicks(picks.slice(0, -1))}>
            {text("nagmon_erase")}
          </Tap>
          <Tap id="quiz_check" className="key check" disabled={!complete} onTap={send}>
            {text("nagmon_check_answer")}
          </Tap>
        </div>
      )}
      {pad && (
        <div className="quiz-keys" dir="ltr">
          {PAD_KEYS.map((k) => (
            <Tap key={k} id={`quiz_key_${k}`} className="key" onTap={act(() => session.press(k))}>
              {k}
            </Tap>
          ))}
          <Tap id="quiz_key_back" className="key erase" onTap={act(() => session.press("back"))}>
            {text("nagmon_erase")}
          </Tap>
          <Tap id="quiz_key_0" className="key" onTap={act(() => session.press("0"))}>
            0
          </Tap>
          <Tap id="quiz_check" className="key check" disabled={!session.pad.text} onTap={act(() => session.check())}>
            {text("nagmon_check_answer")}
          </Tap>
        </div>
      )}
      {foot}
    </ScreenTime>
  );
}
