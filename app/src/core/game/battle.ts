/**
 * One friendly battle (docs/app/TRIPS.md; the old game's battle, made
 * calm): a wild creature, a question about its subject, and the answer
 * is the attack.
 *
 * - A right answer takes health from the wild creature; a wrong answer
 *   takes nothing from anyone. Nothing here can lose: the only ends are
 *   winning (the creature becomes a friend) and going on one's way.
 * - A right answer also grows the partner (two points when it was fast).
 * - No gore, no fainting, no health for the child's creature at all.
 */
import type { LearningEngine } from "../learning/engine";
import type { SubjectMap } from "../learning/quiz_flow";
import { type HelperBag, type HelperKind, type QuizRequest, QuizSession } from "../world/quiz";
import type { Creature, WorldState } from "../world/worldState";
import { addCreature, giveXp, type Growth, markSeen, PARTY_SIZE, partner as partnerOf } from "./collection";
import { claimSpareNet, countOf, type Economy, type Item, spendBoost, take } from "./items";
import { setPartner } from "./party";
import {
  ASSISTS_PER_BATTLE,
  type Beat,
  type Band,
  bandOf,
  type Burst,
  burstAnswer,
  burstLive,
  burstHit,
  charge,
  comboOf,
  freeDamage,
  type Legal,
  legalBeats,
  METER_SIZE,
  newBurst,
} from "./battleBeats";
import type { Wild } from "./encounters";
import type { FieldLog } from "./fieldLog";
import type { MonsterTable } from "./monsters";

export const MAX_CREATURES = 60;
export { PARTY_SIZE };

/** The wild creature's health, from its level. */
export function hpFor(level: number): number {
  return 18 + 3 * level;
}

/** What a right answer takes: the partner's level and how well it was answered (1.5 right, 2 fast). */
export function damageFor(partnerLevel: number, multiplier: number): number {
  return Math.round((3 + partnerLevel) * multiplier);
}

/**
 * fighting: asking questions; calm: the fog is gone, a net can come;
 * caught: the friend joined; won: a master's test is won; ran: gone on.
 */
export type BattlePhase = "fighting" | "calm" | "caught" | "won" | "ran";

export interface Turn {
  correct: boolean;
  damage: number;
  won: boolean;
  growth: Growth;
  /** Coins this answer paid (right answers only). */
  coins: number;
  /** The partner's species before this answer (it may have evolved on it). */
  partnerBefore: string;
  /** This answer took the last of the fog: the creature is calm (a master's test: won). */
  calm: boolean;
  /** This answer was a question of a Special: the medals so far, and whether the burst is over. */
  burst: { medals: (boolean | null)[]; combo: number; over: boolean } | null;
  /** The meter after this answer. */
  meter: number;
}

/** What a free beat (a Move, or the friend's assist) did; a Power-up is only the start of a question. */
export interface BeatResult {
  beat: Beat;
  damage: number;
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
}

export interface BattleOptions {
  engine: LearningEngine;
  world: WorldState;
  monsters: MonsterTable;
  subjects: SubjectMap;
  wild: Wild;
  clock: () => number;
  maxChoices: number | null;
  /** The child's age: it sets the meter's size (3 or 4 pips). The learner's own age when left out. */
  age?: number;
  field: FieldLog;
  /** The economy: with it, the Bag's helpers can be used on the questions. */
  economy?: Economy;
  /** A master's test: twice the health, and the prize is a badge, not a creature. */
  master?: boolean;
  /** The creatures or the learner changed: save them. */
  onChange: () => void;
  warn?: (message: string) => void;
}

/** How many times a question is tried for before the battle ends in peace. */
const TRIES = 5;

export class Battle {
  partner: Creature;
  readonly maxHp: number;
  hp: number;
  phase: BattlePhase = "fighting";
  last: Turn | null = null;
  readonly stats = { questions: 0, correct: 0, ms: 0 };
  /** The net being used: a wrong seal answer keeps it, a right one finishing the seal uses it up. */
  net: Item | null = null;
  /** Seal answers still needed with that net. */
  sealLeft = 0;
  /** Tries at the seal in this meeting (a wrong one is only a try). */
  tries = 0;
  lastSeal: SealResult | null = null;
  /** The last free beat, for the screen to play. */
  lastBeat: BeatResult | null = null;
  /** The friend's assists left in this battle. */
  assistsLeft = ASSISTS_PER_BATTLE;
  /** The last beat was a question: the next one is free. */
  lastWasQuestion = false;
  readonly band: Band;
  /** The charge meter: right Power-up answers fill it; full, it unlocks Special. */
  meter = 0;
  readonly meterSize: number;
  private burstHitSize = 0;
  /** The Special being played: its three questions, in a row. */
  burst: Burst | null = null;
  private subject: string;

  /** The subject the questions are about (it shows in the arena's look). */
  get topic(): string {
    return this.subject;
  }

  constructor(private readonly o: BattleOptions) {
    const p = partnerOf(o.world);
    if (!p) throw new Error("no partner to battle with");
    this.partner = p;
    this.band = bandOf(o.age ?? o.engine.learner.age ?? o.engine.learner.grade + 6);
    this.meterSize = METER_SIZE[this.band];
    this.maxHp = hpFor(o.wild.level) * (o.master ? 2 : 1);
    this.hp = this.maxHp;
    const info = o.monsters[o.wild.species];
    this.subject = o.subjects.subjectFor(info?.types ?? [], null, o.wild.species);
    markSeen(o.world, o.wild.species);
  }

  /** Friends: another friend of the party becomes the partner, and the questions are about what it is good at. */
  swapPartner(id: string): boolean {
    if (this.phase !== "fighting" && this.phase !== "calm") return false;
    if (!setPartner(this.o.world, id)) return false;
    this.partner = partnerOf(this.o.world)!;
    const info = this.o.monsters[this.partner.species];
    this.subject = this.o.subjects.subjectFor(info?.types ?? [], null, this.partner.species);
    this.o.field.note("partner", { species: this.partner.species, subject: this.subject });
    this.o.onChange();
    return true;
  }

  /** The cards the child may pick now (docs/app/BATTLE.md, section 4.1). */
  legal(): Legal {
    return legalBeats({ fighting: this.phase === "fighting", lastWasQuestion: this.lastWasQuestion, meterFull: this.meter >= this.meterSize, assistsLeft: this.assistsLeft });
  }

  /**
   * The child picks a card. A Move or a friend's assist plays at once and
   * asks nothing (it can only take the fog to half); a Power-up only opens
   * the way to a question (`next`). Null when the card is not open now.
   */
  pick(beat: Beat): BeatResult | null {
    if (!this.legal()[beat]) return null;
    if (beat === "power") return { beat, damage: 0 };
    if (beat === "special") {
      // the meter is spent; the burst's three questions follow (`next`)
      this.meter = 0;
      this.burst = newBurst();
      this.burstHitSize = burstHit(this.hp);
      this.o.onChange();
      return { beat, damage: 0 };
    }
    if (beat === "assist") this.assistsLeft--;
    const damage = freeDamage(this.hp, this.maxHp, damageFor(this.partner.level, 1.5));
    this.hp -= damage;
    this.lastWasQuestion = false;
    this.lastBeat = { beat, damage };
    this.o.onChange();
    return this.lastBeat;
  }

  start(map: string): void {
    this.o.field.battleStart({ monster: this.o.wild.species, level: this.o.wild.level, map });
  }

  /** The next question; null when none can be made (the battle then ends in peace). */
  next(): QuizSession | null {
    for (let i = 0; i < TRIES; i++) {
      const session = new QuizSession(
        this.o.engine,
        this.request("battle"),
        this.o.clock,
        (outcome) => this.answered(session, outcome.correct, outcome.power_multiplier, outcome.quality === "super", outcome.coins),
        this.o.warn,
      );
      if (session.question) return session;
    }
    return null;
  }

  private request(context: string): QuizRequest {
    const r: QuizRequest = { topic: this.subject, context, maxChoices: this.o.maxChoices };
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

  private answered(session: QuizSession, correct: boolean, multiplier: number, fast: boolean, earned: number): void {
    this.stats.questions++;
    this.stats.ms += session.elapsedMs;
    let damage = 0;
    let growth: Growth = { leveled: false, level: this.partner.level, evolvedTo: null };
    let coins = 0;
    const partnerBefore = this.partner.species;
    const burst = burstLive(this.burst) ? this.burst : null;
    if (burst) burstAnswer(burst, correct);
    else this.meter = charge(this.meter, this.meterSize, correct);
    if (correct) {
      this.stats.correct++;
      coins = Math.max(1, earned);
      this.o.world.addMoney(coins);
      damage = Math.min(this.hp, burst ? this.burstHitSize : damageFor(this.partner.level, multiplier));
      this.hp -= damage;
      growth = giveXp(this.o.world, this.partner.id, (fast ? 2 : 1) * spendBoost(this.o.world), this.o.monsters);
    }
    this.lastWasQuestion = true;
    const won = this.hp <= 0;
    if (won) {
      this.o.world.seen.add(this.o.wild.species);
      if (this.o.master) {
        this.phase = "won";
        this.end("won");
      } else {
        // the wild creature sits down, calm: a net is the next step, no friend joins by itself
        this.phase = "calm";
      }
    }
    // a burst ends on a wrong answer, after its last question, or when the fog is gone
    const burstOver = !!burst && (burst.broken || !burstLive(burst) || won);
    const snapshot = burst ? { medals: [...burst.medals], combo: comboOf(burst), over: burstOver } : null;
    if (burstOver) this.burst = null;
    this.last = { correct, damage, won, growth, coins, partnerBefore, calm: won && !this.o.master, burst: snapshot, meter: this.meter };
    this.o.field.battleResult({
      n: this.stats.questions,
      ok: correct,
      damage,
      hp: this.hp,
      max: this.maxHp,
      ms: session.elapsedMs,
      monster: this.o.wild.species,
      partner: partnerBefore,
    });
    this.o.onChange();
  }

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
        this.request("seal"),
        this.o.clock,
        (outcome) => this.sealed(eco, session, outcome.correct),
        this.o.warn,
      );
      if (session.question) return session;
    }
    return null;
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
    this.lastSeal = { left: this.sealLeft, correct, caught, toMeadow, full, coins };
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

  /** The child goes on their way: nothing is lost. */
  run(): void {
    if (this.phase !== "fighting" && this.phase !== "calm") return;
    const calm = this.phase === "calm";
    this.phase = "ran";
    this.end(calm ? "calm_left" : "ran");
  }

  private ended = false;

  private end(result: string): void {
    if (this.ended) return;
    this.ended = true;
    this.o.field.battleEnd({ result, questions: this.stats.questions, correct: this.stats.correct, ms: this.stats.ms });
  }
}
