/**
 * The app's own log (port of tests/nagmon/test_app_log.py, 19 cases):
 * the last 400 lines, keys hidden when written, Nagmon's INFO and
 * everyone's warnings, kept on disk so it can be sent after the game
 * opens again.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LOG_FILE,
  MAX_LINES,
  RingLog,
  appLogTail,
  appLogText,
  buildInfo,
  currentAppLog,
  getLogger,
  installAppLog,
  noteCrash,
  saveAppLog,
  uninstallAppLog,
} from "../../../src/platform/appLog";
import { type FileStore, MemoryFileStore } from "../../../src/platform/storage";

const TOKEN = "github_pat_TEST" + "11ABCDEFG0".repeat(6);
const SAVED = "plainsecret123456";
const NOW = new Date(Date.UTC(2026, 9, 19, 14, 30, 5));
const clock = () => NOW;

function ring(): RingLog {
  return new RingLog({ secrets: () => [SAVED], clock });
}

afterEach(() => {
  uninstallAppLog();
});

describe("ring log", () => {
  it("a line has the time, level, logger and message", () => {
    const r = ring();
    r.log("nagmon.runtime", "INFO", "Active child: p1a2b3");
    expect(r.lines()).toEqual(["14:30:05 INFO nagmon.runtime: Active child: p1a2b3"]);
  });

  it("errors carry their stack", () => {
    const r = ring();
    r.log("nagmon.x", "ERROR", "failed", new RangeError("bad value"));
    const text = r.text();
    expect(text).toContain("14:30:05 ERROR nagmon.x: failed");
    expect(text).toContain("RangeError: bad value");
    expect(text).toMatch(/\n\s+at /);
  });

  it("keeps no more than 400 lines", () => {
    const r = ring();
    for (let i = 0; i < 1000; i++) r.log("nagmon.x", "INFO", `line ${i}`);
    const lines = r.lines();
    expect(lines).toHaveLength(MAX_LINES);
    expect(MAX_LINES).toBe(400);
    expect(lines.at(-1)!.endsWith("line 999")).toBe(true);
    expect(lines[0]!.endsWith("line 600")).toBe(true);
  });

  it("a multi-line message still fits", () => {
    const r = ring();
    r.log("nagmon.x", "WARNING", Array(900).fill("x").join("\n"));
    expect(r.lines()).toHaveLength(400);
  });

  it("hides keys as they are written", () => {
    const r = ring();
    r.log("nagmon.x", "WARNING", `token ${TOKEN} and ${SAVED}`);
    r.log("nagmon.x", "WARNING", "Authorization: Bearer abc.def");
    const text = r.text();
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain(SAVED);
    expect(text).not.toContain("abc.def");
    expect(text).toContain("token ***");
  });

  it("hides every kind of token, saved keys and the children's names, as written and on disk", async () => {
    const fs = new MemoryFileStore();
    // made-up names: one Hebrew (also after a prefix letter), one Latin
    const r = new RingLog({ secrets: () => [SAVED], names: async () => ["דנית", "Tomer"], clock });
    await r.refreshSecrets();
    const keys = {
      classic: "ghp_" + "A1b2C3d4".repeat(5),
      fineGrained: TOKEN,
      openai: "sk-" + "proj_" + "x9Y8z7".repeat(6),
      groq: "gsk_" + "Q1w2E3r4".repeat(6),
      google: "AIza" + "Sy".repeat(18),
    };
    r.log("nagmon.x", "WARNING", `keys ${Object.values(keys).join(" ")} saved ${SAVED}`);
    r.log("nagmon.x", "INFO", "לדנית יש 3 כוכבים; Tomer finished the map; tomer again");
    for (const text of [r.text(), (await r.save(fs, "log.txt"), (await fs.readText("log.txt"))!)]) {
      for (const secret of [...Object.values(keys), SAVED, "דנית", "Tomer", "tomer"]) expect(text).not.toContain(secret);
      expect(text).toContain("ל<child> יש 3 כוכבים; <child> finished the map; <child> again");
    }
  });

  it("a name added after the log started is hidden at the latest when saved", async () => {
    const fs = new MemoryFileStore();
    const names: string[] = [];
    const r = new RingLog({ names: () => names, clock });
    await r.refreshSecrets();
    r.log("nagmon.x", "INFO", "hello Gali");
    names.push("Gali");
    await r.save(fs, "log.txt");
    expect(await fs.readText("log.txt")).not.toContain("Gali");
  });

  it("a failing secrets source does not break logging", async () => {
    const r = new RingLog({
      secrets: () => {
        throw new Error("disk");
      },
      clock,
    });
    r.log("nagmon.x", "WARNING", `hi ${TOKEN}`);
    expect(r.lines()).toEqual(["14:30:05 WARNING nagmon.x: hi ***"]);
    const rejecting = new RingLog({ secrets: () => Promise.reject(new Error("keystore")), clock });
    rejecting.log("nagmon.x", "WARNING", "still here");
    await rejecting.refreshSecrets();
    expect(rejecting.lines()).toEqual(["14:30:05 WARNING nagmon.x: still here"]);
  });

  it("async secrets (the Keystore) are hidden once known, and always on save", async () => {
    const fs = new MemoryFileStore();
    const r = new RingLog({ secrets: async () => [SAVED], clock });
    r.log("nagmon.x", "WARNING", `early ${SAVED}`);
    await r.save(fs, "log.txt");
    expect(await fs.readText("log.txt")).not.toContain(SAVED);
    expect(r.text()).toContain("early ***");
    r.log("nagmon.x", "WARNING", `later ${SAVED}`);
    expect(r.text()).toContain("later ***");
  });

  it.each([
    ["nagmon.runtime", "INFO", true],
    ["nagmon", "INFO", true],
    ["nagmon.runtime", "DEBUG", false],
    ["phaser", "INFO", false],
    ["phaser", "WARNING", true],
    ["nagmonish", "INFO", false],
    ["root", "ERROR", true],
  ] as const)("keeps %s at %s: %s", (name, level, kept) => {
    const r = ring();
    r.log(name, level, "msg");
    expect(r.lines().length > 0).toBe(kept);
  });

  it("tail gives the last lines", () => {
    const r = ring();
    for (let i = 0; i < 150; i++) r.log("nagmon.x", "INFO", `line ${i}`);
    const tail = r.tail(100).split("\n").filter(Boolean);
    expect(tail).toHaveLength(100);
    expect(tail.at(-1)!.endsWith("line 149")).toBe(true);
  });
});

describe("the log file", () => {
  it("keeps the previous log as .bak", async () => {
    const fs = new MemoryFileStore();
    const r = ring();
    r.log("nagmon.x", "INFO", "one");
    await r.save(fs, "app_log.txt", { ending: "exit" });
    r.log("nagmon.x", "INFO", "two");
    await r.save(fs, "app_log.txt", { ending: "exit" });
    expect(await fs.readText("app_log.txt.bak")).not.toContain("two");
    expect(await fs.readText("app_log.txt")).toContain("two");
    expect(await fs.stat("app_log.txt.tmp")).toBeNull();
  });

  it("a save cut short is read from the .tmp, then from the .bak", async () => {
    const fs = new MemoryFileStore();
    await fs.writeText("app_log.txt.bak", "older\n--- saved: exit\n");
    await fs.writeText("app_log.txt.tmp", "newer\n--- saved: background\n");
    const a = new RingLog({ clock });
    expect(await a.load(fs, "app_log.txt")).toBe("background");
    expect(a.lines()[0]).toBe("newer");
    await fs.remove("app_log.txt");
    await fs.remove("app_log.txt.tmp");
    const b = new RingLog({ clock });
    expect(await b.load(fs, "app_log.txt")).toBe("exit");
    expect(b.lines()[0]).toBe("older");
  });

  it("a huge message does not overflow the stack and keeps the end", () => {
    const r = ring();
    r.log("nagmon.x", "WARNING", Array.from({ length: 300_000 }, (_, i) => `l${i}`).join("\n"));
    expect(r.lines()).toHaveLength(400);
    expect(r.lines().at(-1)).toBe("l299999");
  });

  it("is saved and loaded with the way the session ended", async () => {
    const fs = new MemoryFileStore();
    const r = ring();
    r.log("nagmon.x", "INFO", `before ${TOKEN}`);
    await r.save(fs, "nagmon/app_log.txt", { ending: "crash" });
    expect(await fs.readText("nagmon/app_log.txt")).not.toContain(TOKEN);
    const again = new RingLog({ clock });
    expect(await again.load(fs, "nagmon/app_log.txt")).toBe("crash");
    expect(again.lines().some((l) => l.endsWith("before ***"))).toBe(true);
  });

  it("loading keeps the newest lines", async () => {
    const fs = new MemoryFileStore();
    await fs.writeText("app_log.txt", Array.from({ length: 500 }, (_, i) => `old ${i}`).join("\n") + "\n");
    const again = new RingLog({ clock });
    expect(await again.load(fs, "app_log.txt")).toBe("unknown");
    expect(again.lines()).toHaveLength(400);
    expect(again.lines().at(-1)).toBe("old 499");
  });

  it("a missing log file is fine", async () => {
    expect(await new RingLog().load(new MemoryFileStore(), "none.txt")).toBeNull();
  });

  it("an odd character does not stop saving", async () => {
    const fs = new MemoryFileStore();
    const r = ring();
    r.log("nagmon.x", "WARNING", "no file a\udcffb");
    await r.save(fs, "log.txt");
    const text = (await fs.readText("log.txt"))!;
    expect(text).toContain("no file a?b");
    expect(text).not.toMatch(/[\uD800-\uDFFF]/);
  });
});

describe("the app's log", () => {
  async function previous(fs: FileStore, ending: string, line = "last session"): Promise<void> {
    const old = new RingLog({ clock });
    old.log("nagmon.x", "INFO", line);
    await old.save(fs, LOG_FILE, { ending });
  }

  it("install writes a start line and reads the last session", async () => {
    const fs = new MemoryFileStore();
    await previous(fs, "exit");
    const r = await installAppLog(fs, {
      details: { version: "0.4.35", build: "11", device: "Pixel TEST" },
      secrets: () => [SAVED],
      clock,
    });
    expect(await installAppLog(fs)).toBe(r); // once only
    expect(currentAppLog()).toBe(r);
    getLogger("nagmon.test_app_log").info(`now ${SAVED}`);
    const lines = r.lines();
    expect(lines.some((l) => l.endsWith("last session"))).toBe(true);
    const start = lines.find((l) => l.startsWith("=== Nagmon"))!;
    expect(start).toContain("0.4.35");
    expect(start).toContain("build 11");
    expect(start).toContain("Pixel TEST");
    expect(start).toContain("previous exit: normal");
    expect(start).toContain("2026-10-19 14:30 UTC");
    expect(lines.at(-1)!.endsWith("now ***")).toBe(true);
    await saveAppLog({ ending: "background" });
    expect((await fs.readText(LOG_FILE))!.trimEnd().endsWith("--- saved: background")).toBe(true);
    uninstallAppLog();
    expect(currentAppLog()).toBeNull();
  });

  it("does not wait for slow keys (the Keystore's first use), and still hides them", async () => {
    const fs = new MemoryFileStore();
    let answer!: (keys: string[]) => void;
    const keys = new Promise<string[]>((r) => (answer = r));
    const r = await installAppLog(fs, { clock, secrets: () => keys });
    getLogger("nagmon.x").warning(`early ${SAVED}`);
    answer([SAVED]);
    await r.save(fs, LOG_FILE);
    expect(r.text()).not.toContain(SAVED);
    expect(await fs.readText(LOG_FILE)).not.toContain(SAVED);
  });

  it("the first run says so", async () => {
    const r = await installAppLog(new MemoryFileStore(), { clock });
    expect(r.lines().find((l) => l.startsWith("=== Nagmon"))).toContain("previous exit: none (first run)");
  });

  it("after a crash the start line says so", async () => {
    const fs = new MemoryFileStore();
    await previous(fs, "crash");
    const r = await installAppLog(fs, { clock });
    expect(r.lines().find((l) => l.startsWith("=== Nagmon"))).toContain("previous exit: crash");
  });

  it("a noted crash is saved as a crash", async () => {
    const fs = new MemoryFileStore();
    await installAppLog(fs, { clock });
    noteCrash();
    await saveAppLog();
    expect((await fs.readText(LOG_FILE))!.trimEnd().endsWith("--- saved: crash")).toBe(true);
  });

  it("without install the helpers do nothing", async () => {
    uninstallAppLog();
    await saveAppLog();
    getLogger("nagmon.x").warning("nobody listens");
    expect(appLogTail(100)).toBe("");
    expect(appLogText()).toBe("");
  });

  it("buildInfo names a version", () => {
    const info = buildInfo();
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info.build).toBeTruthy();
  });

  it("other code's console warnings and errors reach the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const r = await installAppLog(new MemoryFileStore(), { clock });
      console.warn("WebGL context lost", 3);
      console.error(new Error(`fetch failed ${TOKEN}`));
      const text = r.text();
      expect(text).toContain("WARNING console: WebGL context lost 3");
      expect(text).toContain("ERROR console: Error: fetch failed ***");
      expect(warn).toHaveBeenCalledWith("WebGL context lost", 3);
      uninstallAppLog();
      console.warn("after");
      expect(r.text()).not.toContain("after");
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("saving never throws", async () => {
    const fs = new MemoryFileStore();
    const r = await installAppLog(fs, { clock });
    vi.spyOn(r, "save").mockRejectedValue(new Error("odd"));
    await expect(saveAppLog({ ending: "background" })).resolves.toBeUndefined();
  });
});
