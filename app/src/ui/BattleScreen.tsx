import { type MutableRefObject, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { AnswerOutcome } from "../core/learning/engine";
import type { Play } from "../app/play";
import { Battle, type Effect, type Round, type RoundEvent } from "../core/game/battle";
import type { Selection, TryResult } from "../core/game/befriendTry";
import type { IntentId, StatusId } from "../core/data/battleTypes";
import type { Move } from "../core/game/moves";
import { needFor } from "../core/game/collection";
import type { Wild } from "../core/game/encounters";
import { readyToEvolve } from "../core/game/evolution";
import { usable } from "../core/game/faint";
import { seededRng } from "../core/game/rng";
import { giveStarterKit } from "../core/game/items";
import type { QuizSession } from "../core/world/quiz";
import { itemText, t } from "../i18n";
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
import { type Aura, type EnemyFx, type Fx, Stage } from "./battle/Stage";
import { INTENT_ICON, STATUS_GLYPH, subjectColor, subjectIcon } from "./battle/subjects";
import type { StatusLook } from "./battle/StatusBadges";
import { useCalm } from "./battle/useCalm";
import { NameCard } from "./battle/NameCard";
import { LetterBoard } from "./LetterBoard";
import { BagView } from "./BagView";
import { GrowthCard } from "./battle/GrowthCard";
import { EvolveOffer } from "./battle/EvolveOffer";
import { evolutionScale } from "./evolution/scale";
import { Evolution, Later } from "./lazy";
import { ScreenTime } from "./screenTime";
import { Tap } from "./Tap";
import "../i18nEvolution";

interface Props {
  play: Play;
  wild: Wild;
  /** The map's name, for the log. */
  map: string;
  /** The battle is over: won, or the child went on their way; `carried`: the whole team fell asleep and was carried back (the map takes the child to the Rest Center). */
  onDone: (won: boolean, carried?: boolean) => void;
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
const BEAT = { ours: 1500, theirs: 1500, swap: 800, asleep: 1400, tick: 400, live: 600, quick: 900 } as const;

/** The glyph of an effect's glow on a creature. */
const AURA_GLYPH: Record<Effect["kind"], string> = {
  status: "💫",
  heal: "💚",
  shield: "🫧",
  regen: "🌿",
  boost: "⬆️",
  weaken: "⬇️",
  cleanse: "🍃",
  mirror: "🪞",
  mark: "🔖",
  reveal: "🔍",
  focus: "🎯",
  swap_boosts: "🔀",
  echo: "🔁",
  resist: "🔒",
  spark: "⭐",
  windup: "⭕",
};

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
  spark: number;
  yawning: boolean;
  finale: { ready: boolean; spark: number } | null;
  badges: { mine: string[]; theirs: string[] };
  peek: string[];
  windup: boolean;
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
    const spark = hook("nagmon.battle.spark");
    let intents: IntentId[] | undefined;
    try {
      const raw = localStorage.getItem("nagmon.battle.intents");
      if (raw) intents = raw.split(",").filter((x) => x in INTENT_ICON) as IntentId[];
    } catch {
      intents = undefined;
    }
    const dice = diceHook();
    const debug = { ...(intents ? { intents } : {}), ...(pep ? { pep } : {}), ...(fog ? { fog } : {}), ...(charges ? { charges } : {}), ...(spark ? { spark } : {}), ...(dice ? { dice } : {}) };
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
  const [card, setCard] = useState<{ species: string; level: number } | null>(null);
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
  const [auras, setAuras] = useState<Aura[]>([]);
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
  // the evolution after a fight (7.1): "feels something warm" once, then the scene; the tray waits for both
  const [offer, setOffer] = useState<string | null>(null);
  const [evolving, setEvolving] = useState<{ id: string; from: string; to: string } | null>(null);
  const offered = useRef(false);
  const offerOpen = useRef(false);
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
      spark: battle.spark,
      yawning: battle.yawning,
      finale: battle.finaleCard() ? { ready: battle.finaleCard()!.ready, spark: battle.spark } : null,
      badges: { mine: battle.badgesOf("mine").map((b) => b.id), theirs: battle.badgesOf("theirs").map((b) => b.id) },
      peek: battle.peek,
      windup: !!battle.windup,
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
  const statusLook: StatusLook = {
    name: (id: StatusId) => play.battle?.statusesById[id]?.he ?? id,
    hex: (id: StatusId) => play.battle?.statusesById[id]?.hex ?? "#c8c8d8",
    stat: (st: string) => t(`stat_${st}` as "stat_power"),
    subject: subjectTitle,
  };
  const flowDone = () =>
    new Promise<void>((r) => {
      flowWait.current = r;
    });

  const stat = (st: string) => t(`stat_${st}` as "stat_power");
  /** One line for what a move did besides taking Fog (the child's own effects only: the enemy's mist has its own beat). */
  const effectLine = (e: Effect, partner: string): string | null => {
    switch (e.kind) {
      case "status":
        return e.on === "them" && e.status ? t(`battleStatusOn_${e.status}` as "battleStatusOn_slow", { name: wildName }) : null;
      case "resist":
        return t("battleResist", { name: wildName });
      case "weaken":
        return t("battleWeakened", { stat: stat(e.stat ?? "power"), name: wildName });
      case "boost":
        return t("battleBoosted", { stat: stat(e.stat ?? "power"), partner });
      case "shield":
        return t("battleShielded", { partner });
      case "heal":
        return t("battleHealed", { partner, n: e.amount ?? 0 });
      case "regen":
        return t("battleRegen");
      case "cleanse":
        return t("battleCleansed", { partner });
      case "mirror":
        return t("battleMirror");
      case "mark":
        return t("battleMark", { name: wildName });
      case "reveal":
        return t("battleRevealed", { name: wildName });
      case "focus":
        return t("battleFocus");
      case "swap_boosts":
        return t("battleSwapBoosts");
      case "echo":
        return t("battleEcho");
      default:
        return null;
    }
  };
  /** The effects of the child's own move, in the order they happened (the enemy's mist is not one of them). */
  const myEffects = (round: Round) => round.effects.filter((e) => !(e.on === "me" && (e.kind === "status" || e.kind === "windup")) && e.kind !== "windup");

  /** The words of one beat of a round. */
  const say = (ev: RoundEvent, round: Round): string => {
    if (ev.who === "me") {
      if (ev.kind === "swap") return t("battleSwapped", { name: nameOf(ev.creature) });
      if (ev.kind === "medicine") return t("battleMedicineUsed", { name: nameOf(ev.creature) });
      const move = round.move?.he ?? "";
      const partner = nameOf(ev.creature);
      const lines = myEffects(round).map((e) => effectLine(e, partner)).filter((x): x is string => !!x);
      if (ev.kind === "utility") return [t("battleUtility", { move }), ...lines.slice(0, 2)].join(" ");
      const parts = [round.correct || round.move?.tier === "W" || round.move?.question === "none" ? t("battleCastHit", { move, name: wildName, damage: ev.amount }) : t("battleCastWeak", { damage: ev.amount })];
      if (round.wheel === "sparkle") parts.push(t("battleSparkleHit"));
      if (round.wheel === "sturdy") parts.push(t("battleSturdyHit", { name: wildName }));
      if (round.brilliant) parts.push(t("battleBrilliantHit"));
      if (lines[0]) parts.push(lines[0]);
      return parts.join(" ");
    }
    const partner = nameOf(ev.creature);
    switch (ev.kind) {
      case "puff":
        return ev.intent === "big_puff" ? t("battleBigPuff", { partner, damage: ev.amount }) : t("battlePuff", { name: wildName, partner, damage: ev.amount });
      case "windup":
        return t("battleWindup", { name: wildName });
      case "stagger":
        return t("battleStagger", { name: wildName });
      case "thicken":
        return t("battleThicken", { name: wildName });
      case "giggle":
        return t("battleGiggle", { name: wildName });
      case "cheer":
        return t("battleCheer", { name: wildName });
      case "mist":
        return t(`battleMist_${ev.status ?? "slow"}` as "battleMist_slow", { partner });
      case "sleep":
        return t("battleSleep", { name: wildName });
      case "stumble":
        return t("battleStumble", { name: wildName });
      default:
        return t("battleSilly", { name: wildName });
    }
  };

  /** Glows on the creatures for a move's effects (at most three). */
  const aurasOf = (round: Round): Aura[] =>
    myEffects(round)
      .filter((e) => e.kind !== "spark")
      .slice(0, 3)
      .map((e) => ({ id: ++fxId.current, on: e.on, kind: e.kind as Aura["kind"], glyph: e.kind === "status" && e.status ? (STATUS_GLYPH[e.status] ?? "💫") : AURA_GLYPH[e.kind], ...(e.kind === "heal" && e.amount ? { amount: e.amount } : {}) }));

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
      if (ev.who === "me" && (ev.kind === "hit" || ev.kind === "utility")) {
        const id = ++fxId.current;
        const question = !!out && round.move?.tier !== "W" && round.move?.question !== "none";
        const subject = round.move && round.move.subject !== "any" && ev.kind === "hit" ? round.move.subject : null;
        if (ev.kind === "hit") {
          setFx({
            id,
            correct: round.correct,
            damage: ev.amount,
            won: round.calm && !round.capped,
            plan: question ? planFor(round.correct, calm, ev.amount) : planForFree(ev.amount, calm),
            wheel: round.wheel,
            brilliant: round.brilliant,
            subject: round.correct || !question ? subject : null,
            ...(round.finale ? { finaleStep: 3 } : {}),
          });
          void sfx.play(round.calm ? "win" : round.correct ? "hit" : "oops", switches);
        } else {
          // a utility move: the glow on the creature it is for; no number
          setFx({ id, correct: round.correct, damage: 0, won: false, plan: { ...planForFree(0, calm), oops: false, wildHit: false, attack: false, stars: round.correct ? (calm ? 1 : 4) : 0 }, wheel: null });
          void sfx.play(round.correct ? "hit" : "oops", switches);
        }
        setAuras(aurasOf(round));
        if (round.correct) sfx.tick(switches);
        if (question && out) {
          setOutcome(out);
          setFlow(answered(out.correct, performance.now()));
          await flowDone();
          if (!alive.current) return;
          setOutcome(null);
        } else await pace.wait(BEAT.ours);
        setAuras([]);
      } else if (ev.who === "me") {
        await pace.wait(BEAT.swap);
      } else {
        const id = ++fxId.current;
        const kind = ev.kind as EnemyFx["kind"];
        setEnemyFx({ id, kind, amount: ev.amount, ...(ev.intent === "big_puff" && ev.kind === "puff" ? { big: true } : {}), ...(ev.status ? { glyph: STATUS_GLYPH[ev.status] } : {}), ...(ev.returned ? { returned: ev.returned } : {}) });
        // the menu is live from 0.6 s into the enemy's animation
        setTimeout(() => alive.current && setLive(true), BEAT.live * scale);
        await pace.wait(ev.kind === "sleep" || ev.kind === "silly" || ev.kind === "cheer" || ev.kind === "thicken" ? BEAT.quick : BEAT.theirs);
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
    setAuras([]);
    setLive(true);
    setCast(null);
    setMsg(round.needSwap ? t("battleAsleep", { name: nameOf(round.fainted ?? battle.partner.id) }) : null);
    setTick((n) => n + 1);
    if (round.growth.leveled) setCard({ species: round.partnerBefore, level: round.growth.level });
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
    // a Finale: the first two answers land a hit at once, and the next question follows; the round comes after the third
    if (battle.finaleOpen && battle.finaleStep) {
      const step = battle.finaleStep;
      const id = ++fxId.current;
      setFx({ id, correct: step.correct, damage: step.damage, won: false, plan: planFor(step.correct, calm, step.damage), wheel: step.wheel, brilliant: step.brilliant, subject: step.correct && cast.move.subject !== "any" ? cast.move.subject : null, finaleStep: step.i + 1 });
      setShown({ fog: step.fog, pep: battle.partnerPep.now });
      const switches = effectsFrom(play.profile.settings);
      void sfx.play(step.correct ? "hit" : "oops", switches);
      if (step.correct) sfx.tick(switches);
      setOutcome(o);
      setFlow(answered(o.correct, performance.now()));
      const move = cast.move;
      void flowDone().then(() => {
        if (!alive.current) return;
        setOutcome(null);
        setFx(null);
        setShown(null);
        const next = battle.nextFinale();
        if (!next) {
          setCast(null);
          setMode("menu");
          return;
        }
        setCast({ session: next, move });
      });
      return;
    }
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
      if (r.growth?.leveled) setCard({ species: battle.partner.species, level: r.growth.level });
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
    if ((battle.phase !== "calm" && battle.phase !== "won") || mode !== "menu" || card || offered.current) return;
    offered.current = true;
    const ctx = play.evolveCtx();
    const ready = ctx ? readyToEvolve(play.world, ctx).find((c) => c.id === battle.partner.id) : undefined;
    if (ready) {
      offerOpen.current = true;
      setOffer(ready.id);
    }
  });

  useEffect(() => {
    if (battle.phase !== "calm" || mode !== "menu" || card || offerOpen.current || tray || autoTray.current || sheet) return;
    autoTray.current = true;
    openTray();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const mine = battle.partner;
  const myName = nameOf(mine.id);
  /** What the partner learns at the level it just reached (the learnset of the data). */
  const learnedLine = (level: number): string => {
    const rows = play.battle?.species[mine.species]?.learnset.filter((r) => r.level === level && r.move !== "little_wiggle") ?? [];
    const names = rows.map((r) => play.battle?.movesById[r.move]?.he).filter((x): x is string => !!x);
    return names.length ? t("battleLearned", { partner: myName, moves: names.join(", ") }) : "";
  };
  const phase = battle.phase;

  if (card && mode !== "question" && mode !== "playing" && mode !== "gift" && mode !== "throw") {
    return (
      <ScreenTime key={`card-${tick}`}>
        <GrowthCard monsters={play.monsters} species={card.species} level={card.level} name={(sp) => play.text(sp)} learned={learnedLine(card.level)} onClose={() => setCard(null)} />
      </ScreenTime>
    );
  }

  if (evolving) {
    return (
      <Later>
        <Evolution.Screen
          key={`evolution-${evolving.id}`}
          play={play}
          creatureId={evolving.id}
          from={evolving.from}
          to={evolving.to}
          how="learning"
          scale={evolutionScale()}
          onDone={() => {
            setEvolving(null);
            offerOpen.current = false;
            nudge((n) => n + 1);
          }}
        />
      </Later>
    );
  }

  if (offer && mode === "menu" && !card) {
    const c = play.world.creatures.find((x) => x.id === offer);
    if (c) {
      return (
        <ScreenTime key="offer">
          <EvolveOffer
            monsters={play.monsters}
            species={c.species}
            name={nameOf(c.id)}
            onLater={() => {
              setOffer(null);
              offerOpen.current = false;
            }}
            onEvolve={() => {
              const r = play.evolveNow(c.id, "learning");
              setOffer(null);
              if (!r) {
                offerOpen.current = false;
                return;
              }
              onChanged?.();
              setEvolving({ id: r.id, from: r.before, to: r.after });
            }}
          />
        </ScreenTime>
      );
    }
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
              onDone(false, true);
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
  const finaleCard = battle.finaleCard();
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
          auras={auras}
          spark={{ n: battle.spark, max: battle.sparkMax }}
          badges={{ mine: battle.badgesOf("mine"), theirs: battle.badgesOf("theirs") }}
          look={statusLook}
          peek={battle.peek.length && mode !== "playing" ? battle.peek : []}
          yawning={battle.yawning && mode === "menu"}
          onWake={() => {
            battle.wakeTap();
            nudge((n) => n + 1);
          }}
          mood={mood}
        >
          {mode === "throw" && flight && <BefriendThrow key={flight.id} r={flight.r} scale={scale} sound={throwSound} onDone={thrown} />}
        </Stage>
        {!asking && calmView && battle.reward && (
          <div className="message-box top" data-id="battle_message" role="status">
            <ResultsCard reward={battle.reward} asleep={asleepNames} line={calmLine} found={battle.reward.found ? t("evoFound", { name: wildName, card: itemText(battle.reward.found, "name") }) : null} />
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
              cast={{ name: cast.move.tier === "F" ? `${t("battleFinale")} ${Math.min(3, (battle.finale?.step ?? 0) + 1)}/3` : cast.move.he, subject: cast.move.subject !== "any" ? subjectTitle(cast.move.subject) : "", icon: subjectIcon(cast.move.subject), color: subjectColor(cast.move.subject) }}
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
        {finaleCard?.ready && mode === "menu" && live && phase === "fighting" && !battle.needSwap && (
          <Tap id="battle_finale" className="finale-pill pulse" aria-label={t("battleFinaleName", { move: finaleCard.move.he })} onTap={() => onMove(finaleCard.move.id)}>
            <span aria-hidden="true">✨ </span>
            {t("battleFinaleReady")}
          </Tap>
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
