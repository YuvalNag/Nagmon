/**
 * One friendly battle, slice S1 of docs/app/BATTLE_V3.md: the child picks
 * one of the partner's four moves, and the question IS the cast. A round
 * is: the child chooses (and answers), then both sides act in order of
 * Speed; the enemy's intent was shown before the child chose.
 *
 * - Right answer: the move's full effect. Wrong answer: x0.35 damage
 *   (at least 1), no Brilliant, nothing else lost. Nothing is taken from
 *   the Bag, the coins or the hearts.
 * - Both sides have a bar: the enemy's Fog (take it to 0 and it is calm)
 *   and the partner's Pep. A creature at 0 Pep at the end of a round
 *   FAINTS (decision of the parent): it is not lost, but it cannot be used
 *   until it is healed (medicine or the Rest Center's nurse). The answered
 *   move always plays, even when the enemy's first action brings Pep to 0.
 * - Pep and Charges are per battle: every awake friend starts a battle full.
 *   Fainting is the only thing that carries over.
 * - Speed counts for nothing in the rating or the growth (a creature's Speed
 *   only decides who acts first; there is no timer).
 */
import type { LearningEngine } from "../learning/engine";
import { BattleQuizBudget, type SubjectMap } from "../learning/quiz_flow";
import { type HelperBag, type HelperKind, type QuizRequest, QuizSession } from "../world/quiz";
import type { Creature, WorldState } from "../world/worldState";
import {
  addCreature,
  type Growth,
  giveXp,
  markSeen,
  PARTY_SIZE,
  partner as partnerOf,
} from "./collection";
import { claimSpareNet, countOf, type Economy, type Item, spendBoost, take } from "./items";
import { awakeParty, faint, nurseHeals, partyDown, useMedicine, usable } from "./faint";
import { setPartner } from "./party";
import {
  BRILLIANT_COIN_MAX,
  CATCH_POINTS,
  GENTLE,
  QUESTION_CAP,
  RIGHT_CHANCE,
  S1_PACING,
  ROLL_MIN,
  STAR_COINS,
  WIN_POINTS,
  type Band,
  type FightKind,
  type WheelHit,
  bandOf,
  damageOf,
  fogOf,
  MP,
  weakSubjects,
  wheelHit,
  wheelMult,
  winCoins,
} from "./battleNumbers";
import { creatureStats, speciesBattle, type SpeciesBattle } from "./battleSpecies";
import { BIG_PUFF, drawIntent, GIGGLE_SHARE, type IntentId } from "./intents";
import { DEFAULT_MOVES, equipped, type Move, type MoveTable, type Tier, WIGGLE } from "./moves";
import type { Wild } from "./encounters";
import type { FieldLog } from "./fieldLog";
import type { MonsterTable } from "./monsters";

export const MAX_CREATURES = 60;
export { PARTY_SIZE };

/** The master's test has the guardian's caps: its fight is about twice as long (5.5). */
const MASTER_CAP: Record<Band, number> = { A: 18, B: 22, C: 19 };
/** The expected number a Puff shows over the creature (the roll fixed at its middle). */
const SHOWN_ROLL = 0.96;
/** A lucky star: one right answer in sixteen is Brilliant. */
const LUCKY_STAR = 1 / 16;

/**
 * fighting: asking questions; calm: the fog is gone, a net can come;
 * caught: the friend joined; won: a master's test is won; ran: gone on;
 * carried: the whole team fell asleep and was carried to the Rest Center.
 */
export type BattlePhase = "fighting" | "calm" | "caught" | "won" | "ran" | "carried";

/** One thing that happened in a round, for the screen to play in order. */
export interface RoundEvent {
  who: "me" | "them";
  kind: "hit" | "puff" | "giggle" | "silly" | "swap" | "medicine";
  /** Fog taken, Pep taken, or what a Giggle gave back. */
  amount: number;
  /** The bars right after this event. */
  fog: number;
  pep: number;
  /** The creature that acted or was acted on. */
  creature: string;
}

export interface IntentView {
  id: IntentId;
  /** A Puff's number (about; the roll fixed); 0 for the others. */
  amount: number;
  /** The enemy acts before the partner this round (Speed). */
  first: boolean;
}

export interface Round {
  n: number;
  kind: "move" | "swap" | "medicine";
  move: Move | null;
  correct: boolean;
  /** Fog the move took. */
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
}

/** What a calm creature pays (5.4, 6.5): coins and the stars of the results card. */
export interface Reward {
  coins: number;
  points: number;
  /** Calm always; Steady: nobody fell asleep; Bright: two Brilliant hits. */
  stars: { calm: true; steady: boolean; bright: boolean };
  brilliant: number;
  capped: boolean;
}

/** A card of the 2 x 2 grid. */
export interface Card {
  move: Move;
  /** Charges left (null: no limit) and the most. */
  left: number | null;
  max: number | null;
  /** No charges left: the card is dimmed. */
  dimmed: boolean;
  /** The wheel against this enemy, when the child may know it (the age band's rule). */
  hit: WheelHit;
  /** The move is of the partner's own subject (Home bonus). */
  home: boolean;
}

/** One go at a net: the seal question(s) and what came of them. */
export interface SealResult {
  /** Right answers still needed (0 when it is caught). */
  left: number;
  correct: boolean;
  /** The creature that joined, when this answer finished the seal. */
  caught: Creature | null;
  /** It joined the Meadow, not the party. */
  toMeadow: boolean;
  /** The friend count was full: it is in the Book, but did not join. */
  full: boolean;
  coins: number;
  /** Growth the befriending gave the partner. */
  growth: Growth | null;
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
  /** The moves table (game/moves.json); the plain attacks when left out. */
  moves?: MoveTable;
  /** A random number in [0, 1): a test passes a seeded one. */
  rng?: () => number;
  /** The tests' hook: start the partner's Pep or the enemy's Fog at this number. */
  debug?: { pep?: number; fog?: number; charges?: number };
}

/** How many times a question is tried for before the battle ends in peace. */
const TRIES = 5;

/** The selector's bias for a wanted chance of a right answer, given the learner's own target (a logit shift). */
export function biasFor(wanted: number, target: number): number {
  const logit = (p: number) => Math.log(p / (1 - p));
  const clamp = (p: number) => Math.min(0.97, Math.max(0.03, p));
  return Math.max(-1.5, Math.min(1.5, logit(clamp(wanted)) - logit(clamp(target))));
}

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
  readonly enemy: SpeciesBattle & { level: number; speed: number; power: number };
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
  /** The net being used: a wrong seal answer keeps it, a right one finishing the seal uses it up. */
  net: Item | null = null;
  /** Seal answers still needed with that net. */
  sealLeft = 0;
  /** Tries at the seal in this meeting (a wrong one is only a try). */
  tries = 0;
  lastSeal: SealResult | null = null;
  /** The owl's free hint is offered on the next question (three wrong answers in a row). */
  autoHint = false;
  /** Brilliant hits so far. */
  brilliant = 0;
  /** Friends that fell asleep in this fight. */
  fainted = 0;

  private readonly moves: MoveTable;
  private readonly rng: () => number;
  private readonly pep = new Map<string, number>();
  private readonly charges = new Map<string, number>();
  private readonly brave = new Set<string>();
  private casting: { move: Move; session: QuizSession } | null = null;
  private rightStreak = 0;
  private wrongStreak = 0;
  private easier = false;
  private lastSubject: string | null = null;
  private sinceGiggle = 99;
  private lastWasBigPuff = false;
  private readonly seenBefore: boolean;
  private readonly startedAt: number;
  private ended = false;

  constructor(private readonly o: BattleOptions) {
    const w = o.world;
    if (!partnerOf(w)) throw new Error("no partner to battle with");
    this.moves = o.moves ?? DEFAULT_MOVES;
    this.rng = o.rng ?? Math.random;
    this.startedAt = o.clock();
    this.band = bandOf(o.age ?? o.engine.learner.age ?? o.engine.learner.grade + 6);
    this.kind = o.master ? "master" : "wild";
    this.seenBefore = w.seen.has(o.wild.species);
    const sp = speciesBattle(o.monsters[o.wild.species], o.wild.species, o.subjects);
    const st = creatureStats(sp, o.wild.level);
    this.enemy = { ...sp, level: o.wild.level, speed: st.speed, power: st.power };
    this.maxFog = fogOf(o.wild.level, this.kind, this.band, S1_PACING);
    this.fog = o.debug?.fog ?? this.maxFog;
    this.budget = new BattleQuizBudget(o.master ? MASTER_CAP[this.band] : QUESTION_CAP[this.band]);
    markSeen(w, o.wild.species);
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

  /** The partner's friends of the party, awake or not. */
  team(): Creature[] {
    return this.o.world.creatures.slice(0, PARTY_SIZE);
  }

  /** The species' traits of one of the child's creatures. */
  traits(c: Creature): SpeciesBattle {
    return speciesBattle(this.o.monsters[c.species], c.species, this.o.subjects);
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

  // ---- the cards ----

  /** The four moves of the partner, with charges and the wheel; when every one is out of charges, only the Little Wiggle. */
  cards(): Card[] {
    const p = this.partner;
    const tr = this.traits(p);
    const show = this.revealed();
    const cards = equipped(tr.subject, p.level, this.moves).map<Card>((m) => {
      const max = m.charges;
      const left = max === null ? null : (this.charges.get(`${p.id}:${m.id}`) ?? Math.min(max, this.o.debug?.charges ?? max));
      return { move: m, left, max, dimmed: left !== null && left <= 0, hit: show && m.subject ? wheelHit(m.subject, this.enemy.subject, this.enemy.weak) : null, home: m.subject === tr.subject };
    });
    if (cards.length === 0 || cards.every((c) => c.dimmed)) {
      const wiggle = this.moves[WIGGLE] ?? DEFAULT_MOVES[WIGGLE]!;
      return [{ move: wiggle, left: null, max: null, dimmed: false, hit: null, home: false }];
    }
    return cards;
  }

  // ---- intents ----

  private drawNext(): IntentView {
    const p = this.partnerOrNull();
    const pepMax = p ? this.maxPepOf(p) : 1;
    const amount = p ? this.puffAmount(p, SHOWN_ROLL) : 0;
    const id = drawIntent(this.rng(), this.enemy.temperament, {
      lastWasBigPuff: this.lastWasBigPuff,
      sinceGiggle: this.sinceGiggle,
      fogFull: this.fog >= this.maxFog,
      puffIsBig: amount > BIG_PUFF * pepMax,
    });
    return { id, amount: id === "puff" ? amount : 0, first: p ? this.enemy.speed > creatureStats(this.traits(p), p.level).speed : false };
  }

  private partnerOrNull(): Creature | null {
    return this.phase === "carried" ? null : (partnerOf(this.o.world) ?? null);
  }

  /** What the enemy's Puff takes from this friend: the same formula, the friend's Guard, the band's gentle factor. */
  private puffAmount(c: Creature, roll: number): number {
    return damageOf({
      level: this.enemy.level,
      mp: this.kind === "master" ? MP.puffBoss : MP.puff,
      power: this.enemy.power,
      guard: creatureStats(this.traits(c), c.level).guard,
      right: true,
      roll,
      gentle: GENTLE[this.band],
    });
  }

  // ---- the round ----

  start(map: string): void {
    this.o.field.battleStart({ monster: this.o.wild.species, level: this.o.wild.level, map });
    if (this.phase === "carried") this.end("carried");
  }

  /**
   * The child picks a move. A move with a question opens it (`session`);
   * the answer is the cast. The Little Wiggle asks nothing and plays at
   * once (`round`). Null when the card is not open now.
   */
  choose(moveId: string): { move: Move; session: QuizSession | null; round: Round | null; hint: boolean } | null {
    if (this.phase !== "fighting" || this.needSwap) return null;
    const card = this.cards().find((c) => c.move.id === moveId);
    if (!card || card.dimmed) return null;
    const move = card.move;
    this.casting = null;
    if (move.tier === "W") return { move, session: null, round: this.play({ kind: "move", move, correct: true, ms: 0, question: false }), hint: false };
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

  /** The question was closed without an answer (the owl's pass, or Android's back): nothing is counted or spent. */
  cancel(): void {
    this.casting = null;
  }

  /** The tier of the question: easier by one after three wrong answers in a row (E stays E). */
  private questionTier(move: Move): "E" | "N" | "S" {
    const t: "E" | "N" | "S" = move.tier === "E" ? "E" : move.tier === "S" ? "S" : "N";
    if (!this.easier) return t;
    return t === "S" ? "N" : "E";
  }

  private request(move: Move): QuizRequest {
    const tier = this.questionTier(move);
    const target = this.o.engine.learner.targetFrontier;
    // no Elo speed bonus in a battle: the rating stays about knowledge, not reflexes
    const r: QuizRequest = {
      topic: move.subject!,
      context: "battle",
      maxChoices: this.o.maxChoices,
      speed: false,
      // easy moves use the quick shapes only; the others may use ordering and letter tiles
      kinds: tier === "E" ? [] : ["order", "letters"],
      bias: biasFor(RIGHT_CHANCE[this.band][tier], target),
    };
    const bag = this.helperBag();
    if (bag) r.helpers = bag;
    return r;
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

  private resolve(move: Move, correct: boolean, ms: number): Round {
    this.stats.questions++;
    this.budget.take();
    return this.play({ kind: "move", move, correct, ms, question: true });
  }

  /**
   * The rules' own entry for simulations and tests: the cast of a move with a given answer, no question asked.
   * (The screen always goes through `choose`, where the question is the cast.) Null when the card is not open.
   */
  castScripted(moveId: string, correct: boolean): Round | null {
    if (this.phase !== "fighting" || this.needSwap) return null;
    const card = this.cards().find((c) => c.move.id === moveId);
    if (!card || card.dimmed) return null;
    if (card.move.tier === "W") return this.play({ kind: "move", move: card.move, correct: true, ms: 0, question: false });
    return this.resolve(card.move, correct, 0);
  }

  /** Whose turn order: true when the child's creature acts first (higher Speed; ties go to the child). */
  private meFirst(): boolean {
    const p = this.partner;
    return creatureStats(this.traits(p), p.level).speed >= this.enemy.speed;
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
      growth: { leveled: false, level: this.partner.level, evolvedTo: null },
      next: null,
      needSwap: false,
      carried: false,
    };

    // ---- the child's action ----
    const doMine = () => {
      if (a.kind === "swap") {
        if (setPartner(w, a.to)) this.o.field.note("partner", { species: this.partner.species, subject: this.traits(this.partner).subject });
        events.push({ who: "me", kind: "swap", amount: 0, fog: this.fog, pep: this.partnerPep.now, creature: this.partner.id });
        return;
      }
      if (a.kind === "medicine") {
        events.push({ who: "me", kind: "medicine", amount: 0, fog: this.fog, pep: this.partnerPep.now, creature: a.to });
        return;
      }
      const p = this.partner;
      const mine = creatureStats(this.traits(p), p.level);
      const tr = this.traits(p);
      const subject = a.move.subject;
      const hit = subject ? wheelHit(subject, this.enemy.subject, this.enemy.weak) : null;
      let brilliant = false;
      if (a.question) {
        if (a.correct) {
          this.stats.correct++;
          this.rightStreak++;
          this.wrongStreak = 0;
          brilliant = this.rightStreak % 3 === 0 || this.rng() < LUCKY_STAR;
          round.growth = giveXp(w, p.id, spendBoost(w), this.o.monsters);
        } else {
          this.rightStreak = 0;
          this.wrongStreak++;
          if (this.wrongStreak >= 3) {
            this.autoHint = true;
            this.easier = true;
            this.wrongStreak = 0;
          }
        }
      }
      const mix = a.question && subject !== null && this.lastSubject !== null && this.lastSubject !== subject;
      const damage = Math.min(
        this.fog,
        damageOf({
          level: p.level,
          mp: a.move.mp,
          power: mine.power,
          guard: this.enemyGuard(),
          home: subject !== null && subject === tr.subject,
          wheel: wheelMult(hit),
          brilliant: a.question && a.correct && brilliant,
          mix,
          right: a.correct,
          roll: ROLL_MIN + (1 - ROLL_MIN) * this.rng(),
        }),
      );
      if (a.question && subject) this.lastSubject = subject;
      this.fog -= damage;
      if (a.move.charges !== null) {
        const key = `${p.id}:${a.move.id}`;
        this.charges.set(key, Math.max(0, (this.charges.get(key) ?? Math.min(a.move.charges, this.o.debug?.charges ?? a.move.charges)) - 1));
      }
      round.damage = damage;
      round.wheel = a.question ? hit : null;
      round.brilliant = a.question && a.correct && brilliant;
      if (round.brilliant) this.brilliant++;
      // the wheel is learned by seeing it work (ages 11 and up)
      if (a.question && hit && !this.known()) w.variables.set(this.weakKey(), "1");
      events.push({ who: "me", kind: "hit", amount: damage, fog: this.fog, pep: this.pepOf(p), creature: p.id });
      this.o.field.move({
        n,
        move: a.move.id,
        subject: subject ?? "none",
        tier: a.move.tier,
        ok: a.correct,
        damage,
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
    const doTheirs = () => {
      if (this.fog <= 0) return;
      const p = this.partner;
      let amount = 0;
      let kind: RoundEvent["kind"] = "silly";
      if (intent.id === "puff") {
        kind = "puff";
        amount = this.puffAmount(p, ROLL_MIN + (1 - ROLL_MIN) * this.rng());
        const max = this.maxPepOf(p);
        let pep = this.pepOf(p) - amount;
        // Brave Heart (the youngest band): the first hit that would put a friend to sleep leaves it at 1 Pep
        if (pep <= 0 && this.band === "A" && !this.brave.has(p.id)) {
          this.brave.add(p.id);
          pep = 1;
        }
        this.pep.set(p.id, Math.max(0, Math.min(max, pep)));
        this.lastWasBigPuff = amount > BIG_PUFF * max;
        this.sinceGiggle++;
      } else if (intent.id === "giggle") {
        kind = "giggle";
        amount = Math.max(0, Math.min(this.maxFog - this.fog, Math.ceil(this.maxFog * GIGGLE_SHARE)));
        this.fog += amount;
        this.sinceGiggle = 0;
        this.lastWasBigPuff = false;
      } else {
        this.sinceGiggle++;
        this.lastWasBigPuff = false;
      }
      round.enemyDamage = kind === "puff" ? amount : 0;
      events.push({ who: "them", kind, amount, fog: this.fog, pep: this.pepOf(p), creature: p.id });
    };

    // a swap, or medicine, comes before the enemy's action; a move goes by Speed
    const mine = a.kind !== "move" || this.meFirst();
    round.first = mine ? "me" : "them";
    if (a.kind === "medicine") {
      const max = this.o.world.creatures.find((c) => c.id === a.to);
      if (max) this.pep.set(a.to, Math.ceil(this.maxPepOf(max) / 2));
    }
    if (mine) {
      doMine();
      doTheirs();
    } else {
      doTheirs();
      doMine();
    }

    // ---- the end of the round ----
    const p = this.partner;
    // the answered move has played: only now does a friend at 0 Pep fall asleep
    if (this.pepOf(p) <= 0 && usable(p)) {
      faint(p);
      this.fainted++;
      round.fainted = p.id;
      this.o.field.doze({ species: p.species, n, awake: awakeParty(w).length });
    }
    this.fog = Math.max(0, this.fog);
    if (this.fog > 0 && a.kind === "move" && a.question && this.budget.asked >= this.budget.limit) {
      this.fog = 0;
      round.capped = true;
      this.o.field.cap({ asked: this.budget.asked, limit: this.budget.limit, band: this.band });
    }
    if (this.fog <= 0) {
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
    this.last = round;
    this.o.onChange();
    return round;
  }

  private enemyGuard(): number {
    return creatureStats(this.enemy, this.enemy.level).guard;
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
    const growth = giveXp(w, this.partner.id, WIN_POINTS, this.o.monsters);
    if (growth.leveled) round.growth = { leveled: true, level: growth.level, evolvedTo: growth.evolvedTo ?? round.growth.evolvedTo };
    this.reward = { coins, points: WIN_POINTS, stars: { calm: true, steady, bright }, brilliant: this.brilliant, capped: round.capped };
    if (this.o.master) {
      this.phase = "won";
      this.end("won");
    } else this.phase = "calm";
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
      this.needSwap = false;
      this.o.field.note("partner", { species: c.species, subject: this.traits(c).subject });
      if (this.phase === "fighting" && this.intent === null) this.intent = this.drawNext();
      this.o.onChange();
      return "free";
    }
    return this.play({ kind: "swap", to: id });
  }

  /** Medicine from the Bag on a sleeping friend of the party: it wakes at half Pep. Free while a friend must be picked, else it costs the turn. */
  medicine(creatureId: string, itemId: string): Round | "free" | null {
    const eco = this.o.economy;
    if (!eco || (this.phase !== "fighting" && this.phase !== "calm")) return null;
    if (!this.team().some((c) => c.id === creatureId)) return null;
    if (!useMedicine(this.o.world, eco, creatureId, itemId)) return null;
    this.o.field.item({ item: itemId, where: "battle", ok: true });
    const c = this.o.world.creatures.find((x) => x.id === creatureId)!;
    if (this.phase === "calm" || this.needSwap) {
      this.pep.set(c.id, Math.ceil(this.maxPepOf(c) / 2));
      // the partner itself woke: nobody needs to be picked
      if (c.id === this.partner.id) this.needSwap = false;
      if (this.phase === "fighting" && this.intent === null) this.intent = this.drawNext();
      this.o.onChange();
      return "free";
    }
    return this.play({ kind: "medicine", to: creatureId });
  }

  // ---- calm: the current Net (befriending is S3) ----

  /** Seal answers a net needs for this creature: one; three for a rare (grown-up form) one; a silver net saves one. */
  sealNeeded(net: Item): number {
    const rare = (this.o.monsters[this.o.wild.species]?.stage ?? "basic") !== "basic";
    return Math.max(1, (rare ? 3 : 1) - net.sealLess);
  }

  /**
   * The Net: throws one at the calm creature. Nothing is used up yet;
   * the seal question comes next (`nextSeal`). Null when the creature is
   * not calm or the child has no such net.
   */
  throwNet(eco: Economy, netId: string): Item | null {
    const net = eco.items[netId];
    if (this.phase !== "calm" || !net || net.kind !== "net" || countOf(this.o.world, netId) < 1) return null;
    // the same net again goes on with the seals already broken; another net starts over
    if (this.net?.id !== net.id) {
      this.net = net;
      this.sealLeft = this.sealNeeded(net);
      this.o.field.item({ item: net.id, where: "battle", ok: true });
    }
    return net;
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

  /** The seal question for the net thrown; null when no net is out or no question can be made. */
  nextSeal(eco: Economy): QuizSession | null {
    if (this.phase !== "calm" || !this.net) return null;
    for (let i = 0; i < TRIES; i++) {
      const session = new QuizSession(
        this.o.engine,
        { topic: this.enemy.subject, context: "seal", maxChoices: this.o.maxChoices, speed: false, kinds: ["order", "letters"], ...this.sealHelpers() },
        this.o.clock,
        (outcome) => this.sealed(eco, session, outcome.correct),
        this.o.warn,
      );
      if (session.question) return session;
    }
    return null;
  }

  private sealHelpers(): { helpers?: HelperBag } {
    const bag = this.helperBag();
    return bag ? { helpers: bag } : {};
  }

  /** The seal answer: right takes a seal off; the last one catches. Wrong: the creature stays, the net is kept, try again. */
  private sealed(eco: Economy, session: QuizSession, correct: boolean): void {
    const net = this.net!;
    this.tries++;
    this.stats.questions++;
    this.stats.ms += session.elapsedMs;
    let caught: Creature | null = null;
    let toMeadow = false;
    let full = false;
    let coins = 0;
    let growth: Growth | null = null;
    if (correct) {
      this.stats.correct++;
      this.sealLeft = Math.max(0, this.sealLeft - 1);
      if (this.sealLeft === 0) {
        const w = this.o.world;
        w.seen.add(this.o.wild.species);
        w.caught.add(this.o.wild.species);
        full = w.creatures.length >= MAX_CREATURES;
        if (!full) {
          take(w, net.id);
          caught = addCreature(w, this.o.wild.species, this.o.wild.level);
          toMeadow = w.creatures.length > PARTY_SIZE;
          coins = eco.sealCoins;
          w.addMoney(coins);
          growth = giveXp(w, this.partner.id, CATCH_POINTS, this.o.monsters);
          this.phase = "caught";
          this.net = null;
        }
      }
    }
    this.o.field.capture({ species: this.o.wild.species, net: net.id, ok: correct, left: this.sealLeft, tries: this.tries });
    if (caught) {
      this.o.field.note("catch", { species: caught.species, level: caught.level, party: toMeadow ? 0 : 1 });
      this.end("caught");
    }
    this.lastSeal = { left: this.sealLeft, correct, caught, toMeadow, full, coins, growth };
    this.o.onChange();
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

  /** Which tiers exist on the cards, for the tests. */
  tiers(): Tier[] {
    return this.cards().map((c) => c.move.tier);
  }
}
