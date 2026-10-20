import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_KEY,
  AdaptiveResolution,
  changeLine,
  ladder,
  startLine,
  STORAGE_KEY,
  type Store,
  WARMUP_MS,
  WINDOW_MS,
} from "../../../src/game/resolution";

function memory(init: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

/** Feeds `ms` of frames of `dt` ms each, from `start`; returns the time reached. */
function run(r: AdaptiveResolution, ms: number, dt: number, start = 0): number {
  let now = start;
  while (now < start + ms) {
    now += dt;
    r.frame(dt, now);
  }
  return now;
}

describe("the map's resolution steps", () => {
  it("are the screen's own ratio, then 2, then 1.5", () => {
    expect(ladder(2.75)).toEqual([2.75, 2, 1.5]);
    expect(ladder(3)).toEqual([3, 2, 1.5]);
    expect(ladder(2)).toEqual([2, 1.5]);
    expect(ladder(1.5)).toEqual([1.5]);
    // a low-density screen keeps its own ratio: never below it, never below 1
    expect(ladder(1)).toEqual([1]);
  });
});

describe("adaptive resolution", () => {
  it("starts at the screen's pixels", () => {
    expect(new AdaptiveResolution(2.75, memory()).dpr).toBe(2.75);
  });

  it("stays there at 60 fps", () => {
    const r = new AdaptiveResolution(2.75, memory());
    run(r, 20_000, 1000 / 60);
    expect(r.dpr).toBe(2.75);
    expect(r.changes).toEqual([]);
  });

  it("drops one step after a slow window, says so and remembers it", () => {
    const store = memory();
    const seen: string[] = [];
    const r = new AdaptiveResolution(2.75, store, (c) => seen.push(`${c.from}->${c.to} at ${c.fps.toFixed(0)}`));
    const t = run(r, WARMUP_MS + WINDOW_MS + 50, 30); // 33 fps
    expect(r.dpr).toBe(2);
    expect(seen).toEqual(["2.75->2 at 33"]);
    expect(store.data[STORAGE_KEY]).toBe("2");
    // one more slow window: 1.5, and never below
    run(r, WARMUP_MS + WINDOW_MS + 50, 30, t);
    expect(r.dpr).toBe(1.5);
    run(r, 30_000, 100);
    expect(r.dpr).toBe(1.5);
    expect(r.changes.map((c) => c.to)).toEqual([2, 1.5]);
  });

  it("does not count the warm-up after a new map or a resume", () => {
    const r = new AdaptiveResolution(2.75, memory());
    // a second of slow frames while textures upload, then smooth
    let t = run(r, WARMUP_MS - 10, 200);
    t = run(r, WINDOW_MS + 500, 1000 / 60, t);
    expect(r.dpr).toBe(2.75);
    r.reset();
    run(r, WARMUP_MS - 10, 500, t);
    expect(r.dpr).toBe(2.75);
  });

  it("is not lowered by one stall in a smooth window (the median, not the mean)", () => {
    const r = new AdaptiveResolution(2.75, memory());
    let t = run(r, WARMUP_MS + 1000, 1000 / 60);
    r.frame(900, (t += 900)); // a garbage collection
    run(r, 2500, 1000 / 60, t);
    expect(r.dpr).toBe(2.75);
  });

  it("is lowered at 40 fps, kept at 50", () => {
    const slow = new AdaptiveResolution(2.75, memory());
    run(slow, WARMUP_MS + WINDOW_MS + 50, 25);
    expect(slow.dpr).toBe(2);
    const fine = new AdaptiveResolution(2.75, memory());
    run(fine, WARMUP_MS + WINDOW_MS + 50, 20);
    expect(fine.dpr).toBe(2.75);
  });

  it("starts at the step this phone was left at", () => {
    const r = new AdaptiveResolution(2.75, memory({ [STORAGE_KEY]: "1.5" }));
    expect(r.dpr).toBe(1.5);
    expect(r.remembered).toBe(true);
  });

  it("ignores a remembered value that is not one of this screen's steps", () => {
    expect(new AdaptiveResolution(2.75, memory({ [STORAGE_KEY]: "0.5" })).dpr).toBe(2.75);
    expect(new AdaptiveResolution(2.75, memory({ [STORAGE_KEY]: "nonsense" })).dpr).toBe(2.75);
  });

  it("can be switched off (the tests that measure the full-pixel canvas)", () => {
    const r = new AdaptiveResolution(2.75, memory({ [ADAPTIVE_KEY]: "off", [STORAGE_KEY]: "1.5" }));
    expect(r.dpr).toBe(2.75);
    run(r, 20_000, 100);
    expect(r.dpr).toBe(2.75);
  });

  it("works with no storage, or storage that throws", () => {
    const broken: Store = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    const r = new AdaptiveResolution(2.75, broken);
    run(r, WARMUP_MS + WINDOW_MS + 50, 30);
    expect(r.dpr).toBe(2);
    expect(new AdaptiveResolution(2.75, null).dpr).toBe(2.75);
  });
});

describe("the log lines", () => {
  it("say what changed, how slow it was, and that it is kept", () => {
    expect(changeLine({ from: 2.75, to: 2, fps: 33.33 })).toBe(
      "Map resolution lowered: 2.75 -> 2 canvas px per CSS px (median 33.3 fps over 3 s); kept for this phone",
    );
  });

  it("say where the canvas starts", () => {
    expect(startLine(new AdaptiveResolution(2.75, memory()), 2.75)).toBe("Map resolution 2.75 canvas px per CSS px (screen 2.75)");
    expect(startLine(new AdaptiveResolution(2.75, memory({ [STORAGE_KEY]: "2" })), 2.75)).toBe(
      "Map resolution 2 canvas px per CSS px (screen 2.75, lowered before on this phone)",
    );
    expect(startLine(new AdaptiveResolution(2.75, memory({ [ADAPTIVE_KEY]: "off" })), 2.75)).toBe(
      "Map resolution 2.75 canvas px per CSS px (screen 2.75, adaptive off)",
    );
  });

  it("are kept by the app's ring log (Nagmon's INFO lines are)", async () => {
    const { RingLog } = await import("../../../src/platform/appLog");
    const ring = new RingLog();
    ring.log("nagmon.map", "INFO", changeLine({ from: 2.75, to: 2, fps: 30 }));
    expect(ring.text()).toContain("INFO nagmon.map: Map resolution lowered: 2.75 -> 2");
  });
});
