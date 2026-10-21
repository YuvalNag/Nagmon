import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import type { Play } from "../../app/play";
import {
  addCharges,
  finishPractice,
  type Lesson,
  lessonLocked,
  lessonRewards,
  lessonsAt,
  stampCard,
} from "../../core/game/lessons";
import { QuizSession } from "../../core/world/quiz";
import { getLogger } from "../../platform/appLog";
import { gameClock } from "../../platform/lifecycle";
import { QuizScreen } from "../QuizScreen";
import { LessonAgain, LessonNoQuestion, LessonResult, type Passed } from "./LessonResult";
import { LessonList, type LessonRow } from "./LessonList";
import { LessonPlayer } from "./LessonPlayer";

const log = getLogger("nagmon.tutor");

/** The people who teach: talking to them opens their lessons (events.ts `open_tutor`). */
export const TUTOR_NPCS: readonly string[] = ["nagmon_house_tutor"];

/** How many times a practice question is asked for before there is "no question now". */
const PRACTICE_TRIES = 6;

type Step =
  | { kind: "list" }
  | { kind: "cards"; lesson: Lesson; index: number }
  | { kind: "practice"; lesson: Lesson; session: QuizSession; n: number }
  | { kind: "again"; lesson: Lesson }
  | { kind: "noquestion" }
  | { kind: "passed"; passed: Passed };

interface Props {
  play: Play;
  lessons: readonly Lesson[];
  /** Whose lessons: an institute id, or "all". */
  institute: string;
  /** The tutor is left: the map goes on. */
  onClose: () => void;
  /** The coins changed (the map's counter). */
  onChanged: () => void;
  /** Android's back: one step back inside the tutor; it leaves from the list. */
  backRef?: MutableRefObject<(() => void) | null>;
}

/**
 * The tutor's room (docs/app/FEATURES.md 4.17): the lesson list, the
 * lesson's cards, one tiny practice question on the quiz screen, then
 * the coins and the stamp. A wrong answer costs nothing: the tutor says
 * to look at the cards again, as often as the child likes.
 */
export function TutorScreen({ play, lessons, institute, onClose, onChanged, backRef }: Props) {
  const [step, setStep] = useState<Step>({ kind: "list" });
  const stepRef = useRef(step);
  stepRef.current = step;
  const seq = useRef(0);
  const mine = lessonsAt(lessons, institute);

  const rows: LessonRow[] = mine.map((lesson) => {
    const skill = play.engine.content.get(lesson.skill);
    const level = skill ? play.engine.learner.gradeIn(skill.subject) : play.profile.grade;
    return { lesson, locked: skill ? lessonLocked(skill.grade, level) : false };
  });

  const open = (lesson: Lesson) => {
    play.field.lesson({ step: "open", id: lesson.id });
    setStep({ kind: "cards", lesson, index: 0 });
  };

  /** The practice: a question of the lesson's skill on the normal quiz screen; no Notes in it. */
  const practice = useCallback(
    (lesson: Lesson) => {
      for (let i = 0; i < PRACTICE_TRIES; i++) {
        const session: QuizSession = new QuizSession(
          play.engine,
          { topic: lesson.skill, context: "lesson", maxChoices: play.maxChoices },
          () => gameClock.now(),
          () => {
            // the learner first, and at once: a kill now loses nothing
            void play.saveLearner();
            play.logAnswer(session, "lesson");
            play.field.lesson({ step: "practice", id: lesson.id, ok: session.outcome?.correct ?? false });
          },
          (m) => log.warning(m),
        );
        if (session.question) {
          setStep({ kind: "practice", lesson, session, n: ++seq.current });
          return;
        }
      }
      log.warning(`No practice question for lesson ${lesson.id}`);
      setStep({ kind: "noquestion" });
    },
    [play],
  );

  /** The practice screen closed: a right answer passes, anything else shows the cards again. */
  const practiced = (lesson: Lesson, session: QuizSession) => {
    if (!session.outcome) {
      // closed with back before answering: nothing counted, back to the cards
      setStep({ kind: "cards", lesson, index: 0 });
      return;
    }
    const result = finishPractice(lesson, play.world.lessons, play.today(), lessonRewards(play.profile.settings), session.outcome.correct);
    if (!result.award) {
      setStep({ kind: "again", lesson });
      return;
    }
    const { award } = result;
    // one note charge for a first pass, the tutor's gift
    const gift = award.first ? 1 : 0;
    play.world.lessons = gift ? addCharges(award.state, gift) : award.state;
    if (award.coins > 0) play.world.addMoney(award.coins);
    play.field.lesson({ step: "pass", id: lesson.id, ok: true, coins: award.coins, first: award.first });
    void play.saveWorld();
    onChanged();
    setStep({ kind: "passed", passed: { lesson, coins: award.coins, first: award.first, gift, card: stampCard(mine, play.world.lessons), total: play.world.money } });
  };

  const back = useCallback(() => {
    const s = stepRef.current;
    switch (s.kind) {
      case "cards":
        setStep(s.index > 0 ? { ...s, index: s.index - 1 } : { kind: "list" });
        return;
      case "practice":
        setStep({ kind: "cards", lesson: s.lesson, index: s.lesson.cards.length - 1 });
        return;
      case "again":
      case "noquestion":
      case "passed":
        setStep({ kind: "list" });
        return;
      case "list":
        onClose();
        return;
    }
  }, [onClose]);

  useEffect(() => {
    if (!backRef) return;
    backRef.current = back;
    return () => {
      if (backRef.current === back) backRef.current = null;
    };
  }, [backRef, back]);

  switch (step.kind) {
    case "list":
      return <LessonList rows={rows} save={play.world.lessons} coins={play.world.money} onPick={open} onClose={onClose} />;
    case "cards":
      return (
        <LessonPlayer
          lesson={step.lesson}
          index={step.index}
          onBack={back}
          onNext={() => (step.index + 1 < step.lesson.cards.length ? setStep({ ...step, index: step.index + 1 }) : practice(step.lesson))}
        />
      );
    case "practice": {
      const { lesson, session } = step;
      return (
        <QuizScreen
          key={step.n}
          session={session}
          text={(id) => play.text(id)}
          subjectTitle={(s) => play.subjects.title(s)}
          onClose={() => practiced(lesson, session)}
        />
      );
    }
    case "again":
      return <LessonAgain lesson={step.lesson} onGo={() => setStep({ kind: "cards", lesson: step.lesson, index: 0 })} onBack={() => setStep({ kind: "list" })} />;
    case "noquestion":
      return <LessonNoQuestion onBack={() => setStep({ kind: "list" })} />;
    case "passed":
      return <LessonResult passed={step.passed} onDone={() => setStep({ kind: "list" })} />;
  }
}
