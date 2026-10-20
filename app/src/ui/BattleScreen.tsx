import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import type { Play } from "../app/play";
import { Battle, type SealResult, type Turn } from "../core/game/battle";
import { needFor } from "../core/game/collection";
import type { Wild } from "../core/game/encounters";
import { countOf, giveStarterKit } from "../core/game/items";
import type { QuizSession } from "../core/world/quiz";
import { t } from "../i18n";
import { gameClock } from "../platform/lifecycle";
import { MonsterPic } from "./MonsterPic";
import { QuizScreen } from "./QuizScreen";
import { ActionBar } from "./battle/ActionBar";
import { NameCard } from "./battle/NameCard";
import { LetterBoard } from "./LetterBoard";
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

type View =
  | { k: "meet" }
  | { k: "question"; session: QuizSession }
  | { k: "seal"; session: QuizSession }
  | { k: "turn"; turn: Turn }
  /** The fog is gone: the net is the next step. `seal` is what the last try said. */
  | { k: "calm"; turn: Turn | null; seal: SealResult | null }
  /** A master's test, won. */
  | { k: "won"; turn: Turn }
  | { k: "caught"; seal: SealResult }
  | { k: "naming"; seal: SealResult };

/**
 * One friendly battle on one screen: the wild creature and the child's
 * partner, a question, and the answer is the attack. A wrong answer is
 * "not a problem, nobody is hurt". The fog gone, the creature is calm:
 * Net, a seal question (a wrong answer only means another try), a new
 * friend, and an optional name. Going on is always free.
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
    // the first nets, once
    if (giveStarterKit(play.world, play.economy)) void play.saveWorld();
    return b;
    // one battle for this meeting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [view, setView] = useState<View>({ k: "meet" });
  const [tick, setTick] = useState(0);
  // a sheet over the arena, from the action bar: the Bag or the Friends
  const [sheet, setSheet] = useState<"bag" | "friends" | null>(null);
  // a line that answers a tap that did nothing (no net)
  const [note, setNote] = useState<string | null>(null);
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
    if (view.k === "question" && view.session.outcome) play.logAnswer(view.session, "battle");
    const turn = battle.last;
    if (!turn) {
      // closed with no answer (Android's back in the question): nothing is counted
      setView({ k: "meet" });
      return;
    }
    setView(battle.phase === "calm" ? { k: "calm", turn, seal: null } : turn.won ? { k: "won", turn } : { k: "turn", turn });
    setTick((n) => n + 1);
  };

  /** The Net: a net is thrown at the calm creature, then its seal question. */
  const throwNet = (itemId: string) => {
    setSheet(null);
    if (!battle.throwNet(play.economy, itemId)) return;
    const session = battle.nextSeal(play.economy);
    if (!session) {
      play.warn("A seal could not make a question");
      return;
    }
    setView({ k: "seal", session });
  };

  const onNet = () => {
    const nets = Object.values(play.economy.items).filter((i) => i.kind === "net" && countOf(play.world, i.id) > 0);
    if (nets.length === 0) {
      // never stuck: the owl's spare net, once a day
      const spare = battle.spareNet(play.economy, play.today());
      if (!spare) {
        setNote(t("battleNoNet"));
        return;
      }
      throwNet(spare.id);
    } else if (nets.length === 1) throwNet(nets[0]!.id);
    else setSheet("bag");
  };

  const afterSeal = () => {
    if (view.k !== "seal") return;
    if (view.session.outcome) play.logAnswer(view.session, "seal");
    const seal = battle.lastSeal;
    if (!seal) {
      setView({ k: "calm", turn: null, seal: null });
      return;
    }
    setView(seal.caught ? { k: "caught", seal } : { k: "calm", turn: null, seal });
    setTick((n) => n + 1);
  };

  const wildName = play.text(wild.species);
  const mine = battle.partner;
  const myName = play.text(mine.species);

  if (view.k === "question" || view.k === "seal") {
    return (
      <div className="battle-ask" data-screen="battle-ask" data-seal={view.k === "seal"}>
        <QuizScreen session={view.session} text={(id) => play.text(id)} subjectTitle={(s) => play.subjects.title(s)} onClose={view.k === "seal" ? afterSeal : afterQuestion} />
      </div>
    );
  }

  if (view.k === "naming") {
    const c = battle.partner && play.world.creatures.find((x) => x.id === view.seal.caught?.id);
    return (
      <LetterBoard
        title={t("nameItTitle")}
        onDone={(text) => {
          if (c) battle.nameIt(c.id, text);
          finished.current = true;
          onDone(true);
        }}
        onCancel={() => setView({ k: "caught", seal: view.seal })}
      />
    );
  }

  if (view.k === "caught") {
    const c = view.seal.caught!;
    return (
      <ScreenTime key={`caught-${tick}`}>
        <NameCard
          monsters={play.monsters}
          species={c.species}
          title={t("battleNewFriend", { name: play.text(c.species) })}
          line={view.seal.toMeadow ? t("battleToMeadow") : t("battleJoined")}
          coins={view.seal.coins}
          suggestions={suggestionsFor(c.species, c.level)}
          freeNames={play.profile.settings["free_names"] !== false}
          onPick={(name) => {
            battle.nameIt(c.id, name);
            finished.current = true;
            onDone(true);
          }}
          onOwn={() => setView({ k: "naming", seal: view.seal })}
          onSkip={() => {
            finished.current = true;
            onDone(true);
          }}
        />
      </ScreenTime>
    );
  }

  const turn = view.k === "turn" || view.k === "won" || view.k === "calm" ? view.turn : null;
  const seal = view.k === "calm" ? view.seal : null;
  let message = t("battleMeet", { name: wildName, level: wild.level });
  const extra: string[] = [];
  if (turn) {
    message = turn.correct ? t("battleHit", { partner: play.text(turn.partnerBefore), name: wildName, damage: turn.damage }) : t("battleMiss");
    if (turn.growth.leveled) extra.push(t("battleLevelUp", { partner: play.text(turn.partnerBefore), level: turn.growth.level }));
    if (turn.growth.evolvedTo) extra.push(t("battleEvolved", { partner: play.text(turn.partnerBefore), name: play.text(turn.growth.evolvedTo) }));
    if (view.k === "calm") message = t("battleCalm", { name: wildName });
    if (turn.won && view.k === "won") extra.unshift(t("battleMasterWon", { name: wildName }));
  }
  if (view.k === "calm" && !turn) message = t("battleCalm", { name: wildName });
  if (seal) {
    message = seal.correct ? t("battleSealOpen", { left: seal.left }) : t("battleSealMiss");
    extra.length = 0;
  }
  if (note && view.k === "calm") extra.push(note);
  const need = needFor(mine.level);

  return (
    <ScreenTime key={`battle-${view.k}-${tick}`}>
      <section className="battle" data-screen="battle" data-view={view.k} data-calm={view.k === "calm"} data-hp={battle.hp} data-wild={wild.species}>
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
        {view.k !== "won" && (
          <ActionBar
            asked={battle.stats.questions > 0}
            calm={view.k === "calm"}
            canNet={view.k === "calm"}
            onAsk={ask}
            onNet={onNet}
            onBag={() => setSheet("bag")}
            onFriends={() => setSheet("friends")}
            onLeave={leave}
          />
        )}
        {sheet === "bag" && <BagView play={play} battle={{ calm: view.k === "calm", onNet: throwNet }} onClose={() => setSheet(null)} />}
        {sheet === "friends" && (
          <Sheet title={t("battleFriends")} onClose={() => setSheet(null)}>
            <p />
          </Sheet>
        )}
      </section>
    </ScreenTime>
  );
}

/** Three names to pick from, steady for one creature (the same creature and level, the same three). */
export function suggestionsFor(species: string, level: number): string[] {
  const all = t("nameSuggestions").split(",");
  let h = level;
  for (const ch of species) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [0, 1, 2].map((i) => all[(h + i * 4) % all.length]!);
}
