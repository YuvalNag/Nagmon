import { type MutableRefObject, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { AnswerOutcome } from "../core/learning/engine";
import type { Play } from "../app/play";
import { Battle, type Round, type RoundEvent } from "../core/game/battle";
import type { Selection, TryResult } from "../core/game/befriendTry";
import type { Move } from "../core/game/moves";
import { needFor } from "../core/game/collection";
import type { Wild } from "../core/game/encounters";
import { usable } from "../core/game/faint";
import { seededRng } from "../core/game/rng";
import { giveStarterKit } from "../core/game/items";
import type { QuizSession } from "../core/world/quiz";
import { t } from "../i18n";
import { gameClock } from "../platform/lifecycle";
import { pageSfx } from "../platform/sfx";
import { ageFromProfile } from "../core/family/age";
import { effectsFrom } from "../core/family/effects";
import { ActionBar, type Friend } from "./battle/ActionBar";
import { BefriendResult } from "./battle/BefriendResult";
import { BefriendThrow, type ThrowSound } from "./battle/BefriendThrow";
import { BefriendTray, WORD_TEXT } from "./battle/BefriendTray";
import { BattleQuestion, presentationFor } from "./battle/BattleQuestion";
import { planFor, planForFree } from "./battle/effects";
import * as fxm from "./battle/fx";
import { Pace } from "./battle/pace";
import { answered, asking as askingFlow, type Flow, openWhy, remainingMs, tapped, ticked } from "./battle/resultFlow";
import { ResultBox } from "./battle/ResultBox";
import { ResultsCard } from "./battle/ResultsCard";
import { usesSide } from "./battle/presentation";
import { type EnemyFx, type Fx, Stage } from "./battle/Stage";
import { subjectColor, subjectIcon } from "./battle/subjects";
import { useCalm } from "./battle/useCalm";
import { NameCard } from "./battle/NameCard";
import { LetterBoard } from "./LetterBoard";
import { BagView } from "./BagView";
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
  /** A master's test: a longer fight, a badge for a prize. */
  master?: boolean;
  /** Android's back: the same as "going on". */
  leaveRef?: MutableRefObject<(() => void) | null>;
  /** The creatures changed (saved by the battle); the map's HUD may show more. */
  onChanged?: () => void;
}

/** menu: the cards are open; question: a move's question is open; playing: a round plays; gift: the tray's Gift question; throw: the befriend throw plays; caught, naming: after it. */
type Mode = "menu" | "question" | "playing" | "gift" | "throw" | "caught" | "namecard" | "naming";

/** The test hooks (docs/app/BATTLE_V3.md 12.1): localStorage numbers read once, never set by the game itself. */
function hook(key: string): number | undefined {
  try {
    const v = localStorage.getItem(key);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

/** The browser tests' befriend draws ("0.999,0": a sure fail, then a sure success), read once. */
function diceHook(): number[] | undefined {
  try {
    const v = localStorage.getItem("nagmon.befriend.dice");
    const list = v ? v.split(",").map(Number).filter((n) => Number.isFinite(n) && n >= 0 && n <= 1) : [];
    return list.length ? list : undefined;
  } catch {
    return undefined;
  }
}

/** The lengths of a round's beats, in ms (9.1): our animation, the enemy's, the ticks; the menu is live 0.6 s into the enemy's. */
const BEAT = { ours: 1500, theirs: 1500, swap: 800, asleep: 1400, tick: 400, live: 600 } as const;

export interface BattleProbe {
  phase: string;
  mode: string;
  fog: number;
  maxFog: number;
  pep: number;
  maxPep: number;
  intent: string | null;
  turns: number;
  questions: number;
  needSwap: boolean;
  /** The Befriend tray is open, the tries of this fight, the failed ones, and the chance word of the choice in the tray. */
  tray: boolean;
  tries: number;
  failed: number;
  word: string | null;
  cards: { id: string; left: number | null; dimmed: boolean; hit: string | null }[];
  team: { id: string; fainted: boolean }[];
}

/**
 * One friendly battle on one screen (docs/app/BATTLE_V3.md, S1): the wild
 * creature and the child's partner with their bars, the enemy's intent over
 * it, and a menu of the partner's four moves: the tapped move opens its
 * question, and the answer is the cast. A round then plays: our move, the
 * enemy's action, the end of the round. A friend that falls asleep is
 * swapped for another (free); the fog gone, the creature is calm and the
 * Net (and a seal question) is the next step. Going on is always free.
 */
export function BattleScreen({ play, wild, map, onDone, master, leaveRef, onChanged }: Props) {
  const battle = useMemo(() => {
    const charges = hook("nagmon.battle.charges");
    const pep = hook("nagmon.battle.pep");
    const fog = hook("nagmon.battle.fog");
    const seed = hook("nagmon.battle.seed");
    const dice = diceHook();
    const debug = { ...(pep ? { pep } : {}), ...(fog ? { fog } : {}), ...(charges ? { charges } : {}), ...(dice ? { dice } : {}) };
    const b = new Battle({
      engine: play.engine,
      data: play.battle!,
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
      ...(Object.keys(debug).length ? { debug } : {}),
      ...(seed ? { rng: seededRng(seed) } : {}),
    });
    b.start(map);
    // the first nets, once
    if (giveStarterKit(play.world, play.economy)) void play.saveWorld();
    return b;
    // one battle for this meeting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const calm = useCalm(play.profile.settings);
  useEffect(() => {
    fxm.setCalm(calm);
  }, [calm]);
  const scale = (hook("nagmon.battle.timescale") ?? 1) * (calm ? 0.5 : 1);

  const [mode, setMode] = useState<Mode>("menu");
  // rounds played: a finger that lifts as the menu returns presses nothing
  const [tick, setTick] = useState(0);
  // draws the arena again (a new partner) without making it a new screen
  const [, nudge] = useState(0);
  const [sheet, setSheet] = useState<"bag" | null>(null);
  // the line over the arena: what just happened, or what to do
  const [msg, setMsg] = useState<string | null>(null);
  // the level-up or evolution card, shown over the arena until it is tapped
  const [card, setCard] = useState<{ before: string; evolvedTo: string | null; level: number } | null>(null);
  const finished = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const [, lookChanged] = useReducer((n: number) => n + 1, 0);
  const [flow, setFlow] = useState<Flow>(askingFlow());
  const [fx, setFx] = useState<Fx | null>(null);
  const [enemyFx, setEnemyFx] = useState<EnemyFx | null>(null);
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);
  const fxId = useRef(0);
  // the move being asked, and the question
  const [cast, setCast] = useState<{ session: QuizSession; move: Move } | null>(null);
  // the Befriend tray (the choice in it, or null when closed), the Gift question, the throw in play and what it gave
  const [tray, setTray] = useState<Selection | null>(null);
  const [trayTurn, setTrayTurn] = useState(0);
  const [giftSession, setGiftSession] = useState<QuizSession | null>(null);
  const [flight, setFlight] = useState<{ r: TryResult; id: number } | null>(null);
  const [befriended, setBefriended] = useState<TryResult | null>(null);
  const [mood, setMood] = useState<"lean" | "sniff" | null>(null);
  const autoTray = useRef(false);
  // the bars while a round plays (each beat sets what it shows), and whether the partner lies down already
  const [shown, setShown] = useState<{ fog: number; pep: number } | null>(null);
  const [sleeping, setSleeping] = useState(false);
  // the cards take taps (a tap while a round plays waits for its end)
  const [live, setLive] = useState(true);
  const [queued, setQueued] = useState<string | null>(null);
  const queuedRef = useRef<string | null>(null);
  const paceRef = useRef<Pace | null>(null);
  const flowWait = useRef<(() => void) | null>(null);
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

  // the answer's message box closes by itself, or at a tap
  useEffect(() => {
    if (flow.k !== "result") return;
    const left = remainingMs(flow, performance.now());
    if (left === null) return;
    const id = setTimeout(() => setFlow((f) => ticked(f, performance.now())), left + 4);
    return () => clearTimeout(id);
  }, [flow]);
  useEffect(() => {
    if (flow.k !== "done") return;
    setFlow(askingFlow());
    flowWait.current?.();
    flowWait.current = null;
  }, [flow]);

  // the hook the browser tests read
  useEffect(() => {
    const w = window as unknown as { __nagmonBattle?: () => BattleProbe };
    w.__nagmonBattle = () => ({
      phase: battle.phase,
      mode,
      fog: battle.fog,
      maxFog: battle.maxFog,
      pep: battle.partnerPep.now,
      maxPep: battle.partnerPep.max,
      intent: battle.intent?.id ?? null,
      turns: battle.turns,
      questions: battle.stats.questions,
      needSwap: battle.needSwap,
      tray: tray !== null,
      tries: battle.befriend.tries,
      failed: battle.befriend.failed,
      word: tray ? battle.befriend.chance(tray).word : null,
      cards: battle.cards().map((c) => ({ id: c.move.id, left: c.left, dimmed: c.dimmed, hit: c.hit })),
      team: battle.team().map((c) => ({ id: c.id, fainted: !usable(c) })),
    });
    return () => {
      delete w.__nagmonBattle;
    };
  });

  const wildName = play.text(wild.species);
  const nameOf = (id: string) => {
    const c = play.world.creatures.find((x) => x.id === id);
    return c ? (c.name ?? play.text(c.species)) : "";
  };
  const subjectTitle = (s: string) => play.subjects.title(s);
  const flowDone = () =>
    new Promise<void>((r) => {
      flowWait.current = r;
    });

  /** The words of one beat of a round. */
  const say = (ev: RoundEvent, round: Round): string => {
    if (ev.who === "me") {
      if (ev.kind === "swap") return t("battleSwapped", { name: nameOf(ev.creature) });
      if (ev.kind === "medicine") return t("battleMedicineUsed", { name: nameOf(ev.creature) });
      const move = round.move?.he ?? "";
      const parts = [round.correct || round.move?.tier === "W" ? t("battleCastHit", { move, name: wildName, damage: ev.amount }) : t("battleCastWeak", { damage: ev.amount })];
      if (round.wheel === "sparkle") parts.push(t("battleSparkleHit"));
      if (round.wheel === "sturdy") parts.push(t("battleSturdyHit", { name: wildName }));
      if (round.brilliant) parts.push(t("battleBrilliantHit"));
      return parts.join(" ");
    }
    if (ev.kind === "puff") return t("battlePuff", { name: wildName, partner: nameOf(ev.creature), damage: ev.amount });
    if (ev.kind === "giggle") return t("battleGiggle", { name: wildName });
    return t("battleSilly", { name: wildName });
  };

  /**
   * Plays a round in order (9.1): our beat (the answer's result line shows with it), the enemy's, the end of the
   * round. A tap on the arena speeds it up, a second one skips to its end; a move tapped late in the round waits
   * and starts at its end.
   */
  const playRound = async (round: Round, out: AnswerOutcome | null) => {
    const pace = new Pace(scale);
    paceRef.current = pace;
    fxm.reset();
    queuedRef.current = null;
    setQueued(null);
    setMode("playing");
    setLive(false);
    setSleeping(false);
    const switches = effectsFrom(play.profile.settings);
    for (const ev of round.events) {
      if (!alive.current) return;
      setMsg(say(ev, round));
      setShown({ fog: ev.fog, pep: ev.pep });
      if (ev.who === "me" && ev.kind === "hit") {
        const id = ++fxId.current;
        const question = !!out && round.move?.tier !== "W";
        setFx({
          id,
          correct: round.correct,
          damage: ev.amount,
          won: round.calm && !round.capped,
          plan: question ? planFor(round.correct, calm, ev.amount) : planForFree(ev.amount, calm),
          wheel: round.wheel,
          brilliant: round.brilliant,
        });
        void sfx.play(round.calm ? "win" : round.correct ? "hit" : "oops", switches);
        if (round.correct) sfx.tick(switches);
        if (question && out) {
          setOutcome(out);
          setFlow(answered(out.correct, performance.now()));
          await flowDone();
          if (!alive.current) return;
          setOutcome(null);
        } else await pace.wait(BEAT.ours);
      } else if (ev.who === "me") {
        await pace.wait(BEAT.swap);
      } else {
        const id = ++fxId.current;
        setEnemyFx({ id, kind: ev.kind as EnemyFx["kind"], amount: ev.amount });
        // the menu is live from 0.6 s into the enemy's animation
        setTimeout(() => alive.current && setLive(true), BEAT.live * scale);
        await pace.wait(BEAT.theirs);
        if (!alive.current) return;
        setEnemyFx(null);
      }
    }
    if (round.fainted) {
      setSleeping(true);
      setMsg(t("battleAsleep", { name: nameOf(round.fainted) }));
      await pace.wait(BEAT.asleep);
    }
    await pace.wait(BEAT.tick);
    if (!alive.current) return;
    fxm.reset();
    setShown(null);
    setFx(null);
    setEnemyFx(null);
    setLive(true);
    setCast(null);
    setMsg(round.needSwap ? t("battleAsleep", { name: nameOf(round.fainted ?? battle.partner.id) }) : null);
    setTick((n) => n + 1);
    if (round.growth.leveled) setCard({ before: round.partnerBefore, evolvedTo: round.growth.evolvedTo, level: round.growth.level });
    setMode("menu");
    const next = queuedRef.current;
    queuedRef.current = null;
    setQueued(null);
    if (next && battle.phase === "fighting" && !battle.needSwap) setTimeout(() => alive.current && openMove(next), 0);
  };

  /** The child taps a move: the question opens (the answer is the cast), or a move that asks nothing plays at once. */
  const openMove = (id: string) => {
    const c = battle.choose(id);
    if (!c) {
      if (battle.cards().some((x) => x.move.id === id && !x.dimmed) && battle.phase === "fighting" && !battle.needSwap) {
        // no question can be made: peace, not a stuck screen
        play.warn("A battle could not make a question");
        leave();
      }
      return;
    }
    setMsg(null);
    if (c.round) {
      void playRound(c.round, null);
      return;
    }
    setFlow(askingFlow());
    setFx(null);
    setOutcome(null);
    setCast({ session: c.session!, move: c.move });
    setMode("question");
  };

  const onMove = (id: string) => {
    if (mode === "playing") {
      // a tap late in the round waits for its end
      if (live && battle.phase === "fighting" && !battle.needSwap) {
        queuedRef.current = id;
        setQueued(id);
      }
      return;
    }
    if (mode === "menu") openMove(id);
  };

  /** The answer was given: the cast plays now (our beat, then the enemy's). */
  const onResult = (o: AnswerOutcome) => {
    if (!cast) return;
    play.logAnswer(cast.session, "battle");
    const round = battle.last;
    if (!round || round.n !== battle.turns) return;
    void playRound(round, o);
  };

  /** The question closed with no answer: the owl's pass (a new question for the same move), or the back button. */
  const afterQuestion = () => {
    const open = cast;
    battle.cancel();
    if (open?.session.passed) {
      const again = battle.choose(open.move.id);
      if (again?.session) {
        setCast({ session: again.session, move: again.move });
        return;
      }
    }
    setCast(null);
    setMode("menu");
  };

  /** A friend's portrait: free when the partner fell asleep, otherwise it costs the turn. */
  const onFriend = (id: string) => {
    if (mode !== "menu") return;
    const r = battle.swap(id);
    if (r === "free") {
      setMsg(t("battleSwapped", { name: nameOf(id) }));
      setSleeping(false);
      setTick((n) => n + 1);
      nudge((n) => n + 1);
    } else if (r) void playRound(r, null);
  };

  /** Medicine from the Bag on a sleeping friend. */
  const onMedicine = (itemId: string, creatureId: string): boolean => {
    const r = battle.medicine(creatureId, itemId);
    if (!r) return false;
    setSheet(null);
    setSleeping(false);
    if (r === "free") {
      setMsg(t("battleMedicineUsed", { name: nameOf(creatureId) }));
      setTick((n) => n + 1);
      nudge((n) => n + 1);
    } else void playRound(r, null);
    return true;
  };

  // ---- befriending (docs/app/BATTLE_V3.md 8): the tray, the Gift question, the throw ----

  /** The tray opens on the last choice (or Auto); with no tool at all the owl's spare net comes, once a day. */
  const openTray = (pick?: string) => {
    if (!battle.canBefriend()) return;
    if (battle.befriend.options().tools.length === 0 && !battle.spareNet(play.economy, play.today())) {
      setMsg(t("battleNoNet"));
      return;
    }
    setMsg(null);
    const cur = battle.befriend.initial();
    const o = battle.befriend.options();
    const sel: Selection = !pick ? cur : o.tools.some((x) => x.item.id === pick) ? { ...cur, tool: pick } : { ...cur, treat: pick };
    setTray(sel);
    setMood("lean");
    setTrayTurn((n) => n + 1);
  };

  const closeTray = () => {
    setTray(null);
    setMood(null);
    setTick((n) => n + 1);
  };

  /** The Gift question: normal tier, the creature's subject; right is x1.5, wrong or closed costs nothing. */
  const onGift = () => {
    const q = battle.giftQuestion();
    if (!q) return;
    setFlow(askingFlow());
    setOutcome(null);
    setGiftSession(q);
    setMode("gift");
  };

  const onGiftResult = (o: AnswerOutcome) => {
    if (!giftSession) return;
    play.logAnswer(giftSession, "gift");
    const switches = effectsFrom(play.profile.settings);
    void sfx.play(o.correct ? "hit" : "oops", switches);
    setOutcome(o);
    setFlow(answered(o.correct, performance.now()));
    void flowDone().then(() => {
      if (!alive.current) return;
      setOutcome(null);
      afterGift();
    });
  };

  const afterGift = () => {
    const passed = giftSession?.passed;
    if (passed) {
      const next = battle.giftQuestion();
      if (next) {
        setGiftSession(next);
        return;
      }
    }
    setGiftSession(null);
    const g = battle.befriend.gift;
    setMsg(g === null ? null : g ? t("befriendGiftWon") : t("befriendGiftLost"));
    setMode("menu");
    setTrayTurn((n) => n + 1);
  };

  /** Throw: the outcome is decided now and the throw only shows it (about 4 s, a tap speeds it up, a second skips). */
  const onThrow = () => {
    if (!tray) return;
    const r = battle.tryBefriend(tray);
    setTray(null);
    if (r.kind === "refused") {
      setMood(null);
      setMsg(r.refusal === "full" ? t("befriendFull", { name: wildName }) : r.refusal === "no_tool" ? t("battleNoNet") : null);
      setTick((n) => n + 1);
      return;
    }
    setMsg(null);
    setMood(null);
    setFlight({ r, id: ++fxId.current });
    setMode("throw");
  };

  const throwSound = (s: ThrowSound) => {
    const switches = effectsFrom(play.profile.settings);
    if (s === "shake") sfx.tick(switches);
    else if (s === "win") void sfx.play("win", switches);
    else if (s === "throw") void sfx.play("hit", switches);
  };

  /** The throw is over: a friend (the result card), or a gentle fail (the creature sniffs the net, the chance word moved). */
  const thrown = () => {
    const f = flight;
    setFlight(null);
    if (!f || !alive.current) return;
    const r = f.r;
    setBefriended(r);
    if (r.kind === "caught") {
      if (r.growth?.leveled) setCard({ before: battle.partner.species, evolvedTo: r.growth.evolvedTo, level: r.growth.level });
      setMode("caught");
      return;
    }
    const said = r.nextMercy ? t("befriendSniffMercy", { name: wildName }) : t("befriendSniff", { name: wildName, word: r.nextWord ? t(WORD_TEXT[r.nextWord]) : "" });
    setMsg(r.netBack ? `${said} ${t("befriendNetBack")}` : said);
    setMood("sniff");
    setTimeout(() => alive.current && setMood((m) => (m === "sniff" ? null : m)), 1800 * scale);
    setMode("menu");
    setTick((n) => n + 1);
  };

  // the creature calms: the tray pops up by itself once (T14), after any level-up card
  useEffect(() => {
    if (battle.phase !== "calm" || mode !== "menu" || card || tray || autoTray.current || sheet) return;
    autoTray.current = true;
    openTray();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const mine = battle.partner;
  const myName = nameOf(mine.id);
  const phase = battle.phase;

  if (card && mode !== "question" && mode !== "playing" && mode !== "gift" && mode !== "throw") {
    return (
      <ScreenTime key={`card-${tick}`}>
        <GrowthCard monsters={play.monsters} before={card.before} evolvedTo={card.evolvedTo} level={card.level} name={(sp) => play.text(sp)} onClose={() => setCard(null)} />
      </ScreenTime>
    );
  }

  // the lethal round plays first; the card comes once it is over (or at once when the fight never began)
  if (phase === "carried" && mode !== "playing" && mode !== "question") {
    return (
      <ScreenTime key="carried">
        <section className="growth-card carried" data-screen="carried" role="dialog" aria-label={t("battleCarried")}>
          <p className="title" data-id="battle_carried" role="status">
            {t("battleCarried")}
          </p>
          <Tap
            id="battle_carried_ok"
            className="primary"
            onTap={() => {
              finished.current = true;
              onDone(false);
            }}
          >
            {t("battleCarriedGo")}
          </Tap>
        </section>
      </ScreenTime>
    );
  }

  const friend = befriended?.caught ?? null;
  const leaveCaught = () => {
    finished.current = true;
    onDone(true);
  };

  if (mode === "naming") {
    return (
      <LetterBoard
        title={t("nameItTitle")}
        onDone={(text) => {
          if (friend) battle.nameIt(friend.id, text);
          leaveCaught();
        }}
        onCancel={() => setMode("namecard")}
      />
    );
  }

  // "Name it" is a chip on the result card (8.6): the three suggested names, a name of one's own, or none
  if (mode === "namecard" && friend && befriended) {
    return (
      <ScreenTime key="namecard">
        <NameCard
          monsters={play.monsters}
          species={friend.species}
          title={t("battleNewFriend", { name: play.text(friend.species) })}
          line={befriended.toMeadow ? t("battleToMeadow") : t("battleJoined")}
          coins={0}
          suggestions={suggestionsFor(friend.species, friend.level)}
          freeNames={play.profile.settings["free_names"] !== false}
          onPick={(name) => {
            battle.nameIt(friend.id, name);
            leaveCaught();
          }}
          onOwn={() => setMode("naming")}
          onSkip={leaveCaught}
        />
      </ScreenTime>
    );
  }

  if (mode === "caught" && friend && befriended) {
    return (
      <ScreenTime key="caught">
        <BefriendResult monsters={play.monsters} species={friend.species} name={play.text(friend.species)} r={befriended} canName={play.profile.settings["free_names"] !== false} onNext={leaveCaught} onName={() => setMode("namecard")} />
      </ScreenTime>
    );
  }

  // a question is a part of the battle: the creatures stay in view while the child thinks
  const asking = mode === "question" || mode === "gift";
  const session = mode === "question" ? cast?.session : mode === "gift" ? giftSession : null;
  const calmView = phase === "calm" || phase === "won";
  const view = mode === "question" ? "question" : mode === "gift" ? "gift" : mode === "throw" ? "throw" : mode === "playing" ? "playing" : phase === "calm" ? "calm" : phase === "won" ? "won" : battle.needSwap ? "swap" : battle.turns === 0 ? "meet" : "turn";
  const band = battle.band;
  const detail = band === "A" ? 1 : band === "B" ? 2 : 3;
  const team = battle.team();
  const friends: Friend[] = team.map((c) => ({ id: c.id, species: c.species, name: nameOf(c.id), active: c.id === mine.id, fainted: !usable(c), pep: battle.pepOf(c) / Math.max(1, battle.maxPepOf(c)) }));
  const asleepNames = team.filter((c) => !usable(c)).map((c) => nameOf(c.id));
  const look = session && session.phase !== "feedback" ? presentationFor(session) : null;
  const padAnswer = !!look && usesSide(look) && flow.k === "asking";
  const victory = calmView || !!(asking && fx?.won);
  const pep = battle.partnerPep;
  const loves = battle.revealed() ? battle.loves().map((id) => ({ id, title: subjectTitle(id) })) : null;
  const meet = t("battleMeet", { name: wildName, level: wild.level });
  const line = msg ?? (battle.turns === 0 && mode === "menu" ? meet : null);
  const calmLine = battle.reward?.capped ? t("battleCapped", { name: wildName }) : phase === "won" ? t("battleMasterWon", { name: wildName }) : t("battleCalm", { name: wildName });
  const needBar = mode === "menu" || mode === "playing";
  const trayOpen = tray !== null && mode === "menu";

  return (
    <ScreenTime key="battle">
      <section
        className="battle"
        data-screen="battle"
        data-calm-fx={calm}
        data-view={view}
        data-asking={asking}
        data-flow={flow.k}
        data-calm={phase === "calm"}
        data-tray={trayOpen}
        data-turn={mode === "playing" ? "playing" : "idle"}
        data-hp={shown?.fog ?? battle.fog}
        data-pep={shown?.pep ?? pep.now}
        data-round={battle.turns}
        data-intent={battle.intent?.id ?? "none"}
        data-wild={wild.species}
        data-intro={battle.turns === 0}
      >
        <Stage
          monsters={play.monsters}
          mine={mine}
          myName={myName}
          avatar={play.profile.avatar}
          map={map}
          wildSpecies={wild.species}
          wildName={wildName}
          wildLevel={wild.level}
          hp={shown?.fog ?? battle.fog}
          maxHp={battle.maxFog}
          pep={{ now: shown?.pep ?? pep.now, max: pep.max }}
          asleep={(mode !== "playing" || sleeping) && !usable(mine)}
          need={needFor(mine.level)}
          subject={battle.topic}
          fx={asking || mode === "playing" ? fx : null}
          calm={calm}
          victory={victory}
          pad={padAnswer}
          intent={mode === "playing" || calmView ? null : battle.intent}
          detail={detail}
          loves={loves}
          enemyFx={enemyFx}
          mood={mood}
        >
          {mode === "throw" && flight && <BefriendThrow key={flight.id} r={flight.r} scale={scale} sound={throwSound} onDone={thrown} />}
        </Stage>
        {!asking && calmView && battle.reward && (
          <div className="message-box top" data-id="battle_message" role="status">
            <ResultsCard reward={battle.reward} asleep={asleepNames} line={calmLine} />
            {msg && <span>{msg}</span>}
          </div>
        )}
        {!asking && !(calmView && battle.reward) && line && (
          <p className="message-box top" data-id="battle_message" role="status">
            {line}
          </p>
        )}
        {phase === "won" && (
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
        {mode === "playing" && flow.k !== "result" && (
          <Tap
            id="battle_pace"
            className="skip-layer arena"
            aria-label={t("battleSkip")}
            onTap={() => {
              const p = paceRef.current;
              if (!p) return;
              p.tap();
              fxm.speed(p.speed);
              if (p.done) fxm.skip();
            }}
          />
        )}
        {mode === "question" && cast && (
          <div className="battle-ask" data-screen="battle-ask" data-seal="false" data-pad={padAnswer}>
            <BattleQuestion
              session={cast.session}
              text={(id) => play.text(id)}
              subjectTitle={subjectTitle}
              onResult={onResult}
              onClose={afterQuestion}
              onPhase={lookChanged}
              cast={{ name: cast.move.he, subject: cast.move.subject !== "any" ? subjectTitle(cast.move.subject) : "", icon: subjectIcon(cast.move.subject), color: subjectColor(cast.move.subject) }}
            />
          </div>
        )}
        {mode === "gift" && giftSession && (
          <div className="battle-ask" data-screen="battle-ask" data-seal="true" data-pad={padAnswer}>
            <BattleQuestion session={giftSession} text={(id) => play.text(id)} subjectTitle={subjectTitle} onResult={onGiftResult} onClose={afterGift} onPhase={lookChanged} />
          </div>
        )}
        {asking && flow.k === "result" && outcome && (
          <ResultBox
            outcome={outcome}
            text={(id) => play.text(id)}
            why={flow.why}
            stars={outcome.newly_mastered.map((sk) => session?.skillTitle(sk) ?? sk)}
            onWhy={() => setFlow((f) => openWhy(f))}
            onSkip={() => setFlow((f) => tapped(f, performance.now()))}
          />
        )}
        {mode === "playing" && flow.k === "result" && outcome && (
          <ResultBox
            outcome={outcome}
            text={(id) => play.text(id)}
            why={flow.why}
            stars={outcome.newly_mastered.map((sk) => cast?.session.skillTitle(sk) ?? sk)}
            onWhy={() => setFlow((f) => openWhy(f))}
            onSkip={() => setFlow((f) => tapped(f, performance.now()))}
          />
        )}
        {phase !== "won" && needBar && !trayOpen && (
          <ActionBar
            monsters={play.monsters}
            cards={battle.cards()}
            moveName={(id) => play.battle?.movesById[id]?.he ?? id}
            subjectTitle={subjectTitle}
            friends={friends}
            calm={phase === "calm"}
            canBefriend={battle.canBefriend() && mode === "menu"}
            live={live}
            idle={mode === "menu"}
            queued={queued}
            pick={battle.needSwap}
            turn={tick}
            onMove={onMove}
            onFriend={onFriend}
            onBefriend={() => openTray()}
            onBag={() => setSheet("bag")}
            onLeave={leave}
          />
        )}
        {trayOpen && tray && (
          <BefriendTray
            tools={battle.befriend.options().tools}
            treats={battle.befriend.options().treats}
            tool={tray.tool}
            treat={tray.treat}
            word={battle.befriend.chance(tray).word}
            mercy={battle.befriend.chance(tray).mercy}
            gift={battle.befriend.gift}
            canGift={battle.canBefriend()}
            likedKnown={battle.befriend.likedKnown()}
            turn={trayTurn}
            onTool={(id) => setTray({ ...tray, tool: id })}
            onTreat={(id) => setTray({ ...tray, treat: id })}
            onGift={onGift}
            onAuto={() => setTray(battle.befriend.options().auto)}
            onThrow={onThrow}
            onClose={closeTray}
          />
        )}
        {sheet === "bag" && <BagView play={play} battle={{ canBefriend: battle.canBefriend(), onTool: (id) => { setSheet(null); openTray(id); }, onMedicine, targets: (itemId) => battle.medicineTargets(itemId) }} onClose={() => setSheet(null)} />}
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
