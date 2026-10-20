import { describe, expect, it } from "vitest";
import {
  ADAPTIVE_KEY,
  AdaptiveResolution,
  type Change,
  changeLine,
  EXPIRE_MS,
  EXPIRE_STARTS,
  ladder,
  startLine,
  STORAGE_KEY,
  type Store,
  WARMUP_MS,
  WINDOW_MS,
} from "../../../src/game/resolution";

const DAY = 24 * 3600 * 1000;
const NOW = 1_800_000_000_000;

function memory(init: Record<string, string> = {}): Store & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
  };
}

const saved = (dpr: number, at = NOW, starts = 0) => JSON.stringify({ dpr, at, starts });

/** One measuring window (warm-up and window) of frames of `dt` ms, from `start`; the time reached. */
function window_(r: AdaptiveResolution, dt: number, start = 0): number {
  let now = start;
  while (now < start + WARMUP_MS + WINDOW_MS + 50) {
    now += dt;
    if (r.frame(dt, now, NOW)) r.reset(); // the map resets after a change (a new canvas size)
  }
  return now;
}

function run(r: AdaptiveResolution, ms: number, dt: number, start = 0): number {
  let now = start;
  while (now < start + ms) {
    now += dt;
    if (r.frame(dt, now, NOW)) r.reset();
  }
  return now;
}

const kinds = (r: AdaptiveResolution) => r.changes.map((c) => `${c.kind} ${c.from}->${c.to}`);

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
  it("starts at the screen's pixels and stays there at 60 fps", () => {
    const r = new AdaptiveResolution(2.75, memory(), undefined, NOW);
    expect(r.dpr).toBe(2.75);
    run(r, 20_000, 1000 / 60);
    expect(r.dpr).toBe(2.75);
    expect(r.changes).toEqual([]);
  });

  it("tries one step lower after a slow window, and keeps and saves it when it is faster", () => {
    const store = memory();
    const r = new AdaptiveResolution(2.75, store, undefined, NOW);
    let t = window_(r, 30); // 33 fps
    expect(r.dpr).toBe(2);
    expect(store.data[STORAGE_KEY]).toBeUndefined(); // only tried so far
    t = window_(r, 25, t); // 40 fps: 20% faster
    expect(kinds(r)).toEqual(["lowered 2.75->2", "kept 2.75->2"]);
    expect(JSON.parse(store.data[STORAGE_KEY])).toEqual({ dpr: 2, at: NOW, starts: 0 });
    // still under 45: the next step is tried, and kept when it helps
    t = window_(r, 25, t);
    window_(r, 18, t); // 55 fps
    expect(r.dpr).toBe(1.5);
    expect(kinds(r)).toEqual(["lowered 2.75->2", "kept 2.75->2", "lowered 2->1.5", "kept 2->1.5"]);
    expect(JSON.parse(store.data[STORAGE_KEY]).dpr).toBe(1.5);
    // never below 1.5
    run(r, 30_000, 100);
    expect(r.dpr).toBe(1.5);
  });

  it("undoes a step that is not 15% faster, saves nothing and stops adapting", () => {
    const store = memory();
    const seen: Change[] = [];
    const r = new AdaptiveResolution(2.75, store, (c) => seen.push(c), NOW);
    let t = window_(r, 30); // 33 fps
    expect(r.dpr).toBe(2);
    t = window_(r, 28, t); // 35.7 fps: 7% faster, the drawing was not the problem
    expect(r.dpr).toBe(2.75);
    expect(kinds(r)).toEqual(["lowered 2.75->2", "reverted 2->2.75"]);
    expect(seen.at(-1)).toMatchObject({ kind: "reverted", before: expect.closeTo(33.3, 1) });
    expect(store.data[STORAGE_KEY]).toBeUndefined();
    expect(r.adaptive).toBe(false);
    // slow on, but no more changes this session
    run(r, 30_000, 40, t);
    expect(r.dpr).toBe(2.75);
    expect(r.changes).toHaveLength(2);
  });

  it("undoes a second step and keeps the first one saved", () => {
    const store = memory();
    const r = new AdaptiveResolution(2.75, store, undefined, NOW);
    let t = window_(r, 40); // 25 fps
    t = window_(r, 30, t); // 33 fps: kept at 2
    t = window_(r, 30, t); // still slow: try 1.5
    window_(r, 29, t); // no better: back to 2
    expect(r.dpr).toBe(2);
    expect(kinds(r).at(-1)).toBe("reverted 1.5->2");
    expect(JSON.parse(store.data[STORAGE_KEY]).dpr).toBe(2);
  });

  it("does not count the warm-up after a new map or a resume", () => {
    const r = new AdaptiveResolution(2.75, memory(), undefined, NOW);
    let t = run(r, WARMUP_MS - 10, 200); // texture uploads
    t = run(r, WINDOW_MS + 500, 1000 / 60, t);
    expect(r.dpr).toBe(2.75);
    r.reset();
    run(r, WARMUP_MS - 10, 500, t);
    expect(r.dpr).toBe(2.75);
  });

  it("is not lowered by one stall in a smooth window (the median, not the mean)", () => {
    const r = new AdaptiveResolution(2.75, memory(), undefined, NOW);
    let t = run(r, WARMUP_MS + 1000, 1000 / 60);
    r.frame(900, (t += 900), NOW); // a garbage collection
    run(r, 2500, 1000 / 60, t);
    expect(r.dpr).toBe(2.75);
  });

  it("is lowered at 40 fps, not at 50", () => {
    const slow = new AdaptiveResolution(2.75, memory(), undefined, NOW);
    window_(slow, 25);
    expect(slow.dpr).toBe(2);
    const fine = new AdaptiveResolution(2.75, memory(), undefined, NOW);
    window_(fine, 20);
    expect(fine.dpr).toBe(2.75);
  });

  it("starts at the step this phone kept, and counts the start", () => {
    const store = memory({ [STORAGE_KEY]: saved(1.5, NOW - DAY, 2) });
    const r = new AdaptiveResolution(2.75, store, undefined, NOW);
    expect(r.dpr).toBe(1.5);
    expect(r.start).toBe("kept");
    expect(JSON.parse(store.data[STORAGE_KEY]).starts).toBe(3);
  });

  it("measures afresh when the kept step is old or used often", () => {
    const old = memory({ [STORAGE_KEY]: saved(2, NOW - EXPIRE_MS) });
    const a = new AdaptiveResolution(2.75, old, undefined, NOW);
    expect([a.dpr, a.start]).toEqual([2.75, "expired"]);
    expect(old.data[STORAGE_KEY]).toBeUndefined();
    const used = memory({ [STORAGE_KEY]: saved(2, NOW - 1000, EXPIRE_STARTS - 1) });
    expect(new AdaptiveResolution(2.75, used, undefined, NOW).start).toBe("expired");
    // a clock set back (a date from the future) is not trusted either
    const future = memory({ [STORAGE_KEY]: saved(2, NOW + DAY) });
    expect(new AdaptiveResolution(2.75, future, undefined, NOW).start).toBe("expired");
    // the starts before the limit keep it
    let store = memory({ [STORAGE_KEY]: saved(2, NOW - 1000) });
    for (let i = 0; i < EXPIRE_STARTS - 1; i++) {
      const r = new AdaptiveResolution(2.75, store, undefined, NOW);
      expect(r.start).toBe("kept");
      store = memory(store.data);
    }
    expect(new AdaptiveResolution(2.75, store, undefined, NOW).start).toBe("expired");
  });

  it("ignores a saved value that is not one of this screen's steps, or not its own", () => {
    for (const raw of [saved(0.5), saved(2.75), "1.5", "nonsense", JSON.stringify({ dpr: 2 })]) {
      const r = new AdaptiveResolution(2.75, memory({ [STORAGE_KEY]: raw }), undefined, NOW);
      expect([r.dpr, r.start], raw).toEqual([2.75, "screen"]);
    }
  });

  it("can be switched off (the tests that measure the full-pixel canvas)", () => {
    const r = new AdaptiveResolution(2.75, memory({ [ADAPTIVE_KEY]: "off", [STORAGE_KEY]: saved(1.5) }), undefined, NOW);
    expect([r.dpr, r.start]).toEqual([2.75, "off"]);
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
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const r = new AdaptiveResolution(2.75, broken, undefined, NOW);
    const t = window_(r, 30);
    window_(r, 20, t);
    expect(r.dpr).toBe(2);
    expect(new AdaptiveResolution(2.75, null).dpr).toBe(2.75);
  });
});

describe("the log lines", () => {
  it("say what changed, how fast it was, and what was kept", () => {
    expect(changeLine({ kind: "lowered", from: 2.75, to: 2, fps: 33.33 })).toBe(
      "Map resolution lowered: 2.75 -> 2 canvas px per CSS px (median 33.3 fps over 3 s); trying it",
    );
    expect(changeLine({ kind: "kept", from: 2.75, to: 2, fps: 40, before: 33.33 })).toBe(
      "Map resolution kept at 2 (median 33.3 -> 40.0 fps); saved for this phone",
    );
    expect(changeLine({ kind: "reverted", from: 2, to: 2.75, fps: 35, before: 33.33 })).toBe(
      "Map resolution reverted: 2 -> 2.75 (median 33.3 -> 35.0 fps, not 15% faster); not changed again this session",
    );
  });

  it("say where the canvas starts", () => {
    const line = (init: Record<string, string>) => startLine(new AdaptiveResolution(2.75, memory(init), undefined, NOW), 2.75);
    expect(line({})).toBe("Map resolution 2.75 canvas px per CSS px (screen 2.75)");
    expect(line({ [STORAGE_KEY]: saved(2) })).toBe("Map resolution 2 canvas px per CSS px (screen 2.75, kept before on this phone)");
    expect(line({ [STORAGE_KEY]: saved(2, NOW - EXPIRE_MS) })).toBe(
      "Map resolution 2.75 canvas px per CSS px (screen 2.75, the kept step expired: measuring again)",
    );
    expect(line({ [ADAPTIVE_KEY]: "off" })).toBe("Map resolution 2.75 canvas px per CSS px (screen 2.75, adaptive off)");
  });

  it("are kept by the app's ring log (Nagmon's INFO lines are)", async () => {
    const { RingLog } = await import("../../../src/platform/appLog");
    const ring = new RingLog();
    ring.log("nagmon.map", "INFO", changeLine({ kind: "reverted", from: 2, to: 2.75, fps: 30, before: 29 }));
    expect(ring.text()).toContain("INFO nagmon.map: Map resolution reverted: 2 -> 2.75");
  });
});
