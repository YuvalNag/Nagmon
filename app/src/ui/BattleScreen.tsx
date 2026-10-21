import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import type { AnswerOutcome } from "../core/learning/engine";
import type { Play } from "../app/play";
import { Battle, type BeatResult, type SealResult, type Turn } from "../core/game/battle";
import { atFloor, type Beat } from "../core/game/battleBeats";
import { needFor } from "../core/game/collection";
import type { Wild } from "../core/game/encounters";
import { countOf, giveStarterKit } from "../core/game/items";
import type { QuizSession } from "../core/world/quiz";
import { t } from "../i18n";
import { gameClock } from "../platform/lifecycle";
import { pageSfx } from "../platform/sfx";
import { ageFromProfile } from "../core/family/age";
import { effectsFrom } from "../core/family/effects";
import { ActionBar } from "./battle/ActionBar";
import { BattleQuestion } from "./battle/BattleQuestion";
import { planFor, planForFree } from "./battle/effects";
import { answered, asking as askingFlow, type Flow, openWhy, remainingMs, tapped, ticked } from "./battle/resultFlow";
import { ResultBox } from "./battle/ResultBox";
import { type Fx, Stage } from "./battle/Stage";
import { useCalm } from "./battle/useCalm";
import { NameCard } from "./battle/NameCard";
import { LetterBoard } from "./LetterBoard";
import { BagView } from "./BagView";
import { FriendsView } from "./FriendsView";
import { GrowthCard } from "./battle/GrowthCard";
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
  /** A free beat (a Move or the friend's assist) just played. */
  | { k: "free"; beat: BeatResult }
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
      age: ageFromProfile(play.profile, new Date()),
      field: play.field,
      economy: play.economy,
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
  // draws the arena again (a new partner) without making it a new screen
  const [, nudge] = useState(0);
  // a sheet over the arena, from the action bar: the Bag or the Friends
  const [sheet, setSheet] = useState<"bag" | "friends" | null>(null);
  // a line that answers a tap that did nothing (no net)
  const [note, setNote] = useState<string | null>(null);
  // the level-up or evolution card, shown over the arena until it is tapped
  const [card, setCard] = useState<{ before: string; evolvedTo: string | null; level: number } | null>(null);
  const finished = useRef(false);
  // the result of the answer now playing in the arena, and the message box under it
  const [flow, setFlow] = useState<Flow>(askingFlow());
  const [fx, setFx] = useState<Fx | null>(null);
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);
  const fxId = useRef(0);
  // a Special's medals, from its start until the next beat
  const [medals, setMedals] = useState<(boolean | null)[] | null>(null);
  const calm = useCalm(play.profile.settings);
  // three little sounds and a tick, each behind the parents' switch
  const sfx = useMemo(() => pageSfx(), []);

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
    setFlow(askingFlow());
    setFx(null);
    setOutcome(null);
    setView({ k: "question", session });
  };

  /** The answer was given: the result plays in the arena now, and the message box opens under it. */
  const onResult = (o: AnswerOutcome) => {
    if (view.k !== "question" && view.k !== "seal") return;
    const turn = view.k === "question" ? battle.last : null;
    // the answer is counted when it is given, not when the box closes
    play.logAnswer(view.session, view.k === "seal" ? "seal" : "battle");
    const switches = effectsFrom(play.profile.settings);
    const won = view.k === "seal" ? !!battle.lastSeal?.caught : !!turn?.won;
    void sfx.play(won ? "win" : o.correct ? "hit" : "oops", switches);
    if (o.correct) sfx.tick(switches);
    if (turn?.burst) setMedals([...turn.burst.medals]);
    setOutcome(o);
    setFx({ id: ++fxId.current, correct: o.correct, damage: turn?.damage ?? 0, won: !!turn?.won, plan: planFor(o.correct, calm) });
    setFlow(answered(o.correct, performance.now()));
  };

  // the message box closes by itself, or at a tap
  useEffect(() => {
    if (flow.k !== "result") return;
    const left = remainingMs(flow, performance.now());
    if (left === null) return;
    const id = setTimeout(() => setFlow((f) => ticked(f, performance.now())), left + 4);
    return () => clearTimeout(id);
  }, [flow]);
  const closeRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (flow.k !== "done") return;
    setFlow(askingFlow());
    closeRef.current();
  }, [flow]);

  /** The child picks one of the big cards. */
  const onBeat = (beat: Beat) => {
    if (beat === "power" || beat === "special") {
      if (!battle.pick(beat)) return;
      setMedals(beat === "special" ? [...battle.burst!.medals] : null);
      if (beat === "special") void sfx.play("win", effectsFrom(play.profile.settings));
      ask();
      return;
    }
    setMedals(null);
    const r = battle.pick(beat);
    if (!r) return;
    const switches = effectsFrom(play.profile.settings);
    void sfx.play(r.damage > 0 ? "hit" : "oops", switches);
    setNote(null);
    setView({ k: "free", beat: r });
    // the old result clears first, so the attack plays again for each beat
    setFx(null);
    const id = ++fxId.current;
    setTimeout(() => setFx((cur) => cur ?? { id, correct: true, damage: r.damage, won: false, plan: planForFree(r.damage, calm) }), 40);
  };

  const afterQuestion = () => {
    if (view.k === "question" && view.session.passed) {
      // the owl's pass: a new question, nothing counted
      ask();
      return;
    }
    const turn = battle.last;
    if (turn?.burst && !turn.burst.over && battle.phase === "fighting" && view.k === "question") {
      // the burst goes on: the next of its three questions
      if (turn.growth.leveled) setCard({ before: turn.partnerBefore, evolvedTo: turn.growth.evolvedTo, level: turn.growth.level });
      ask();
      return;
    }
    if (!turn) {
      // closed with no answer (Android's back in the question): nothing is counted
      setView({ k: "meet" });
      return;
    }
    if (turn.growth.leveled) setCard({ before: turn.partnerBefore, evolvedTo: turn.growth.evolvedTo, level: turn.growth.level });
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
    if (view.session.passed) {
      const next = battle.nextSeal(play.economy);
      if (next) setView({ k: "seal", session: next });
      return;
    }
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

  if (card && (view.k === "turn" || view.k === "calm" || view.k === "won")) {
    return (
      <ScreenTime key={`card-${tick}`}>
        <GrowthCard monsters={play.monsters} before={card.before} evolvedTo={card.evolvedTo} level={card.level} name={(sp) => play.text(sp)} onClose={() => setCard(null)} />
      </ScreenTime>
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

  // a question is a part of the battle: the creatures stay in view while the child thinks
  const asking = view.k === "question" || view.k === "seal";
  const turn = view.k === "turn" || view.k === "won" || view.k === "calm" ? view.turn : null;
  const free = view.k === "free" ? view.beat : null;
  const seal = view.k === "calm" ? view.seal : null;
  let message = t("battleMeet", { name: wildName, level: wild.level });
  const extra: string[] = [];
  if (turn) {
    message = turn.correct ? t("battleHit", { partner: play.text(turn.partnerBefore), name: wildName, damage: turn.damage }) : t("battleMiss");
    if (view.k === "calm") message = turn.capped ? t("battleCapped", { name: wildName }) : t("battleCalm", { name: wildName });
    if (turn.won && view.k === "won") extra.unshift(t("battleMasterWon", { name: wildName }));
    if (turn.capped && view.k === "won") extra.unshift(t("battleCapped", { name: wildName }));
  }
  if (free) {
    message =
      free.damage <= 0
        ? t("battleHalfFog", { name: wildName })
        : free.beat === "assist"
          ? t("battleAssistHit", { name: wildName, damage: free.damage })
          : t("battleMoveHit", { partner: play.text(mine.species), name: wildName, damage: free.damage });
  }
  if (turn?.burst?.over && view.k === "turn") {
    const b = turn.burst;
    message = b.combo === 0 ? t("battleSpecialEnd") : b.medals.includes(false) ? `${t("battleSpecialDone", { n: b.combo })} ${t("battleSpecialEnd")}` : t("battleSpecialDone", { n: b.combo });
  }
  if (view.k === "calm" && !turn) message = t("battleCalm", { name: wildName });
  if (seal) {
    message = seal.correct ? t("battleSealOpen", { left: seal.left }) : t("battleSealMiss");
    extra.length = 0;
  }
  if (note && view.k === "calm") extra.push(note);
  const need = needFor(mine.level);
  const session = asking ? view.session : null;
  const padAnswer = !!session && session.phase !== "feedback" && session.usesPad && flow.k === "asking";
  const victory = view.k === "calm" || view.k === "won" || !!(asking && fx?.won);
  closeRef.current = view.k === "seal" ? afterSeal : afterQuestion;

  return (
    <ScreenTime key={`battle-${asking ? "ask" : view.k === "free" ? "meet" : view.k}-${tick}`}>
      <section className="battle" data-screen="battle" data-calm-fx={calm} data-view={view.k} data-asking={asking} data-flow={flow.k} data-calm={view.k === "calm"} data-hp={battle.hp} data-wild={wild.species}>
        <Stage
          monsters={play.monsters}
          mine={mine}
          myName={myName}
          avatar={play.profile.avatar}
          wildSpecies={wild.species}
          wildName={wildName}
          wildLevel={wild.level}
          hp={battle.hp}
          maxHp={battle.maxHp}
          need={need}
          subject={battle.topic}
          fx={asking || view.k === "free" ? fx : null}
          calm={calm}
          victory={victory}
          pad={padAnswer}
          charge={{ filled: battle.meter, size: battle.meterSize }}
          medals={medals}
        />
        {!asking && (
          <p className="message-box top" data-id="battle_message" role="status">
            {message}
            {extra.map((x) => (
              <span key={x}>{x}</span>
            ))}
          </p>
        )}
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
        {asking && (
          <div className="battle-ask" data-screen="battle-ask" data-seal={view.k === "seal"} data-pad={padAnswer}>
            <BattleQuestion
              session={view.session}
              text={(id) => play.text(id)}
              subjectTitle={(sub) => play.subjects.title(sub)}
              onResult={onResult}
              onClose={view.k === "seal" ? afterSeal : afterQuestion}
            />
          </div>
        )}
        {asking && flow.k === "result" && outcome && (
          <ResultBox
            outcome={outcome}
            text={(id) => play.text(id)}
            why={flow.why}
            stars={outcome.newly_mastered.map((sk) => view.session.skillTitle(sk))}
            onWhy={() => setFlow((f) => openWhy(f))}
            onSkip={() => setFlow((f) => tapped(f, performance.now()))}
          />
        )}
        {view.k !== "won" && !asking && (
          <ActionBar
            asked={battle.stats.questions > 0}
            calm={view.k === "calm"}
            canNet={view.k === "calm"}
            legal={battle.legal()}
            assistsLeft={battle.assistsLeft}
            nudge={atFloor(battle.hp, battle.maxHp)}
            onBeat={onBeat}
            onNet={onNet}
            onBag={() => setSheet("bag")}
            onFriends={() => setSheet("friends")}
            onLeave={leave}
          />
        )}
        {sheet === "bag" && <BagView play={play} battle={{ calm: view.k === "calm", onNet: throwNet }} onClose={() => setSheet(null)} />}
        {sheet === "friends" && <FriendsView play={play} battle={battle} onClose={() => setSheet(null)} onChanged={() => nudge((n) => n + 1)} />}
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
