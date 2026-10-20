/**
 * Crash reports from the phone (port of nagmon/crash_report.py;
 * docs/kids/SDD_ANDROID.md §2.6).
 *
 * The report says what broke, on which build and phone, hides every key
 * and every child's name, is kept on the phone (`crash/last_crash.txt`),
 * and leaves it only through `offer`: the crash dialog, where the parent
 * taps "send".
 */
import { type FileStore, joinPath } from "../platform/storage";

/** Fits in a WhatsApp or e-mail message. */
export const MAX_CHARS = 20_000;
/** The app's last log lines follow this line. */
export const LOG_MARKER = "--- app log (last lines) ---";
/** At most this much of the log, so the error always has room. */
export const LOG_CHARS = 8_000;
/** What a child's name becomes in a log or a report. */
export const NAME_MARK = "<child>";

/** Keys by their shape: Groq, Gemini/Google, GitHub, OpenAI, HTTP auth. */
const KEY_PATTERNS: RegExp[] = [
  /gsk_[A-Za-z0-9]{20,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
];
const BEARER = /(bearer\s+)\S+/gi;

/**
 * The base64 characters that encode only the key's own bytes, when the key
 * starts 0, 1 or 2 bytes into a 3-byte group (after "user:" in a Basic
 * header, inside base64 JSON, ...). The first and last characters of each
 * also depend on the bytes around the key, so they are left out.
 */
function base64Forms(secret: string): string[] {
  const bytes = new TextEncoder().encode(secret);
  const forms: string[] = [];
  for (let offset = 0; offset < 3; offset++) {
    const all = new Uint8Array(offset + bytes.length);
    all.set(bytes, offset);
    let binary = "";
    for (const byte of all) binary += String.fromCharCode(byte);
    const start = Math.ceil((offset * 8) / 6);
    const end = Math.floor((all.length * 8) / 6);
    forms.push(btoa(binary).slice(start, end));
  }
  return forms;
}

/**
 * The ways a saved key shows up in a log: as it is, URL-encoded (a query
 * string) and in base64 (an auth header, a GitHub upload body).
 */
function secretForms(secret: string): string[] {
  const forms = new Set([secret, encodeURIComponent(secret), ...base64Forms(secret)]);
  return [...forms].filter((f) => f.length >= 8);
}

/**
 * `text` without keys: the known shapes, plus every saved key (8+ chars)
 * in any case, URL-encoded or in base64.
 */
export function redactSecrets(text: string, secrets: Iterable<string> = []): string {
  const forms: string[] = [];
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 8) forms.push(...secretForms(secret));
  }
  // Longest first, so a longer form is not cut by a shorter one.
  for (const form of forms.sort((a, b) => b.length - a.length)) {
    text = text.replace(new RegExp(escapeRegExp(form), "gi"), "***");
  }
  for (const pattern of KEY_PATTERNS) text = text.replace(pattern, "***");
  return text.replace(BEARER, "$1***");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A letter or a mark (niqqud): what a word is made of, in any alphabet. A digit ends a word. */
const LETTER_OR_MARK = "[\\p{L}\\p{M}]";
/** The Hebrew letters that join a word in front: ו ה ב ל מ ש כ. */
const HEBREW_PREFIX = "(?:[ובהלמשכ]\\p{M}*){0,3}";

/**
 * `text` without the children's names. A name is hidden only as a whole
 * word (in any alphabet, in any case), or after up to three Hebrew prefix letters
 * (ולנועה), which stay; niqqud marks may sit between the letters, and a
 * digit is a boundary (נועה123): "דן" is hidden in "לדן" but not inside "עדן".
 * One-letter names are left alone.
 */
export function hideNames(text: string, names: Iterable<string> = []): string {
  const wanted = new Set<string>();
  for (const n of names) if (typeof n === "string" && n.trim().length >= 2) wanted.add(n.trim());
  // Longest first, so a name that contains another is hidden whole.
  for (const name of [...wanted].sort((a, b) => b.length - a.length)) {
    // marks inside the name are ignored: both sides may carry any niqqud
    const letters = [...name.replace(/\p{M}/gu, "")].map(escapeRegExp).join("\\p{M}*");
    const pattern = new RegExp(`(?<!${LETTER_OR_MARK})(${HEBREW_PREFIX})${letters}\\p{M}*(?!${LETTER_OR_MARK})`, "giu");
    text = text.replace(pattern, `$1${NAME_MARK}`);
  }
  return text;
}

/** `YYYY-MM-DD HH:MM UTC`. */
export function utcMinute(now: Date): string {
  return now.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

/**
 * A header (build, phone, time), the error and the app's last log lines.
 * A long error or log keeps its end, where the stack names what broke.
 */
export function buildReport(
  error: string,
  info: Readonly<Record<string, string>>,
  { now, log = "" }: { now: Date; log?: string },
): string {
  const header = ["Nagmon crash report", ...Object.entries(info).map(([k, v]) => `${k}: ${v}`)];
  header.push(`time: ${utcMinute(now)}`);
  const head = header.join("\n") + "\n\n";
  let tail = "";
  let lines = log.trim();
  if (lines) {
    if (lines.length > LOG_CHARS) lines = "...\n" + lines.slice(-(LOG_CHARS - 4));
    tail = `\n\n${LOG_MARKER}\n${lines}`;
  }
  const room = MAX_CHARS - head.length - tail.length - 1; // the final newline
  let body = error.trim();
  if (body.length > room) body = "...\n" + body.slice(-(room - 4));
  return head + body + tail + "\n";
}

/** An error (or anything thrown) as text: the name, the message and the stack. */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    const title = `${error.name}: ${error.message}`;
    const stack = error.stack ?? "";
    // V8 starts the stack with "Name: message"; other engines do not.
    return stack.startsWith(title) ? stack : stack ? `${title}\n${stack}` : title;
  }
  if (typeof error === "string") return error;
  if (error === undefined) return "undefined";
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/** The last report and the native-crash file, under `crash/`. */
export class CrashReports {
  readonly lastFile: string;
  /** Written by the native side when the app died in Java/Kotlin code. */
  readonly nativeFile: string;

  constructor(
    private fs: FileStore,
    root = "crash",
  ) {
    this.lastFile = joinPath(root, "last_crash.txt");
    this.nativeFile = joinPath(root, "native_crash.txt");
  }

  /** Keeps only this report. */
  async save(text: string): Promise<string> {
    await this.fs.writeText(this.lastFile, text);
    return this.lastFile;
  }

  async last(): Promise<string | null> {
    return this.fs.readText(this.lastFile);
  }

  /** What the native side wrote when the app last died, once. */
  async takeNative(): Promise<string | null> {
    const text = await this.fs.readText(this.nativeFile);
    if (text === null) return null;
    await this.fs.writeText(this.nativeFile, "");
    return text.trim() ? text : null;
  }
}

type MaybeAsync<T> = T | Promise<T>;

export interface CrashReporterOptions {
  /** Build and phone details. */
  info: () => MaybeAsync<Readonly<Record<string, string>>>;
  /** Shows the report to the parent; it is shared only on their tap. */
  offer: (text: string) => MaybeAsync<void>;
  /** The saved keys to hide (the secret store's values). */
  secrets?: () => MaybeAsync<Iterable<string>>;
  /** The app's last log lines. */
  log?: () => MaybeAsync<string>;
  /** The children's names to hide, deleted profiles included. */
  names?: () => MaybeAsync<Iterable<string>>;
  /** Runs first when this session broke (e.g. to note it in the app log). */
  onCrash?: () => MaybeAsync<unknown>;
  clock?: () => Date;
  /** Where failures of the reporter itself go; never throws. */
  warn?: (message: string) => void;
}

/** Saves and offers a report when the game breaks. */
export class CrashReporter {
  private o: CrashReporterOptions;
  private pending = new Set<Promise<unknown>>();

  constructor(
    readonly reports: CrashReports,
    options: CrashReporterOptions,
  ) {
    this.o = options;
  }

  private warn(message: string): void {
    try {
      this.o.warn?.(message);
    } catch {
      // nothing more to do
    }
  }

  /**
   * Saves and offers a report for `error` (a stack as text); `previous`
   * when it is about an earlier session. Each step may fail on its own
   * without hiding the crash.
   */
  report(error: string, { previous = false }: { previous?: boolean } = {}): Promise<string> {
    const run = this.doReport(error, previous);
    this.pending.add(run);
    void run.finally(() => this.pending.delete(run));
    return run;
  }

  private async doReport(error: string, previous: boolean): Promise<string> {
    if (!previous) {
      try {
        await this.o.onCrash?.();
      } catch (e) {
        this.warn(`Could not note the crash: ${formatError(e)}`);
      }
    }
    let info: Readonly<Record<string, string>>;
    try {
      info = { ...(await this.o.info()) };
    } catch (e) {
      info = { details: `unavailable (${e instanceof Error ? e.message : String(e)})` };
    }
    let secrets: string[] = [];
    try {
      secrets = [...((await this.o.secrets?.()) ?? [])];
    } catch {
      secrets = [];
    }
    let log = "";
    try {
      log = (await this.o.log?.()) ?? "";
    } catch (e) {
      log = `(log unavailable: ${e instanceof Error ? e.message : String(e)})`;
    }
    let names: string[] = [];
    try {
      names = [...((await this.o.names?.()) ?? [])];
    } catch {
      names = [];
    }
    const now = this.o.clock?.() ?? new Date();
    const text = hideNames(redactSecrets(buildReport(error, info, { now, log }), secrets), names);
    try {
      await this.reports.save(text);
    } catch (e) {
      this.warn(`Could not save the crash report: ${formatError(e)}`);
    }
    try {
      await this.o.offer(text);
    } catch (e) {
      this.warn(`Could not show the crash report: ${formatError(e)}`);
    }
    return text;
  }

  /** Resolves when every report started so far is done (tests, before exit). */
  async idle(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  /**
   * Offers last time's native crash, then starts the game. Returns false
   * when `start` threw (the report has been saved and offered).
   */
  async run(start: () => unknown): Promise<boolean> {
    try {
      const native = await this.reports.takeNative();
      if (native) await this.report("The game stopped last time (native crash):\n" + native, { previous: true });
    } catch (e) {
      this.warn(`Could not read the native crash: ${formatError(e)}`);
    }
    try {
      await start();
      return true;
    } catch (e) {
      await this.report(formatError(e));
      return false;
    }
  }
}

export interface CrashHandlerOptions {
  /** Where to listen; the window by default. */
  target?: EventTarget;
  /**
   * Errors after the first: the dialog opens once per session, so a
   * broken frame loop does not stack dialogs. Pass the app log here.
   */
  onLater?: (text: string) => void;
}

function eventText(event: Event): string {
  if (event.type === "unhandledrejection") {
    const reason = (event as Event & { reason?: unknown }).reason;
    return reason instanceof Error ? formatError(reason) : `Unhandled rejection: ${formatError(reason)}`;
  }
  const e = event as Event & { error?: unknown; message?: string; filename?: string; lineno?: number };
  if (e.error !== undefined && e.error !== null) return formatError(e.error);
  const where = e.filename ? ` (${e.filename}:${e.lineno ?? 0})` : "";
  return `${e.message || "Script error"}${where}`;
}

/**
 * Reports uncaught errors and unhandled promise rejections (the
 * window's `error` and `unhandledrejection` events). Returns a function
 * that removes the handlers.
 */
export function installCrashHandlers(reporter: CrashReporter, options: CrashHandlerOptions = {}): () => void {
  const target = options.target ?? globalThis;
  let reported = false;
  const handle = (event: Event) => {
    let text: string;
    try {
      text = eventText(event);
    } catch {
      text = `Uncaught ${event.type}`;
    }
    if (reported) {
      try {
        options.onLater?.(text);
      } catch {
        // a broken log must not throw inside the error handler
      }
      return;
    }
    reported = true;
    void reporter.report(text);
  };
  target.addEventListener("error", handle);
  target.addEventListener("unhandledrejection", handle);
  return () => {
    target.removeEventListener("error", handle);
    target.removeEventListener("unhandledrejection", handle);
  };
}
