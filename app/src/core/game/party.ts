/**
 * The party and what a friend shows (docs/app/FEATURES.md 4.6 and 4.7):
 * the first four creatures go along, the rest wait in the Meadow; the
 * first of the party is the partner that answers in battle.
 */
import type { SubjectMap } from "../learning/quiz_flow";
import type { Creature, WorldState } from "../world/worldState";
import { PARTY_SIZE } from "./battle";
import { MAX_LEVEL, needFor } from "./collection";
import type { MonsterTable } from "./monsters";

export const partyOf = (world: WorldState): Creature[] => world.creatures.slice(0, PARTY_SIZE);

export const meadowCount = (world: WorldState): number => Math.max(0, world.creatures.length - PARTY_SIZE);

/** The friend of the party becomes the partner (moves to the front). False when it already is, is not in the party, or is unknown. */
export function setPartner(world: WorldState, id: string): boolean {
  const at = world.creatures.findIndex((c) => c.id === id);
  if (at <= 0 || at >= PARTY_SIZE) return false;
  const [c] = world.creatures.splice(at, 1);
  world.creatures.unshift(c!);
  return true;
}

/** One to five paws: the only strength a child sees. */
export function powerPaws(level: number): number {
  return Math.max(1, Math.min(5, Math.ceil(level / 10)));
}

export interface Details {
  /** The child's own name, or null. */
  name: string | null;
  species: string;
  level: number;
  xp: number;
  /** Growth points for the next level (0 at the top). */
  need: number;
  /** What it is good at: a subject id. */
  subject: string;
  paws: number;
  hearts: number;
}

export function details(c: Creature, monsters: MonsterTable, subjects: SubjectMap): Details {
  return {
    name: c.name ?? null,
    species: c.species,
    level: c.level,
    xp: c.xp,
    need: c.level >= MAX_LEVEL ? 0 : needFor(c.level),
    subject: subjects.subjectFor(monsters[c.species]?.types ?? [], null, c.species),
    paws: powerPaws(c.level),
    hearts: c.hearts ?? 0,
  };
}
