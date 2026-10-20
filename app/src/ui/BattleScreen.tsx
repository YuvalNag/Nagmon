import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import type { Play } from "../app/play";
import { Battle, type Turn } from "../core/game/battle";
import { needFor } from "../core/game/collection";
import type { Wild } from "../core/game/encounters";
import type { QuizSession } from "../core/world/quiz";
import { t } from "../i18n";
import { gameClock } from "../platform/lifecycle";
import { MonsterPic } from "./MonsterPic";
import { QuizScreen } from "./QuizScreen";
import { ActionBar } from "./battle/ActionBar";
import { BagView } from "./BagView";
import { Sheet } from "./battle/Sheet";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";

interface Props {
  play: Play;
  wild: Wild;
  /** The map's name, for the log. */
  map: string;
  /** The battle is over: won, or the child went on their way. */
  onDone: (won: boolean) => void;
  /** A master's test: twice the health, a badge for a prize. */
  master?: boolean;
  /** Android's back: the same as "going on". */
  leaveRef?: MutableRefObject<(() => void) | null>;
  /** The creatures changed (saved by the battle); the map's HUD may show more. */
  onChanged?: () => void;
}

type View = { k: "meet" } | { k: "question"; session: QuizSession } | { k: "turn"; turn: Turn } | { k: "won"; turn: Turn };

/**
 * One friendly battle on one screen: the wild creature and the child's
 * partner, a question, and the answer is the attack. A wrong answer is
 * "not a problem, nobody is hurt"; the only ways out are winning (the
 * creature becomes a friend) and going on one's way.
 */
export function BattleScreen({ play, wild, map, onDone, master, leaveRef, onChanged }: Props) {
  const battle = useMemo(() => {
    const b = new Battle({
      engine: play.engine,
      world: play.world,
      monsters: play.monsters,
      subjects: play.subjects,
      wild,
      clock: () => gameClock.now(),
      maxChoices: play.maxChoices,
      field: play.field,
      onChange: () => {
        void play.saveWorld();
        void play.saveLearner();
        onChanged?.();
      },
      warn: (m) => play.warn(m),
      ...(master ? { master: true } : {}),
    });
    b.start(map);
    return b;
    // one battle for this meeting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [view, setView] = useState<View>({ k: "meet" });
  const [tick, setTick] = useState(0);
  // a sheet over the arena, from the action bar: the Bag or the Friends
  const [sheet, setSheet] = useState<"bag" | "friends" | null>(null);
  const finished = useRef(false);

  const leave = () => {
    if (finished.current) return;
    finished.current = true;
    battle.run();
    onDone(false);
  };
  const leaveNow = useRef(leave);
  leaveNow.current = leave;
  useEffect(() => {
    if (!leaveRef) return;
    const fn = () => leaveNow.current();
    leaveRef.current = fn;
    return () => {
      if (leaveRef.current === fn) leaveRef.current = null;
    };
  }, [leaveRef]);

  const ask = () => {
    const session = battle.next();
    if (!session) {
      // no question can be made: peace, not a stuck screen
      play.warn("A battle could not make a question");
      leave();
      return;
    }
    setView({ k: "question", session });
  };

  const afterQuestion = () => {
    const turn = battle.last;
    if (!turn) {
      // closed with no answer (Android's back in the question): nothing is counted
      setView({ k: "meet" });
      return;
    }
    setView(turn.won ? { k: "won", turn } : { k: "turn", turn });
    setTick((n) => n + 1);
  };

  const wildName = play.text(wild.species);
  const mine = battle.partner;
  const myName = play.text(mine.species);

  if (view.k === "question") {
    return (
      <div className="battle-ask" data-screen="battle-ask">
        <QuizScreen session={view.session} text={(id) => play.text(id)} subjectTitle={(s) => play.subjects.title(s)} onClose={afterQuestion} />
      </div>
    );
  }

  const turn = view.k === "turn" || view.k === "won" ? view.turn : null;
  let message = t("battleMeet", { name: wildName, level: wild.level });
  const extra: string[] = [];
  if (turn) {
    message = turn.correct ? t("battleHit", { partner: play.text(turn.partnerBefore), name: wildName, damage: turn.damage }) : t("battleMiss");
    if (turn.growth.leveled) extra.push(t("battleLevelUp", { partner: play.text(turn.partnerBefore), level: turn.growth.level }));
    if (turn.growth.evolvedTo) extra.push(t("battleEvolved", { partner: play.text(turn.partnerBefore), name: play.text(turn.growth.evolvedTo) }));
    if (turn.won) extra.unshift(t("battleWon", { name: wildName }), turn.caught ? t("battleCaught", { name: wildName }) : t("battleSeen", { name: wildName }));
  }
  const need = needFor(mine.level);

  return (
    <ScreenTime key={`battle-${view.k}-${tick}`}>
      <section className="battle" data-screen="battle" data-view={view.k} data-hp={battle.hp} data-wild={wild.species}>
        <div className="battle-arena">
        <div className="battle-field" dir="ltr">
          <div className="battle-side mine">
            <div className={turn?.correct ? "battle-pic lunge" : "battle-pic"} key={`m${tick}`}>
              <MonsterPic monsters={play.monsters} species={mine.species} side="back" height={0.3} />
            </div>
            <div className="battle-card" dir="rtl">
              <span className="battle-name">{myName}</span>
              <span className="battle-level">{t("battleLevel", { level: mine.level })}</span>
              <div className="meter xp" role="progressbar" aria-label={t("battleLevel", { level: mine.level })} aria-valuemin={0} aria-valuemax={need} aria-valuenow={mine.xp}>
                <span style={{ width: `${Math.min(100, (100 * mine.xp) / need)}%` }} />
              </div>
            </div>
          </div>
          <div className="battle-side theirs">
            <div className="battle-card" dir="rtl">
              <span className="battle-name">{wildName}</span>
              <span className="battle-level">{t("battleLevel", { level: wild.level })}</span>
              <div
                className="meter hp"
                data-id="wild_hp"
                role="progressbar"
                aria-label={t("battleHealth", { name: wildName, hp: battle.hp, max: battle.maxHp })}
                aria-valuemin={0}
                aria-valuemax={battle.maxHp}
                aria-valuenow={battle.hp}
              >
                <span style={{ width: `${(100 * battle.hp) / battle.maxHp}%` }} />
              </div>
            </div>
            <div className={turn?.correct && !turn.won ? "battle-pic hit" : turn?.won ? "battle-pic friend" : "battle-pic"} key={`w${tick}`}>
              <MonsterPic monsters={play.monsters} species={wild.species} side="front" height={0.3} />
            </div>
          </div>
        </div>
        <p className="battle-message" data-id="battle_message" role="status">
          {message}
          {extra.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </p>
        {view.k === "won" && (
          <Tap
            id="battle_done"
            className="primary battle-continue"
            onTap={() => {
              finished.current = true;
              onDone(true);
            }}
          >
            {t("next")}
          </Tap>
        )}
        </div>
        <ActionBar
          asked={battle.stats.questions > 0}
          calm={view.k === "won"}
          canNet={false}
          onAsk={ask}
          onNet={() => {}}
          onBag={() => setSheet("bag")}
          onFriends={() => setSheet("friends")}
          onLeave={leave}
        />
        {sheet === "bag" && <BagView play={play} battle={{ calm: view.k === "won", onNet: () => setSheet(null) }} onClose={() => setSheet(null)} />}
        {sheet === "friends" && (
          <Sheet title={t("battleFriends")} onClose={() => setSheet(null)}>
            <p />
          </Sheet>
        )}
      </section>
    </ScreenTime>
  );
}
