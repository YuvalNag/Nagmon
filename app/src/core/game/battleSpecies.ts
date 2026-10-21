/**
 * What a species brings to a battle (docs/app/BATTLE_V3.md 5.7): its four
 * base numbers, its subject, the extra subject it is weak to, and its
 * temperament. The data (db/monsters.json fields `bp bw bg bs weak
 * temperament subject`, from the data branch) wins; where a species has
 * none, the first chapter's table below (the spec's own) fills in, and
 * then a plain 10 / 10 / 10 / 10, Playful, with no extra weakness.
 */
import type { SubjectMap } from "../learning/quiz_flow";
import type { BattleFields, MonsterInfo } from "./collection";
import { type Bases, DEFAULT_BASES, statsOf, type Stats } from "./battleNumbers";
import { isTemperament, type Temperament } from "./intents";

interface Row {
  subject: string;
  bases: [number, number, number, number];
  /** The data subject the species is weak to (the second of the spec's "weak to"). */
  weak: string;
  temperament: Temperament;
}

/** The 25 families of the first chapter (5.7), by the first form's slug. */
export const CHAPTER1: Readonly<Record<string, Row>> = {
  lunibble: { subject: "science", bases: [10, 9, 9, 11], weak: "math", temperament: "playful" },
  terrabub: { subject: "geometry", bases: [11, 8, 11, 8], weak: "science", temperament: "sleepy" },
  heliobud: { subject: "math", bases: [10, 11, 8, 10], weak: "science", temperament: "playful" },
  solwind: { subject: "science", bases: [9, 10, 8, 12], weak: "english", temperament: "playful" },
  sailbit: { subject: "english", bases: [9, 9, 9, 12], weak: "logic", temperament: "shy" },
  mercurip: { subject: "science", bases: [9, 9, 9, 13], weak: "hebrew", temperament: "playful" },
  venubud: { subject: "hebrew", bases: [11, 8, 10, 9], weak: "logic", temperament: "shy" },
  rustip: { subject: "logic", bases: [10, 11, 9, 9], weak: "hebrew", temperament: "grumpy" },
  roveroo: { subject: "logic", bases: [10, 9, 11, 10], weak: "geometry", temperament: "proud" },
  asterchip: { subject: "geometry", bases: [9, 10, 12, 7], weak: "english", temperament: "sleepy" },
  meteet: { subject: "science", bases: [8, 12, 8, 12], weak: "hebrew", temperament: "grumpy" },
  dustip: { subject: "english", bases: [10, 8, 9, 12], weak: "math", temperament: "shy" },
  jovibud: { subject: "science", bases: [12, 10, 10, 8], weak: "logic", temperament: "proud" },
  iobud: { subject: "math", bases: [10, 12, 8, 10], weak: "english", temperament: "grumpy" },
  europip: { subject: "english", bases: [11, 8, 11, 10], weak: "geometry", temperament: "shy" },
  ganybit: { subject: "geometry", bases: [12, 9, 12, 7], weak: "hebrew", temperament: "sleepy" },
  ringlet: { subject: "hebrew", bases: [11, 9, 11, 9], weak: "math", temperament: "proud" },
  titanip: { subject: "logic", bases: [11, 10, 10, 9], weak: "science", temperament: "sleepy" },
  gravip: { subject: "math", bases: [10, 10, 12, 8], weak: "logic", temperament: "proud" },
  tiltip: { subject: "geometry", bases: [11, 9, 11, 9], weak: "math", temperament: "playful" },
  nepbit: { subject: "science", bases: [10, 10, 10, 10], weak: "hebrew", temperament: "playful" },
  plutot: { subject: "hebrew", bases: [9, 9, 9, 13], weak: "geometry", temperament: "shy" },
  kuipip: { subject: "english", bases: [10, 10, 9, 11], weak: "hebrew", temperament: "playful" },
  combit: { subject: "logic", bases: [9, 11, 8, 12], weak: "english", temperament: "grumpy" },
  probip: { subject: "math", bases: [10, 10, 10, 10], weak: "geometry", temperament: "proud" },
};

export interface SpeciesBattle {
  bases: Bases;
  stage: string;
  subject: string;
  /** Subjects besides the wheel's that are a Sparkle against it. */
  weak: string[];
  temperament: Temperament;
}

function basesOf(f: BattleFields | undefined, row: Row | undefined): Bases {
  const r = row?.bases;
  return {
    bp: f?.bp ?? r?.[0] ?? DEFAULT_BASES.bp,
    bw: f?.bw ?? r?.[1] ?? DEFAULT_BASES.bw,
    bg: f?.bg ?? r?.[2] ?? DEFAULT_BASES.bg,
    bs: f?.bs ?? r?.[3] ?? DEFAULT_BASES.bs,
  };
}

/** A species' battle traits (an unknown species: plain ones). */
export function speciesBattle(info: MonsterInfo | undefined, slug: string, subjects: SubjectMap): SpeciesBattle {
  const row = CHAPTER1[info?.family ?? slug];
  const f = info?.battle;
  // the data's subject, else the subjects table's own entry for the species, else the first chapter's, else by element
  const subject = f?.subject ?? (Object.hasOwn(subjects.monsterToSubject, slug) ? subjects.monsterToSubject[slug]! : undefined) ?? row?.subject ?? subjects.subjectFor(info?.types ?? [], null, slug);
  const t = f?.temperament;
  return {
    bases: basesOf(f, row),
    stage: info?.stage ?? "basic",
    subject,
    weak: f?.weak ?? (row ? [row.weak] : []),
    temperament: isTemperament(t) ? t : (row?.temperament ?? "playful"),
  };
}

/** The stats of a creature of this species and level. */
export function creatureStats(sp: SpeciesBattle, level: number): Stats {
  return statsOf(sp.bases, level, sp.stage);
}
