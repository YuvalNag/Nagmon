/**
 * Child profiles: one card per child on the "who is playing?" screen
 * (port of nagmon/family/profiles.py).
 *
 * Layout under the data root (INVENTORY §7.1):
 *
 *     profiles/<id>/profile.json
 *     profiles/<id>/learning.json   (opaque dict; the learner lives elsewhere)
 *     profiles/<id>/saves/
 *     trash/<id>-<stamp>/           (deleted profiles, recoverable)
 *
 * The JSON keys are the old snake_case ones, so the old files load as
 * they are; the TypeScript fields are camelCase.
 */
import {
  type FileStore,
  type JsonObject,
  asBool,
  asFloat,
  asInt,
  asStr,
  isJsonObject,
  joinPath,
  readJson,
  writeJson,
} from "../../platform/storage";

export const SCHEMA_VERSION = 2;
export const MAX_PROFILES = 8;
export const MAX_NAME_LEN = 16;
/** The name a profile gets when its file cannot be read at all. */
export const RECOVERED_NAME = "שחקן";

const LETTER = "A-Za-zא-ת";
// A letter first; then letters, an apostrophe or geresh right after a
// letter, or a single space or hyphen between two letters.
const NAME_RE = new RegExp(`^[${LETTER}](?:[${LETTER}]|(?<=[${LETTER}])['׳]|[ \\-](?=[${LETTER}]))*$`);
const ID_RE = /^p[0-9a-f]{5}$/;

/** Invalid profile data. */
export class ProfileError extends Error {
  override name = "ProfileError";
}

/** Too many profiles. */
export class ProfileLimitError extends ProfileError {
  override name = "ProfileLimitError";
}

/** No profile (or trash entry) with this id. */
export class ProfileNotFoundError extends Error {
  override name = "ProfileNotFoundError";
}

/** Avatars a child may pick: a set of names, or a test function. */
export type AvatarAllowList = ReadonlySet<string> | readonly string[] | ((avatar: string) => boolean);

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  birthYear: number | null;
  /** 0 is kindergarten, up to 9. */
  grade: number;
  /** The language ladder, 0 (Hebrew only) to 5 (English only). */
  languageLevel: number;
  languageLocked: boolean;
  interests: string[];
  settings: JsonObject;
  /** Seconds since the epoch, as in the old files. */
  createdAt: number;
  /** Position on the "who plays" screen; -1 until the store fixes it. */
  order: number;
  /** Keys this version does not know; written back unchanged. */
  extra: JsonObject;
}

/** What a new profile may set; the store fills in the rest. */
export interface NewProfile {
  name: string;
  avatar: string;
  birthYear?: number | null;
  grade?: number;
  languageLevel?: number;
  languageLocked?: boolean;
  interests?: string[];
  settings?: JsonObject;
}

const NEW_PROFILE_KEYS = new Set([
  "name",
  "avatar",
  "birthYear",
  "grade",
  "languageLevel",
  "languageLocked",
  "interests",
  "settings",
]);

/** The keys of profile.json that map to Profile fields. */
const KNOWN_KEYS = new Set([
  "id",
  "name",
  "avatar",
  "birth_year",
  "grade",
  "language_level",
  "language_locked",
  "interests",
  "settings",
  "created_at",
  "order",
  "schema_version",
]);

export interface TrashEntry {
  /** The directory name under trash/. */
  entry: string;
  profileId: string;
  name: string;
  /** Seconds since the epoch. */
  deletedAt: number;
}

/**
 * Returns the trimmed name, or throws {@link ProfileError}: 1 to 16
 * Hebrew or Latin letters, with a single space, hyphen or apostrophe
 * between letters only. No digits, niqqud, emoji or bidi marks.
 */
export function validateName(name: unknown): string {
  if (typeof name !== "string") throw new ProfileError("name must be a string");
  const clean = name.trim();
  // Count code points, as Python's len() does.
  const length = [...clean].length;
  if (length < 1 || length > MAX_NAME_LEN) {
    throw new ProfileError(`name must be 1-${MAX_NAME_LEN} characters`);
  }
  if (!NAME_RE.test(clean)) throw new ProfileError("name may contain Hebrew or English letters only");
  return clean;
}

/** The profile as profile.json holds it (schema_version 2). */
export function profileToDict(p: Profile): JsonObject {
  return {
    ...p.extra,
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    birth_year: p.birthYear,
    grade: p.grade,
    language_level: p.languageLevel,
    language_locked: p.languageLocked,
    interests: [...p.interests],
    settings: { ...p.settings },
    created_at: p.createdAt,
    order: p.order,
    schema_version: SCHEMA_VERSION,
  };
}

/**
 * A profile from profile.json, migrating older versions. Throws a
 * TypeError when the file has no usable id, name or avatar; other bad
 * fields fall back to their defaults.
 */
export function profileFromDict(d: JsonObject): Profile {
  // v1 (the first contract) had no "order": -1 lets the store fix the
  // order from created_at after loading all profiles. Writing always
  // stamps schema_version 2.
  const order = asInt(d.order, -1);
  const { id, name, avatar } = d;
  if (typeof id !== "string" || typeof name !== "string" || typeof avatar !== "string") {
    throw new TypeError("profile needs id, name and avatar");
  }
  const birth = d.birth_year;
  const extra: JsonObject = {};
  for (const [k, v] of Object.entries(d)) if (!KNOWN_KEYS.has(k)) extra[k] = v;
  return {
    id,
    name,
    avatar,
    birthYear: typeof birth === "number" && Number.isInteger(birth) ? birth : null,
    grade: asInt(d.grade, 0),
    languageLevel: asInt(d.language_level, 0),
    languageLocked: asBool(d.language_locked, false),
    interests: Array.isArray(d.interests) ? d.interests.filter((x): x is string => typeof x === "string") : [],
    settings: isJsonObject(d.settings) ? { ...d.settings } : {},
    createdAt: asFloat(d.created_at, 0),
    order,
    extra,
  };
}

function cloneProfile(p: Profile): Profile {
  return {
    ...p,
    interests: [...p.interests],
    settings: structuredClone(p.settings),
    extra: structuredClone(p.extra),
  };
}

/** A random id: "p" and 5 hex digits. */
function randomId(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const n = ((bytes[0]! << 16) | (bytes[1]! << 8) | bytes[2]!) & 0xfffff;
  return "p" + n.toString(16).padStart(5, "0");
}

export interface ProfileStoreOptions<L> {
  /** Directory of the data root inside the file store ("" by default). */
  root?: string;
  /** The modest avatars a child may pick; no list means any non-empty name. */
  avatars?: AvatarAllowList;
  learnerFromDict?: (data: JsonObject) => L;
  learnerNew?: () => L;
  /** Seconds since the epoch. */
  clock?: () => number;
  idFactory?: () => string;
  /** Told when a file had to be recovered (the app log listens). */
  onWarning?: (message: string) => void;
}

/** Something that saves itself as a JSON dict (the learner state). */
export interface ToDict {
  toDict(): JsonObject;
}

/** The profiles of one family, on a {@link FileStore}. */
export class ProfileStore<L = unknown> {
  private fs: FileStore;
  private profilesDir: string;
  private trashDir: string;
  private avatars: AvatarAllowList | undefined;
  private learnerFromDict: ((data: JsonObject) => L) | undefined;
  private learnerNew: (() => L) | undefined;
  private clock: () => number;
  private idFactory: () => string;
  private warn: (message: string) => void;
  // Changes run one at a time: two taps on "add" must not both pass the
  // limit or pick the same id.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(fs: FileStore, options: ProfileStoreOptions<L> = {}) {
    this.fs = fs;
    const root = options.root ?? "";
    this.profilesDir = joinPath(root, "profiles");
    this.trashDir = joinPath(root, "trash");
    this.avatars = options.avatars;
    this.learnerFromDict = options.learnerFromDict;
    this.learnerNew = options.learnerNew;
    this.clock = options.clock ?? (() => Date.now() / 1000);
    this.idFactory = options.idFactory ?? randomId;
    this.warn = options.onWarning ?? (() => undefined);
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  // ------------------------------------------------------------ queries

  /** Every profile, in the order of the "who plays" screen. */
  async list(): Promise<Profile[]> {
    const profiles = await Promise.all((await this.ids()).map((id) => this.load(id)));
    const unordered = profiles
      .filter((p) => p.order < 0)
      .sort((a, b) => a.createdAt - b.createdAt || cmp(a.id, b.id));
    const start = Math.max(-1, ...profiles.map((p) => p.order)) + 1;
    unordered.forEach((p, i) => (p.order = start + i));
    return profiles.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || cmp(a.id, b.id));
  }

  /**
   * Every child's name, deleted profiles included: what logs and reports
   * must hide before they leave the phone.
   */
  async allNames(): Promise<string[]> {
    const names = [...(await this.list()).map((p) => p.name), ...(await this.listTrash()).map((e) => e.name)];
    return [...new Set(names.filter(Boolean))];
  }

  /** One profile; throws {@link ProfileNotFoundError}. */
  async get(id: string): Promise<Profile> {
    if (!(await this.ids()).includes(id)) throw new ProfileNotFoundError(id);
    return this.load(id);
  }

  /** The profile's saves directory (created when missing). */
  async saveDir(id: string): Promise<string> {
    const path = joinPath(this.dir(id), "saves");
    await this.fs.mkdir(path);
    return path;
  }

  // ---------------------------------------------------------- mutations

  /** Adds a profile; throws {@link ProfileError} or {@link ProfileLimitError}. */
  create(input: NewProfile): Promise<Profile> {
    return this.serial(async () => {
      const unknown = Object.keys(input).filter((k) => !NEW_PROFILE_KEYS.has(k));
      if (unknown.length) throw new TypeError(`unknown profile fields: ${unknown.sort().join(", ")}`);
      const existing = await this.list();
      if (existing.length >= MAX_PROFILES) throw new ProfileLimitError(`at most ${MAX_PROFILES} profiles`);
      const p: Profile = {
        id: await this.newId(),
        name: input.name,
        avatar: input.avatar,
        birthYear: input.birthYear ?? null,
        grade: input.grade ?? 0,
        languageLevel: input.languageLevel ?? 0,
        languageLocked: input.languageLocked ?? false,
        interests: [...(input.interests ?? [])],
        settings: { ...(input.settings ?? {}) },
        createdAt: this.clock(),
        order: Math.max(-1, ...existing.map((x) => x.order)) + 1,
        extra: {},
      };
      this.validate(p, existing);
      await this.fs.mkdir(this.dir(p.id));
      await this.saveDir(p.id);
      await this.write(p);
      return cloneProfile(p);
    });
  }

  /** Saves a changed profile; returns it as saved (the name trimmed). */
  save(profile: Profile): Promise<Profile> {
    return this.serial(async () => {
      const p = cloneProfile(profile);
      if (!(await this.ids()).includes(p.id)) throw new ProfileNotFoundError(p.id);
      const others = (await this.list()).filter((x) => x.id !== p.id);
      this.validate(p, others);
      await this.write(p);
      return cloneProfile(p);
    });
  }

  /** Sets the order; `ids` must name every profile exactly once. */
  reorder(ids: readonly string[]): Promise<void> {
    return this.serial(async () => {
      const profiles = new Map((await this.list()).map((p) => [p.id, p]));
      const same = [...ids].sort().join() === [...profiles.keys()].sort().join();
      if (!same || new Set(ids).size !== ids.length) {
        throw new ProfileError("reorder needs every profile exactly once");
      }
      for (const [i, id] of ids.entries()) {
        const p = profiles.get(id)!;
        p.order = i;
        await this.write(p);
      }
    });
  }

  /** Moves a profile with all its files to the trash. */
  delete(id: string): Promise<TrashEntry> {
    return this.serial(async () => {
      const p = await this.get(id);
      const now = this.clock();
      const entry = `${id}-${Math.trunc(now * 1000)}`;
      await this.fs.mkdir(this.trashDir);
      await this.fs.rename(this.dir(id), joinPath(this.trashDir, entry));
      return { entry, profileId: id, name: p.name, deletedAt: now };
    });
  }

  /** The deleted profiles that can be restored. */
  async listTrash(): Promise<TrashEntry[]> {
    const out: TrashEntry[] = [];
    const entries = (await this.fs.list(this.trashDir)).sort((a, b) => cmp(a.name, b.name));
    for (const e of entries) {
      const dash = e.name.indexOf("-");
      const id = dash < 0 ? e.name : e.name.slice(0, dash);
      const stamp = dash < 0 ? "" : e.name.slice(dash + 1);
      if (e.kind !== "dir" || !ID_RE.test(id)) continue;
      const res = await readJson(this.fs, joinPath(this.trashDir, e.name, "profile.json"));
      const name = asStr(res.data?.name, "");
      const deletedAt = /^\d+$/.test(stamp) ? Number(stamp) / 1000 : 0;
      out.push({ entry: e.name, profileId: id, name, deletedAt });
    }
    return out;
  }

  /** Brings a deleted profile back, last in the order. */
  restore(entry: string): Promise<Profile> {
    return this.serial(async () => {
      const info = (await this.listTrash()).find((e) => e.entry === entry);
      if (!info) throw new ProfileNotFoundError(entry);
      const existing = await this.list();
      if (existing.some((p) => p.id === info.profileId)) {
        throw new ProfileError("a profile with this id already exists");
      }
      if (existing.length >= MAX_PROFILES) throw new ProfileLimitError(`at most ${MAX_PROFILES} profiles`);
      const src = joinPath(this.trashDir, entry);
      const p = await this.read(info.profileId, joinPath(src, "profile.json"));
      // The avatar was allowed when it was picked; the list may have changed.
      this.validate(p, existing, { checkAvatar: false });
      p.order = Math.max(-1, ...existing.map((x) => x.order)) + 1;
      await this.fs.rename(src, this.dir(info.profileId));
      await this.write(p);
      return cloneProfile(p);
    });
  }

  // ------------------------------------------------------------ learner

  /** learning.json of a profile; `{}` when there is none. */
  async loadLearnerDict(id: string): Promise<JsonObject> {
    await this.get(id);
    const res = await readJson(this.fs, joinPath(this.dir(id), "learning.json"));
    if (res.recovered) this.warn(`learning.json of ${id} recovered (${res.status})`);
    return res.data ?? {};
  }

  async saveLearnerDict(id: string, data: JsonObject): Promise<void> {
    await this.get(id);
    await writeJson(this.fs, joinPath(this.dir(id), "learning.json"), data);
  }

  /** The learner state, through the factories given to the store. */
  async loadLearner(id: string): Promise<L> {
    if (!this.learnerFromDict) throw new Error("ProfileStore has no learnerFromDict factory");
    const data = await this.loadLearnerDict(id);
    if (Object.keys(data).length === 0 && this.learnerNew) return this.learnerNew();
    return this.learnerFromDict(data);
  }

  async saveLearner(id: string, state: L & ToDict): Promise<void> {
    await this.saveLearnerDict(id, state.toDict());
  }

  // ------------------------------------------------------------ helpers

  private dir(id: string): string {
    return joinPath(this.profilesDir, id);
  }

  private async ids(): Promise<string[]> {
    return (await this.fs.list(this.profilesDir))
      .filter((e) => e.kind === "dir" && ID_RE.test(e.name))
      .map((e) => e.name)
      .sort();
  }

  private async newId(): Promise<string> {
    const taken = new Set([...(await this.ids()), ...(await this.listTrash()).map((e) => e.profileId)]);
    for (let i = 0; i < 1000; i++) {
      const id = this.idFactory();
      if (!taken.has(id)) return id;
    }
    throw new Error("could not generate a unique profile id");
  }

  private load(id: string): Promise<Profile> {
    return this.read(id, joinPath(this.dir(id), "profile.json"));
  }

  private async read(id: string, path: string): Promise<Profile> {
    const res = await readJson(this.fs, path);
    if (res.recovered) this.warn(`profile ${id} recovered (${res.status})`);
    if (res.data !== null) {
      try {
        return { ...profileFromDict({ ...res.data, id }), id };
      } catch {
        this.warn(`profile ${id} has invalid fields`);
      }
    }
    this.warn(`profile ${id} could not be read; using defaults`);
    return {
      id,
      name: RECOVERED_NAME,
      avatar: "",
      birthYear: null,
      grade: 0,
      languageLevel: 0,
      languageLocked: false,
      interests: [],
      settings: { recovered: true },
      createdAt: 0,
      order: -1,
      extra: {},
    };
  }

  private async write(p: Profile): Promise<void> {
    await writeJson(this.fs, joinPath(this.dir(p.id), "profile.json"), profileToDict(p));
  }

  private validate(p: Profile, others: readonly Profile[], { checkAvatar = true } = {}): void {
    p.name = validateName(p.name);
    const lower = p.name.toLowerCase();
    if (others.some((o) => o.name.toLowerCase() === lower)) {
      throw new ProfileError("another profile already has this name");
    }
    if (checkAvatar) this.checkAvatar(p.avatar);
    if (!isIntIn(p.grade, 0, 9)) throw new ProfileError("grade must be 0..9");
    if (!isIntIn(p.languageLevel, 0, 5)) throw new ProfileError("language_level must be 0..5");
    if (p.birthYear !== null && !isIntIn(p.birthYear, 1990, 2100)) {
      throw new ProfileError("birth_year out of range");
    }
  }

  private checkAvatar(avatar: unknown): void {
    if (typeof avatar !== "string" || !avatar) throw new ProfileError("avatar is required");
    const allow = this.avatars;
    if (allow === undefined) return;
    const ok =
      typeof allow === "function"
        ? allow(avatar)
        : Array.isArray(allow)
          ? allow.includes(avatar)
          : (allow as ReadonlySet<string>).has(avatar);
    if (!ok) throw new ProfileError("avatar is not in the allowed list");
  }
}

function isIntIn(value: unknown, lo: number, hi: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= lo && value <= hi;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
