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
import { QuizSession } from "../world/quiz";
import type { Creature, WorldState } from "../world/worldState";
import { addCreature, giveXp, type Growth, markSeen, partner as partnerOf } from "./collection";
import type { Wild } from "./encounters";
import type { FieldLog } from "./fieldLog";
import type { MonsterTable } from "./monsters";

export const MAX_CREATURES = 60;

/** The wild creature's health, from its level. */
export function hpFor(level: number): number {
  return 18 + 3 * level;
}

/** What a right answer takes: the partner's level and how well it was answered (1.5 right, 2 fast). */
export function damageFor(partnerLevel: number, multiplier: number): number {
  return Math.round((3 + partnerLevel) * multiplier);
}

export type BattlePhase = "fighting" | "won" | "ran";

export interface Turn {
  correct: boolean;
  damage: number;
  won: boolean;
  growth: Growth;
  /** The creature that joined the child, when this answer won. */
  caught: Creature | null;
}

export interface BattleOptions {
  engine: LearningEngine;
  world: WorldState;
  monsters: MonsterTable;
  subjects: SubjectMap;
  wild: Wild;
  clock: () => number;
  maxChoices: number | null;
  field: FieldLog;
  /** The creatures or the learner changed: save them. */
  onChange: () => void;
  warn?: (message: string) => void;
}

/** How many times a question is tried for before the battle ends in peace. */
const TRIES = 5;

export class Battle {
  readonly partner: Creature;
  readonly maxHp: number;
  hp: number;
  phase: BattlePhase = "fighting";
  last: Turn | null = null;
  readonly stats = { questions: 0, correct: 0, ms: 0 };
  private readonly subject: string;

  constructor(private readonly o: BattleOptions) {
    const p = partnerOf(o.world);
    if (!p) throw new Error("no partner to battle with");
    this.partner = p;
    this.maxHp = hpFor(o.wild.level);
    this.hp = this.maxHp;
    const info = o.monsters[o.wild.species];
    this.subject = o.subjects.subjectFor(info?.types ?? [], null, o.wild.species);
    markSeen(o.world, o.wild.species);
  }

  start(map: string): void {
    this.o.field.battleStart({ monster: this.o.wild.species, level: this.o.wild.level, map });
  }

  /** The next question; null when none can be made (the battle then ends in peace). */
  next(): QuizSession | null {
    for (let i = 0; i < TRIES; i++) {
      const session = new QuizSession(
        this.o.engine,
        { topic: this.subject, context: "battle", maxChoices: this.o.maxChoices },
        this.o.clock,
        (outcome) => this.answered(session, outcome.correct, outcome.power_multiplier, outcome.quality === "super"),
        this.o.warn,
      );
      if (session.question) return session;
    }
    return null;
  }

  private answered(session: QuizSession, correct: boolean, multiplier: number, fast: boolean): void {
    this.stats.questions++;
    this.stats.ms += session.elapsedMs;
    let damage = 0;
    let growth: Growth = { leveled: false, level: this.partner.level, evolvedTo: null };
    let caught: Creature | null = null;
    if (correct) {
      this.stats.correct++;
      damage = Math.min(this.hp, damageFor(this.partner.level, multiplier));
      this.hp -= damage;
      growth = giveXp(this.o.world, this.partner.id, fast ? 2 : 1, this.o.monsters);
    }
    const won = this.hp <= 0;
    if (won) {
      this.phase = "won";
      this.o.world.seen.add(this.o.wild.species);
      this.o.world.caught.add(this.o.wild.species);
      if (this.o.world.creatures.length < MAX_CREATURES) caught = addCreature(this.o.world, this.o.wild.species, this.o.wild.level);
      this.end("won");
    }
    this.last = { correct, damage, won, growth, caught };
    this.o.onChange();
  }

  /** The child goes on their way: nothing is lost. */
  run(): void {
    if (this.phase !== "fighting") return;
    this.phase = "ran";
    this.end("ran");
  }

  private ended = false;

  private end(result: string): void {
    if (this.ended) return;
    this.ended = true;
    this.o.field.battleEnd({ result, questions: this.stats.questions, correct: this.stats.correct, ms: this.stats.ms });
  }
}
