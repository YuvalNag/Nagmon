/**
 * Shapes of the build outputs in `public/game/` (written by
 * `tools/app/build_data.py`, docs/app/SDD.md §2). The content keeps the
 * structure of its YAML source (docs/kids/SDD_CONTENT.md), the maps are
 * Tiled JSON, the database keeps Tuxemon's record fields.
 *
 * Only the fields the app reads are typed strictly; records keep the rest
 * of their source fields as `unknown`.
 */

// ------------------------------------------------------------ content
/** content/subjects.json */
export interface SubjectsFile {
  subjects: Record<SubjectId, Subject>;
}
export type SubjectId =
  | "math"
  | "geometry"
  | "science"
  | "english"
  | "logic"
  | "hebrew";
export interface Subject {
  title_he: string;
  title_en: string;
  /** "#rrggbb" */
  color: string;
  /** Monster types (element slugs) that practise this subject. */
  elements: string[];
  /** Monsters that practise this subject whatever their type. */
  monsters?: string[];
}

/** content/skills/<subject>.json */
export interface SkillsFile {
  subject: SubjectId;
  skills: Skill[];
}
export interface Skill {
  id: string;
  /** 0 = kindergarten ... 9 */
  grade: number;
  title_he: string;
  title_en: string;
  prereq: string[];
  /** A procedural generator ("arithmetic.add"), "bank" or "english.vocab". */
  generator: string;
  params: Record<string, unknown>;
  mastery?: { min_attempts?: number; threshold?: number };
  srs?: boolean;
}

export type QuestionKind = "choice" | "true_false" | "order";
export interface BankChoice {
  he?: string;
  en?: string;
  /** Twemoji code, see emoji/index.json */
  emoji?: string;
}
/** One question of a bank file (science, hebrew, english phonics/sentences). */
export interface BankItem {
  id: string;
  skill: string;
  kind: QuestionKind;
  grade: number;
  difficulty: number;
  prompt_he: string;
  prompt_en: string;
  choices?: BankChoice[];
  /** choice: index; true_false: boolean; order: indices in order. */
  answer: number | boolean | number[];
  explanation_he: string;
  explanation_en?: string;
  tags: string[];
  /** English text the question reads aloud. */
  speak_en?: string;
  emoji?: string;
}
/** content/science/*.json, content/hebrew/*.json, phonics, sentences */
export interface BankFile {
  skill?: string;
  items: BankItem[];
  /** science/monster_facts.json only */
  elements?: Record<string, MonsterFacts>;
}
export interface MonsterFacts {
  title_he: string;
  title_en: string;
  facts: { id: string; he: string; en: string }[];
}

/** content/english/words.json */
export type WordsFile = Word[];
export interface Word {
  word: string;
  he: string;
  pos: string;
  topic: string;
  level: "preA1" | "A1" | "A2" | "B1";
  grade: number;
  emoji: string | null;
  example_en: string;
  example_he: string;
}

/** content/english/reading.json */
export type ReadingFile = ReadingPassage[];
export interface ReadingPassage {
  id: string;
  grade: number;
  level: string;
  skill: string;
  tags: string[];
  title: string;
  text_en: string;
  text_he: string;
  questions: (Omit<BankItem, "skill" | "grade" | "difficulty" | "tags"> & {
    answer: number | boolean;
  })[];
}

/** content/owl_faq.json */
export interface OwlFaqFile {
  schema_version: number;
  fallback_he: string;
  sleepy_he: string;
  items: {
    id: string;
    q_he: string;
    /** A trailing "*" means "starts with". */
    keywords: string[];
    a_he: string;
    min_age: number;
    topic: string;
  }[];
}

/** content/index.json */
export interface ContentIndex {
  files: { file: string; source: string }[];
  counts: { skills: number; bank_items: number; words: number };
}

// --------------------------------------------------------------- i18n
/** i18n/he.json, i18n/en.json: msgid -> text ("\n" opens a dialog page). */
export type Catalogue = Record<string, string>;

// --------------------------------------------------------------- maps
export interface TiledProperty<T = unknown> {
  name: string;
  type: "string" | "int" | "float" | "bool" | "class";
  propertytype?: string;
  value: T;
}
export interface TiledTileLayer {
  id: number;
  name: string;
  type: "tilelayer";
  width: number;
  height: number;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  /** gid = 1 + atlas index (0 = empty), Tiled flip flags in the top bits. */
  data: number[];
}
export interface TiledObject {
  id: number;
  name: string;
  type: "event";
  /** Pixels of the map's 64 px tiles. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  properties: TiledProperty[];
}
export interface TiledObjectLayer {
  id: number;
  /** "events" (live) or "blocked_exits" (exits out of the world, walled). */
  name: "events" | "blocked_exits";
  type: "objectgroup";
  draworder: "index";
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  objects: TiledObject[];
}
export interface TiledTileset {
  firstgid: number;
  name: string;
  /** Relative to the map file: "../atlas/<map>.png" */
  image: string;
  imagewidth: number;
  imageheight: number;
  tilewidth: number;
  tileheight: number;
  margin: number;
  spacing: number;
  columns: number;
  tilecount: number;
  tiles?: { id: number; animation: { tileid: number; duration: number }[] }[];
}
/** maps/<name>.json */
export interface TiledMap {
  type: "map";
  version: string;
  orientation: "orthogonal";
  renderorder: "right-down";
  infinite: false;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  nextlayerid: number;
  nextobjectid: number;
  /**
   * Tuxemon's own (edges, map_type, slug, inside), plus nagmon_source,
   * nagmon_script, source_tile_size, collision (NagmonCollision) and
   * surface (NagmonSurface).
   */
  properties: TiledProperty[];
  layers: (TiledTileLayer | TiledObjectLayer)[];
  tilesets: [TiledTileset];
}

export type Direction = "up" | "down" | "left" | "right";
/** The "script" property of an event object. */
export interface NagmonEvent {
  kind: "event" | "init";
  source: "tmx" | "nagmon";
  priority: number;
  timeout: number | null;
  delay: number | null;
  /** All must hold. "not" negates. Conditions have no side effects. */
  conditions: { operator: "is" | "not"; type: EventCondition; args: string[] }[];
  /** Run in order, after the behaviours' own actions. */
  actions: { type: EventAction; args: string[] }[];
  /** "talk <npc>": facing the NPC + interact; the NPC turns to the player. */
  behaviors: { type: EventBehavior; args: string[] }[];
}
export interface CollisionRegion {
  enter_from: Direction[];
  exit_from: Direction[];
  endure: Direction[];
  key: string | null;
  hop: boolean;
  speed_modifier: number | null;
  push: { direction: Direction | null; strength: number } | null;
}
/** The "collision" property of a map. */
export interface NagmonCollision {
  /** rows[y][x]: "." free, "#" wall, "r" region (see regions["x,y"]). */
  rows: string[];
  regions: Record<string, CollisionRegion>;
  /** [x, y, direction]: the step from (x, y) that way is blocked. */
  lines: [number, number, Direction][];
}
/** The "surface" property: "x,y" -> {surfable: 1, ...} */
export type NagmonSurface = Record<string, Record<string, number>>;

/** atlas/<name>.json: where each source tile went. */
export interface AtlasFile {
  image: string;
  imagewidth: number;
  imageheight: number;
  tilewidth: number;
  tileheight: number;
  margin: number;
  spacing: number;
  columns: number;
  tilecount: number;
  frames: { index: number; tileset: string; tile: number; x: number; y: number }[];
}

/** Every action the converted map scripts use. */
export const EVENT_ACTIONS = [
  "add_item",
  "add_monster",
  "ask_quiz",
  "char_face",
  "char_talk",
  "choice_monster",
  "clear_variable",
  "create_npc",
  "modify_money",
  "nagmon_apply_profile",
  "nagmon_daily_count",
  "play_map_animation",
  "play_music",
  "random_encounter",
  "remove_npc",
  "set_battle",
  "set_environment",
  "set_monster_health",
  "set_monster_status",
  "set_teleport_faint",
  "set_template",
  "set_variable",
  "start_battle",
  "transition_teleport",
  "translated_dialog",
  "translated_dialog_choice",
  "variable_math",
] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];

/** Every condition the converted map scripts use. */
export const EVENT_CONDITIONS = [
  "battle_outcome",
  "char_at",
  "char_defeated",
  "char_exists",
  "char_facing",
  "char_moved",
  "environment_is",
  "music_playing",
  "nagmon_daily_below",
  "one_of",
  "party_size",
  "profile_grade_at_least",
  "time_is",
  "variable_is",
  "variable_set",
] as const;
export type EventCondition = (typeof EVENT_CONDITIONS)[number];

export const EVENT_BEHAVIORS = ["talk"] as const;
export type EventBehavior = (typeof EVENT_BEHAVIORS)[number];

/** Actions whose first argument (":"-separated for choices) is a msgid. */
export const MSGID_ACTIONS = ["translated_dialog", "translated_dialog_choice"] as const;

// ----------------------------------------------------------------- db
interface DbRecord {
  slug: string;
  /** Source files, relative to the repo. */
  _source: string[];
  [field: string]: unknown;
}
export interface MonsterSprites {
  /** Relative to public/game. */
  sheet: string;
  /** The sheet is `scale` x the 128x88 layout. */
  scale: number;
  front: [number, number, number, number];
  back: [number, number, number, number];
  menu1: [number, number, number, number];
  menu2: [number, number, number, number];
}
/** db/monsters.json: slug -> record (msgids: slug, slug_description, cat_<species>) */
export interface Monster extends DbRecord {
  species: string;
  types: string[];
  txmn_id: number;
  catch_rate: number;
  moveset: { level_learned: number; technique: string; learning_method?: string }[];
  evolutions?: { at_level?: number; monster_slug: string }[];
  sounds?: Record<string, { sfx: string; volume: number } | null>;
  sprites: MonsterSprites | null;
}
/** db/techniques.json */
export interface Technique extends DbRecord {
  types: string[];
  power: number;
  accuracy: number;
  range: string;
  effects: { type: string; parameters?: unknown[] }[];
  visuals?: { animation: string | null; flip_axes: string; loop: number };
  sound?: { sfx: string | null; volume: number };
}
/** db/items.json */
export interface Item extends DbRecord {
  category: string;
  /** Relative to public/game. */
  sprite: string | null;
}
/** db/npcs.json */
export interface Npc extends DbRecord {
  template: {
    sprite_name: string;
    combat_sheet: string;
    slug: string;
    is_static_prop?: boolean;
  };
  speech: { profile: Record<string, Record<string, string | null>> };
  sprites: { map?: string | null; portrait?: string | null };
}
/** db/avatars.json (keys are stored in profiles: never rename) */
export interface Avatar {
  key: string;
  sprite: string;
  combat_sheet: string;
  gender: "male" | "female";
  label_he: string;
  fallback: boolean;
  map: string | null;
  portrait: string | null;
}
/** db/encounters.json */
export interface Encounter extends DbRecord {
  monsters: {
    monster: string;
    encounter_rate: number;
    level_range: [number, number];
    exp_req_mod?: number;
    held_items?: unknown[];
    variables?: { key: string; value: string }[];
  }[];
}
/** db/elements.json */
export interface Element extends DbRecord {
  icon: string | null;
  types: { against: string; multiplier: number }[];
}
/** db/environments.json */
export interface Environment extends DbRecord {
  battle_graphics: Record<string, unknown>;
  battle_music: Record<string, { music: string }>;
}
/** db/animations.json */
export interface Animation extends DbRecord {
  file: string;
  frame_x: number;
  frame_y: number;
  duration?: number;
  sheet: string | null;
}
/** db/music.json, db/sounds.json: slug -> file (relative to public/game) */
export type AudioIndex = Record<string, string>;

// ------------------------------------------------------------ credits
export interface CreditEntry {
  section: string;
  title: string;
  authors: string;
  licence: string;
  licences: string[];
  text: string;
}
/** credits.json */
export interface CreditsFile {
  schema_version: number;
  code: { licence: string; file: string; note: string };
  font: CreditEntry;
  entries: Record<string, CreditEntry>;
  assets: {
    path: string;
    kind: string;
    sources: string[];
    /** Entry id(s) in `entries`, or null (owner art, or not listed). */
    credit: string | string[] | null;
    author: string;
    licence: string;
    note: string;
    /** false: not found in ATTRIBUTIONS.md; to be credited by hand. */
    matched: boolean;
  }[];
}

/** emoji/index.json */
export interface EmojiIndex {
  /** Code as written in content/generators -> file stem. */
  codes: Record<string, string>;
  files: string[];
}
