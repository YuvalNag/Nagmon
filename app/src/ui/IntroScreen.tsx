import { useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Play } from "../app/play";
import { Placement, PLACEMENT_QUESTIONS } from "../core/game/placement";
import { finishIntro } from "../core/game/intro";
import { pickStarters, starterLevel, type StarterOption } from "../core/game/starters";
import { pages } from "../core/world/dialog";
import { gameClock } from "../platform/lifecycle";
import { t } from "../i18n";
import { artUrl } from "../game/art";
import { Dialog } from "./Dialog";
import { MonsterPic } from "./MonsterPic";
import { QuizScreen } from "./QuizScreen";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";
import type { QuizSession } from "../core/world/quiz";

/** The subject the first chapter is about (the solar system trip). */
export const CHAPTER_SUBJECT = "science";

const REASONS = { chapter: "starterChapter", strong: "starterStrong", friend: "starterFriend", other: "starterOther" } as const;

type Step =
  | { k: "hello" }
  | { k: "ask"; session: QuizSession; n: number }
  | { k: "starters" }
  | { k: "pick"; options: StarterOption[] }
  | { k: "picked"; species: string };

interface Props {
  play: Play;
  /** The intro is over: the world opens. */
  onDone: () => void;
  /** Android's back turns a dialog's page. */
  advanceRef?: MutableRefObject<(() => void) | null>;
  /** The coins and the creature changed. */
  onChanged?: () => void;
  chapterSubject?: string;
}

/**
 * The owl's intro (the old game's first minutes, with placement): the
 * owl says hello, asks five or six questions in different subjects that
 * only set where each subject starts (a wrong answer blocks nothing), and
 * then the child always chooses one of three creatures. Then the world opens.
 */
export function IntroScreen({ play, onDone, advanceRef, onChanged, chapterSubject = CHAPTER_SUBJECT }: Props) {
  const placement = useMemo(
    () => new Placement(play.engine, { grade: play.profile.grade, clock: () => gameClock.now(), maxChoices: play.maxChoices, warn: (m) => play.warn(m) }),
    [play],
  );
  const [step, setStep] = useState<Step>({ k: "hello" });
  const total = useRef(0);

  const askNext = () => {
    const session = placement.next();
    if (!session) {
      // the placement is over: the levels are the learner's, saved at once
      const result = placement.apply();
      play.field.placement(result.levels);
      void play.saveLearner();
      setStep({ k: "starters" });
      return;
    }
    total.current = Math.max(total.current, placement.history.length + 1);
    setStep({ k: "ask", session, n: placement.history.length + 1 });
  };

  const answered = (session: QuizSession) => {
    if (session.outcome) play.logAnswer(session, "placement");
    placement.answered(session);
    askNext();
  };

  const choose = (o: StarterOption) => {
    const level = starterLevel(placement.result().levels[o.subject] ?? play.profile.grade);
    finishIntro(play.world, o.species, level);
    play.field.note("starter", { species: o.species, subject: o.subject, level });
    void play.saveWorld();
    onChanged?.();
    setStep({ k: "picked", species: o.species });
  };

  /** `cards[i]` is the story card (an art id) behind the pages of `texts[i]`; the last card stays for a text with none. */
  const say = (texts: string[], then: () => void, cards: (string | null)[] = []) => {
    const pageList = texts.map((x) => pages(x));
    let card: string | undefined;
    const art = pageList.flatMap((list, i) => {
      card = cards[i] ? artUrl(cards[i]!) : card;
      return list.map(() => card);
    });
    return (
      <ScreenTime key={`say-${step.k}`}>
        <Dialog pages={pageList.flat()} art={cards.length ? art : undefined} onDone={then} advanceRef={advanceRef} />
      </ScreenTime>
    );
  };

  switch (step.k) {
    case "hello":
      return say([t("introHello", { name: play.profile.name }), t("introStory"), t("introQuestions")], askNext, ["card_owl_help", "card_forgetting_fog", null]);
    case "ask":
      return (
        <div className="intro-ask" data-screen="intro-ask" data-n={step.n}>
          <QuizScreen
            key={step.n}
            session={step.session}
            text={(id) => play.text(id)}
            subjectTitle={(s) => play.subjects.title(s)}
            onClose={() => answered(step.session)}
          />
          <p className="intro-progress" role="status">
            {t("introQuestionOf", { n: step.n, total: Math.min(PLACEMENT_QUESTIONS, Math.max(total.current, step.n)) })}
          </p>
        </div>
      );
    case "starters":
      return say([t("introStarters")], () => {
        const options = pickStarters({
          monsters: play.monsters,
          subjects: play.subjects,
          levels: placement.result().levels,
          chapterSubject,
          seed: Math.floor(Math.random() * 2 ** 31),
        });
        setStep({ k: "pick", options });
      }, ["card_creature_steps"]);
    case "pick":
      return (
        <ScreenTime key="pick">
          <section className="screen intro-pick" data-screen="intro-starters">
            <h1 className="title">{t("introPickTitle")}</h1>
            <div className="starters">
              {step.options.map((o) => (
                <Tap key={o.species} id={`starter_${o.species}`} className="card starter" onTap={() => choose(o)}>
                  <MonsterPic monsters={play.monsters} species={o.species} height={0.3} />
                  <span className="starter-name">{play.text(o.species)}</span>
                  <span className="starter-why">{play.subjects.title(o.subject)}</span>
                  <span className="starter-reason">{t(REASONS[o.reason])}</span>
                </Tap>
              ))}
            </div>
          </section>
        </ScreenTime>
      );
    case "picked":
      return say([t("introPicked", { creature: play.text(step.species) })], onDone, ["card_colors_return"]);
  }
}
