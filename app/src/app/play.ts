/**
 * A child playing on the map: their learning engine, their world (coins
 * and the scripts' variables) and the game's texts, loaded when the map
 * opens and saved after every change (the old NagmonRuntime,
 * nagmon/runtime.py: `persist()` after every answer).
 *
 * Loaded on demand, with the map: the learning core and its 1.3 MB of
 * content are not part of who-plays.
 */
import { ageFromProfile } from "../core/family/age";
import { applyStartGrades } from "../core/family/learningSettings";
import type { Profile, ProfileStore } from "../core/family/profiles";
import { type ContentLibrary, LearningEngine, LearnerState, loadContent, PyRandom } from "../core/learning";
import { SubjectMap } from "../core/learning/quiz_flow";
import { loadTrips, type Trip } from "../core/game/trips";
import { FieldLog } from "../core/game/fieldLog";
import { type Economy, economy } from "../core/game/items";
import { type Facts, facts } from "../core/game/facts";
import { type Hatched, warmEggs } from "../core/game/eggs";
import { type Loot, loot } from "../core/game/loot";
import { type EncounterTables, encounterTables } from "../core/game/encounters";
import { type MonsterTable, monsterTable } from "../core/game/monsters";
import type { QuizSession } from "../core/world/quiz";
import { fillText } from "../core/world/dialog";
import { localDay, WorldState } from "../core/world/worldState";
import type { JsonObject } from "../platform/storage";

/** Fetches a JSON file of the game's data, by its path under `game/`. */
export type FetchJson = (path: string) => Promise<unknown>;

export const fetchGameJson: FetchJson = async (path) => {
  const r = await fetch(`game/${path}`);
  if (!r.ok) throw new Error(`game/${path}: ${r.status}`);
  return r.json();
};

/** The game's data a quiz needs: the learning content, the subjects and the texts. */
export interface GameData {
  content: ContentLibrary;
  subjects: SubjectMap;
  texts: Readonly<Record<string, string>>;
  monsters: MonsterTable;
  encounters: EncounterTables;
  economy: Economy;
  loot: Loot;
  facts: Facts;
}

let cached: { fetch: FetchJson; data: Promise<GameData> } | null = null;

/** The game's data, read once per run of the app (a failed read is tried again next time). */
export function loadGameData(fetchJson: FetchJson = fetchGameJson): Promise<GameData> {
  if (cached?.fetch === fetchJson) return cached.data;
  const data = (async () => {
    const [index, texts, monsters, encounters, eco, lootDoc, factsDoc] = await Promise.all([
      fetchJson("content/index.json") as Promise<{ files: { file: string }[] }>,
      fetchJson("i18n/he.json") as Promise<Record<string, string>>,
      fetchJson("db/monsters.json"),
      // a build with no encounter tables is a game with no wild creatures, not a broken one
      Promise.resolve(fetchJson("db/encounters.json")).catch(() => ({})),
      // no economy table is a game with an empty Bag, not a broken one
      Promise.resolve(fetchJson("economy.json")).catch(() => ({})),
      // and none for the daily gift and the chests is a world that gives nothing
      Promise.resolve(fetchJson("loot.json")).catch(() => ({})),
      // and none for the signs is signs with nothing to say
      Promise.resolve(fetchJson("facts.json")).catch(() => ({})),
    ]);
    const files = Object.fromEntries(
      await Promise.all(index.files.map(async (f) => [f.file, await fetchJson(`content/${f.file}`)] as const)),
    );
    return { content: loadContent(files), subjects: SubjectMap.fromDoc(files["subjects.json"]), texts, monsters: monsterTable(monsters), encounters: encounterTables(encounters), economy: economy(eco), loot: loot(lootDoc), facts: facts(factsDoc) };
  })();
  cached = { fetch: fetchJson, data };
  data.catch(() => {
    if (cached?.data === data) cached = null;
  });
  return data;
}

/** The learning content, read once per run of the app. */
export async function loadLibrary(fetchJson: FetchJson = fetchGameJson): Promise<ContentLibrary> {
  return (await loadGameData(fetchJson)).content;
}

/** The learner as the engine needs it: this child's grade, age and learning settings. */
export function learnerFor(profile: Profile, saved: Record<string, unknown>, now: Date): LearnerState {
  const learner = LearnerState.fromDict(saved);
  learner.grade = profile.grade;
  learner.age = ageFromProfile(profile, now);
  const learning = profile.settings["learning"];
  if (learning && typeof learning === "object" && !Array.isArray(learning)) Object.assign(learner.settings, learning);
  // the parent's start grade for a subject is where it begins
  applyStartGrades(learner, profile.settings);
  return learner;
}

/**
 * At most this many choices: only the youngest are held to it; from
 * grade 2 the engine may also ask for a typed answer (the old QuizState).
 */
export function maxChoicesFor(profile: Profile): number | null {
  if (profile.grade >= 2) return null;
  const learning = profile.settings["learning"] as Record<string, unknown> | undefined;
  const n = learning?.["max_choices"];
  return typeof n === "number" && n > 0 ? n : null;
}

export interface PlayOptions {
  profiles: ProfileStore;
  profile: Profile;
  fetchJson?: FetchJson;
  now?: () => Date;
  /** Seeds the question picker (the browser tests' hook); random otherwise. */
  seed?: number | null;
  log?: { info(m: string): void; warning(m: string): void; error(m: string, e?: unknown): void };
}

export class Play {
  readonly maxChoices: number | null;
  /** The field log: one line for each thing a parent reads back. */
  readonly field: FieldLog;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    readonly profile: Profile,
    readonly engine: LearningEngine,
    readonly world: WorldState,
    readonly texts: Readonly<Record<string, string>>,
    readonly subjects: SubjectMap,
    readonly monsters: MonsterTable,
    readonly encounters: EncounterTables,
    readonly economy: Economy,
    /** The trips in the build: none until a trip file is there. */
    readonly trips: Trip[],
    private readonly profiles: ProfileStore,
    private readonly log: NonNullable<PlayOptions["log"]>,
    private readonly now: () => Date,
    /** The daily gift and the chests (game/loot.json). */
    readonly loot: Loot = { dailyGift: [], chests: {} },
    /** The facts of signs (game/facts.json). */
    readonly facts: Facts = {},
  ) {
    this.maxChoices = maxChoicesFor(profile);
    this.field = new FieldLog(log);
  }

  /** Friends that hatched from an egg and have not been told about yet (the map shows them when it is free). */
  readonly hatched: Hatched[] = [];

  /** The creatures an egg of a zone can hatch into: the zone's encounter table, creatures with a picture. */
  pools = (table: string) =>
    (this.encounters[table] ?? []).filter((e) => this.monsters[e.monster]?.hasSprite).map((e) => ({ species: e.monster, level: e.levels[0] }));

  /** Logs an answered question (subject, skill, level, right or not, ms). */
  logAnswer(session: QuizSession, context: string): void {
    const q = session.question;
    if (!q || !session.outcome) return;
    // a right answer anywhere warms the eggs; what hatches waits to be told
    if (session.outcome.correct && this.world.eggs.length) {
      const out = warmEggs(this.world, this.pools);
      for (const h of out) this.field.note("hatch", { egg: h.eggId, species: h.species, level: h.level });
      this.hatched.push(...out);
      void this.saveWorld();
    }
    const skill = this.engine.content.get(q.skill_id);
    this.field.question({
      subject: q.subject,
      skill: q.skill_id,
      grade: skill ? skill.grade : this.profile.grade,
      theta: this.engine.learner.skills.get(q.skill_id)?.theta ?? 0,
      correct: session.outcome.correct,
      ms: session.elapsedMs,
      context,
    });
  }

  /** A warning in the log. */
  warn(message: string): void {
    this.log.warning(message);
  }

  /** The phone's day for the daily prizes. */
  today(): string {
    return localDay(this.now());
  }

  /** A catalogue text with the child's name put in (a missing one shows its id and is logged). */
  text(msgid: string): string {
    const t = this.texts[msgid];
    if (t === undefined) {
      this.log.warning(`No text for ${msgid}`);
      return msgid;
    }
    return fillText(t, { name: this.profile.name });
  }

  /** Writes the learner now (after every answer). Never rejects: a failed save is logged. */
  saveLearner(): Promise<void> {
    const data = this.engine.save() as unknown as JsonObject;
    return this.queue("the learner", () => this.profiles.saveLearnerDict(this.profile.id, data));
  }

  /** Writes the coins and the scripts' variables now. Never rejects. */
  saveWorld(): Promise<void> {
    const data = this.world.toDict() as unknown as JsonObject;
    return this.queue("the world", () => this.profiles.saveWorldDict(this.profile.id, data));
  }

  /** Resolves when every save asked for so far is done. */
  idle(): Promise<void> {
    return this.saving;
  }

  /**
   * Starts the save at once: the profile store runs its saves in the
   * order asked, and the background flush (storage.pendingWrites) sees
   * every one of them from this moment.
   */
  private queue(what: string, task: () => Promise<void>): Promise<void> {
    const done = task().catch((e: unknown) => {
      this.log.error(`Could not save ${what}`, e);
    });
    this.saving = Promise.all([this.saving, done]).then(() => undefined);
    return done;
  }
}

/** Opens a child's play: the content (once per run), their learner, their world and the texts. */
export async function openPlay(opts: PlayOptions): Promise<Play> {
  const fetchJson = opts.fetchJson ?? fetchGameJson;
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? { info: () => {}, warning: () => {}, error: () => {} };
  const { profile, profiles } = opts;
  const [{ content, subjects, texts, monsters, encounters, economy: eco, loot: lootTable, facts: factsTable }, learnerDict, worldDict] = await Promise.all([
    loadGameData(fetchJson),
    profiles.loadLearnerDict(profile.id),
    profiles.loadWorldDict(profile.id),
  ]);
  const learner = learnerFor(profile, learnerDict, now());
  const seed = opts.seed;
  const engine = new LearningEngine(content, learner, seed === null || seed === undefined ? {} : { rng: new PyRandom(seed) });
  const world = WorldState.fromDict(worldDict);
  // a trip file that is not there, or a map not built, is not an error: the zone is "coming soon"
  const trips = await loadTrips(fetchJson, (map) => Promise.resolve(fetchJson(`maps/${map}.json`)).then(() => true, () => false)).catch(() => []);
  log.info(`Play opened: grade ${profile.grade}, ${learner.answers_total} answers so far, ${world.money} coins`);
  return new Play(profile, engine, world, texts, subjects, monsters, encounters, eco, trips, profiles, log, now, lootTable, factsTable);
}
