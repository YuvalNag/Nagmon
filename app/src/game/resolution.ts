/**
 * Adaptive resolution for the map. The parent's first complaint about
 * the old app was that it was slow, and the CI machines have no GPU, so
 * the phone's own frame rate is the only true measure: if the map cannot
 * keep up at the screen's full pixels, it draws fewer.
 *
 * - The canvas starts at the screen's devicePixelRatio (2.75 on the
 *   family's phone), or at the step this phone was left at before.
 * - It is measured in windows of {@link WINDOW_MS} after a warm-up of
 *   {@link WARMUP_MS} (a new map uploads its textures, a resume catches
 *   up). If the median frame of a window is slower than 45 fps, the map
 *   draws one step lower: 2.75, then 2, then 1.5, never below 1.5. The
 *   median, not the mean: one stall (a garbage collection) does not make
 *   the phone slow; most frames being slow does.
 * - It never goes back up by itself (a phone that was slow once stays
 *   smooth); the step is remembered per device (local storage, which
 *   belongs to this install), and the change is a line in the app's log.
 */

/** Frames slower than this rate, most of a window, lower the resolution. */
export const MIN_FPS = 45;
export const WINDOW_MS = 3000;
export const WARMUP_MS = 1000;
/** The steps below the screen's own ratio; never below the last. */
export const STEPS = [2, 1.5] as const;
export const FLOOR = 1.5;
export const STORAGE_KEY = "nagmon.map.renderDpr";
/** "off": never lower it (the browser tests that measure the full-pixel canvas). */
export const ADAPTIVE_KEY = "nagmon.map.adaptiveResolution";

export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Change {
  from: number;
  to: number;
  /** The window's median frame rate. */
  fps: number;
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
  return {
    getItem: (k) => {
      try {
        return store.getItem(k);
      } catch {
        return null;
      }
    },
    setItem: (k, v) => {
      try {
        store.setItem(k, v);
      } catch {
        // nothing kept: the next start measures again
      }
    },
  };
}

export class AdaptiveResolution {
  readonly steps: number[];
  readonly adaptive: boolean;
  readonly remembered: boolean;
  private level: number;
  private store: Store | null;
  private since: number | null = null;
  private frames: number[] = [];
  readonly changes: Change[] = [];

  constructor(
    deviceDpr: number,
    store: Store | null,
    private readonly onChange: (change: Change) => void = () => {},
  ) {
    this.store = safe(store);
    this.steps = ladder(deviceDpr);
    this.adaptive = this.store?.getItem(ADAPTIVE_KEY) !== "off";
    const kept = Number(this.store?.getItem(STORAGE_KEY));
    const at = this.steps.indexOf(kept);
    this.remembered = this.adaptive && at > 0;
    this.level = this.remembered ? at : 0;
  }

  /** The device px per CSS px the canvas draws at now. */
  get dpr(): number {
    return this.steps[this.level];
  }

  /** Starts measuring afresh: a new map, a resume, a new resolution. */
  reset(): void {
    this.since = null;
    this.frames = [];
  }

  /** One frame of `dtMs`, drawn at `now` (ms). True if the resolution dropped. */
  frame(dtMs: number, now: number): boolean {
    if (!this.adaptive || this.level >= this.steps.length - 1) return false;
    if (this.since === null) this.since = now;
    const age = now - this.since;
    if (age < WARMUP_MS) return false;
    this.frames.push(dtMs);
    if (age < WARMUP_MS + WINDOW_MS) return false;
    const fps = 1000 / median(this.frames);
    this.reset();
    if (fps >= MIN_FPS) return false;
    const change = { from: this.dpr, to: this.steps[this.level + 1], fps };
    this.level++;
    this.store?.setItem(STORAGE_KEY, String(this.dpr));
    this.changes.push(change);
    this.onChange(change);
    return true;
  }
}

/** The app-log line for a change; the parent's "send log" carries it. */
export function changeLine(c: Change): string {
  return `Map resolution lowered: ${c.from} -> ${c.to} canvas px per CSS px (median ${c.fps.toFixed(1)} fps over ${WINDOW_MS / 1000} s); kept for this phone`;
}

/** The app-log line when a map opens: where the canvas starts, and why. */
export function startLine(r: AdaptiveResolution, deviceDpr: number): string {
  const why = r.remembered ? ", lowered before on this phone" : r.adaptive ? "" : ", adaptive off";
  return `Map resolution ${r.dpr} canvas px per CSS px (screen ${deviceDpr}${why})`;
}
