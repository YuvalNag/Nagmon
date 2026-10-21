/**
 * Shapes of the battle data in `public/game/` (docs/app/BATTLE_V3.md),
 * written by `tools/app/moves.py` from `mods/nagmon/moves/*.yaml` and
 * `mods/nagmon/battle/*.yaml`. Types only, plus {@link loadBattleData}, the
 * one way the engine reads all seven files.
 *
 *   moves.json            the 50 moves
 *   statuses.json         the 14 statuses and the stat-stage rules
 *   intents.json          the 9 enemy intents and 5 temperaments
 *   gifts.json            the 8 gifts
 *   species_battle.json   the 25 families and the 70 species
 *   battle_encounters.json wild tables, guardians, the master, Keepers
 *   battle_rules.json     the numbers of sections 2 to 8
 */
import type { SubjectId } from "./types";

export type FetchJson = (path: string) => Promise<unknown>;

/** The wheel's six subjects; a move may also be "any" (the Little Wiggle). */
export type MoveSubject = SubjectId | "any";
/** E easy, N normal, S stretch, U utility, C chain starter, K finisher, Q quick, F Finale, W fallback. */
export type MoveTier = "E" | "N" | "S" | "U" | "C" | "K" | "Q" | "F" | "W";
export type QuestionTier = "E" | "N" | "S" | "none";
export type LearnSource = "level" | "lesson_card" | "chest_card" | "shop_card";
export type StatName = "power" | "guard" | "speed";
export type Band = "A" | "B" | "C";
export type TemperamentId = "shy" | "playful" | "grumpy" | "sleepy" | "proud";
export type StatusId =
  | "drowsy"
  | "dizzy"
  | "slow"
  | "shield"
  | "regen"
  | "boost"
  | "weaken"
  | "focus"
  | "giggly"
  | "mark"
  | "sniffly"
  | "windup"
  | "calm"
  | "dozing";
export type IntentId =
  | "fog_puff"
  | "big_puff"
  | "thicken"
  | "giggle"
  | "drowsy_mist"
  | "dizzy_swirl"
  | "sticky_mud"
  | "cheer_up"
  | "silly_dance";

// ------------------------------------------------------------------ moves
/** What a move does besides its damage; `type` says which fields are there. */
export type MoveEffect =
  | { type: "status"; status: StatusId; chance: number; rounds?: number; actions?: number; boss_actions?: number; attacks?: number; target?: "self" | "enemy" }
  | { type: "weaken"; stat: StatName; stages: number; chance: number; rounds: number }
  | { type: "boost"; stats: StatName[]; stages: number; rounds: number }
  | { type: "shield"; share: number; rounds: number; target?: "self" }
  | { type: "heal"; share: number; target?: "self" }
  | { type: "regen"; share: number; rounds: number }
  | { type: "cleanse"; scope: "all" | "one" }
  | { type: "mirror"; soften: number; return: number; rounds: number }
  | { type: "mark"; subject: SubjectId; rounds: number }
  | { type: "finisher"; per_mark: number; same_subject: number; two_different: number; consumes: boolean }
  | { type: "reveal"; weak_subject: boolean; intents: number }
  | { type: "focus"; target?: "self" }
  | { type: "echo"; power_share: number; needs_last_damage_move: boolean }
  | { type: "swap_boosts"; copy_to_self: boolean }
  | { type: "ignore_shield" }
  | { type: "always_brilliant" }
  | { type: "chain_bonus"; steps: number[] };

export interface Move {
  id: string;
  /** 1 to 50, the number in the spec's table. */
  n: number;
  he: string;
  en: string;
  subject: MoveSubject;
  tier: MoveTier;
  /** The move's base number MP; null for a utility move. */
  power: number | null;
  /** 3 for a Finale. */
  hits: number;
  /** Uses per battle; null: never runs out, or paid by Spark. */
  charges: number | null;
  /** A Finale costs this many Spark stars. */
  spark_cost?: number;
  question: QuestionTier;
  /** +1 for Quick moves. */
  priority?: number;
  target: "enemy" | "self";
  /** What a RIGHT answer does besides damage. */
  effects: MoveEffect[];
  /** The weak version of a non-damage move on a wrong answer. */
  wrong?: MoveEffect[];
  /** What the last hit of a Finale adds. */
  last_hit?: MoveEffect[];
  unlock_level: number;
  learn_source: LearnSource[];
  animation: string;
  desc_he: string;
}
export interface MovesFile {
  version: number;
  moves: Move[];
}

// --------------------------------------------------------------- statuses
export interface Status {
  id: StatusId;
  n: number;
  he: string;
  en: string;
  kind: "major" | "minor" | "stat" | "meta";
  /** Statuses of one group replace each other. */
  group: string;
  /** After it lands on a boss: immune for this many rounds. */
  boss_immune_rounds?: number;
  icon: string;
  icon_variants?: string[];
  shape: string;
  color: string;
  hex: string;
  /** What it does on the enemy / on our creature (numbers by name, see statuses.yaml). */
  enemy: Record<string, unknown>;
  ours: Record<string, unknown>;
  cure: string[];
  desc_he: string;
}
export interface StatusesFile {
  version: number;
  stage_rules: { max_stage: number; up_step: number; down_formula: string; boost_rounds: number; weaken_rounds: number; stats: StatName[] };
  statuses: Status[];
}

// ---------------------------------------------------------------- intents
export interface Intent {
  id: IntentId;
  n: number;
  he: string;
  en: string;
  icon: string;
  kind: "hit" | "windup_hit" | "shield" | "fog_up" | "status_on_us" | "self_boost" | "breather";
  /** MP of a hit (wild); bosses use `boss_power` when given. */
  power?: number;
  boss_power?: number;
  windup?: boolean;
  wild_min_level?: number;
  status?: StatusId;
  /** Band A turns this intent into the named one (Drowsy Mist to Silly Dance). */
  band_a_replace?: IntentId;
  shield_share_of_max_fog?: number;
  fog_share?: number;
  every_rounds?: number;
  rounds?: number;
  stat?: StatName;
  stages?: number;
  spark_for_child?: number;
  desc_he: string;
}
export interface Temperament {
  id: TemperamentId;
  he: string;
  en: string;
  /** Percents; they add up to 100. */
  weights: Partial<Record<IntentId, number>>;
  big_puff_min_level?: number;
}
export interface IntentsFile {
  version: number;
  intents: Intent[];
  temperaments: Temperament[];
}

// ------------------------------------------------------------------ gifts
export type GiftId = "brave_heart" | "cheerful" | "steady" | "warm_fog" | "quick_learner" | "curious" | "sturdy_shell" | "sparkly";
export interface Gift {
  id: GiftId;
  he: string;
  en: string;
  effect: { kind: string } & Record<string, unknown>;
  default_for_bands?: Band[];
  desc_he: string;
}
export interface GiftsFile {
  version: number;
  gifts: Gift[];
}

// ---------------------------------------------------------------- species
/** The four base numbers: Pep, Power, Guard, Speed. */
export type Bases = [number, number, number, number];
export interface Signature {
  replace: string;
  with: string;
}
export interface Family {
  subject: SubjectId;
  /** [the subject the wheel makes it weak to, one more from data]. */
  weak: [SubjectId, SubjectId];
  temperament: TemperamentId;
  bases: Bases;
  catch_rate: number;
  gift: GiftId;
  signature: Signature | null;
}
export interface LearnRow {
  level: number;
  move: string;
  from: "home" | "signature" | "any";
}
export interface EvolveGates {
  to: string;
  level: number;
  know_how: number;
  stars: number;
  hearts: number;
  /** A tutor lesson (the lesson file's id) that must be done; Moon and Sun families, stage 0. */
  lesson: string | null;
  /** The zone the child must stand in; stage 1 to 2. */
  place: string | null;
}
export interface SpeciesBattle {
  family: string;
  /** 0 basic, 1 and 2 evolved. */
  stage: 0 | 1 | 2;
  zone: string;
  subject: SubjectId;
  weak: [SubjectId, SubjectId];
  temperament: TemperamentId;
  /** The family's basic bases; multiply by `stage_mult` before the level formula. */
  bases: Bases;
  stage_mult: number;
  catch_rate: number;
  gift: GiftId;
  signature: Signature | null;
  /** Every move by level, sorted; the Little Wiggle is at level 1. */
  learnset: LearnRow[];
  /** The Finale of the creature's subject (level 6, paid by Spark). */
  finale: string;
  /** The four equipped moves by level ("1", "3", ... "20"). */
  equipped: Record<string, string[]>;
  evolves_from: string | null;
  evolves_to: string | null;
  evolve: EvolveGates | null;
}
export interface SpeciesFile {
  version: number;
  families: Record<string, Family>;
  species: Record<string, SpeciesBattle>;
}

// ------------------------------------------------------------- encounters
export interface WildEntry {
  species: string;
  weight: number;
  levels: [number, number];
  subject: SubjectId;
}
export interface WildTable {
  levels: [number, number];
  wild: WildEntry[];
  /** Share of each subject by encounter weight, 0 to 1. */
  subject_share: Partial<Record<SubjectId, number>>;
}
export interface Phase {
  /** Intents in order; they repeat. Missing in the master's mixed phase. */
  cycle?: IntentId[];
  mixed?: boolean;
  /** A Big Puff at least this often (null: the cycle has its own). */
  windup_every?: number | null;
  double_windup?: boolean;
  final_windup?: { id: string; power: number; stagger_ends_fight: string };
}
export interface Boss {
  species: string;
  title_he: string;
  title_en: string;
  level_floor: number;
  subject: SubjectId;
  weak: [SubjectId, SubjectId];
  phases: [Phase, Phase, Phase];
  reward: Record<string, unknown>;
  kind: "guardian" | "master";
  stats_at_floor: [number, number, number, number];
  /** Fog at the floor level by band, Normal length. */
  fog_at_floor: Record<Band, number>;
}
export interface Guardian extends Boss {
  zone: string;
}
export interface BattleEncountersFile {
  version: number;
  /** Wild tables by zone id, and "route1". */
  zones: Record<string, WildTable>;
  guardians: Guardian[];
  master: Boss;
  keepers: { creatures: number; second_level_plus: number; picks_sparkle_move: boolean; swaps_once: boolean; befriend: boolean };
}

// ------------------------------------------------------------------ rules
export interface BandRules {
  grades: [number, number];
  fog: number;
  gentle: number;
  right_chance: { E: number; N: number; S: number };
  choices: number;
  wild_level_shift: number;
  question_cap: { wild: number; guardian: number };
  intent_bubble: string;
  weak_chip: string;
  brave_heart_default: boolean;
  befriend_pity: number;
  befriend_mercy_try: number;
  net_return: number;
}
export interface BattleRules {
  version: number;
  wheel: SubjectId[];
  wheel_mult: { sparkle: number; sturdy: number; neutral: number };
  home_bonus: number;
  mix_bonus: number;
  bonus_cap: number;
  stage_mult: { basic: number; stage1: number; stage2: number };
  stat_formulas: Record<string, Record<string, number>>;
  fog_kind: { wild: number; keeper: number; guardian: number; master: number };
  length_knob: { short: number; normal: number; long: number };
  strength_knob: { gentle: number; normal: number; lively: number };
  damage: {
    level_coeff: number;
    level_add: number;
    divisor: number;
    flat_add: number;
    roll: [number, number];
    wrong_quality: number;
    wrong_min_damage: number;
    brilliant: number;
    lucky_star_one_in: number;
    brilliant_streak: number;
    wiggle_power: number;
  };
  bands: Record<Band, BandRules>;
  tiers: Record<string, Record<string, unknown>>;
  spark: { max: number; per_right: number; per_right_stretch: number; per_hard_hit: number; hard_hit_share_of_pep: number };
  moves_known_max: number;
  moves_equipped: number;
  kindness: { wrong_in_a_row_for_help: number; run_is_free: boolean };
  enemy_level: Record<string, Record<string, unknown>>;
  growth: Record<string, unknown>;
  evolution: { level: [number, number]; know_how: [number, number]; stars: [number, number]; hearts: [number, number]; card_level_offset: number; rainbow_min_level: number } & Record<string, unknown>;
  befriend: Record<string, unknown>;
  /** The parent's rule: a dozing friend wakes only with shop medicine or the nurse. */
  dozing: { bench_nap: Record<string, number>; heal_only_with: string[]; wakes_at_battle_end: boolean };
}

// ----------------------------------------------------------------- loader
/** Everything the battle reads, with the lookups the engine needs. */
export interface BattleData {
  moves: Move[];
  movesById: Record<string, Move>;
  statuses: Status[];
  statusesById: Record<string, Status>;
  stageRules: StatusesFile["stage_rules"];
  intents: Intent[];
  intentsById: Record<string, Intent>;
  temperaments: Record<string, Temperament>;
  gifts: Record<string, Gift>;
  families: Record<string, Family>;
  species: Record<string, SpeciesBattle>;
  encounters: BattleEncountersFile;
  rules: BattleRules;
}

/** The files, in the order {@link loadBattleData} asks for them. */
export const BATTLE_FILES = [
  "moves.json",
  "statuses.json",
  "intents.json",
  "gifts.json",
  "species_battle.json",
  "battle_encounters.json",
  "battle_rules.json",
] as const;

/** What the data of today holds; a different count means the files are out of step. */
export const BATTLE_COUNTS = { moves: 50, statuses: 14, intents: 9, temperaments: 5, gifts: 8, families: 25, species: 70 } as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function list<T extends { id: string }>(file: string, doc: unknown, key: string, count: number): T[] {
  const rows = isObject(doc) ? doc[key] : undefined;
  if (!Array.isArray(rows) || rows.length !== count) throw new Error(`${file}: ${key} must be a list of ${count}`);
  return rows as T[];
}

function byId<T extends { id: string }>(rows: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const r of rows) out[r.id] = r;
  return out;
}

/**
 * Loads and checks the seven battle files. Throws a plain Error naming the
 * file when one is missing or has the wrong shape (the count of its rows, a
 * reference to a move or a status that is not there), so a bad build stops
 * the battle at the door and not in the middle of a child's fight.
 */
export async function loadBattleData(fetchJson: FetchJson): Promise<BattleData> {
  const [movesDoc, statusesDoc, intentsDoc, giftsDoc, speciesDoc, encDoc, rulesDoc] = await Promise.all(BATTLE_FILES.map((f) => fetchJson(f)));
  const moves = list<Move>("moves.json", movesDoc, "moves", BATTLE_COUNTS.moves);
  const statuses = list<Status>("statuses.json", statusesDoc, "statuses", BATTLE_COUNTS.statuses);
  const intents = list<Intent>("intents.json", intentsDoc, "intents", BATTLE_COUNTS.intents);
  const temperamentRows = isObject(intentsDoc) ? intentsDoc["temperaments"] : undefined;
  if (!Array.isArray(temperamentRows) || temperamentRows.length !== BATTLE_COUNTS.temperaments) throw new Error("intents.json: temperaments must be a list of 5");
  const gifts = list<Gift>("gifts.json", giftsDoc, "gifts", BATTLE_COUNTS.gifts);
  if (!isObject(speciesDoc) || !isObject(speciesDoc["species"]) || !isObject(speciesDoc["families"])) throw new Error("species_battle.json: needs families and species");
  const families = speciesDoc["families"] as Record<string, Family>;
  const species = speciesDoc["species"] as Record<string, SpeciesBattle>;
  if (Object.keys(families).length !== BATTLE_COUNTS.families) throw new Error("species_battle.json: families must hold 25");
  if (Object.keys(species).length !== BATTLE_COUNTS.species) throw new Error("species_battle.json: species must hold 70");
  if (!isObject(encDoc) || !isObject(encDoc["zones"]) || !Array.isArray(encDoc["guardians"]) || !isObject(encDoc["master"])) throw new Error("battle_encounters.json: needs zones, guardians and a master");
  if (!isObject(rulesDoc) || !Array.isArray(rulesDoc["wheel"]) || !isObject(rulesDoc["bands"])) throw new Error("battle_rules.json: needs a wheel and bands");

  const movesById = byId(moves);
  const statusesById = byId(statuses);
  const intentsById = byId(intents);
  const giftsById = byId(gifts);
  for (const [slug, s] of Object.entries(species)) {
    for (const row of s.learnset) if (!movesById[row.move]) throw new Error(`species_battle.json: ${slug} learns ${row.move}, which is not a move`);
    for (const slot of Object.values(s.equipped)) for (const id of slot) if (!movesById[id]) throw new Error(`species_battle.json: ${slug} equips ${id}, which is not a move`);
    if (!movesById[s.finale]) throw new Error(`species_battle.json: ${slug} has no Finale`);
    if (!giftsById[s.gift]) throw new Error(`species_battle.json: ${slug} has an unknown gift ${s.gift}`);
  }
  for (const m of moves) {
    for (const fx of [...m.effects, ...(m.wrong ?? []), ...(m.last_hit ?? [])]) {
      if (fx.type === "status" && !statusesById[fx.status]) throw new Error(`moves.json: ${m.id} names the unknown status ${fx.status}`);
    }
  }
  const temperaments = byId(temperamentRows as Temperament[]);
  for (const t of Object.values(temperaments)) for (const k of Object.keys(t.weights)) if (!intentsById[k]) throw new Error(`intents.json: ${t.id} weighs the unknown intent ${k}`);

  return {
    moves,
    movesById,
    statuses,
    statusesById,
    stageRules: (statusesDoc as StatusesFile).stage_rules,
    intents,
    intentsById,
    temperaments,
    gifts: giftsById,
    families,
    species,
    encounters: encDoc as unknown as BattleEncountersFile,
    rules: rulesDoc as unknown as BattleRules,
  };
}
