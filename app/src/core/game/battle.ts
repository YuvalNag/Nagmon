/**
 * One friendly battle, slices S1 and S2 of docs/app/BATTLE_V3.md: the child
 * picks one of the partner's moves, and the question IS the cast. A round
 * is: the child chooses (and answers), then both sides act in order of
 * Speed; the enemy's intent was shown before the child chose.
 *
 * - Right answer: the move's full effect (damage, a status, a Mark, a shield,
 *   a heal ...). Wrong answer: x0.35 damage (at least 1), no status, no Mark,
 *   no Brilliant, and the weak version of a utility move. Nothing is taken
 *   from the Bag, the coins or the hearts.
 * - Both sides have a bar: the enemy's Fog (take it to 0 and it is calm)
 *   and the partner's Pep. A creature at 0 Pep at the end of a round
 *   FAINTS (decision of the parent): it is not lost, but it cannot be used
 *   until it is healed (medicine or the Rest Center's nurse). The answered
 *   move always plays, even when the enemy's first action brings Pep to 0.
 * - Spark (4 stars, shared by the team) fills with right answers and the
 *   hard hits the partner takes; a full meter opens the Finale: three
 *   questions in one go.
 * - The enemy telegraphs what it will do (nine intents); a Big Puff is a
 *   windup that a good round (25% of its Fog) staggers.
 * - Pep and Charges are per battle: every awake friend starts a battle full.
 *   Fainting is the only thing that carries over; statuses never do.
 * - Speed counts for nothing in the rating or the growth (a creature's Speed
 *   only decides who acts first; there is no timer).
 *
 * The status state is in battleStatus.ts; the numbers in battleNumbers.ts.
 */
import type { LearningEngine } from "../learning/engine";
import { BattleQuizBudget, type SubjectMap } from "../learning/quiz_flow";
import { type HelperBag, type HelperKind, type QuizRequest, QuizSession } from "../world/quiz";
import type { Creature, WorldState } from "../world/worldState";
import {
  type Growth,
  giveXp,
  markSeen,
  PARTY_SIZE,
  partner as partnerOf,
} from "./collection";
import { addKnowHow, findCard } from "./evolution";
import { claimSpareNet, countOf, type Economy, economy as economyFrom, give, type Item, spendBoost, take } from "./items";
import { Befriending, type Selection, type TryResult } from "./befriendTry";
import type { BattleData, Move, MoveEffect, StatName, StatusId } from "../data/battleTypes";
import { awakeParty, faint, nurseHeals, partyDown, usable, wakeWith } from "./faint";
import { setPartner } from "./party";
import {
  BRILLIANT_COIN_MAX,
  FOG_TUNE,
  S1_PACING,
  ROLL_MIN,
  SPARKLE,
  SPARKLY,
  STAR_COINS,
  WIN_POINTS,
  type Band,
  type FightKind,
  type WheelHit,
  bandOf,
  damageOf,
  fogFrom,
  weakSubjects,
  wheelHit,
  wheelMult,
  winCoins,
} from "./battleNumbers";
import {
  type Badge,
  type Fighter,
  absorb,
  addMark,
  badges,
  cleanse,
  expire,
  hasMajor,
  isDizzy,
  isDrowsy,
  isImmune,
  isSlow,
  markBonus,
  newFighter,
  shieldLeft,
  shiftStage,
  stageOf,
  statMult,
} from "./battleStatus";
import { creatureStats, speciesBattle, type SpeciesTraits } from "./battleSpecies";
import { BIG_PUFF, bigPuffMinLevel, bigPuffPower, drawIntent, giggleEvery, giggleShare, type IntentId, puffPower, type Weights, weightsOf } from "./intents";
import { cardMoves, finaleOf, WIGGLE } from "./moves";
import type { Wild } from "./encounters";
import type { FieldLog } from "./fieldLog";
import type { MonsterTable } from "./monsters";

export const MAX_CREATURES = 60;
/** The tests' draws for the befriend shakes: each is used once, in order; then the battle's own random. */
function diceFrom(list: number[], rest: () => number): () => number {
  const queue = [...list];
  return () => (queue.length ? queue.shift()! : rest());
}

/** An empty Bag's economy, for a battle made without one (befriending then has no tools). */
const NO_ECONOMY = economyFrom({});
export { PARTY_SIZE };

/** The expected number a Puff shows over the creature (the roll fixed at its middle). */
const SHOWN_ROLL = 0.96;
/** A lucky star: one right answer in sixteen is Brilliant. */
const LUCKY_STAR = 1 / 16;
/** A Windup is Staggered by a round that takes this share of the enemy's maximum Fog (4.3). */
export const STAGGER_SHARE = 0.25;
/** An enemy that is Dizzy stumbles in this share of its actions (4.1). */
const STUMBLE = 0.33;
/** Yawn (Drowsy on our side): the Power of the move is cut by a quarter. */
const YAWN_POWER = 0.75;
/** Taps on the sleepy partner that wake it at once. */
export const WAKE_TAPS = 3;

/**
 * fighting: asking questions; calm: the fog is gone (befriending is open in both);
 * caught: the friend joined; won: a master's test is won; ran: gone on;
 * carried: the whole team fell asleep and was carried to the Rest Center.
 */
export type BattlePhase = "fighting" | "calm" | "caught" | "won" | "ran" | "carried";

/** What an event of a round was, for the screen to play and say. */
export type EventKind =
  | "hit"
  | "utility"
  | "puff"
  | "windup"
  | "stagger"
  | "thicken"
  | "giggle"
  | "silly"
  | "cheer"
  | "mist"
  | "sleep"
  | "stumble"
  | "swap"
  | "medicine";

/** One thing that happened in a round, for the screen to play in order. */
export interface RoundEvent {
  who: "me" | "them";
  kind: EventKind;
  /** Fog taken, Pep taken, what a Giggle gave back, or what a heal gave. */
  amount: number;
  /** The bars right after this event. */
  fog: number;
  pep: number;
  /** The creature that acted or was acted on. */
  creature: string;
  /** The enemy's intent that this event plays. */
  intent?: IntentId;
  /** The status a mist put on us. */
  status?: StatusId;
  /** Fog taken from the enemy by a mirror, while the enemy hit us. */
  returned?: number;
}

/** What a move or an intent did besides taking Fog, for the line and the badges. */
export interface Effect {
  on: "me" | "them";
  kind: "status" | "heal" | "shield" | "regen" | "boost" | "weaken" | "cleanse" | "mirror" | "mark" | "reveal" | "focus" | "swap_boosts" | "echo" | "spark" | "resist" | "windup";
  status?: StatusId;
  stat?: StatName;
  amount?: number;
  stages?: number;
  subject?: string;
}

export interface IntentView {
  id: IntentId;
  /** A hit's number (about; the roll fixed); 0 for the others. */
  amount: number;
  /** The enemy acts before the partner this round (Speed). */
  first: boolean;
  /** A Windup that is let go at the end of this round (the Big Puff of last round). */
  release?: boolean;
}

export interface Round {
  n: number;
  kind: "move" | "swap" | "medicine";
  move: Move | null;
  correct: boolean;
  /** Fog the move took (all three hits of a Finale). */
  damage: number;
  wheel: WheelHit;
  brilliant: boolean;
  events: RoundEvent[];
  first: "me" | "them";
  /** The intent the enemy had this round, and what it did to the partner (Pep). */
  intent: IntentId;
  enemyDamage: number;
  /** A friend that fell asleep at the end of this round. */
  fainted: string | null;
  /** The fog is gone: the creature is calm (a master's test: won). */
  calm: boolean;
  /** The question cap was reached: the creature calmed by itself. */
  capped: boolean;
  /** The partner before this round (it may have evolved on this answer). */
  partnerBefore: string;
  growth: Growth;
  /** The next intent, shown for the next round (null when the fight is over). */
  next: IntentView | null;
  /** A friend must be picked now (free), because the partner fell asleep. */
  needSwap: boolean;
  /** The whole team fell asleep: carried to the Rest Center and healed. */
  carried: boolean;
  /** What the child's move did besides taking Fog. */
  effects: Effect[];
  /** A Windup was staggered in this round (the enemy tumbles and loses it). */
  staggered: boolean;
  /** Spark after this round (0 to 4). */
  spark: number;
  /** The move was a Finale. */
  finale: boolean;
}

/** What a calm creature pays (5.4, 6.5): coins and the stars of the results card. */
export interface Reward {
  coins: number;
  points: number;
  /** Calm always; Steady: nobody fell asleep; Bright: two Brilliant hits. */
  stars: { calm: true; steady: boolean; bright: boolean };
  brilliant: number;
  capped: boolean;
  /** An Evolution Card the creature left (7.2): the item's id, or null. */
  found: string | null;
}

/** Why a card cannot be played now. */
export type Why = "charges" | "yawn" | "dizzy" | "echo" | "spark";

/** A card of the 2 x 2 grid. */
export interface Card {
  move: Move;
  /** Charges left (null: no limit) and the most. */
  left: number | null;
  max: number | null;
  /** Cannot be played now: the card is dimmed. */
  dimmed: boolean;
  why?: Why;
  /** The wheel against this enemy, when the child may know it (the age band's rule). */
  hit: WheelHit;
  /** The move is of the partner's own subject (Home bonus). */
  home: boolean;
}

/** One question of a Finale, answered: the hit it dealt right away. */
export interface FinaleStep {
  /** 0 to 2. */
  i: number;
  correct: boolean;
  damage: number;
  fog: number;
  wheel: WheelHit;
  brilliant: boolean;
  /** The chain bonus this hit had (1, 1.15, 1.3). */
  chain: number;
}

export interface BattleOptions {
  engine: LearningEngine;
  world: WorldState;
  monsters: MonsterTable;
  subjects: SubjectMap;
  wild: Wild;
  clock: () => number;
  maxChoices: number | null;
  /** The child's age: it sets the band. The learner's own age when left out. */
  age?: number;
  field: FieldLog;
  /** The economy: with it, the Bag's helpers and medicine can be used. */
  economy?: Economy;
  /** A master's test: a longer fight, and the prize is a badge, not a creature. */
  master?: boolean;
  /** The creatures or the learner changed: save them. */
  onChange: () => void;
  warn?: (message: string) => void;
  /** The battle's data (game/moves.json, species_battle.json, intents.json, battle_rules.json ...). */
  data: BattleData;
  /** A random number in [0, 1): a test passes a seeded one. */
  rng?: () => number;
  /** The tests' hook: start the partner's Pep or the enemy's Fog at this number. */
  debug?: { pep?: number; fog?: number; charges?: number; spark?: number; cards?: string[]; intents?: IntentId[]; /** the befriend draws, in order (then the battle's own random): the browser tests' sure fail or sure success */ dice?: number[] };
}

/** How many times a question is tried for before the battle ends in peace. */
const TRIES = 5;

/** The selector's bias for a wanted chance of a right answer, given the learner's own target (a logit shift). */
export function biasFor(wanted: number, target: number): number {
  const logit = (p: number) => Math.log(p / (1 - p));
  const clamp = (p: number) => Math.min(0.97, Math.max(0.03, p));
  return Math.max(-1.5, Math.min(1.5, logit(clamp(wanted)) - logit(clamp(target))));
}

const floor = (x: number): number => Math.floor(x + 1e-9);

export class Battle {
  phase: BattlePhase = "fighting";
  /** The last round, for the screen to play. */
  last: Round | null = null;
  readonly stats = { questions: 0, correct: 0, ms: 0 };
  readonly band: Band;
  readonly kind: FightKind;
  readonly maxFog: number;
  fog: number;
  /** The enemy's traits: subject, weak subjects, temperament, stats. */
  readonly enemy: SpeciesTraits & { level: number; speed: number; power: number; guard: number };
  /** The intent shown now (null when the fight is over). */
  intent: IntentView | null = null;
  /** Rounds played. */
  turns = 0;
  /** A friend must be picked now, free: the partner fell asleep. */
  needSwap = false;
  /** The reward of a calm creature (null until it is calm). */
  reward: Reward | null = null;
  /** The cap on questions of this fight, and how many were asked. */
  readonly budget: BattleQuizBudget;
  /** Befriending (S3, section 8): the tray's chance, the tries of this fight, pity and Mercy (befriendTry.ts). */
  readonly befriend: Befriending;
  /** The owl's free hint is offered on the next question (three wrong answers in a row). */
  autoHint = false;
  /** Brilliant hits so far. */
  brilliant = 0;
  /** Friends that fell asleep in this fight. */
  fainted = 0;
  /** The Spark meter (0 to 4), shared by the team. */
  spark = 0;
  /** The enemy's statuses and the partner's (reset when the partner leaves). */
  foe: Fighter = newFighter();
  mine: Fighter = newFighter();
  /** Intents the child has seen ahead (Detective Lens): ids, next first. */
  peek: IntentId[] = [];
  /** A Finale is being asked: the step (0 to 2) and what the first hits did. */
  finale: { move: Move; step: number; chain: number; hits: FinaleStep[]; rights: number } | null = null;
  /** The last hit of a Finale question, for the screen to play while the next question is made. */
  finaleStep: FinaleStep | null = null;
  /** The enemy took a round's worth of windup and will let it go at the end of this round. */
  windup: { releaseAt: number } | null = null;

  private readonly data: BattleData;
  private readonly weights: Weights;
  private readonly rng: () => number;
  private readonly pep = new Map<string, number>();
  private readonly charges = new Map<string, number>();
  private readonly brave = new Set<string>();
  private casting: { move: Move; session: QuizSession } | null = null;
  private rightStreak = 0;
  private wrongStreak = 0;
  private easier = false;
  private lastSubject: string | null = null;
  private lastDamageMove: Move | null = null;
  private sinceGiggle = 99;
  private lastWasBigPuff = false;
  private lastWasStatus = false;
  private queue: IntentId[] = [];
  private wakeTaps = 0;
  private xpCarry = 0;
  private growthKeep: Growth | null = null;
  private roundDamage = 0;
  private readonly seenBefore: boolean;
  private readonly startedAt: number;
  private ended = false;

  constructor(private readonly o: BattleOptions) {
    const w = o.world;
    if (!partnerOf(w)) throw new Error("no partner to battle with");
    this.data = o.data;
    this.rng = o.rng ?? Math.random;
    this.startedAt = o.clock();
    this.band = bandOf(o.age ?? o.engine.learner.age ?? o.engine.learner.grade + 6);
    this.kind = o.master ? "master" : "wild";
    this.seenBefore = w.seen.has(o.wild.species);
    const sp = speciesBattle(o.data, o.wild.species, o.subjects.subjectFor(o.monsters[o.wild.species]?.types ?? [], null, o.wild.species));
    const st = creatureStats(sp, o.wild.level);
    this.enemy = { ...sp, level: o.wild.level, speed: st.speed, power: st.power, guard: st.guard };
    this.weights = weightsOf(o.data, sp.temperament);
    const rules = o.data.rules;
    this.maxFog = fogFrom(o.wild.level, rules.fog_kind[this.kind], rules.bands[this.band].fog, S1_PACING * FOG_TUNE[this.kind]);
    this.fog = o.debug?.fog ?? this.maxFog;
    this.budget = new BattleQuizBudget(rules.bands[this.band].question_cap[o.master ? "guardian" : "wild"]);
    markSeen(w, o.wild.species);
    this.befriend = new Befriending({
      world: w,
      eco: o.economy ?? NO_ECONOMY,
      monsters: o.monsters,
      data: o.data,
      band: this.band,
      rng: o.debug?.dice ? diceFrom(o.debug.dice, this.rng) : this.rng,
      field: o.field,
      onChange: o.onChange,
      species: o.wild.species,
      level: o.wild.level,
      subject: this.enemy.subject,
      zone: o.data.species[o.wild.species]?.zone ?? "",
      gift: o.data.species[o.wild.species]?.gift ?? null,
      fog: () => this.fog,
      maxFog: () => this.maxFog,
      statuses: () => this.enemyStatuses(),
      allowed: () => this.canBefriend(),
      partnerId: () => this.partner.id,
      maxCreatures: MAX_CREATURES,
    });
    // everybody awake starts full; the fainted wait for medicine or the nurse
    for (const c of w.creatures.slice(0, PARTY_SIZE)) if (usable(c)) this.pep.set(c.id, this.maxPepOf(c));
    if (o.debug?.pep !== undefined) {
      const p = partnerOf(w);
      if (p && usable(p)) this.pep.set(p.id, Math.min(this.maxPepOf(p), Math.max(1, o.debug.pep)));
    }
    if (partyDown(w)) {
      // the game never dead-ends: the team is carried to the Rest Center and healed, free
      nurseHeals(w);
      this.phase = "carried";
      o.field.note("carried", { at: "start" });
      o.onChange();
      return;
    }
    const first = partnerOf(w)!;
    if (!usable(first)) {
      const next = awakeParty(w)[0]!;
      setPartner(w, next.id);
    }
    // Cheerful: the battle starts with a star
    this.spark = Math.min(this.sparkMax, o.debug?.spark ?? (this.giftOf(this.partner) === "cheerful" ? 1 : 0) + (this.partner.shimmer ? 1 : 0));
    this.intent = this.drawNext();
  }

  /** The partner now: the first friend of the party. */
  get partner(): Creature {
    return partnerOf(this.o.world)!;
  }

  /** The wild creature's subject (the arena's look and the wheel). */
  get topic(): string {
    return this.enemy.subject;
  }

  /** The enemy is a boss (the master; guardians when they come): it resists a major status for a while. */
  get boss(): boolean {
    return this.kind === "master" || this.kind === "guardian";
  }

  get sparkMax(): number {
    return this.data.rules.spark.max;
  }

  /** The round the child is choosing for. */
  private get next(): number {
    return this.turns + 1;
  }

  /** The partner's friends of the party, awake or not. */
  team(): Creature[] {
    return this.o.world.creatures.slice(0, PARTY_SIZE);
  }

  /** The species' traits of one of the child's creatures. */
  traits(c: Creature): SpeciesTraits {
    return speciesBattle(this.data, c.species, this.o.subjects.subjectFor(this.o.monsters[c.species]?.types ?? [], null, c.species));
  }

  /** The Gift of a friend (3.5); Brave Heart is also the default gift of the youngest band. */
  giftOf(c: Creature): string {
    return this.traits(c).gift;
  }

  maxPepOf(c: Creature): number {
    return creatureStats(this.traits(c), c.level).pep;
  }

  pepOf(c: Creature): number {
    return this.pep.get(c.id) ?? 0;
  }

  /** The partner's Pep now and at most. */
  get partnerPep(): { now: number; max: number } {
    return { now: this.pepOf(this.partner), max: this.maxPepOf(this.partner) };
  }

  /** The subjects whose moves are a Sparkle against this enemy. */
  loves(): string[] {
    return weakSubjects(this.enemy.subject, this.enemy.weak);
  }

  /** The wheel is shown to this child now: ages 5-7 always; 8-10 after the creature was seen once; 11 and up after a Sparkle or Sturdy hit. */
  revealed(): boolean {
    if (this.band === "A") return true;
    if (this.known()) return true;
    return this.band === "B" && this.seenBefore;
  }

  private weakKey = () => `nagmon_weak_${this.o.wild.species}`;
  private known = () => this.o.world.variables.has(this.weakKey());

  /** The badges beside the two bars (4.1): what is on the enemy and on the partner now. */
  badgesOf(side: "mine" | "theirs"): Badge[] {
    const turn = this.next;
    if (side === "mine") return badges(this.mine, turn, { dozing: !usable(this.partner) });
    return badges(this.foe, turn, { windup: !!this.windup, calm: this.phase === "calm" || this.phase === "won" || this.fog <= 0 }).map((b) => (b.id === "drowsy" || b.id === "dizzy" || b.id === "slow") && isImmune(this.foe, b.id, turn) ? { ...b, locked: true } : b);
  }

  /** A boss's lock icons: kinds it shrugs off now. */
  lockedKinds(): string[] {
    return (["drowsy", "dizzy", "slow"] as const).filter((k) => isImmune(this.foe, k, this.next));
  }

  /** The Yawn (Drowsy) is on the partner: three taps on it wake it at once. */
  get yawning(): boolean {
    return isDrowsy(this.mine, this.next);
  }

  /** A tap on the sleepy partner; the third wakes it. Returns true when it woke. */
  wakeTap(): boolean {
    if (!this.yawning) return false;
    this.wakeTaps++;
    if (this.wakeTaps < WAKE_TAPS) return false;
    this.mine.drowsy = null;
    this.wakeTaps = 0;
    return true;
  }

  // ---- the cards ----

  /** What the Yawn and the Dizziness allow: by tier. */
  private lockedBy(m: Move): Why | null {
    const turn = this.next;
    if (isDrowsy(this.mine, turn) && !["E", "Q", "W"].includes(m.tier)) return "yawn";
    if (isDizzy(this.mine, turn) && m.tier === "S") return "dizzy";
    return null;
  }

  private chargesLeft(p: Creature, m: Move): number | null {
    if (m.charges === null) return null;
    return this.charges.get(`${p.id}:${m.id}`) ?? Math.min(m.charges, this.o.debug?.charges ?? m.charges);
  }

  private cardOf(p: Creature, m: Move, show: boolean, home: string): Card {
    const left = this.chargesLeft(p, m);
    const why: Why | undefined = left !== null && left <= 0 ? "charges" : (this.lockedBy(m) ?? (m.id === "echo" && !this.lastDamageMove ? "echo" : undefined));
    return { move: m, left, max: m.charges, dimmed: !!why, ...(why ? { why } : {}), hit: show && m.subject !== "any" && m.power !== null ? wheelHit(m.subject, this.enemy.subject, this.enemy.weak) : null, home: m.subject === home };
  }

  /** The four moves of the partner, with charges and the wheel; when none can be played, only the Little Wiggle. */
  cards(): Card[] {
    const p = this.partner;
    const tr = this.traits(p);
    const show = this.revealed();
    const moves = this.o.debug?.cards ? this.o.debug.cards.map((id) => this.data.movesById[id]!).filter(Boolean) : cardMoves(this.data, p.species, p.level, tr.subject);
    const cards = moves.map<Card>((m) => this.cardOf(p, m, show, tr.subject));
    if (cards.length === 0 || cards.every((c) => c.dimmed)) {
      const wiggle = this.data.movesById[WIGGLE]!;
      return [{ move: wiggle, left: null, max: null, dimmed: false, hit: null, home: false }];
    }
    return cards;
  }

  /** The Finale card of the partner's species (level 6 on), and whether the Spark meter is full for it. */
  finaleCard(): { move: Move; ready: boolean; spark: number; cost: number } | null {
    const p = this.partner;
    const m = finaleOf(this.data, p.species, p.level);
    if (!m) return null;
    const cost = m.spark_cost ?? this.sparkMax;
    return { move: m, ready: this.spark >= cost && this.phase === "fighting" && !this.needSwap, spark: this.spark, cost };
  }

  // ---- stats with the stages and statuses on them ----

  private mineStat(stat: StatName, c: Creature = this.partner, turn = this.next): number {
    const base = creatureStats(this.traits(c), c.level)[stat];
    return Math.max(1, floor(base * statMult(this.mine, stat, turn) * (stat === "speed" && isSlow(this.mine, turn) ? 0.5 : 1)));
  }

  private foeStat(stat: StatName, turn = this.next): number {
    return Math.max(1, floor(this.enemy[stat] * statMult(this.foe, stat, turn) * (stat === "speed" && isSlow(this.foe, turn) ? 0.5 : 1)));
  }

  // ---- intents ----

  private intentState(p: Creature | null) {
    const pepMax = p ? this.maxPepOf(p) : 1;
    const amount = p ? this.hitAmount(p, SHOWN_ROLL, puffPower(this.data, this.boss)) : 0;
    return {
      lastWasBigPuff: this.lastWasBigPuff,
      sinceGiggle: this.sinceGiggle,
      fogFull: this.fog >= this.maxFog,
      puffIsBig: amount > BIG_PUFF * pepMax,
      lastWasStatus: this.lastWasStatus,
      level: this.enemy.level,
      bandA: this.band === "A",
      childMajor: hasMajor(this.mine, this.next),
      childSlow: isSlow(this.mine, this.next),
      shielded: shieldLeft(this.foe, this.next) > 0,
      powerMax: stageOf(this.foe, "power", this.next) >= 3,
      windup: !!this.windup,
      boss: this.boss,
      bigMinLevel: bigPuffMinLevel(this.data),
    };
  }

  private scripted = 0;
  private draw(p: Creature | null): IntentId {
    // the tests' hook: a list of intents to use in order (then the draws go on)
    const scripted = this.o.debug?.intents?.[this.scripted];
    if (scripted) {
      this.scripted++;
      return scripted;
    }
    return drawIntent(this.rng(), this.weights, this.intentState(p), giggleEvery(this.data));
  }

  private drawNext(): IntentView {
    const p = this.partnerOrNull();
    const mine = p ? this.partner : null;
    let id: IntentId;
    let release = false;
    if (this.windup) {
      // the Big Puff charged last round: it is let go at the end of this one
      id = "big_puff";
      release = true;
    } else id = this.queue.shift() ?? this.draw(mine);
    const amount = p ? (id === "big_puff" ? this.hitAmount(p, SHOWN_ROLL, bigPuffPower(this.data)) : id === "fog_puff" ? this.hitAmount(p, SHOWN_ROLL, puffPower(this.data, this.boss)) : 0) : 0;
    const my = p ? this.mineStat("speed", p) : 0;
    return { id, amount, first: p ? this.foeStat("speed") > my : false, ...(release ? { release } : {}) };
  }

  /** The Detective Lens: the next `n` intents are known (the screen shows them). */
  private reveal(n: number): void {
    const p = this.partnerOrNull();
    while (this.queue.length < n) this.queue.push(this.draw(p ? this.partner : null));
    this.peek = this.queue.slice(0, n);
  }

  private partnerOrNull(): Creature | null {
    return this.phase === "carried" ? null : (partnerOf(this.o.world) ?? null);
  }

  /** What an enemy hit takes from this friend: the same formula, the friend's Guard, the band's gentle factor. */
  private hitAmount(c: Creature, roll: number, mp: number, turn = this.next): number {
    const guard = c.id === this.partner.id ? this.mineStat("guard", c, turn) : creatureStats(this.traits(c), c.level).guard;
    return damageOf({ level: this.enemy.level, mp, power: this.foeStat("power", turn), guard, right: true, roll, gentle: this.data.rules.bands[this.band].gentle });
  }

  // ---- the round ----

  start(map: string): void {
    this.o.field.battleStart({ monster: this.o.wild.species, level: this.o.wild.level, map });
    if (this.phase === "carried") this.end("carried");
  }

  /**
   * The child picks a move. A move with a question opens it (`session`);
   * the answer is the cast. The Little Wiggle and Echo ask nothing and play
   * at once (`round`). A Finale opens its first of three questions. Null when
   * the card is not open now.
   */
  choose(moveId: string): { move: Move; session: QuizSession | null; round: Round | null; hint: boolean } | null {
    if (this.phase !== "fighting" || this.needSwap) return null;
    let move: Move;
    if (this.finale && this.finale.move.id === moveId) move = this.finale.move;
    else {
      const fin = this.finaleCard();
      if (fin && fin.move.id === moveId) {
        if (!fin.ready) return null;
        move = fin.move;
        this.finale = { move, step: 0, chain: 0, hits: [], rights: 0 };
      } else {
        const card = this.cards().find((c) => c.move.id === moveId);
        if (!card || card.dimmed) return null;
        move = card.move;
        this.finale = null;
      }
    }
    this.casting = null;
    if (move.question === "none") return { move, session: null, round: this.play({ kind: "move", move, correct: true, ms: 0, question: false }), hint: false };
    for (let i = 0; i < TRIES; i++) {
      const session = new QuizSession(
        this.o.engine,
        this.request(move),
        this.o.clock,
        (outcome) => this.answered(session, move, outcome.correct),
        this.o.warn,
      );
      if (session.question) {
        this.casting = { move, session };
        this.easier = false;
        // three wrong answers in a row: the owl offers the hint, free (the screen shows it once the question is open)
        const hint = this.autoHint;
        this.autoHint = false;
        if (hint && session.canHint) session.hint();
        return { move, session, round: null, hint };
      }
    }
    return null;
  }

  /** The next question of a Finale, after the answer to one: null when none is open. */
  nextFinale(): QuizSession | null {
    const f = this.finale;
    if (!f || this.phase !== "fighting") return null;
    const c = this.choose(f.move.id);
    return c?.session ?? null;
  }

  /** A Finale is in the middle: its next question is waiting. */
  get finaleOpen(): boolean {
    return !!this.finale && this.finale.step > 0 && this.finale.step < 3 && !this.casting;
  }

  /** The question was closed without an answer (the owl's pass, or Android's back): nothing is counted or spent. */
  cancel(): void {
    this.casting = null;
  }

  /** The tier of the question: easier by one after three wrong answers in a row (E stays E). */
  private questionTier(move: Move): "E" | "N" | "S" {
    const t: "E" | "N" | "S" = move.question === "E" ? "E" : move.question === "S" ? "S" : "N";
    if (!this.easier) return t;
    return t === "S" ? "N" : "E";
  }

  private request(move: Move): QuizRequest {
    const tier = this.questionTier(move);
    const target = this.o.engine.learner.targetFrontier;
    // no Elo speed bonus in a battle: the rating stays about knowledge, not reflexes
    const r: QuizRequest = {
      topic: move.subject === "any" ? this.enemy.subject : move.subject,
      context: "battle",
      maxChoices: this.o.maxChoices,
      speed: false,
      // easy moves use the quick shapes only; the others may use ordering and letter tiles
      kinds: tier === "E" ? [] : ["order", "letters"],
      bias: biasFor(this.data.rules.bands[this.band].right_chance[tier], target),
    };
    const bag = this.helperBag();
    if (bag) r.helpers = bag;
    return r;
  }

  private questionHelpers(): { helpers?: HelperBag } {
    const bag = this.helperBag();
    return bag ? { helpers: bag } : {};
  }

  /** The Bag's helpers for a question: the feather, the clover and the owl's pass, counted from the Bag. */
  private helperBag(): HelperBag | null {
    const eco = this.o.economy;
    if (!eco) return null;
    const itemOf = (kind: HelperKind) => Object.values(eco.items).find((i) => i.helper === kind)?.id;
    const world = this.o.world;
    return {
      count: (kind) => {
        const id = itemOf(kind);
        return id ? countOf(world, id) : 0;
      },
      spend: (kind) => {
        const id = itemOf(kind);
        if (!id || !take(world, id)) return false;
        this.o.onChange();
        return true;
      },
      used: (kind, q) => this.o.field.helper({ kind, skill: q.skill_id }),
    };
  }

  private answered(session: QuizSession, move: Move, correct: boolean): void {
    if (!this.casting || this.casting.session !== session) return;
    this.casting = null;
    this.stats.ms += session.elapsedMs;
    this.resolve(move, correct, session.elapsedMs);
  }

  private resolve(move: Move, correct: boolean, ms: number): Round | null {
    this.stats.questions++;
    this.budget.take();
    if (move.tier === "F" && this.finale) {
      const f = this.finale;
      if (f.step < 2) {
        // the first two hits land at once; the round (the enemy's turn) comes after the third
        this.finaleStep = this.finaleHit(f, correct);
        f.step++;
        return null;
      }
    }
    return this.play({ kind: "move", move, correct, ms, question: true });
  }

  /**
   * The rules' own entry for simulations and tests: the cast of a move with a given answer, no question asked.
   * (The screen always goes through `choose`, where the question is the cast.) Null when the card is not open; for a
   * Finale it plays all three answers the same.
   */
  castScripted(moveId: string, correct: boolean | boolean[]): Round | null {
    if (this.phase !== "fighting" || this.needSwap) return null;
    const fin = this.finaleCard();
    if (fin && fin.move.id === moveId) {
      if (!fin.ready) return null;
      this.finale = { move: fin.move, step: 0, chain: 0, hits: [], rights: 0 };
      const answers = Array.isArray(correct) ? correct : [correct, correct, correct];
      let r: Round | null = null;
      for (let i = 0; i < 3; i++) r = this.resolve(fin.move, answers[i] ?? false, 0);
      return r;
    }
    const card = this.cards().find((c) => c.move.id === moveId);
    if (!card || card.dimmed) return null;
    this.finale = null;
    const right = Array.isArray(correct) ? (correct[0] ?? false) : correct;
    if (card.move.question === "none") return this.play({ kind: "move", move: card.move, correct: true, ms: 0, question: false });
    return this.resolve(card.move, right, 0);
  }

  /** Whose turn order: true when the child's creature acts first (Quick moves first; then higher Speed; ties go to the child). */
  private meFirst(move: Move | null): boolean {
    if (move && (move.priority ?? 0) > 0) return true;
    return this.mineStat("speed", this.partner, this.turns) >= this.foeStat("speed", this.turns);
  }

  /** Marks an answer: the streak, the point, the owl's help after three misses; returns whether the answer is Brilliant by streak or luck. */
  private grade(correct: boolean, move: Move, round: Round | null): { streak: boolean } {
    const w = this.o.world;
    if (correct) {
      this.stats.correct++;
      // Know-how: a right answer in the partner's home subject while it is the partner (5.4)
      if (move.subject !== "any" && move.subject === this.traits(this.partner).subject) addKnowHow(this.partner, 1);
      this.rightStreak++;
      this.wrongStreak = 0;
      const base = spendBoost(w);
      const mult = this.giftOf(this.partner) === "quick_learner" ? 1.2 : 1;
      const total = base * mult * (move.tier === "S" ? 2 : 1) + this.xpCarry;
      const pts = floor(total);
      this.xpCarry = total - pts;
      const g = giveXp(w, this.partner.id, pts);
      if (g.leveled) this.growthKeep = g;
      void round;
      this.addSpark(move.tier === "S" ? this.data.rules.spark.per_right_stretch : this.data.rules.spark.per_right);
      return { streak: this.rightStreak % 3 === 0 };
    }
    this.rightStreak = 0;
    this.wrongStreak++;
    if (this.wrongStreak >= this.data.rules.kindness.wrong_in_a_row_for_help) {
      this.autoHint = true;
      this.easier = true;
      this.wrongStreak = 0;
      this.addSpark(1);
    }
    return { streak: false };
  }

  private addSpark(n: number): void {
    this.spark = Math.max(0, Math.min(this.sparkMax, this.spark + n));
  }

  private sparkleMult(hit: WheelHit): number {
    return hit === "sparkle" && this.giftOf(this.partner) === "sparkly" ? SPARKLY : hit === "sparkle" ? SPARKLE : wheelMult(hit);
  }

  /** One hit of the child's creature on the enemy: the damage, with the shield taking its share. */
  private strike(o: { move: Move; mp: number; correct: boolean; question: boolean; brilliant: boolean; chain?: number; mark?: number; ignoreShield?: boolean; share?: number }): { damage: number; hit: WheelHit } {
    const p = this.partner;
    const tr = this.traits(p);
    const subject = o.move.subject === "any" ? null : o.move.subject;
    const hit = subject ? wheelHit(subject, this.enemy.subject, this.enemy.weak) : null;
    const mix = o.question && subject !== null && this.lastSubject !== null && this.lastSubject !== subject;
    const yawn = isDrowsy(this.mine, this.turns) ? YAWN_POWER : 1;
    const raw = damageOf({
      level: p.level,
      mp: o.mp * yawn * (o.share ?? 1),
      power: this.mineStat("power", this.partner, this.turns),
      guard: this.foeStat("guard", this.turns),
      home: subject !== null && subject === tr.subject,
      wheel: this.sparkleMult(hit),
      ...(o.mark ? { mark: o.mark } : {}),
      ...(o.chain ? { chain: o.chain } : {}),
      brilliant: o.question && o.correct && o.brilliant,
      mix,
      right: o.correct,
      roll: ROLL_MIN + (1 - ROLL_MIN) * this.rng(),
    });
    if (o.question && subject) this.lastSubject = subject;
    let dmg = raw;
    if (!o.ignoreShield) {
      const s = absorb(this.foe, raw, this.turns);
      dmg = s.left;
    }
    const damage = Math.min(this.fog, dmg);
    this.fog -= damage;
    return { damage, hit };
  }

  /** One of the Finale's three hits, dealt at once (the first two; the third is the round's own). */
  private finaleHit(f: NonNullable<Battle["finale"]>, correct: boolean): FinaleStep {
    const { streak } = this.grade(correct, f.move, null);
    const steps = f.move.effects.find((e): e is Extract<MoveEffect, { type: "chain_bonus" }> => e.type === "chain_bonus")?.steps ?? [1, 1.15, 1.3];
    const chain = correct ? (steps[Math.min(f.chain, steps.length - 1)] ?? 1) : 1;
    f.chain = correct ? f.chain + 1 : 0;
    const brilliant = correct && (streak || this.rng() < LUCKY_STAR || this.mine.focus);
    if (correct && this.mine.focus) this.mine.focus = false;
    const { damage, hit } = this.strike({ move: f.move, mp: f.move.power ?? 70, correct, question: true, brilliant, chain });
    if (brilliant) this.brilliant++;
    this.roundDamage += damage;
    if (hit && !this.known() && correct) this.o.world.variables.set(this.weakKey(), "1");
    const step: FinaleStep = { i: f.step, correct, damage, fog: this.fog, wheel: correct ? hit : null, brilliant, chain };
    f.hits.push(step);
    if (correct) f.rights++;
    return step;
  }

  /** The enemy's Fog takes the heal of a Giggle, a Regen tick ... capped at the maximum. */
  private foeHeal(n: number): number {
    const give = Math.max(0, Math.min(this.maxFog - this.fog, n));
    this.fog += give;
    return give;
  }

  private healMine(c: Creature, n: number): number {
    const max = this.maxPepOf(c);
    const give = Math.max(0, Math.min(max - this.pepOf(c), n));
    this.pep.set(c.id, this.pepOf(c) + give);
    return give;
  }

  /** A status lands on the enemy (4.4: Drowsy and Dizzy exclusive, a boss's lock, Steady). Returns whether it took. */
  private statusOnFoe(status: StatusId, e: Extract<MoveEffect, { type: "status" }>, fx: Effect[]): boolean {
    const t = this.turns;
    const rounds = e.rounds ?? 3;
    if (status === "dizzy" && this.enemy.gift === "steady") return false;
    if ((status === "drowsy" || status === "dizzy" || status === "slow") && this.boss && isImmune(this.foe, status, t)) {
      fx.push({ on: "them", kind: "resist", status });
      return false;
    }
    if (status === "drowsy") {
      const actions = this.boss ? (e.boss_actions ?? 1) : (e.actions ?? 2);
      if (actions <= 0) return false;
      this.foe.dizzy = null;
      this.foe.drowsy = { actions, until: 0 };
      this.cancelWindup();
    } else if (status === "dizzy") {
      this.foe.drowsy = null;
      this.foe.dizzy = { until: t + rounds };
    } else if (status === "slow") this.foe.slow = { until: t + rounds };
    else if (status === "sniffly") this.foe.sniffly = { until: t + rounds - 1 };
    else if (status === "giggly") this.foe.giggly = e.attacks ?? 1;
    else return false;
    if (this.boss && (status === "drowsy" || status === "dizzy" || status === "slow")) this.foe.immune[status] = t + (this.data.statusesById[status]?.boss_immune_rounds ?? 3) + rounds;
    fx.push({ on: "them", kind: "status", status });
    return true;
  }

  /** A status the enemy put on the partner: softened (4.1 "on our creature"). */
  private statusOnMine(status: StatusId, fx: Effect[]): boolean {
    const t = this.turns;
    if (status === "dizzy" && this.giftOf(this.partner) === "steady") return false;
    if (status === "drowsy") {
      this.mine.dizzy = null;
      this.mine.drowsy = { actions: 0, from: t + 1, until: t + 1 };
      this.wakeTaps = 0;
    } else if (status === "dizzy") {
      this.mine.drowsy = null;
      this.mine.dizzy = { from: t + 1, until: t + 2 };
    } else if (status === "slow") this.mine.slow = { until: t + 3 };
    else return false;
    fx.push({ on: "me", kind: "status", status });
    return true;
  }

  private cancelWindup(): void {
    this.windup = null;
  }

  /** What a move does besides its damage: its effects (a right answer) or the weak version (a wrong one). */
  private applyEffects(list: MoveEffect[], correct: boolean, fx: Effect[], round: Round): void {
    const p = this.partner;
    const t = this.turns;
    const gift = this.giftOf(p);
    for (const e of list) {
      switch (e.type) {
        case "status":
          if ((e.target ?? "enemy") === "self") break;
          if (e.chance >= 1 || this.rng() < e.chance) this.statusOnFoe(e.status, e, fx);
          break;
        case "weaken":
          if (this.rng() < e.chance) {
            shiftStage(this.foe, e.stat, -e.stages, t, e.rounds);
            fx.push({ on: "them", kind: "weaken", stat: e.stat, stages: e.stages });
          }
          break;
        case "boost":
          for (const stat of e.stats) {
            shiftStage(this.mine, stat, e.stages, t, e.rounds);
            fx.push({ on: "me", kind: "boost", stat, stages: e.stages });
          }
          break;
        case "shield": {
          const rounds = e.rounds + (gift === "sturdy_shell" ? 1 : 0);
          const amount = Math.max(1, floor(e.share * this.maxPepOf(p)));
          this.mine.shield = { amount: Math.max(amount, shieldLeft(this.mine, t)), until: t + rounds };
          fx.push({ on: "me", kind: "shield", amount });
          break;
        }
        case "heal": {
          const n = Math.ceil(e.share * this.maxPepOf(p) * (gift === "warm_fog" ? 1.2 : 1));
          const given = this.healMine(p, n);
          fx.push({ on: "me", kind: "heal", amount: given });
          break;
        }
        case "regen":
          this.mine.regen = { share: e.share, until: t + e.rounds - 1 };
          fx.push({ on: "me", kind: "regen", amount: Math.ceil(e.share * this.maxPepOf(p)) });
          break;
        case "cleanse": {
          const n = cleanse(this.mine, e.scope, this.next);
          fx.push({ on: "me", kind: "cleanse", amount: n });
          break;
        }
        case "mirror":
          this.mine.mirror = { soften: e.soften, ret: e.return, until: t + e.rounds };
          fx.push({ on: "me", kind: "mirror" });
          break;
        case "mark":
          if (correct) {
            addMark(this.foe, e.subject, t, e.rounds);
            fx.push({ on: "them", kind: "mark", subject: e.subject });
          }
          break;
        case "reveal":
          this.o.world.variables.set(this.weakKey(), "1");
          if (e.intents > 0) this.reveal(e.intents);
          fx.push({ on: "them", kind: "reveal", amount: e.intents });
          break;
        case "focus":
          this.mine.focus = true;
          fx.push({ on: "me", kind: "focus" });
          break;
        case "swap_boosts": {
          let n = 0;
          for (const stat of ["power", "guard", "speed"] as StatName[]) {
            const st = stageOf(this.foe, stat, t);
            if (st > 0) {
              if (e.copy_to_self) shiftStage(this.mine, stat, st, t, this.data.stageRules.boost_rounds);
              this.foe.stages[stat] = { stage: 0, until: 0 };
              n++;
            }
          }
          fx.push({ on: "me", kind: "swap_boosts", amount: n });
          break;
        }
        default:
          break;
      }
    }
    void round;
  }

  private play(a: { kind: "move"; move: Move; correct: boolean; ms: number; question: boolean } | { kind: "swap"; to: string } | { kind: "medicine"; to: string }): Round {
    const w = this.o.world;
    const n = ++this.turns;
    const partnerBefore = this.partner.species;
    const intent = this.intent ?? this.drawNext();
    const events: RoundEvent[] = [];
    const round: Round = {
      n,
      kind: a.kind,
      move: a.kind === "move" ? a.move : null,
      correct: a.kind === "move" ? a.correct : true,
      damage: 0,
      wheel: null,
      brilliant: false,
      events,
      first: "me",
      intent: intent.id,
      enemyDamage: 0,
      fainted: null,
      calm: false,
      capped: false,
      partnerBefore,
      growth: { leveled: false, level: this.partner.level },
      next: null,
      needSwap: false,
      carried: false,
      effects: [],
      staggered: false,
      spark: this.spark,
      finale: a.kind === "move" && a.move.tier === "F",
    };
    const finale = round.finale ? this.finale : null;
    if (!finale) this.roundDamage = 0;
    let staggerIt = false;

    // ---- the child's action ----
    const doMine = () => {
      if (a.kind === "swap") {
        if (setPartner(w, a.to)) {
          this.mine = newFighter();
          this.wakeTaps = 0;
          this.o.field.note("partner", { species: this.partner.species, subject: this.traits(this.partner).subject });
        }
        events.push({ who: "me", kind: "swap", amount: 0, fog: this.fog, pep: this.partnerPep.now, creature: this.partner.id });
        return;
      }
      if (a.kind === "medicine") {
        events.push({ who: "me", kind: "medicine", amount: 0, fog: this.fog, pep: this.partnerPep.now, creature: a.to });
        return;
      }
      const move = a.move;
      const p = this.partner;
      const subject = move.subject === "any" ? null : move.subject;
      let brilliant = false;
      let chain: number | undefined;
      const correct = a.correct;
      if (finale) {
        const steps = move.effects.find((e): e is Extract<MoveEffect, { type: "chain_bonus" }> => e.type === "chain_bonus")?.steps ?? [1, 1.15, 1.3];
        const { streak } = this.grade(correct, move, round);
        chain = correct ? (steps[Math.min(finale.chain, steps.length - 1)] ?? 1) : 1;
        finale.chain = correct ? finale.chain + 1 : 0;
        brilliant = correct && (streak || this.rng() < LUCKY_STAR || this.mine.focus);
        if (correct && this.mine.focus) this.mine.focus = false;
      } else if (a.question) {
        const { streak } = this.grade(correct, move, round);
        brilliant = correct && (streak || this.rng() < LUCKY_STAR || move.tier === "S" || this.mine.focus || move.effects.some((e) => e.type === "always_brilliant"));
        if (correct && this.mine.focus) this.mine.focus = false;
      }
      const isEcho = move.id === "echo" && this.lastDamageMove;
      const source = isEcho ? this.lastDamageMove! : move;
      const damaging = source.power !== null;
      let damage = 0;
      let hit: WheelHit = null;
      if (damaging) {
        const fin = move.effects.find((e): e is Extract<MoveEffect, { type: "finisher" }> => e.type === "finisher");
        const mark = fin && correct ? markBonus(this.foe, move.subject, n, fin) : 1;
        const ignore = move.effects.some((e) => e.type === "ignore_shield");
        const r = this.strike({
          move: source,
          mp: source.power ?? 0,
          correct,
          question: a.question,
          brilliant,
          ...(chain ? { chain } : {}),
          ...(mark > 1 ? { mark } : {}),
          ...(ignore ? { ignoreShield: true } : {}),
          ...(isEcho ? { share: move.effects.find((e): e is Extract<MoveEffect, { type: "echo" }> => e.type === "echo")?.power_share ?? 0.6 } : {}),
        });
        damage = r.damage;
        hit = r.hit;
        if (fin && correct && mark > 1) this.foe.marks = [];
        if (!isEcho && move.tier !== "W") this.lastDamageMove = move;
        if (isEcho) round.effects.push({ on: "them", kind: "echo", amount: damage });
      }
      this.roundDamage += damage;
      // statuses, marks and the rest (a wrong answer has none, or the weak version of a utility move)
      const list = correct ? move.effects : (move.wrong ?? []);
      if (move.tier !== "F") this.applyEffects(list, correct, round.effects, round);
      if (move.tier === "F" && finale && finale.step >= 2) {
        // the last hit's extra, when its answer was right
        if (correct) this.applyEffects(this.lastHitEffects(move), correct, round.effects, round);
        this.spark = 0;
      }
      if (move.charges !== null) {
        const key = `${p.id}:${move.id}`;
        this.charges.set(key, Math.max(0, (this.charges.get(key) ?? Math.min(move.charges, this.o.debug?.charges ?? move.charges)) - 1));
      }
      round.damage = finale ? this.roundDamage : damage;
      round.wheel = a.question && correct ? hit : null;
      round.brilliant = brilliant && (a.question || !!finale);
      if (round.brilliant) this.brilliant++;
      // the wheel is learned by seeing it work (ages 11 and up)
      if (a.question && hit && !this.known()) w.variables.set(this.weakKey(), "1");
      const utility = !damaging;
      const healed = round.effects.filter((e) => e.on === "me" && e.kind === "heal").reduce((x, e) => x + (e.amount ?? 0), 0);
      events.push({ who: "me", kind: utility ? "utility" : "hit", amount: utility ? healed : damage, fog: this.fog, pep: this.pepOf(p), creature: p.id });
      this.o.field.move({
        n,
        move: move.id,
        subject: subject ?? "none",
        tier: move.tier,
        ok: a.correct,
        damage: round.damage,
        wheel: hit ?? "none",
        brilliant: round.brilliant,
        ms: a.ms,
        fog: this.fog,
        max: this.maxFog,
        monster: this.o.wild.species,
        partner: this.partner.species,
      });
    };

    // ---- the enemy's action ----
    let releasing = false;
    const doTheirs = () => {
      if (this.fog <= 0) return;
      const p = this.partner;
      const push = (kind: EventKind, amount: number, extra: Partial<RoundEvent> = {}) => events.push({ who: "them", kind, amount, fog: this.fog, pep: this.pepOf(p), creature: p.id, intent: intent.id, ...extra });
      // asleep: the action (and a charging Windup) is lost
      if (this.foe.drowsy && this.foe.drowsy.actions > 0) {
        this.foe.drowsy.actions--;
        this.cancelWindup();
        push("sleep", 0);
        return;
      }
      // dizzy: a third of its actions stumble
      if (isDizzy(this.foe, n) && this.rng() < STUMBLE) {
        this.cancelWindup();
        push("stumble", 0);
        return;
      }
      if (intent.release) {
        releasing = true;
        return;
      }
      switch (intent.id) {
        case "fog_puff": {
          const r = this.enemyHit(p, puffPower(this.data, this.boss), false);
          this.sinceGiggle++;
          this.lastWasStatus = false;
          round.enemyDamage += r.taken;
          push("puff", r.taken, r.returned ? { returned: r.returned } : {});
          break;
        }
        case "big_puff":
          // the charge: it shows a ring and lets go at the end of the next round
          this.windup = { releaseAt: n + 1 };
          this.sinceGiggle++;
          this.lastWasStatus = false;
          round.effects.push({ on: "them", kind: "windup" });
          push("windup", 0);
          break;
        case "thicken": {
          const amount = floor(this.maxFog * (this.data.intentsById["thicken"]?.shield_share_of_max_fog ?? 0.2));
          const rounds = (this.data.intentsById["thicken"]?.rounds ?? 2) + (this.enemy.gift === "sturdy_shell" ? 1 : 0);
          this.foe.shield = { amount, until: n + rounds };
          this.sinceGiggle++;
          this.lastWasStatus = false;
          this.lastWasBigPuff = false;
          push("thicken", amount);
          break;
        }
        case "giggle": {
          const give = this.foeHeal(Math.ceil(this.maxFog * giggleShare(this.data)));
          this.sinceGiggle = 0;
          this.lastWasBigPuff = false;
          this.lastWasStatus = false;
          push("giggle", give);
          break;
        }
        case "drowsy_mist":
        case "dizzy_swirl":
        case "sticky_mud": {
          const status = this.data.intentsById[intent.id]!.status as StatusId;
          const took = this.statusOnMine(status, round.effects);
          this.sinceGiggle++;
          this.lastWasBigPuff = false;
          this.lastWasStatus = took;
          push("mist", 0, { status });
          break;
        }
        case "cheer_up": {
          shiftStage(this.foe, "power", 1, n, this.data.intentsById["cheer_up"]?.rounds ?? 3);
          this.sinceGiggle++;
          this.lastWasBigPuff = false;
          this.lastWasStatus = false;
          push("cheer", 0);
          break;
        }
        default:
          // Silly Dance: a breather, and a star for the child
          this.addSpark(this.data.intentsById["silly_dance"]?.spark_for_child ?? 1);
          this.sinceGiggle++;
          this.lastWasBigPuff = false;
          this.lastWasStatus = false;
          push("silly", 0);
      }
    };

    // a swap, or medicine, comes before the enemy's action; a move goes by Speed (Quick moves first)
    const mine = a.kind !== "move" || this.meFirst(a.move);
    round.first = mine ? "me" : "them";
    // the Speed of the order is read before anything of this round changes it
    if (mine) {
      doMine();
      doTheirs();
    } else {
      doTheirs();
      doMine();
    }

    // ---- the end of the round ----
    const p = this.partner;
    // a Windup is let go at the end of the round, unless a good round (or a lullaby) staggered it
    if (releasing && this.windup && this.fog > 0) {
      if (this.roundDamage >= Math.ceil(this.maxFog * STAGGER_SHARE)) {
        staggerIt = true;
        round.staggered = true;
        this.windup = null;
        events.push({ who: "them", kind: "stagger", amount: 0, fog: this.fog, pep: this.pepOf(p), creature: p.id, intent: "big_puff" });
        this.lastWasBigPuff = false;
        this.sinceGiggle++;
      } else {
        this.windup = null;
        const r = this.enemyHit(p, bigPuffPower(this.data), true);
        this.lastWasBigPuff = true;
        round.enemyDamage += r.taken;
        events.push({ who: "them", kind: "puff", amount: r.taken, fog: this.fog, pep: this.pepOf(p), creature: p.id, intent: "big_puff", ...(r.returned ? { returned: r.returned } : {}) });
      }
    }
    void staggerIt;
    // the answered move has played: only now does a friend at 0 Pep fall asleep
    if (this.pepOf(p) <= 0 && usable(p)) {
      faint(p);
      this.fainted++;
      round.fainted = p.id;
      this.mine = newFighter();
      this.o.field.doze({ species: p.species, n, awake: awakeParty(w).length });
    }
    if (usable(p)) this.ticks(p, n);
    else this.tickFoe(n);
    expire(this.foe, n);
    if (usable(p)) expire(this.mine, n);
    this.fog = Math.max(0, this.fog);
    if (this.fog > 0 && a.kind === "move" && a.question && this.budget.asked >= this.budget.limit) {
      this.fog = 0;
      round.capped = true;
      this.o.field.cap({ asked: this.budget.asked, limit: this.budget.limit, band: this.band });
    }
    if (this.fog <= 0) {
      this.windup = null;
      round.calm = true;
      this.calmed(round);
    } else if (round.fainted) {
      if (awakeParty(w).length === 0) {
        nurseHeals(w);
        this.phase = "carried";
        round.carried = true;
        this.o.field.note("carried", { at: "round", n });
        this.end("carried");
      } else {
        this.needSwap = true;
        round.needSwap = true;
      }
    }
    if (this.finale && round.finale) this.finale = null;
    this.finaleStep = null;
    round.spark = this.spark;
    if (this.phase === "fighting") {
      // while a friend must be picked the next intent waits: it is drawn for the friend who comes in
      this.intent = this.needSwap ? null : this.drawNext();
      round.next = this.intent;
    }
    this.o.field.round({
      n,
      intent: intent.id,
      enemy: round.enemyDamage,
      first: round.first,
      pep: this.pepOf(this.partner),
      pepMax: this.maxPepOf(this.partner),
      fog: this.fog,
      next: this.intent?.id ?? "none",
      action: a.kind,
    });
    if (this.growthKeep && !round.growth.leveled) round.growth = this.growthKeep;
    this.growthKeep = null;
    this.last = round;
    this.o.onChange();
    return round;
  }

  /** The extra the last hit of a Finale adds when its answer was right (a shield, a Slow, a heal ...). */
  private lastHitEffects(move: Move): MoveEffect[] {
    return move.last_hit ?? [];
  }

  /**
   * An enemy hit on the partner: the formula, then the Giggly halving, the mirror's softening and the shield. Brave
   * Heart (the youngest band, or the gift) leaves 1 Pep once. A hard hit fills a star of Spark.
   */
  private enemyHit(p: Creature, mp: number, release: boolean): { taken: number; returned: number } {
    const n = this.turns;
    let amount = this.hitAmount(p, ROLL_MIN + (1 - ROLL_MIN) * this.rng(), mp, n);
    if (this.foe.giggly > 0) {
      amount = Math.max(1, floor(amount * 0.5));
      this.foe.giggly--;
    }
    let returned = 0;
    const m = this.mine.mirror;
    if (m && m.until >= n) {
      returned = Math.max(1, floor(amount * m.ret));
      amount = Math.max(1, floor(amount * (1 - m.soften)));
      this.mine.mirror = null;
      returned = Math.min(returned, Math.max(0, this.fog - 1));
      this.fog -= returned;
    }
    const s = absorb(this.mine, amount, n);
    const hit = s.left;
    const max = this.maxPepOf(p);
    let pep = this.pepOf(p) - hit;
    // Brave Heart: the first hit that would put a friend to sleep leaves it at 1 Pep
    const braveDefault = this.data.rules.bands[this.band].brave_heart_default;
    if (pep <= 0 && (braveDefault || this.giftOf(p) === "brave_heart") && !this.brave.has(p.id)) {
      this.brave.add(p.id);
      pep = 1;
    }
    this.pep.set(p.id, Math.max(0, Math.min(max, pep)));
    if (hit >= this.data.rules.spark.hard_hit_share_of_pep * max) this.addSpark(this.data.rules.spark.per_hard_hit);
    if (!release) this.lastWasBigPuff = hit > BIG_PUFF * max;
    return { taken: hit, returned };
  }

  /** Our side's ticks at the end of a round: Regen heals, Sniffly drips (never below 1 Pep). */
  private ticks(p: Creature, n: number): void {
    const max = this.maxPepOf(p);
    const r = this.mine.regen;
    if (r && r.until >= n) this.healMine(p, Math.ceil(r.share * max));
    const s = this.mine.sniffly;
    if (s && s.until >= n) this.pep.set(p.id, Math.max(1, this.pepOf(p) - Math.ceil(0.06 * max)));
    this.tickFoe(n);
  }

  private tickFoe(n: number): void {
    if (this.foe.regen && this.foe.regen.until >= n) this.foeHeal(Math.ceil(this.foe.regen.share * this.maxFog));
    const s = this.foe.sniffly;
    if (s && s.until >= n && this.fog > 1) this.fog = Math.max(1, this.fog - Math.max(1, Math.ceil(0.03 * this.maxFog)));
  }

  /** The fog is gone: the creature sits down, calm, and pays (a master's test is won). */
  private calmed(round: Round): void {
    const w = this.o.world;
    w.seen.add(this.o.wild.species);
    this.intent = null;
    const brilliant = round.capped ? 0 : Math.min(BRILLIANT_COIN_MAX, this.brilliant);
    const steady = this.fainted === 0;
    const bright = !round.capped && this.brilliant >= 2;
    const coins = winCoins(this.o.wild.level) + brilliant + (steady ? STAR_COINS : 0) + (bright ? STAR_COINS : 0);
    w.addMoney(coins);
    const growth = giveXp(w, this.partner.id, WIN_POINTS);
    if (growth.leveled) round.growth = { leveled: true, level: growth.level };
    const found = this.o.master || !this.o.economy ? null : this.leaveCard(this.o.economy);
    this.reward = { coins, points: WIN_POINTS, stars: { calm: true, steady, bright }, brilliant: this.brilliant, capped: round.capped, found };
    if (this.o.master) {
      this.phase = "won";
      this.end("won");
    } else this.phase = "calm";
  }

  /** A card the calmed creature leaves (the rules' chance): into the Bag, or nothing when it does not fit. */
  private leaveCard(eco: Economy): string | null {
    const id = findCard(eco, this.data.rules.evolution, this.o.monsters, this.data, this.partner, this.rng);
    if (!id || !give(this.o.world, eco, id, 1)) return null;
    this.o.field.note("card_found", { item: id });
    return id;
  }

  // ---- swapping and medicine ----

  /**
   * Another friend of the party becomes the partner. When the partner fell
   * asleep this is free ("free"); otherwise it costs the turn and the
   * enemy acts on the friend who comes in (a Round). Null when it cannot be
   * done: not in the party, asleep, or already the partner.
   */
  swap(id: string): Round | "free" | null {
    if (this.phase !== "fighting" && this.phase !== "calm") return null;
    const c = this.team().find((x) => x.id === id);
    if (!c || !usable(c) || c.id === this.partner.id) return null;
    if (this.phase === "calm" || this.needSwap) {
      if (!setPartner(this.o.world, id)) return null;
      this.mine = newFighter();
      this.needSwap = false;
      this.o.field.note("partner", { species: c.species, subject: this.traits(c).subject });
      if (this.phase === "fighting" && this.intent === null) this.intent = this.drawNext();
      this.o.onChange();
      return "free";
    }
    return this.play({ kind: "swap", to: id });
  }

  /** The friends of the team a medicine can be used on now (ids): the sleeping for a wake, the hurt for a heal, the partner for a refill. */
  medicineTargets(itemId: string): string[] {
    const item = this.o.economy?.items[itemId];
    if (!item || item.kind !== "medicine" || (this.phase !== "fighting" && this.phase !== "calm")) return [];
    const team = this.team();
    if (item.effect === "wake") return team.filter((c) => !usable(c)).map((c) => c.id);
    if (item.effect === "heal_pep") return team.filter((c) => usable(c) && this.pepOf(c) < this.maxPepOf(c)).map((c) => c.id);
    if (item.effect === "refill_charges") return this.cards().some((c) => c.left !== null && c.max !== null && c.left < c.max) ? [this.partner.id] : [];
    return [];
  }

  /**
   * Medicine from the Bag. A Wake Berry wakes a sleeping friend of the party at part of its Pep, for good; a heal
   * gives Pep back to an awake one; the Energy Berry refills the partner's emptiest move. Free while a friend must be
   * picked (or the creature is calm), else it costs the turn. Null when it cannot be used.
   */
  medicine(creatureId: string, itemId: string): Round | "free" | null {
    const eco = this.o.economy;
    const item = eco?.items[itemId];
    if (!eco || !item || (this.phase !== "fighting" && this.phase !== "calm")) return null;
    if (!this.medicineTargets(itemId).includes(creatureId)) return null;
    if (countOf(this.o.world, itemId) < 1) return null;
    const c = this.o.world.creatures.find((x) => x.id === creatureId)!;
    const max = this.maxPepOf(c);
    if (item.effect === "wake") {
      const share = wakeWith(this.o.world, eco, creatureId, itemId);
      if (!share) return null;
      this.pep.set(c.id, Math.max(1, Math.ceil(max * share)));
    } else {
      take(this.o.world, itemId);
      if (item.effect === "heal_pep") this.pep.set(c.id, Math.min(max, this.pepOf(c) + Math.ceil(max * item.healShare)));
      else if (item.effect === "refill_charges") {
        const worst = this.cards().filter((x) => x.left !== null && x.max !== null).sort((a, b) => a.left! / a.max! - b.left! / b.max!)[0];
        if (worst) this.charges.set(`${c.id}:${worst.move.id}`, worst.max!);
      }
    }
    this.o.field.item({ item: itemId, where: "battle", ok: true });
    if (this.phase === "calm" || this.needSwap) {
      // the partner itself woke: nobody needs to be picked
      if (c.id === this.partner.id && usable(c)) this.needSwap = false;
      if (this.phase === "fighting" && this.intent === null && !this.needSwap) this.intent = this.drawNext();
      this.o.onChange();
      return "free";
    }
    return this.play({ kind: "medicine", to: creatureId });
  }

  // ---- befriending (S3, BATTLE_V3 8): a try that can fail, from the tray at any time ----

  /** The creature's statuses by name, for the befriend chance: "calm" at Fog 0 (slice S2 adds Drowsy, Dizzy and the rest here). */
  enemyStatuses(): string[] {
    return this.fog <= 0 ? ["calm"] : [];
  }

  /** Befriending is open: wild creatures only (never a master, Keeper or guardian), fighting or calm, no friend waiting to be picked. */
  canBefriend(): boolean {
    return this.kind === "wild" && (this.phase === "fighting" || this.phase === "calm") && !this.needSwap;
  }

  /**
   * The optional Gift question (8.3): one normal-tier question in the creature's subject. Right: x1.5 on the next try;
   * wrong or closed: x1, nothing lost. Null when no question can be made.
   */
  giftQuestion(): QuizSession | null {
    if (!this.canBefriend()) return null;
    const bias = biasFor(this.data.rules.bands[this.band].right_chance.N, this.o.engine.learner.targetFrontier);
    for (let i = 0; i < TRIES; i++) {
      const session = new QuizSession(
        this.o.engine,
        { topic: this.enemy.subject, context: "seal", maxChoices: this.o.maxChoices, speed: false, kinds: ["order", "letters"], bias, ...this.questionHelpers() },
        this.o.clock,
        (outcome) => {
          this.stats.questions++;
          this.stats.ms += session.elapsedMs;
          if (outcome.correct) this.stats.correct++;
          this.befriend.gift = outcome.correct;
          this.o.onChange();
        },
        this.o.warn,
      );
      if (session.question) return session;
    }
    return null;
  }

  /** One try with a tool and a treat. A friend ends the fight; a failed try changes nothing but the next chance (the creature never runs away). */
  tryBefriend(sel: Selection): TryResult {
    const r = this.befriend.attempt(sel);
    if (r.kind === "caught") {
      this.phase = "caught";
      this.end("caught");
    }
    return r;
  }

  /** The owl's spare net (only with no net at all, once a day). */
  spareNet(eco: Economy, today: string): Item | null {
    const net = claimSpareNet(this.o.world, eco, today);
    if (net) {
      this.o.field.note("spare_net", { item: net.id });
      this.o.onChange();
    }
    return net;
  }

  /** The child's own name for the new friend; null or a bad name is "skip". Kept on the phone only. */
  nameIt(creatureId: string, name: string | null): void {
    const c = this.o.world.creatures.find((x) => x.id === creatureId);
    const clean = name === null ? "" : name.trim().replace(/\s+/g, " ").slice(0, 16);
    if (!c || !clean) return;
    c.name = clean;
    this.o.onChange();
  }

  /** The child goes on their way: always free, always works; nothing is lost. */
  run(): void {
    if (this.phase !== "fighting" && this.phase !== "calm") return;
    const calm = this.phase === "calm";
    this.phase = "ran";
    this.end(calm ? "calm_left" : "ran");
  }

  private end(result: string): void {
    if (this.ended) return;
    this.ended = true;
    this.o.field.battleEnd({
      result,
      questions: this.stats.questions,
      correct: this.stats.correct,
      ms: this.stats.ms,
      turns: this.turns,
      secs: Math.max(0, (this.o.clock() - this.startedAt) / 1000),
    });
  }

}
