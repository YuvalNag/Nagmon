/**
 * The pace of a round's animations (docs/app/BATTLE_V3.md, 9.1 and 9.2): a
 * sequence of waits that a tap speeds up (2x) and a second tap skips to the
 * end. The caller `await`s `wait(ms)` for each beat; `tap()` is the child's
 * tap on the arena. A scale below 1 makes everything shorter (the tests, and
 * calm effects).
 */

export type Timer = { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void; now: () => number };

const real: Timer = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>), now: () => performance.now() };

export class Pace {
  private rate = 1;
  private skipped = false;
  private current: { end: number; at: number; fn: () => void; id: unknown } | null = null;

  constructor(
    /** 1 is the real time; the tests and calm effects use less. */
    private readonly scale = 1,
    private readonly timer: Timer = real,
  ) {}

  /** The speed now (1, then 2 after a tap). */
  get speed(): number {
    return this.rate;
  }

  /** True once a second tap skipped the rest of the sequence. */
  get done(): boolean {
    return this.skipped;
  }

  /** Waits `ms` (scaled, and faster after a tap); resolves at once when the sequence was skipped. */
  wait(ms: number): Promise<void> {
    if (this.skipped) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const left = (ms * this.scale) / this.rate;
      const rec = { end: this.timer.now() + left, at: ms * this.scale, fn: resolve, id: null as unknown };
      rec.id = this.timer.set(() => {
        if (this.current === rec) this.current = null;
        resolve();
      }, left);
      this.current = rec;
    });
  }

  /** The child taps the arena: the first tap speeds the sequence up, the second skips to its end. */
  tap(): void {
    if (this.skipped) return;
    if (this.rate === 1) {
      this.rate = 2;
      const c = this.current;
      if (c) {
        // what is left of this wait now takes half the time
        this.timer.clear(c.id);
        const left = Math.max(0, (c.end - this.timer.now()) / 2);
        c.end = this.timer.now() + left;
        c.id = this.timer.set(() => {
          if (this.current === c) this.current = null;
          c.fn();
        }, left);
      }
      return;
    }
    this.skip();
  }

  /** Ends everything now. */
  skip(): void {
    this.skipped = true;
    const c = this.current;
    if (c) {
      this.timer.clear(c.id);
      this.current = null;
      c.fn();
    }
  }

  /** The sequence is over: the next one starts at normal speed. */
  reset(): void {
    this.rate = 1;
    this.skipped = false;
    this.current = null;
  }
}
