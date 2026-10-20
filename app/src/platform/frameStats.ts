/**
 * The map's frame rate, as one line in the app's log once a minute
 * (docs/app/SDD.md §5: 60 frames a second, the slowest under 50 ms).
 * The old app's `FrameStats` did the same; the line lets the parent's
 * "send log" show how the game ran on the phone.
 */

export const FRAME_LOG_EVERY_MS = 60_000;

export interface FrameSummary {
  frames: number;
  /** Frames a second over the time measured. */
  avgFps: number;
  /** The slowest frame, ms. */
  slowestMs: number;
  /** Frames over 50 ms. */
  slow: number;
}

export const SLOW_FRAME_MS = 50;

export class FrameStats {
  private frames = 0;
  private total = 0;
  private slowest = 0;
  private slow = 0;
  private since: number | null = null;
  private all = { frames: 0, total: 0, slowest: 0, slow: 0 };

  constructor(
    private readonly report: (line: string, summary: FrameSummary) => void,
    private readonly everyMs = FRAME_LOG_EVERY_MS,
  ) {}

  /** One frame of `dtMs`, drawn at `now` (ms). */
  add(dtMs: number, now: number): void {
    if (this.since === null) this.since = now;
    this.frames++;
    this.total += dtMs;
    this.slowest = Math.max(this.slowest, dtMs);
    if (dtMs > SLOW_FRAME_MS) this.slow++;
    this.all.frames++;
    this.all.total += dtMs;
    this.all.slowest = Math.max(this.all.slowest, dtMs);
    if (dtMs > SLOW_FRAME_MS) this.all.slow++;
    if (now - this.since >= this.everyMs) this.flush();
  }

  /** Writes the line for the frames so far, and starts a new minute. */
  flush(): void {
    if (this.frames > 0) {
      const s = summarize(this.frames, this.total, this.slowest, this.slow);
      this.report(
        `map frames: ${s.avgFps.toFixed(1)} fps on average, slowest ${s.slowestMs.toFixed(0)} ms, ${s.slow} over ${SLOW_FRAME_MS} ms (${s.frames} frames)`,
        s,
      );
    }
    this.restart();
  }

  /** Starts a new minute without a line (after a pause: the wait is not a slow frame). */
  restart(): void {
    this.frames = 0;
    this.total = 0;
    this.slowest = 0;
    this.slow = 0;
    this.since = null;
  }

  /** Everything since the map opened (the tests read it). */
  overall(): FrameSummary {
    return summarize(this.all.frames, this.all.total, this.all.slowest, this.all.slow);
  }
}

function summarize(frames: number, total: number, slowest: number, slow: number): FrameSummary {
  return { frames, avgFps: total > 0 ? (frames * 1000) / total : 0, slowestMs: slowest, slow };
}
