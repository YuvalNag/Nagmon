/**
 * The app going to the background and back (docs/app/SDD.md §10): sound
 * stops, the game's clock and the screen-time clock stop, and everything
 * waiting to be written is written, before Android may kill the process.
 */
import { describe, expect, it, vi } from "vitest";
import { LOG_FILE, getLogger, installAppLog, uninstallAppLog } from "../../../src/platform/appLog";
import { Lifecycle, PausableClock, saveEverything, stopPageSound, type AppEvents } from "../../../src/platform/lifecycle";
import { MemoryFileStore, pendingWrites, writeJson } from "../../../src/platform/storage";

/** Stands in for @capacitor/app: keeps the listeners, fires them on demand. */
function fakeApp() {
  const listeners = new Map<string, (data?: unknown) => void>();
  const removed: string[] = [];
  const app: AppEvents = {
    async addListener(event: string, fn: (data: never) => void) {
      listeners.set(event, fn as (data?: unknown) => void);
      return { remove: async () => void removed.push(event) };
    },
  };
  const fire = (event: string, data?: unknown) => listeners.get(event)!(data);
  return { app, listeners, removed, fire };
}

function fakeDocument() {
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const hide = () => {
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
  };
  const show = () => {
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
  };
  return { doc, hide, show };
}

/** A clock the test moves by hand. */
function manualTime() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

describe("a pausable clock", () => {
  it("counts only the time the app is in front", () => {
    const time = manualTime();
    const clock = new PausableClock(time.now);
    time.advance(1000);
    expect(clock.now()).toBe(1000);
    clock.pause();
    time.advance(60_000);
    expect(clock.now()).toBe(1000);
    expect(clock.paused).toBe(true);
    clock.resume();
    time.advance(500);
    expect(clock.now()).toBe(1500);
  });

  it("a second pause or resume changes nothing", () => {
    const time = manualTime();
    const clock = new PausableClock(time.now);
    clock.pause();
    time.advance(100);
    clock.pause();
    time.advance(100);
    clock.resume();
    clock.resume();
    time.advance(10);
    expect(clock.now()).toBe(10);
  });
});

describe("the app's lifecycle", () => {
  it("on Android's pause: stops sound, pauses both clocks, and flushes the saves", async () => {
    const { app, fire, listeners } = fakeApp();
    const { doc } = fakeDocument();
    const time = manualTime();
    const game = new PausableClock(time.now);
    const screen = new PausableClock(time.now);
    const order: string[] = [];
    const life = new Lifecycle({
      native: true,
      app,
      document: doc,
      window: new EventTarget(),
      clocks: [game, screen],
      stopSound: () => order.push("sound"),
      flush: async (why) => void order.push(`flush ${why}`),
    });
    const stop = life.bind();
    await vi.waitFor(() => expect([...listeners.keys()].sort()).toEqual(["appStateChange", "pause", "resume"]));
    time.advance(2000);
    fire("pause");
    expect(life.state).toBe("background");
    expect(game.paused && screen.paused).toBe(true);
    await life.idle();
    // sound first: it must not play on while the disk is written
    expect(order).toEqual(["sound", "flush background"]);
    time.advance(30_000);
    fire("resume");
    expect(life.state).toBe("active");
    time.advance(1000);
    expect(game.now()).toBe(3000);
    expect(screen.now()).toBe(3000);
    stop();
  });

  it("appStateChange, pause and the page's visibility are one change, handled once", async () => {
    const { app, fire, listeners } = fakeApp();
    const { doc, hide, show } = fakeDocument();
    const flush = vi.fn(async () => undefined);
    const stopSound = vi.fn();
    const life = new Lifecycle({ native: true, app, document: doc, window: new EventTarget(), clocks: [], stopSound, flush });
    life.bind();
    await vi.waitFor(() => expect(listeners.size).toBe(3));
    fire("pause");
    fire("appStateChange", { isActive: false });
    hide();
    await life.idle();
    expect(stopSound).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledTimes(1);
    fire("resume");
    fire("appStateChange", { isActive: true });
    show();
    expect(life.snapshot()).toMatchObject({ state: "active", backgrounds: 1, foregrounds: 1, flushes: 1 });
  });

  it("in the browser, hiding the page is going to the background", async () => {
    const { doc, hide, show } = fakeDocument();
    const flush = vi.fn(async () => undefined);
    const clock = new PausableClock(manualTime().now);
    const life = new Lifecycle({ native: false, document: doc, window: new EventTarget(), clocks: [clock], stopSound: () => {}, flush });
    const stop = life.bind();
    hide();
    expect(clock.paused).toBe(true);
    await life.idle();
    expect(flush).toHaveBeenCalledWith("background");
    show();
    expect(clock.paused).toBe(false);
    stop();
    hide();
    expect(clock.paused).toBe(false);
  });

  it("closing the page flushes as an exit", async () => {
    const win = new EventTarget();
    const flush = vi.fn(async () => undefined);
    const life = new Lifecycle({ native: false, document: fakeDocument().doc, window: win, clocks: [], stopSound: () => {}, flush });
    life.bind();
    win.dispatchEvent(new Event("pagehide"));
    await life.idle();
    expect(flush).toHaveBeenCalledWith("exit");
  });

  it("a broken sound or save does not stop the rest", async () => {
    const { doc, hide } = fakeDocument();
    const clock = new PausableClock(manualTime().now);
    const life = new Lifecycle({
      native: false,
      document: doc,
      window: new EventTarget(),
      clocks: [clock],
      stopSound: () => {
        throw new Error("no audio device");
      },
      flush: () => Promise.reject(new Error("disk full")),
    });
    life.bind();
    hide();
    await life.idle();
    expect(clock.paused).toBe(true);
    expect(life.snapshot()).toMatchObject({ flushes: 1, lastFlush: "failed" });
  });

  it("other code can join: a sound to stop, a clock of its own", async () => {
    const { doc, hide, show } = fakeDocument();
    const life = new Lifecycle({ native: false, document: doc, window: new EventTarget(), clocks: [], stopSound: () => {}, flush: async () => {} });
    life.bind();
    const paused: string[] = [];
    const leave = life.onBackground(() => paused.push("music"));
    life.onForeground(() => paused.push("back"));
    hide();
    show();
    leave();
    hide();
    expect(paused).toEqual(["music", "back"]);
  });

  it("unbinding removes the app's listeners", async () => {
    const { app, listeners, removed } = fakeApp();
    const life = new Lifecycle({ native: true, app, document: fakeDocument().doc, window: new EventTarget(), clocks: [], stopSound: () => {}, flush: async () => {} });
    const stop = life.bind();
    await vi.waitFor(() => expect(listeners.size).toBe(3));
    stop();
    await vi.waitFor(() => expect(removed.sort()).toEqual(["appStateChange", "pause", "resume"]));
  });
});

describe("waiting for the writes", () => {
  it("resolves after every write already started on the store", async () => {
    const fs = new MemoryFileStore();
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const real = fs.writeText.bind(fs);
    vi.spyOn(fs, "writeText").mockImplementation(async (p, t) => {
      await slow;
      return real(p, t);
    });
    void writeJson(fs, "a.json", { a: 1 });
    void writeJson(fs, "b.json", { b: 2 });
    let done = false;
    const all = pendingWrites(fs).then(() => (done = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(done).toBe(false);
    release();
    await all;
    expect(JSON.parse((await fs.readText("a.json"))!)).toEqual({ a: 1 });
    expect(JSON.parse((await fs.readText("b.json"))!)).toEqual({ b: 2 });
  });

  it("is at once done when nothing is being written", async () => {
    await expect(pendingWrites(new MemoryFileStore())).resolves.toBeUndefined();
  });
});

describe("the app's flush", () => {
  it("finishes the data files, then saves the log as a background ending", async () => {
    const fs = new MemoryFileStore();
    await installAppLog(fs, { clock: () => new Date(Date.UTC(2026, 9, 20, 8, 0, 0)) });
    try {
      getLogger("nagmon.test").info("before the pause");
      void writeJson(fs, "profiles/p1/profile.json", { id: "p1" });
      const { app, fire, listeners } = fakeApp();
      const life = new Lifecycle({
        native: true,
        app,
        document: fakeDocument().doc,
        window: new EventTarget(),
        clocks: [],
        stopSound: () => {},
        flush: (why) => saveEverything(fs, why),
      });
      life.bind();
      await vi.waitFor(() => expect(listeners.size).toBe(3));
      fire("pause");
      await life.idle();
      expect(await fs.readText("profiles/p1/profile.json")).toContain("p1");
      const saved = (await fs.readText(LOG_FILE))!;
      expect(saved).toContain("before the pause");
      expect(saved.trimEnd().endsWith("--- saved: background")).toBe(true);
      expect(life.snapshot().lastFlush).toBe("ok");
    } finally {
      uninstallAppLog();
    }
  });
});

describe("stopping the page's sound", () => {
  it("pauses every audio and video element, and the speech", () => {
    document.body.innerHTML = "<audio></audio><video></video><audio></audio>";
    const paused: string[] = [];
    for (const m of document.querySelectorAll<HTMLMediaElement>("audio, video")) {
      m.pause = () => void paused.push(m.tagName);
    }
    const cancel = vi.fn();
    vi.stubGlobal("speechSynthesis", { cancel });
    try {
      stopPageSound(document);
      expect(paused).toEqual(["AUDIO", "VIDEO", "AUDIO"]);
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      document.body.innerHTML = "";
    }
  });
});
