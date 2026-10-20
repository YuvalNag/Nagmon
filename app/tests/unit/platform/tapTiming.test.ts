import { afterEach, describe, expect, it } from "vitest";
import { installTapTiming, MAX_TAPS, tapTimes } from "../../../src/platform/tapTiming";

const nextFrames = () => new Promise((r) => setTimeout(r, 60));
let uninstall: (() => void) | null = null;
afterEach(() => {
  uninstall?.();
  uninstall = null;
});

describe("tap timing", () => {
  it("records, for a tap, the time until the next frame was drawn", async () => {
    uninstall = installTapTiming(window);
    window.dispatchEvent(new PointerEvent("pointerup"));
    await nextFrames();
    const times = tapTimes(window);
    expect(times).toHaveLength(1);
    expect(times[0]).toBeGreaterThanOrEqual(0);
    expect(times[0]).toBeLessThan(1000);
    expect((window as unknown as { __responses: number[] }).__responses).toBe(times);
  });

  it(`keeps the last ${MAX_TAPS} taps only`, async () => {
    uninstall = installTapTiming(window);
    for (let i = 0; i < MAX_TAPS + 10; i++) window.dispatchEvent(new PointerEvent("pointerup"));
    await nextFrames();
    expect(tapTimes(window).length).toBe(MAX_TAPS);
  });

  it("stops when uninstalled", async () => {
    uninstall = installTapTiming(window);
    uninstall();
    uninstall = null;
    const before = tapTimes(window).length;
    window.dispatchEvent(new PointerEvent("pointerup"));
    await nextFrames();
    expect(tapTimes(window).length).toBe(before);
  });
});
