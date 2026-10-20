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
import type { Profile, ProfileStore } from "../core/family/profiles";
import { type ContentLibrary, LearningEngine, LearnerState, loadContent, PyRandom } from "../core/learning";
import { SubjectMap } from "../core/learning/quiz_flow";
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

/**
 * A test hook, as `nagmon.map.adaptiveResolution`: a number here seeds
 * the question picker, so a browser test gets the same questions each
 * run. Never set on a phone.
 */
export const SEED_KEY = "nagmon.quiz.seed";

let library: { fetch: FetchJson; content: Promise<ContentLibrary> } | null = null;

/** The learning content, read once per run of the app. */
export function loadLibrary(fetchJson: FetchJson = fetchGameJson): Promise<ContentLibrary> {
  if (library?.fetch === fetchJson) return library.content;
  const content = (async () => {
    const index = (await fetchJson("content/index.json")) as { files: { file: string }[] };
    const files = await Promise.all(index.files.map(async (f) => [f.file, await fetchJson(`content/${f.file}`)] as const));
    return loadContent(Object.fromEntries(files));
  })();
  library = { fetch: fetchJson, content };
  // a failed load is tried again next time
  content.catch(() => {
    if (library?.content === content) library = null;
  });
  return content;
}

/** The learner as the engine needs it: this child's grade, age and learning settings. */
export function learnerFor(profile: Profile, saved: Record<string, unknown>, now: Date): LearnerState {
  const learner = LearnerState.fromDict(saved);
  learner.grade = profile.grade;
  learner.age = ageFromProfile(profile, now);
  const learning = profile.settings["learning"];
  if (learning && typeof learning === "object" && !Array.isArray(learning)) Object.assign(learner.settings, learning);
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
  private saving: Promise<void> = Promise.resolve();

  constructor(
    readonly profile: Profile,
    readonly engine: LearningEngine,
    readonly world: WorldState,
    readonly texts: Readonly<Record<string, string>>,
    readonly subjects: SubjectMap,
    private readonly profiles: ProfileStore,
    private readonly log: NonNullable<PlayOptions["log"]>,
    private readonly now: () => Date,
  ) {
    this.maxChoices = maxChoicesFor(profile);
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
  const [content, learnerDict, worldDict, texts, subjects] = await Promise.all([
    loadLibrary(fetchJson),
    profiles.loadLearnerDict(profile.id),
    profiles.loadWorldDict(profile.id),
    fetchJson("i18n/he.json") as Promise<Record<string, string>>,
    fetchJson("content/subjects.json"),
  ]);
  const learner = learnerFor(profile, learnerDict, now());
  const seed = opts.seed;
  const engine = new LearningEngine(content, learner, seed === null || seed === undefined ? {} : { rng: new PyRandom(seed) });
  const world = WorldState.fromDict(worldDict);
  log.info(`Play opened: grade ${profile.grade}, ${learner.answers_total} answers so far, ${world.money} coins`);
  return new Play(profile, engine, world, texts, SubjectMap.fromDoc(subjects), profiles, log, now);
}
