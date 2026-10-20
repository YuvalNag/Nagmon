import { useEffect, useReducer } from "react";
import { testSeed } from "../app/playConfig";
import type { Choice } from "../core/learning/model";
import { isolateMath } from "../core/learning/text";
import type { HelperKind, QuizSession } from "../core/world/quiz";
import { itemText, t } from "../i18n";
import { Figure } from "./Figure";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";

interface Props {
  session: QuizSession;
  /** A text of the game's catalogue (i18n/he.json), by msgid. */
  text: (msgid: string) => string;
  /** A subject's title ("חשבון"). */
  subjectTitle: (subject: string) => string;
  /** The quiz is done: "continue" after the feedback, or no question to ask. */
  onClose: () => void;
}

/** The Bag's helpers on the question: a picture and the item behind each. */
const HELPERS: Record<HelperKind, { icon: string; item: string }> = {
  hint: { icon: "🪶", item: "hint_feather" },
  fifty: { icon: "🍀", item: "clover" },
  pass: { icon: "🦉", item: "owl_pass" },
};

const PAD_KEYS = ["1", "2", "3", "-", "4", "5", "6", ".", "7", "8", "9", "/"];

function label(c: Choice, englishFirst: boolean): string {
  if (englishFirst && c.text_en) return c.text_en;
  return isolateMath(c.text_he || c.text_en || "");
}

/**
 * A question over the map (the old QuizState): the question, the answers
 * (big choice cards, or a number pad like the parent code's), "רמז" and
 * "לא יודע/ת", then the feedback with the right answer and how to get
 * there. Gentle words only: a wrong answer is "nice try, here is how",
 * never red.
 * - The worked example, the question and the feedback are each their
 *   own screen (ScreenTime): a double tap on an answer does not also
 *   press "continue" where it appears.
 * - Android's back closes the quiz (MapScreen): before an answer nothing
 *   is counted; after it, it is "continue".
 */
export function QuizScreen({ session, text, subjectTitle, onClose }: Props) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  // the browser tests and the emulator check read the question through it (only with the test seed)
  useEffect(() => {
    if (testSeed() === null) return;
    const w = window as Window & { __nagmonQuiz?: () => unknown };
    const read = () => ({ phase: session.phase, kind: session.question?.kind ?? null, answer: session.question?.answer ?? null, skill: session.question?.skill_id ?? null });
    w.__nagmonQuiz = read;
    return () => {
      if (w.__nagmonQuiz === read) delete w.__nagmonQuiz;
    };
  }, [session]);
  const q = session.question;
  const act = (fn: () => unknown) => () => {
    fn();
    redraw();
  };

  if (!q || session.phase === "none") {
    return (
      <ScreenTime key="none">
        <section className="quiz quiz-feedback" data-screen="quiz" data-phase="none" role="dialog" aria-label={text("nagmon_quiz_no_question")}>
          <p className="quiz-headline">{text("nagmon_quiz_no_question")}</p>
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
        <section className="quiz quiz-example" data-screen="quiz" data-phase="example" role="dialog" aria-label={text("nagmon_owl_shows")}>
          <p className="quiz-owl">{text("nagmon_owl_shows")}</p>
          {prompt}
          <p className="quiz-explain" data-id="quiz_example">
            {isolateMath(q.explanation_he)}
          </p>
          <Tap id="quiz_example_done" className="primary" onTap={act(() => session.exampleDone())}>
            {text("nagmon_lets_try")}
          </Tap>
        </section>
      </ScreenTime>
    );
  }

  if (session.phase === "feedback" && session.outcome) {
    const out = session.outcome;
    const headline = out.quality === "super" ? text("nagmon_feedback_super") : out.correct ? text("nagmon_feedback_correct") : session.gaveUp ? t("quizDontKnowFeedback") : text("nagmon_feedback_wrong");
    return (
      <ScreenTime key="feedback">
        <section
          className="quiz quiz-feedback"
          data-screen="quiz"
          data-phase="feedback"
          data-correct={out.correct}
          role="dialog"
          aria-label={headline}
        >
          <p className={out.correct ? "quiz-headline right" : "quiz-headline"} data-id="quiz_headline" role="status">
            {headline}
          </p>
          {!out.correct && out.correct_answer && (
            <p className="quiz-answer" data-id="quiz_answer">
              {text("nagmon_feedback_answer").replace("{answer}", isolateMath(out.correct_answer))}
            </p>
          )}
          {out.explanation_he && (
            <p className="quiz-explain" data-id="quiz_explanation">
              {isolateMath(out.explanation_he)}
            </p>
          )}
          {out.newly_mastered.length > 0 && (
            <p className="quiz-star">{text("nagmon_feedback_star").replace("{skill}", out.newly_mastered.map((s) => session.skillTitle(s)).join(", "))}</p>
          )}
          <Tap id="quiz_continue" className="primary" onTap={onClose}>
            {text("nagmon_continue")}
          </Tap>
        </section>
      </ScreenTime>
    );
  }

  const foot = (
    <div className="quiz-foot">
      <span className="quiz-subject">{subjectTitle(q.subject)}</span>
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
      <Tap id="quiz_dont_know" onTap={act(() => session.dontKnow())}>
        {text("nagmon_dont_know")}
      </Tap>
    </div>
  );
  const hint = session.hintText && (
    <p className="quiz-hint" data-id="quiz_hint_text" role="status">
      {isolateMath(session.hintText)}
    </p>
  );

  if (session.usesPad) {
    return (
      <ScreenTime key="question">
        <section className="quiz quiz-pad" data-screen="quiz" data-phase="question" data-kind={q.kind} role="dialog" aria-label={q.prompt_he}>
          <div className="quiz-side">
            {prompt}
            <p className="quiz-typed" data-id="quiz_typed" aria-live="polite" dir="ltr">
              {session.pad.text || "_"}
            </p>
            {hint}
            {foot}
          </div>
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
        </section>
      </ScreenTime>
    );
  }

  return (
    <ScreenTime key="question">
      <section className="quiz quiz-choices" data-screen="quiz" data-phase="question" data-kind={q.kind} role="dialog" aria-label={q.prompt_he}>
        {prompt}
        {hint}
        <div className="quiz-answers">
          {session.choices.map((c) => (
            <Tap key={c.id} id={`quiz_choice_${c.id}`} className="quiz-choice" onTap={act(() => session.choose(c.id))}>
              {c.image && <img src={`game/emoji/${c.image}.svg`} alt="" />}
              <span>{label(c, englishFirst)}</span>
            </Tap>
          ))}
        </div>
        {foot}
      </section>
    </ScreenTime>
  );
}
