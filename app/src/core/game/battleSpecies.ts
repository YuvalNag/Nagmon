/**
 * What a species brings to a battle (docs/app/BATTLE_V3.md 5.7), from the
 * data (game/species_battle.json): its four base numbers and stage
 * multiplier, its subject, the extra subject it is weak to, its temperament.
 * An unknown species is plain: 10 / 10 / 10 / 10, Playful, no extra weakness.
 */
import type { BattleData } from "../data/battleTypes";
import { type Bases, DEFAULT_BASES, type Stats } from "./battleNumbers";
import { isTemperament, type Temperament } from "./intents";

export interface SpeciesTraits {
  bases: Bases;
  /** The stage multiplier of the data (1.0, 1.2, 1.45). */
  mult: number;
  subject: string;
  /** Subjects besides the wheel's that are a Sparkle against it. */
  weak: string[];
  temperament: Temperament;
  /** The species' Gift (3.5), a passive trait. */
  gift: string;
  /** Evolution stage, 0 basic. */
  stage: number;
}

export function speciesBattle(data: BattleData, slug: string, fallbackSubject = "math"): SpeciesTraits {
  const s = data.species[slug];
  if (!s) return { bases: DEFAULT_BASES, mult: 1, subject: fallbackSubject, weak: [], temperament: "playful", gift: "none", stage: 0 };
  const [bp, bw, bg, bs] = s.bases;
  return {
    bases: { bp, bw, bg, bs },
    mult: s.stage_mult,
    subject: s.subject,
    // the data's weak pair is [the wheel's subject, one more]: only the extra is added to the wheel
    weak: s.weak.slice(1),
    temperament: isTemperament(s.temperament) ? s.temperament : "playful",
    gift: s.gift,
    stage: s.stage,
  };
}

/** Stats of a creature of this species and level: the stage multiplier is applied to the bases before the level formula. */
export function creatureStats(sp: SpeciesTraits, level: number): Stats {
  const floor = (x: number) => Math.floor(x + 1e-9);
  return {
    pep: floor((sp.bases.bp * sp.mult * (level + 10)) / 4),
    power: floor((sp.bases.bw * sp.mult * (level + 8)) / 4),
    guard: floor((sp.bases.bg * sp.mult * (level + 8)) / 4),
    speed: floor((sp.bases.bs * sp.mult * (level + 8)) / 4),
  };
}
