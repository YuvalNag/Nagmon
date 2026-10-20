/**
 * The app's own log (port of nagmon/field_data/app_log.py;
 * docs/kids/SDD_FIELD_DATA.md §2.2).
 *
 * {@link RingLog} keeps the last 400 lines in memory: Nagmon's INFO and
 * everyone's warnings (console.warn/error included). Keys are hidden as
 * each line is written and again when saved. The log is saved to
 * `nagmon/app_log.txt` when the app goes to the background and when it
 * closes (src/platform/lifecycle.ts), and before sending, so the parent
 * can send it after the game opens again. Times are UTC. HTTP bodies are
 * never logged.
 */
import { formatError, hideNames, redactSecrets, utcMinute } from "../core/crashReport";
import { DATA_FILES, type FileStore, dirName, withPathLock } from "./storage";

export const MAX_LINES = 400;
export const LOG_FILE = DATA_FILES.appLog;
/** Loggers whose INFO lines are kept; the rest from WARNING up. */
export const OWN_LOGGERS = ["nagmon"] as const;
export const START_MARK = "=== Nagmon start";
export const SAVED_MARK = "--- saved: ";
/** The saved keys are read at most this often (ms). */
export const SECRETS_TTL_MS = 30_000;

/** How a saved log ended, as the next start line says it. */
const ENDINGS: Record<string, string> = { exit: "normal", background: "normal", crash: "crash" };

export type Level = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
const RANK: Record<Level, number> = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40, CRITICAL: 50 };

/** How a session ended: "exit", "background" or "crash". */
export type Ending = "exit" | "background" | "crash";

type SecretsSource = () => Iterable<string> | Promise<Iterable<string>>;

function isOwn(name: string): boolean {
  return OWN_LOGGERS.some((own) => name === own || name.startsWith(`${own}.`));
}

/** HH:MM:SS in UTC. */
function utcTime(d: Date): string {
  return d.toISOString().slice(11, 19);
}

/** Splits like Python's splitlines (\n, \r\n or \r), dropping the last empty part. */
function splitLines(text: string): string[] {
  const parts = text.split(/\r\n|\r|\n/);
  if (parts.length && parts.at(-1) === "") parts.pop();
  return parts;
}

// A lone surrogate cannot be written as UTF-8; it becomes "?".
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export interface RingLogOptions {
  maxLines?: number;
  /** The saved keys to hide; may be async (the Keystore). */
  secrets?: SecretsSource;
  /** The children's names to hide; may be async (the profiles on disk). */
  names?: SecretsSource;
  clock?: () => Date;
}

/** Reads a source of words to hide: right away when it can, else later; never throws. */
function readSource(source: SecretsSource): string[] | Promise<string[] | null> | null {
  const clean = (values: Iterable<string>) => [...values].filter((s) => typeof s === "string" && s);
  try {
    const got = source();
    return got instanceof Promise ? got.then(clean, () => null) : clean(got);
  } catch {
    // A broken source must not stop logging.
    return null;
  }
}

/** The last `maxLines` lines: `HH:MM:SS LEVEL logger: message`, then a stack if any. */
export class RingLog {
  private buffer: string[] = [];
  private maxLines: number;
  private secrets: SecretsSource;
  private names: SecretsSource;
  private clock: () => Date;
  private known: string[] = [];
  private knownNames: string[] = [];
  private knownAt = -Infinity;
  private refreshing: Promise<void> | null = null;

  constructor({ maxLines = MAX_LINES, secrets = () => [], names = () => [], clock = () => new Date() }: RingLogOptions = {}) {
    this.maxLines = maxLines;
    this.secrets = secrets;
    this.names = names;
    this.clock = clock;
  }

  toString(): string {
    return `RingLog(lines=${this.buffer.length})`;
  }

  // ------------------------------------------------------------ secrets

  /** Keys and names hidden from `text`. */
  private hide(text: string, keys = this.known, names = this.knownNames): string {
    return hideNames(redactSecrets(text, keys), names);
  }

  /** Reads the saved keys and the children's names again now; never rejects. */
  refreshSecrets(): Promise<void> {
    this.knownAt = performance.now();
    const keep = (keys: string[] | null, names: string[] | null) => {
      const nextKeys = keys ?? this.known;
      const nextNames = names ?? this.knownNames;
      const added =
        nextKeys.some((s) => !this.known.includes(s)) || nextNames.some((s) => !this.knownNames.includes(s));
      this.known = nextKeys;
      this.knownNames = nextNames;
      // Lines written before an async source answered are hidden now.
      if (added) this.buffer = this.buffer.map((line) => this.hide(line));
    };
    const keys = readSource(this.secrets);
    const names = readSource(this.names);
    if (keys instanceof Promise || names instanceof Promise) {
      this.refreshing = Promise.all([keys, names])
        .then(([k, n]) => keep(k, n))
        .finally(() => (this.refreshing = null));
      return this.refreshing;
    }
    keep(keys, names);
    return Promise.resolve();
  }

  private refreshIfOld(): void {
    if (performance.now() - this.knownAt >= SECRETS_TTL_MS && !this.refreshing) void this.refreshSecrets();
  }

  // ------------------------------------------------------------ writing

  /** Whether a line of this logger and level is kept. */
  static wanted(name: string, level: Level): boolean {
    return RANK[level] >= (isOwn(name) ? RANK.INFO : RANK.WARNING);
  }

  /** Logs one message (with an error's stack, if given). */
  log(name: string, level: Level, message: string, error?: unknown): void {
    if (!RingLog.wanted(name, level)) return;
    try {
      let text = `${utcTime(this.clock())} ${level} ${name}: ${message}`;
      if (error !== undefined) text += "\n" + formatError(error).replace(/\n+$/, "");
      this.add(text);
    } catch {
      // Logging never breaks the game.
    }
  }

  /** Adds lines as they are (after hiding keys), without a level filter. */
  add(text: string): void {
    this.refreshIfOld();
    const clean = this.hide(text);
    // Only the last lines can stay; no spread, so a huge text cannot
    // overflow the call stack.
    const lines = splitLines(clean).slice(-this.maxLines);
    if (!lines.length) lines.push("");
    for (const line of lines) this.buffer.push(line);
    if (this.buffer.length > this.maxLines) this.buffer.splice(0, this.buffer.length - this.maxLines);
  }

  // ------------------------------------------------------------ reading

  lines(): string[] {
    return [...this.buffer];
  }

  text(): string {
    return this.buffer.length ? this.buffer.join("\n") + "\n" : "";
  }

  tail(n: number): string {
    const lines = n > 0 ? this.buffer.slice(-n) : [];
    return lines.length ? lines.join("\n") + "\n" : "";
  }

  // ------------------------------------------------------------ the file

  /** Writes the lines (and how the session ended), keys hidden again. */
  async save(fs: FileStore, path: string, { ending }: { ending?: string } = {}): Promise<void> {
    await this.refreshSecrets();
    let text = this.text();
    if (ending) text += `${SAVED_MARK}${ending}\n`;
    text = this.hide(text).replace(LONE_SURROGATE, "?");
    // As writeJson: .tmp first, the old log becomes the .bak, then the
    // .tmp becomes the log. A save cut short leaves the .tmp or the .bak.
    await withPathLock(fs, path, async () => {
      await fs.mkdir(dirName(path));
      const tmp = `${path}.tmp`;
      await fs.writeText(tmp, text);
      if ((await fs.stat(path)) === "file") await fs.rename(path, `${path}.bak`);
      await fs.rename(tmp, path);
    });
  }

  /**
   * Puts the saved lines before the current ones. Returns how that session
   * ended ("exit", "background", "crash" or "unknown"), or null when there
   * was no saved log.
   */
  async load(fs: FileStore, path: string): Promise<string | null> {
    const saved = await withPathLock(fs, path, async () => {
      for (const candidate of [path, `${path}.tmp`, `${path}.bak`]) {
        try {
          const text = await fs.readText(candidate);
          if (text !== null) return text;
        } catch {
          // try the next one
        }
      }
      return null;
    });
    if (saved === null) return null;
    const old = splitLines(saved);
    this.buffer = [...old, ...this.buffer].slice(-this.maxLines);
    const last = old.at(-1);
    if (last?.startsWith(SAVED_MARK)) return last.slice(SAVED_MARK.length).trim() || "unknown";
    return "unknown";
  }
}

// ------------------------------------------------------------ build info

/**
 * Version and build. CI sets `VITE_APP_VERSION` and `VITE_APP_BUILD`;
 * a local build says "local".
 */
export function buildInfo(): { version: string; build: string } {
  const env = import.meta.env;
  return { version: String(env.VITE_APP_VERSION || "0.1.0"), build: String(env.VITE_APP_BUILD || "local") };
}

// ------------------------------------------------------- the app's log

let current: RingLog | null = null;
let currentFs: FileStore | null = null;
let crashed = false;
let restoreConsole: (() => void) | null = null;

export interface InstallOptions {
  /** Version, build and device; defaults to {@link buildInfo} and the user agent. */
  details?: Readonly<Record<string, string>>;
  secrets?: SecretsSource;
  /** The children's names, hidden like the keys. */
  names?: SecretsSource;
  clock?: () => Date;
}

function consoleText(args: unknown[]): string {
  return args.map((a) => (typeof a === "string" ? a : formatError(a))).join(" ");
}

/** Copies console.warn and console.error into the log (other code's warnings). */
function hookConsole(ring: RingLog): () => void {
  const { warn, error } = console;
  console.warn = (...args: unknown[]) => {
    warn.apply(console, args);
    ring.log("console", "WARNING", consoleText(args));
  };
  console.error = (...args: unknown[]) => {
    error.apply(console, args);
    ring.log("console", "ERROR", consoleText(args));
  };
  return () => {
    console.warn = warn;
    console.error = error;
  };
}

/**
 * Starts the app's log once (later calls return the same log): loads the
 * last session's lines and writes a start line with the build, the phone
 * and how the last session ended.
 */
export async function installAppLog(fs: FileStore, options: InstallOptions = {}): Promise<RingLog> {
  if (current) return current;
  const clock = options.clock ?? (() => new Date());
  const ring = new RingLog({ secrets: options.secrets, names: options.names, clock });
  // Not waited for: the Keystore can take a second on its first use, and
  // the start must not. Lines written before it answers are hidden then,
  // and a save always waits for it.
  void ring.refreshSecrets();
  const previous = await ring.load(fs, LOG_FILE);
  if (current) return current; // another install won the race
  const info: Record<string, string> = { ...(options.details ?? buildInfo()) };
  info.device ??= typeof navigator === "undefined" ? "unknown" : navigator.userAgent;
  const ended = previous === null ? "none (first run)" : (ENDINGS[previous] ?? "unknown");
  ring.add(
    `${START_MARK} ${utcMinute(clock())}` +
      ` · version ${info.version ?? "?"}` +
      ` · build ${info.build ?? "?"}` +
      ` · device ${info.device ?? "?"}` +
      ` · previous exit: ${ended}`,
  );
  current = ring;
  currentFs = fs;
  crashed = false;
  restoreConsole = hookConsole(ring);
  return ring;
}

/** Stops the log and gives console its functions back (tests). */
export function uninstallAppLog(): void {
  restoreConsole?.();
  restoreConsole = null;
  current = null;
  currentFs = null;
  crashed = false;
}

export function currentAppLog(): RingLog | null {
  return current;
}

/** The game broke: the saved log will say so at the next start. */
export function noteCrash(): void {
  crashed = true;
}

/** Saves the log to `nagmon/app_log.txt`; never rejects. */
export async function saveAppLog({ ending }: { ending?: Ending } = {}): Promise<void> {
  const ring = current;
  const fs = currentFs;
  if (!ring || !fs) return;
  const how = crashed ? "crash" : (ending ?? "exit");
  try {
    await ring.save(fs, LOG_FILE, { ending: how });
  } catch (e) {
    ring.log("nagmon.app_log", "WARNING", `Could not save the log: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The whole log as text ("" before install). */
export function appLogText(): string {
  return current?.text() ?? "";
}

/** The last `n` lines ("" before install). */
export function appLogTail(n: number): string {
  return current?.tail(n) ?? "";
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warning(message: string, error?: unknown): void;
  error(message: string, error?: unknown): void;
}

/** A named logger that writes to the app's log (nothing before install). */
export function getLogger(name: string): Logger {
  const at = (level: Level) => (message: string, error?: unknown) => current?.log(name, level, message, error);
  return { debug: at("DEBUG"), info: at("INFO"), warning: at("WARNING"), error: at("ERROR") };
}
