/**
 * The app going to the background and coming back (docs/app/SDD.md §10).
 *
 * Android tells the app through @capacitor/app (`pause`, `resume`,
 * `appStateChange`); the WebView also hides the page. Each of these is the
 * same change and is handled once. Going to the background:
 * 1. stops every sound (it must not play on behind another app);
 * 2. pauses the game's clock and the screen-time clock (a child's time is
 *    not spent while the phone is in a pocket);
 * 3. writes everything waiting to be written, and the log: Android may
 *    kill the process at any moment after this, with no warning.
 * Coming back resumes the clocks. Nothing here reloads or changes the
 * screen: the child is where they were.
 */
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { saveAppLog } from "./appLog";
import { type FileStore, pendingWrites } from "./storage";

export type AppState = "active" | "background";
/** Why the saves are flushed: the app went behind another, or the page closes. */
export type FlushReason = "background" | "exit";

/** Time that stands still while the app is in the background. */
export class PausableClock {
  private base = 0;
  private since: number | null;

  constructor(private readonly source: () => number = () => performance.now()) {
    this.since = source();
  }

  /** Milliseconds counted so far (only while running). */
  now(): number {
    return this.base + (this.since === null ? 0 : this.source() - this.since);
  }

  get paused(): boolean {
    return this.since === null;
  }

  pause(): void {
    if (this.since === null) return;
    this.base += this.source() - this.since;
    this.since = null;
  }

  resume(): void {
    if (this.since === null) this.since = this.source();
  }
}

/** The game's own time: the map, battles and animations read it. */
export const gameClock = new PausableClock();
/** The child's screen time is counted on this one. */
export const screenTimeClock = new PausableClock();

/** The part of @capacitor/app used here (tests pass their own). */
export interface AppEvents {
  addListener(event: "pause" | "resume", fn: () => void): Promise<{ remove(): Promise<void> }>;
  addListener(event: "appStateChange", fn: (state: { isActive: boolean }) => void): Promise<{ remove(): Promise<void> }>;
}

/** Stops every sound the page plays: media elements and speech. */
export function stopPageSound(doc: Document = document): void {
  for (const media of doc.querySelectorAll<HTMLMediaElement>("audio, video")) {
    try {
      media.pause();
    } catch {
      // one broken element must not keep the others playing
    }
  }
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

/**
 * The app's flush: the data files being written finish first, then the
 * log is saved, saying how the session ended. Never rejects.
 */
export async function saveEverything(fs: FileStore, why: FlushReason): Promise<void> {
  try {
    await pendingWrites(fs);
  } finally {
    await saveAppLog({ ending: why });
  }
}

export interface LifecycleOptions {
  /** On the phone (Capacitor); defaults to Capacitor.isNativePlatform(). */
  native?: boolean;
  app?: AppEvents;
  document?: EventTarget & { visibilityState: string };
  window?: EventTarget;
  /** Paused in the background; defaults to the game's and the screen time's. */
  clocks?: PausableClock[];
  /** Stops all sound; defaults to {@link stopPageSound}. */
  stopSound?: () => void;
  /** Writes everything waiting: the data files and the log. */
  flush: (why: FlushReason) => Promise<void>;
  /**
   * A flush that has not answered by then is given up (and noted as
   * "timeout"), so one stuck plugin call cannot hold every later flush.
   */
  flushTimeoutMs?: number;
}

/** Android gives an app in the background a few seconds; a flush waits this long at most. */
export const FLUSH_TIMEOUT_MS = 3000;

export interface LifecycleSnapshot {
  state: AppState;
  backgrounds: number;
  foregrounds: number;
  flushes: number;
  /** Flushes that finished writing everything. */
  completed: number;
  lastFlush: "none" | "ok" | "failed" | "timeout";
  /** How long the last flush took, ms. */
  lastFlushMs: number;
}

export class Lifecycle {
  state: AppState = "active";
  private readonly native: boolean;
  private readonly clocks: PausableClock[];
  private readonly stopSound: () => void;
  private readonly onLeave = new Set<() => void>();
  private readonly onBack = new Set<() => void>();
  private flushing: Promise<void> = Promise.resolve();
  private counts = { backgrounds: 0, foregrounds: 0, flushes: 0, completed: 0 };
  private lastFlush: LifecycleSnapshot["lastFlush"] = "none";
  private lastFlushMs = 0;

  constructor(private readonly options: LifecycleOptions) {
    this.native = options.native ?? Capacitor.isNativePlatform();
    this.clocks = options.clocks ?? [gameClock, screenTimeClock];
    this.stopSound = options.stopSound ?? (() => stopPageSound());
  }

  /** Runs `fn` each time the app goes to the background; returns a remover. */
  onBackground(fn: () => void): () => void {
    this.onLeave.add(fn);
    return () => void this.onLeave.delete(fn);
  }

  /** Runs `fn` each time the app comes back; returns a remover. */
  onForeground(fn: () => void): () => void {
    this.onBack.add(fn);
    return () => void this.onBack.delete(fn);
  }

  /** The app went behind another app, or the screen went off. */
  background(): void {
    if (this.state === "background") return;
    this.state = "background";
    this.counts.backgrounds++;
    // sound first and at once: these are all synchronous
    safely(this.stopSound);
    for (const clock of this.clocks) clock.pause();
    for (const fn of this.onLeave) safely(fn);
    this.flush("background");
  }

  /** The app is in front again. */
  foreground(): void {
    if (this.state === "active") return;
    this.state = "active";
    this.counts.foregrounds++;
    for (const clock of this.clocks) clock.resume();
    for (const fn of this.onBack) safely(fn);
  }

  /** Resolves when the flushes started so far are done. */
  idle(): Promise<void> {
    return this.flushing;
  }

  snapshot(): LifecycleSnapshot {
    return { state: this.state, ...this.counts, lastFlush: this.lastFlush, lastFlushMs: this.lastFlushMs };
  }

  private flush(why: FlushReason): void {
    this.counts.flushes++;
    // one after another: a close right after a pause waits for the pause's
    this.flushing = this.flushing.then(async () => {
      const start = performance.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), this.options.flushTimeoutMs ?? FLUSH_TIMEOUT_MS);
      });
      let done: Promise<"ok" | "failed">;
      try {
        done = this.options.flush(why).then(
          () => "ok" as const,
          () => "failed" as const,
        );
      } catch {
        done = Promise.resolve("failed" as const);
      }
      this.lastFlush = await Promise.race([done, late]);
      clearTimeout(timer);
      if (this.lastFlush === "ok") this.counts.completed++;
      this.lastFlushMs = performance.now() - start;
    });
  }

  /** Listens to Android and to the page; returns a function that stops. */
  bind(): () => void {
    const doc = this.options.document ?? (typeof document === "undefined" ? undefined : document);
    const win = this.options.window ?? (typeof window === "undefined" ? undefined : window);
    const onVisibility = () => (doc?.visibilityState === "hidden" ? this.background() : this.foreground());
    const onPageHide = () => {
      this.background();
      this.flush("exit");
    };
    doc?.addEventListener("visibilitychange", onVisibility);
    win?.addEventListener("pagehide", onPageHide);
    // started behind another app (or with the screen off): the clocks wait
    if (doc?.visibilityState === "hidden") this.background();
    const handles: Promise<{ remove(): Promise<void> } | null>[] = [];
    if (this.native) {
      const app = this.options.app ?? (App as unknown as AppEvents);
      const quiet = <T,>(p: Promise<T>) => p.catch(() => null);
      // Android may stop the WebView before the page hears that it is hidden
      handles.push(quiet(app.addListener("pause", () => this.background())));
      handles.push(quiet(app.addListener("resume", () => this.foreground())));
      handles.push(
        quiet(app.addListener("appStateChange", (s) => (s.isActive ? this.foreground() : this.background()))),
      );
    }
    return () => {
      doc?.removeEventListener("visibilitychange", onVisibility);
      win?.removeEventListener("pagehide", onPageHide);
      for (const h of handles) void h.then((l) => l?.remove());
    };
  }
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // one broken part must not stop the rest from pausing and saving
  }
}
