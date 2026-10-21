import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCalm, play, playing, setCalm, shake, skip, speed } from "../../../src/ui/battle/fx";
import { Pace } from "../../../src/ui/battle/pace";

describe("Pace (tap to speed up, tap again to skip)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits the time it was asked (scaled)", async () => {
    const p = new Pace(1);
    let done = false;
    void p.wait(1000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
    const q = new Pace(0.1);
    let d2 = false;
    void q.wait(1000).then(() => (d2 = true));
    await vi.advanceTimersByTimeAsync(101);
    expect(d2).toBe(true);
  });

  it("a tap makes what is left take half the time; the next waits take half too", async () => {
    const p = new Pace(1);
    let done = false;
    void p.wait(1000).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(400);
    p.tap();
    expect(p.speed).toBe(2);
    await vi.advanceTimersByTimeAsync(299);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(5);
    expect(done).toBe(true);
    let next = false;
    void p.wait(1000).then(() => (next = true));
    await vi.advanceTimersByTimeAsync(501);
    expect(next).toBe(true);
  });

  it("a second tap skips: the wait ends now and every later wait ends at once", async () => {
    const p = new Pace(1);
    let a = false;
    void p.wait(5000).then(() => (a = true));
    p.tap();
    p.tap();
    await vi.advanceTimersByTimeAsync(0);
    expect(a).toBe(true);
    expect(p.done).toBe(true);
    let b = false;
    void p.wait(5000).then(() => (b = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(b).toBe(true);
    p.reset();
    expect([p.done, p.speed]).toEqual([false, 1]);
  });

  it("a tap with nothing waiting is harmless", () => {
    const p = new Pace(1);
    p.tap();
    p.tap();
    expect(p.done).toBe(true);
  });
});

describe("fx (WAAPI)", () => {
  afterEach(() => {
    setCalm(false);
    speed(1);
    skip();
  });

  function fake() {
    const calls: { kf: Keyframe[]; o: KeyframeAnimationOptions; a: { playbackRate: number; finish: () => void } }[] = [];
    const el = {
      animate(kf: Keyframe[], o: KeyframeAnimationOptions) {
        let resolve!: () => void;
        const finished = new Promise<void>((r) => (resolve = r));
        const a = { playbackRate: 1, finished, finish: () => resolve() };
        calls.push({ kf, o, a });
        return a;
      },
    } as unknown as HTMLElement;
    return { el, calls };
  }

  it("without element.animate everything finishes at once", async () => {
    await play({} as unknown as Element, [{ opacity: 1 }], { ms: 100 });
    await play(null, [], { ms: 100 });
    expect(playing()).toBe(0);
  });

  it("plays the keyframes, speeds up what is running and skips it to the end", async () => {
    const { el, calls } = fake();
    const p = play(el, [{ opacity: 0 }, { opacity: 1 }], { ms: 500 });
    expect(playing()).toBe(1);
    expect(calls[0]!.o.duration).toBe(500);
    speed(2);
    expect(calls[0]!.a.playbackRate).toBe(2);
    skip();
    await p;
    expect(playing()).toBe(0);
  });

  it("calm effects: movement does not play, a fade does", async () => {
    setCalm(true);
    expect(isCalm()).toBe(true);
    const { el, calls } = fake();
    await shake(el);
    expect(calls).toHaveLength(0);
    const f = play(el, [{ opacity: 0.5 }, { opacity: 1 }], { ms: 100, fade: true });
    expect(calls).toHaveLength(1);
    skip();
    await f;
  });

  it("a shake is small and short: at most 6 px, 200 ms", () => {
    const { el, calls } = fake();
    void shake(el, 40);
    const xs = calls[0]!.kf.map((k) => Math.abs(Number(String(k.transform).match(/-?\d+(\.\d+)?/)?.[0] ?? 0)));
    expect(Math.max(...xs)).toBeLessThanOrEqual(6);
    expect(calls[0]!.o.duration).toBe(200);
    skip();
  });
});
