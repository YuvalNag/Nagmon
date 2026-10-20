/**
 * Adaptive resolution for the map. The parent's first complaint about
 * the old app was that it was slow, and the CI machines have no GPU, so
 * the phone's own frame rate is the only true measure: if the map cannot
 * keep up at the screen's full pixels, it draws fewer.
 *
 * - The canvas starts at the screen's devicePixelRatio (2.75 on the
 *   family's phone), or at a step this phone kept before.
 * - It is measured in windows of {@link WINDOW_MS} after a warm-up of
 *   {@link WARMUP_MS} (a new map uploads its textures, a resume catches
 *   up, a new canvas size re-uploads). The window's figure is its median
 *   frame: one stall (a garbage collection) does not make a phone slow.
 * - Under {@link MIN_FPS}, the canvas tries one step lower (2.75, 2, 1.5,
 *   never below 1.5). The next window decides:
 *   - at least {@link MIN_GAIN} faster: the step is kept, and saved for
 *     this phone;
 *   - not: the drawing was not what held it back. The step is undone,
 *     nothing is saved, and the map stops adapting until it opens again.
 * - A saved step expires after {@link EXPIRE_STARTS} map starts or
 *   {@link EXPIRE_MS}: the phone is measured afresh (an update, a cooler
 *   phone, fewer apps in the background).
 * - Every change is a line in the app's log, which the parent's "send
 *   log" carries.
 */

/** Frames slower than this rate, most of a window, lower the resolution. */
export const MIN_FPS = 45;
/** A lower step must make the map at least this much faster to be kept. */
export const MIN_GAIN = 1.15;
export const WINDOW_MS = 3000;
export const WARMUP_MS = 1000;
/** The steps below the screen's own ratio; never below the last. */
export const STEPS = [2, 1.5] as const;
export const FLOOR = 1.5;
/** A kept step is measured again after this many map starts, or this long. */
export const EXPIRE_STARTS = 10;
export const EXPIRE_MS = 3 * 24 * 3600 * 1000;
export const STORAGE_KEY = "nagmon.map.renderDpr";
/** "off": never lower it (the browser tests that measure the full-pixel canvas). */
export const ADAPTIVE_KEY = "nagmon.map.adaptiveResolution";

export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ChangeKind = "lowered" | "kept" | "reverted";

export interface Change {
  kind: ChangeKind;
  from: number;
  to: number;
  /** The median frame rate of the window that led to it. */
  fps: number;
  /** For "kept" and "reverted": the rate before the step was tried. */
  before?: number;
}

/** What is saved for this phone. */
interface Saved {
  dpr: number;
  /** When it was kept (ms since the epoch). */
  at: number;
  /** Map starts since then. */
  starts: number;
}

/** The ratios the canvas may draw at on a screen of `deviceDpr`, best first. */
export function ladder(deviceDpr: number): number[] {
  const top = Math.max(deviceDpr, 1);
  return [top, ...STEPS.filter((s) => s < top && s >= FLOOR)];
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** A store that never fails: private windows and previews throw on access. */
function safe(store: Store | null): Store | null {
  if (!store) return null;
  const guard =
    <A extends unknown[], R>(f: (...a: A) => R, fallback: R) =>
    (...a: A): R => {
      try {
        return f(...a);
      } catch {
        return fallback;
      }
    };
  return {
    getItem: guard((k: string) => store.getItem(k), null),
    setItem: guard((k: string, v: string) => store.setItem(k, v), undefined),
    removeItem: guard((k: string) => store.removeItem(k), undefined),
  };
}

function readSaved(raw: string | null): Saved | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Saved>;
    if (typeof s.dpr === "number" && typeof s.at === "number" && typeof s.starts === "number") return s as Saved;
  } catch {
    // not ours
  }
  return null;
}

export class AdaptiveResolution {
  readonly steps: number[];
  /** Whether it may still change this session. */
  adaptive: boolean;
  /** Why the start step is what it is. */
  readonly start: "screen" | "kept" | "expired" | "off";
  private level: number;
  private store: Store | null;
  private since: number | null = null;
  private frames: number[] = [];
  /** A lower step being tried: the level and rate it came from. */
  private trial: { level: number; fps: number } | null = null;
  readonly changes: Change[] = [];

  constructor(
    deviceDpr: number,
    store: Store | null,
    private readonly onChange: (change: Change) => void = () => {},
    now: number = Date.now(),
  ) {
    this.store = safe(store);
    this.steps = ladder(deviceDpr);
    this.level = 0;
    if (this.store?.getItem(ADAPTIVE_KEY) === "off") {
      this.adaptive = false;
      this.start = "off";
      return;
    }
    this.adaptive = true;
    const saved = readSaved(this.store?.getItem(STORAGE_KEY) ?? null);
    const at = saved ? this.steps.indexOf(saved.dpr) : -1;
    if (!saved || at <= 0) {
      if (saved) this.store?.removeItem(STORAGE_KEY);
      this.start = "screen";
      return;
    }
    if (saved.starts + 1 >= EXPIRE_STARTS || now - saved.at >= EXPIRE_MS || now < saved.at) {
      this.store?.removeItem(STORAGE_KEY);
      this.start = "expired";
      return;
    }
    this.store?.setItem(STORAGE_KEY, JSON.stringify({ ...saved, starts: saved.starts + 1 }));
    this.level = at;
    this.start = "kept";
  }

  /** The canvas px per CSS px it draws at now. */
  get dpr(): number {
    return this.steps[this.level];
  }

  /** Starts measuring afresh: a new map, a resume, a new canvas size. */
  reset(): void {
    this.since = null;
    this.frames = [];
  }

  /** One frame of `dtMs`, drawn at `now` (ms). True if the resolution changed. */
  frame(dtMs: number, now: number, clock: number = Date.now()): boolean {
    if (!this.adaptive) return false;
    if (!this.trial && this.level >= this.steps.length - 1) return false;
    if (this.since === null) this.since = now;
    const age = now - this.since;
    if (age < WARMUP_MS) return false;
    this.frames.push(dtMs);
    if (age < WARMUP_MS + WINDOW_MS) return false;
    const fps = 1000 / median(this.frames);
    this.reset();
    if (this.trial) return this.decide(fps, clock);
    if (fps >= MIN_FPS) return false;
    const from = this.dpr;
    this.trial = { level: this.level, fps };
    this.level++;
    return this.report({ kind: "lowered", from, to: this.dpr, fps });
  }

  /** The window after a lower step: keep it, or undo it and stop. */
  private decide(fps: number, clock: number): boolean {
    const trial = this.trial!;
    this.trial = null;
    if (fps >= trial.fps * MIN_GAIN) {
      this.store?.setItem(STORAGE_KEY, JSON.stringify({ dpr: this.dpr, at: clock, starts: 0 } satisfies Saved));
      this.report({ kind: "kept", from: this.steps[trial.level], to: this.dpr, fps, before: trial.fps });
      return false;
    }
    const from = this.dpr;
    this.level = trial.level;
    this.adaptive = false;
    return this.report({ kind: "reverted", from, to: this.dpr, fps, before: trial.fps });
  }

  private report(c: Change): boolean {
    this.changes.push(c);
    this.onChange(c);
    return c.kind !== "kept";
  }
}

/** The app-log line for a change; the parent's "send log" carries it. */
export function changeLine(c: Change): string {
  const before = c.before === undefined ? "" : `${c.before.toFixed(1)} -> `;
  switch (c.kind) {
    case "lowered":
      return `Map resolution lowered: ${c.from} -> ${c.to} canvas px per CSS px (median ${c.fps.toFixed(1)} fps over ${WINDOW_MS / 1000} s); trying it`;
    case "kept":
      return `Map resolution kept at ${c.to} (median ${before}${c.fps.toFixed(1)} fps); saved for this phone`;
    case "reverted":
      return `Map resolution reverted: ${c.from} -> ${c.to} (median ${before}${c.fps.toFixed(1)} fps, not ${Math.round((MIN_GAIN - 1) * 100)}% faster); not changed again this session`;
  }
}

/** The app-log line when a map opens: where the canvas starts, and why. */
export function startLine(r: AdaptiveResolution, deviceDpr: number): string {
  const why = { screen: "", kept: ", kept before on this phone", expired: ", the kept step expired: measuring again", off: ", adaptive off" }[
    r.start
  ];
  return `Map resolution ${r.dpr} canvas px per CSS px (screen ${deviceDpr}${why})`;
}
