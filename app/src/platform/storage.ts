/**
 * The app's files: an async file store with two implementations, and the
 * JSON helpers every saved file goes through (port of
 * nagmon/family/_jsonio.py).
 *
 * - `writeJson` writes `<name>.tmp`, copies the previous good file to
 *   `<name>.bak` and renames the tmp file over the target.
 * - `readJson` never throws on bad content. A corrupt file is moved aside
 *   to `<name>.corrupt-<stamp>` and the backup (or nothing) is used, with
 *   a `recovered` flag, so the child keeps playing.
 *
 * Paths are relative to the data root and use "/" (no leading slash).
 * In the browser and in tests the files live in memory, optionally
 * mirrored to localStorage; on Android they live in the app's private
 * data directory (Capacitor Filesystem, `Directory.Data`).
 */
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";

export type EntryKind = "file" | "dir";

export interface DirEntry {
  name: string;
  kind: EntryKind;
}

/** A small file system: the operations the stores need, nothing more. */
export interface FileStore {
  /** The text of a file, or `null` when there is no such file. */
  readText(path: string): Promise<string | null>;
  /** Writes a whole file, creating its parent directories. */
  writeText(path: string, text: string): Promise<void>;
  /** "file", "dir" or `null` when nothing is there. */
  stat(path: string): Promise<EntryKind | null>;
  /** The entries of a directory (not recursive); `[]` when it is missing. */
  list(dir: string): Promise<DirEntry[]>;
  /** Creates a directory and its parents; an existing one is fine. */
  mkdir(dir: string): Promise<void>;
  /**
   * Moves a file or a directory. A file replaces an existing file; a
   * directory never replaces anything (it throws).
   */
  rename(from: string, to: string): Promise<void>;
  /** Copies one file, replacing the target. */
  copy(from: string, to: string): Promise<void>;
  /** Removes a file or a whole directory; a missing path is fine. */
  remove(path: string): Promise<void>;
}

// ------------------------------------------------------------ data layout

/**
 * The file names of the old app (INVENTORY §7.1), so migrating is a copy.
 * `secrets.json` is not here on purpose: secrets live in platform/secrets.
 */
export const DATA_FILES = {
  parent: "parent.json",
  usage: "usage.json",
  practice: "practice.json",
  rewards: "rewards.json",
  device: "device.json",
  aiSettings: "ai_settings.json",
  aiStateStudio: "ai_state_studio.json",
  aiStateKid: "ai_state_kid.json",
  aiPending: "ai_pending",
  aiBank: "ai_bank",
  aiExplainCache: "ai_explain_cache.json",
  profiles: "profiles",
  trash: "trash",
  crashDir: "crash",
  lastCrash: "crash/last_crash.txt",
  nativeCrash: "crash/native_crash.txt",
  appLog: "nagmon/app_log.txt",
  profileDir: (id: string) => `profiles/${id}`,
  profile: (id: string) => `profiles/${id}/profile.json`,
  learning: (id: string) => `profiles/${id}/learning.json`,
  saves: (id: string) => `profiles/${id}/saves`,
  owlLog: (id: string) => `profiles/${id}/owl_log.jsonl`,
} as const;

// ------------------------------------------------------------ path helpers

/** Joins path parts with "/", dropping empty parts and extra slashes. */
export function joinPath(...parts: string[]): string {
  return parts
    .flatMap((p) => p.split("/"))
    .filter((p) => p !== "" && p !== ".")
    .join("/");
}

/** The directory part of a path ("" for a top-level name). */
export function dirName(path: string): string {
  const clean = joinPath(path);
  const at = clean.lastIndexOf("/");
  return at < 0 ? "" : clean.slice(0, at);
}

/** The last part of a path. */
export function baseName(path: string): string {
  const clean = joinPath(path);
  return clean.slice(clean.lastIndexOf("/") + 1);
}

// ------------------------------------------------------------ JSON values

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type LoadStatus = "ok" | "missing" | "backup" | "reset";

export interface LoadResult {
  data: JsonObject | null;
  status: LoadStatus;
  /** True when the file was corrupt and the backup or defaults were used. */
  recovered: boolean;
}

/** True for a plain JSON object (not an array, not null). */
export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively sorts object keys, like Python's `sort_keys=True`. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isJsonObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

const bakPath = (path: string) => `${path}.bak`;
const tmpPath = (path: string) => `${path}.tmp`;

export interface WriteJsonOptions {
  /** Keep the previous file as `<name>.bak` (default true). */
  backup?: boolean;
}

/**
 * Writes `data` as JSON to `path` atomically: the tmp file first, then a
 * rename, so a crash mid-write never leaves a half file.
 */
export async function writeJson(
  fs: FileStore,
  path: string,
  data: unknown,
  { backup = true }: WriteJsonOptions = {},
): Promise<void> {
  const payload = JSON.stringify(sortKeys(data), null, 2);
  const tmp = tmpPath(path);
  try {
    await fs.writeText(tmp, payload);
  } catch (err) {
    await fs.remove(tmp).catch(() => undefined);
    throw err;
  }
  if (backup && (await fs.stat(path)) === "file") {
    // Best effort, as in the old code: a missing .bak is not a failure.
    await fs.copy(path, bakPath(path)).catch(() => undefined);
  }
  await fs.rename(tmp, path);
}

async function readObject(fs: FileStore, path: string): Promise<JsonObject | null> {
  try {
    const text = await fs.readText(path);
    if (text === null) return null;
    const data: unknown = JSON.parse(text);
    return isJsonObject(data) ? data : null;
  } catch {
    return null;
  }
}

/** `YYYYMMDD-HHMMSS` in UTC, the stamp of a corrupt file's new name. */
function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
    `-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`
  );
}

async function moveAside(fs: FileStore, path: string): Promise<string> {
  const base = `${path}.corrupt-${stamp(new Date())}`;
  let target = base;
  for (let n = 1; (await fs.stat(target)) !== null; n++) target = `${base}-${n}`;
  await fs.rename(path, target);
  return target;
}

/** Loads a JSON object from `path`, recovering from corruption. */
export async function readJson(fs: FileStore, path: string): Promise<LoadResult> {
  const kind = await fs.stat(path);
  if (kind === null) {
    // One step beyond _jsonio: a rename that is not atomic on the device
    // can leave only the .bak behind; use it rather than lose the file.
    const bak = (await fs.stat(bakPath(path))) === "file" ? await readObject(fs, bakPath(path)) : null;
    if (bak !== null) return { data: bak, status: "backup", recovered: true };
    return { data: null, status: "missing", recovered: false };
  }
  const data = kind === "file" ? await readObject(fs, path) : null;
  if (data !== null) return { data, status: "ok", recovered: false };
  if (kind === "file") await moveAside(fs, path);
  const bak = await readObject(fs, bakPath(path));
  if (bak !== null) return { data: bak, status: "backup", recovered: true };
  return { data: null, status: "reset", recovered: true };
}

/** Removes a JSON file and its backup, so nothing comes back from the .bak. */
export async function removeJson(fs: FileStore, path: string): Promise<void> {
  await fs.remove(path);
  await fs.remove(bakPath(path));
  await fs.remove(tmpPath(path));
}

// Lenient field readers: a bad value falls back to the default.

/** An integer, or `fallback` (booleans are not numbers here). */
export function asInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

/** A finite number, or `fallback`. */
export function asFloat(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A boolean, or `fallback`. */
export function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** A string, or `fallback`. */
export function asStr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

// ------------------------------------------------------------ memory store

/** The subset of the Web Storage API the memory store mirrors to. */
export interface KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MemoryFileStoreOptions {
  /** Mirror every file to this storage (e.g. `localStorage`). */
  storage?: KeyValueStorage;
  /** Key prefix in `storage`. */
  prefix?: string;
}

/**
 * Files in memory: for tests and for the browser. With `storage` set, the
 * files survive a reload (dev in the browser); the phone uses
 * {@link CapacitorFileStore}.
 */
export class MemoryFileStore implements FileStore {
  private files = new Map<string, string>();
  private dirs = new Set<string>([""]);
  private storage: KeyValueStorage | undefined;
  private prefix: string;

  constructor({ storage, prefix = "nagmon-fs:" }: MemoryFileStoreOptions = {}) {
    this.storage = storage;
    this.prefix = prefix;
    if (storage) this.loadFrom(storage);
  }

  private loadFrom(storage: KeyValueStorage): void {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key === null || !key.startsWith(this.prefix)) continue;
      const rest = key.slice(this.prefix.length);
      const value = storage.getItem(key);
      if (rest.startsWith("d:")) this.addDir(rest.slice(2), false);
      else if (rest.startsWith("f:") && value !== null) {
        this.files.set(rest.slice(2), value);
        this.addDir(dirName(rest.slice(2)), false);
      }
    }
  }

  private persistFile(path: string, text: string | null): void {
    if (!this.storage) return;
    const key = `${this.prefix}f:${path}`;
    if (text === null) this.storage.removeItem(key);
    else this.storage.setItem(key, text);
  }

  private persistDir(path: string, present: boolean): void {
    if (!this.storage || path === "") return;
    const key = `${this.prefix}d:${path}`;
    if (present) this.storage.setItem(key, "");
    else this.storage.removeItem(key);
  }

  private addDir(dir: string, persist = true): void {
    for (let d = joinPath(dir); d !== ""; d = dirName(d)) {
      if (this.files.has(d)) throw new Error(`not a directory: ${d}`);
      if (!this.dirs.has(d)) {
        this.dirs.add(d);
        if (persist) this.persistDir(d, true);
      }
    }
  }

  async readText(path: string): Promise<string | null> {
    const p = joinPath(path);
    if (this.dirs.has(p)) throw new Error(`is a directory: ${p}`);
    return this.files.get(p) ?? null;
  }

  async writeText(path: string, text: string): Promise<void> {
    const p = joinPath(path);
    if (this.dirs.has(p)) throw new Error(`is a directory: ${p}`);
    this.addDir(dirName(p));
    this.files.set(p, text);
    this.persistFile(p, text);
  }

  async stat(path: string): Promise<EntryKind | null> {
    const p = joinPath(path);
    if (this.files.has(p)) return "file";
    return this.dirs.has(p) ? "dir" : null;
  }

  async list(dir: string): Promise<DirEntry[]> {
    const d = joinPath(dir);
    if (!this.dirs.has(d)) return [];
    const out: DirEntry[] = [];
    const inDir = (p: string) => dirName(p) === d && p !== "";
    for (const p of this.dirs) if (inDir(p)) out.push({ name: baseName(p), kind: "dir" });
    for (const p of this.files.keys()) if (inDir(p)) out.push({ name: baseName(p), kind: "file" });
    return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async mkdir(dir: string): Promise<void> {
    this.addDir(dir);
  }

  async rename(from: string, to: string): Promise<void> {
    const src = joinPath(from);
    const dst = joinPath(to);
    if (src === dst) return;
    if (this.files.has(src)) {
      if (this.dirs.has(dst)) throw new Error(`is a directory: ${dst}`);
      const text = this.files.get(src)!;
      await this.writeText(dst, text);
      this.files.delete(src);
      this.persistFile(src, null);
      return;
    }
    if (!this.dirs.has(src) || src === "") throw new Error(`no such file or directory: ${src}`);
    if ((await this.stat(dst)) !== null) throw new Error(`already exists: ${dst}`);
    if (dst.startsWith(`${src}/`)) throw new Error("cannot move a directory into itself");
    const under = (p: string) => p === src || p.startsWith(`${src}/`);
    const moved = (p: string) => dst + p.slice(src.length);
    this.addDir(dirName(dst));
    for (const d of [...this.dirs].filter(under)) {
      this.dirs.delete(d);
      this.persistDir(d, false);
      this.dirs.add(moved(d));
      this.persistDir(moved(d), true);
    }
    for (const [p, text] of [...this.files].filter(([p]) => under(p))) {
      this.files.delete(p);
      this.persistFile(p, null);
      this.files.set(moved(p), text);
      this.persistFile(moved(p), text);
    }
  }

  async copy(from: string, to: string): Promise<void> {
    const text = this.files.get(joinPath(from));
    if (text === undefined) throw new Error(`no such file: ${from}`);
    await this.writeText(to, text);
  }

  async remove(path: string): Promise<void> {
    const p = joinPath(path);
    if (this.files.delete(p)) {
      this.persistFile(p, null);
      return;
    }
    if (!this.dirs.has(p) || p === "") return;
    const under = (q: string) => q === p || q.startsWith(`${p}/`);
    for (const d of [...this.dirs].filter(under)) {
      this.dirs.delete(d);
      this.persistDir(d, false);
    }
    for (const f of [...this.files.keys()].filter(under)) {
      this.files.delete(f);
      this.persistFile(f, null);
    }
  }
}

// ------------------------------------------------------------ Capacitor

/**
 * Files in the app's private data directory on Android
 * (`Directory.Data`, i.e. `getFilesDir()`), through @capacitor/filesystem.
 */
export class CapacitorFileStore implements FileStore {
  private directory: Directory;

  constructor(directory: Directory = Directory.Data) {
    this.directory = directory;
  }

  async readText(path: string): Promise<string | null> {
    const p = joinPath(path);
    try {
      const res = await Filesystem.readFile({ path: p, directory: this.directory, encoding: Encoding.UTF8 });
      return typeof res.data === "string" ? res.data : await res.data.text();
    } catch (err) {
      // The plugin throws for a missing file; tell that apart from real errors.
      if ((await this.stat(p)) === null) return null;
      throw err;
    }
  }

  async writeText(path: string, text: string): Promise<void> {
    await Filesystem.writeFile({
      path: joinPath(path),
      data: text,
      directory: this.directory,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  }

  async stat(path: string): Promise<EntryKind | null> {
    const p = joinPath(path);
    if (p === "") return "dir";
    try {
      const res = await Filesystem.stat({ path: p, directory: this.directory });
      return res.type === "directory" ? "dir" : "file";
    } catch {
      return null;
    }
  }

  async list(dir: string): Promise<DirEntry[]> {
    const p = joinPath(dir);
    if ((await this.stat(p)) !== "dir") return [];
    const res = await Filesystem.readdir({ path: p, directory: this.directory });
    return res.files
      .map((f): DirEntry => ({ name: baseName(f.name), kind: f.type === "directory" ? "dir" : "file" }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  async mkdir(dir: string): Promise<void> {
    const p = joinPath(dir);
    if (p === "" || (await this.stat(p)) === "dir") return;
    await Filesystem.mkdir({ path: p, directory: this.directory, recursive: true });
  }

  async rename(from: string, to: string): Promise<void> {
    const src = joinPath(from);
    const dst = joinPath(to);
    const target = await this.stat(dst);
    if (target === "dir") throw new Error(`already exists: ${dst}`);
    if (target === "file") {
      if ((await this.stat(src)) === "dir") throw new Error(`already exists: ${dst}`);
      // Whether the native move replaces a file is not documented; delete
      // first. If the app dies in between, readJson falls back to the .bak.
      await Filesystem.deleteFile({ path: dst, directory: this.directory });
    }
    await this.mkdir(dirName(dst));
    await Filesystem.rename({ from: src, to: dst, directory: this.directory, toDirectory: this.directory });
  }

  async copy(from: string, to: string): Promise<void> {
    const text = await this.readText(from);
    if (text === null) throw new Error(`no such file: ${from}`);
    await this.writeText(to, text);
  }

  async remove(path: string): Promise<void> {
    const p = joinPath(path);
    const kind = await this.stat(p);
    if (kind === "file") await Filesystem.deleteFile({ path: p, directory: this.directory });
    else if (kind === "dir" && p !== "") await Filesystem.rmdir({ path: p, directory: this.directory, recursive: true });
  }
}

/**
 * The data store for this platform: the device's files on Android, memory
 * (mirrored to localStorage) in the browser.
 */
export function createFileStore(): FileStore {
  if (Capacitor.isNativePlatform()) return new CapacitorFileStore();
  const storage = typeof localStorage === "undefined" ? undefined : localStorage;
  return new MemoryFileStore({ storage });
}
