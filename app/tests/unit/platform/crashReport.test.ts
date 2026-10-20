/**
 * The crash report (port of the portable cases of
 * tests/nagmon/test_crash_report.py): what is caught, what the report
 * holds and hides, and that nothing leaves the phone without the
 * parent's tap.
 *
 * Not ported (Python or Tuxemon only): the real segfault through
 * faulthandler, Tuxemon's handle_fatal_error, SystemExit(0) as a clean
 * exit, the 4 checks of buildconfig/android/main.py, and the 3 GitHub
 * upload cases (they come with field data, M10).
 */
import { describe, expect, it } from "vitest";
import {
  CrashReporter,
  CrashReports,
  LOG_MARKER,
  MAX_CHARS,
  NAME_MARK,
  buildReport,
  formatError,
  hideNames,
  installCrashHandlers,
  redactSecrets,
} from "../../../src/core/crashReport";
import { type FileStore, MemoryFileStore } from "../../../src/platform/storage";

const NOW = new Date(Date.UTC(2026, 9, 19, 14, 30));
const INFO = { version: "0.4.35", build: "9", device: "Pixel TEST" };

const GROQ = "gsk_" + "a1B2".repeat(12);
const GEMINI = "AIza" + "Sy".repeat(18);
const GITHUB = "github_pat_TEST" + "11ABCDEFG".repeat(4);

/** Stands in for the crash dialog: records what it was shown. */
function offers(fail = false) {
  const shown: string[] = [];
  const offer = (text: string) => {
    shown.push(text);
    if (fail) throw new Error("no window");
  };
  return { shown, offer };
}

function reporter(fs: FileStore, offer: (t: string) => void, extra: Partial<ConstructorParameters<typeof CrashReporter>[1]> = {}) {
  return new CrashReporter(new CrashReports(fs), { info: () => INFO, offer, clock: () => NOW, ...extra });
}

const boom = () => {
  throw new TypeError("Cannot read properties of undefined (reading 'x')");
};

// ------------------------------------------------------------ the report

describe("hiding keys", () => {
  it("hides the known kinds of keys", () => {
    const text =
      `groq=${GROQ} gemini=${GEMINI} gh=${GITHUB} ` +
      "ghp_" +
      "x".repeat(36) +
      " sk-" +
      "y".repeat(40) +
      " Authorization: Bearer abc.def";
    const clean = redactSecrets(text);
    for (const secret of [GROQ, GEMINI, GITHUB, "x".repeat(36), "y".repeat(40), "abc.def"]) {
      expect(clean).not.toContain(secret);
    }
    expect(clean).toContain("groq=");
    expect(clean).toContain("gemini=");
    expect(clean).toContain("Bearer ***");
  });

  it("hides saved keys even without a known shape", () => {
    const clean = redactSecrets("key is plainsecret123456", ["plainsecret123456"]);
    expect(clean).not.toContain("plainsecret123456");
    expect(clean).toContain("key is");
  });
});

describe("building the report", () => {
  it("says what and where", () => {
    const report = buildReport("Traceback ...\nValueError: bad", INFO, { now: NOW });
    expect(report).toContain("0.4.35");
    expect(report).toContain("build: 9");
    expect(report).toContain("Pixel TEST");
    expect(report).toContain("2026-10-19 14:30 UTC");
    expect(report.trimEnd().endsWith("ValueError: bad")).toBe(true);
  });

  it("a long report keeps its end", () => {
    const error = Array.from({ length: 20000 }, (_, i) => `line ${i}`).join("\n") + "\nKeyError: 'end'";
    const report = buildReport(error, INFO, { now: NOW });
    expect(report.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(report.trimEnd().endsWith("KeyError: 'end'")).toBe(true);
    expect(report).toContain("0.4.35");
  });

  const LOG_LINES = Array.from({ length: 60 }, (_, i) => `14:${String(i).padStart(2, "0")}:00 INFO nagmon.x: step ${i}`).join("\n");

  it("ends with the app's log", () => {
    const report = buildReport("ValueError: bad", INFO, { now: NOW, log: LOG_LINES });
    expect(report.indexOf("ValueError: bad")).toBeLessThan(report.indexOf(LOG_MARKER));
    expect(report.trimEnd().endsWith("step 59")).toBe(true);
  });

  it("a long log keeps its end and the error", () => {
    const huge = Array.from({ length: 20000 }, (_, i) => `line ${i}`).join("\n");
    const error = Array.from({ length: 20000 }, (_, i) => `frame ${i}`).join("\n") + "\nKeyError: 'end'";
    const report = buildReport(error, INFO, { now: NOW, log: huge });
    expect(report.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(report).toContain("KeyError: 'end'");
    expect(report.trimEnd().endsWith("line 19999")).toBe(true);
    expect(report).toContain("0.4.35");
  });

  it("without a log the report is unchanged", () => {
    expect(buildReport("E", INFO, { now: NOW })).toBe(buildReport("E", INFO, { now: NOW, log: "" }));
    expect(buildReport("E", INFO, { now: NOW })).not.toContain(LOG_MARKER);
  });
});

// ------------------------------------------------------------- storage

describe("crash files", () => {
  it("keeps only the last report", async () => {
    const reports = new CrashReports(new MemoryFileStore());
    expect(await reports.last()).toBeNull();
    await reports.save("first");
    await reports.save("second");
    expect(await reports.last()).toBe("second");
  });

  it("reads a native crash once", async () => {
    const fs = new MemoryFileStore();
    const reports = new CrashReports(fs);
    expect(await reports.takeNative()).toBeNull();
    await fs.writeText("crash/native_crash.txt", "FATAL EXCEPTION: main");
    expect(await reports.takeNative()).toContain("FATAL EXCEPTION");
    expect(await reports.takeNative()).toBeNull();
  });

  it("an empty native file is not a crash", async () => {
    const fs = new MemoryFileStore();
    await fs.writeText("crash/native_crash.txt", "");
    expect(await new CrashReports(fs).takeNative()).toBeNull();
  });
});

// --------------------------------------------------------------- guard

describe("the guard", () => {
  it("a normal start reports nothing", async () => {
    const fs = new MemoryFileStore();
    const o = offers();
    expect(await reporter(fs, o.offer).run(() => undefined)).toBe(true);
    expect(o.shown).toEqual([]);
    expect(await new CrashReports(fs).last()).toBeNull();
  });

  it("an error before the game starts is offered, keys hidden", async () => {
    const fs = new MemoryFileStore();
    const o = offers();
    const ok = await reporter(fs, o.offer).run(() => {
      throw new Error(`no module phaser (key ${GROQ})`);
    });
    expect(ok).toBe(false);
    expect(o.shown).toHaveLength(1);
    expect(o.shown[0]).toContain("Error: no module phaser");
    expect(o.shown[0]).not.toContain(GROQ);
    expect(await new CrashReports(fs).last()).toBe(o.shown[0]);
  });

  it("an async start that rejects is offered too", async () => {
    const o = offers();
    const ok = await reporter(new MemoryFileStore(), o.offer).run(async () => {
      throw new RangeError("bad map");
    });
    expect(ok).toBe(false);
    expect(o.shown[0]).toContain("RangeError: bad map");
  });

  it("saved keys are hidden in the offer", async () => {
    const o = offers();
    await reporter(new MemoryFileStore(), o.offer, { secrets: () => ["plainsecret123456"] }).run(() => {
      throw new Error("token plainsecret123456 refused");
    });
    expect(o.shown[0]).not.toContain("plainsecret123456");
  });

  it("an error inside the game is offered (window error event)", async () => {
    const o = offers();
    const r = reporter(new MemoryFileStore(), o.offer);
    const target = new EventTarget();
    const uninstall = installCrashHandlers(r, { target });
    const event = new Event("error") as Event & { error?: unknown; message?: string };
    event.error = new ReferenceError("missing_map is not defined");
    target.dispatchEvent(event);
    await r.idle();
    expect(o.shown).toHaveLength(1);
    expect(o.shown[0]).toContain("ReferenceError: missing_map is not defined");
    uninstall();
  });

  it("an unhandled promise rejection is offered", async () => {
    const o = offers();
    const r = reporter(new MemoryFileStore(), o.offer);
    const target = new EventTarget();
    const uninstall = installCrashHandlers(r, { target });
    const event = new Event("unhandledrejection") as Event & { reason?: unknown };
    event.reason = "plain string reason";
    target.dispatchEvent(event);
    await r.idle();
    expect(o.shown[0]).toContain("Unhandled rejection: plain string reason");
    uninstall();
  });

  it("only the first error of a session opens the dialog", async () => {
    const o = offers();
    const later: string[] = [];
    const r = reporter(new MemoryFileStore(), o.offer);
    const target = new EventTarget();
    const uninstall = installCrashHandlers(r, { target, onLater: (t) => later.push(t) });
    for (const msg of ["first", "second"]) {
      const event = new Event("error") as Event & { error?: unknown };
      event.error = new Error(msg);
      target.dispatchEvent(event);
    }
    await r.idle();
    expect(o.shown).toHaveLength(1);
    expect(o.shown[0]).toContain("first");
    expect(later[0]).toContain("second");
    uninstall();
    const event = new Event("error") as Event & { error?: unknown };
    event.error = new Error("after uninstall");
    target.dispatchEvent(event);
    await r.idle();
    expect(o.shown).toHaveLength(1);
  });

  it("last time's native crash is offered and the game still starts", async () => {
    const fs = new MemoryFileStore();
    await fs.writeText("crash/native_crash.txt", "FATAL EXCEPTION: main\njava.lang.IllegalStateException");
    const o = offers();
    const started: boolean[] = [];
    await reporter(fs, o.offer).run(() => {
      started.push(true);
    });
    expect(started).toEqual([true]);
    expect(o.shown).toHaveLength(1);
    expect(o.shown[0]).toContain("IllegalStateException");
  });

  it("a broken dialog does not hide the crash", async () => {
    const fs = new MemoryFileStore();
    const o = offers(true);
    await reporter(fs, o.offer).run(() => {
      throw new Error("boom");
    });
    expect(await new CrashReports(fs).last()).toContain("Error: boom");
  });

  it("missing phone details still give a report", async () => {
    const o = offers();
    await reporter(new MemoryFileStore(), o.offer, {
      info: () => {
        throw new Error("device plugin missing");
      },
    }).run(boom);
    expect(o.shown[0]).toContain("TypeError");
    expect(o.shown[0]).toContain("details: unavailable");
  });

  it("adds the log with keys hidden", async () => {
    const o = offers();
    await reporter(new MemoryFileStore(), o.offer, {
      log: () => `14:00:00 INFO nagmon.x: key ${GROQ}\n14:00:01 INFO nagmon.x: last`,
    }).run(boom);
    expect(o.shown[0]).toContain("TypeError");
    expect(o.shown[0]).toContain("nagmon.x: last");
    expect(o.shown[0]).not.toContain(GROQ);
  });

  it("a broken log does not hide the crash", async () => {
    const o = offers();
    await reporter(new MemoryFileStore(), o.offer, {
      log: () => {
        throw new Error("no log");
      },
    }).run(boom);
    expect(o.shown[0]).toContain("TypeError");
  });

  it("hides the children's names, in the offer and on disk", async () => {
    const fs = new MemoryFileStore();
    const o = offers();
    await reporter(fs, o.offer, {
      log: () => "14:00:00 WARNING phaser: נועה has no monsters\n",
      names: async () => ["נועה"],
    }).run(boom);
    expect(o.shown[0]).not.toContain("נועה");
    expect(await fs.readText("crash/last_crash.txt")).not.toContain("נועה");
  });

  it("broken names do not hide the crash", async () => {
    const o = offers();
    await reporter(new MemoryFileStore(), o.offer, {
      names: () => {
        throw new Error("no profiles");
      },
    }).run(boom);
    expect(o.shown[0]).toContain("TypeError");
  });
});

// ------------------------------------------------- children's names

describe("hiding names", () => {
  it("hides names in any alphabet, also after a Hebrew prefix letter", () => {
    const text =
      "WARNING phaser: נועה has no monsters\n" +
      "ERROR phaser: Cannot start battle, Zephyrine has no monsters!\n" +
      "ERROR phaser: zephyrine's owner not found (לנועה)\n";
    const hidden = hideNames(text, ["נועה", "Zephyrine"]);
    expect(hidden).not.toContain("נועה");
    expect(hidden.toLowerCase()).not.toContain("zephyrine");
    expect(hidden.split(NAME_MARK)).toHaveLength(5);
  });

  it("leaves a name inside an English word alone", () => {
    expect(hideNames("Danger at the dance, Dan", ["Dan"])).toBe(`Danger at the dance, ${NAME_MARK}`);
  });

  it("ignores one-letter and empty names", () => {
    expect(hideNames("a map", ["a", "", "  "])).toBe("a map");
  });

  it("treats regex characters in a name as plain text", () => {
    expect(hideNames("D'or. and Dxor", ["D'or."])).toBe(`${NAME_MARK} and Dxor`);
  });
});

// ------------------------------------------- how this session ended

describe("marking the session", () => {
  function marking(fs: FileStore, o: ReturnType<typeof offers>, marks: number[]) {
    return reporter(fs, o.offer, { onCrash: () => void marks.push(o.shown.length) });
  }

  it("last time's native crash does not mark this session", async () => {
    const fs = new MemoryFileStore();
    await fs.writeText("crash/native_crash.txt", "FATAL EXCEPTION");
    const o = offers();
    const marks: number[] = [];
    await marking(fs, o, marks).run(() => undefined);
    expect(o.shown).toHaveLength(1);
    expect(marks).toEqual([]);
  });

  it("a crash now is marked before the dialog", async () => {
    const o = offers();
    const marks: number[] = [];
    await marking(new MemoryFileStore(), o, marks).run(boom);
    expect(marks).toEqual([0]);
    expect(o.shown).toHaveLength(1);
  });

  it("a reported error inside the game is marked", async () => {
    const o = offers();
    const marks: number[] = [];
    await marking(new MemoryFileStore(), o, marks).report("Error: boom");
    expect(marks).toEqual([0]);
  });

  it("a broken mark does not hide the crash", async () => {
    const o = offers();
    await reporter(new MemoryFileStore(), o.offer, {
      onCrash: () => {
        throw new Error("disk full");
      },
    }).run(boom);
    expect(o.shown[0]).toContain("TypeError");
  });
});

describe("formatError", () => {
  it("gives the name, the message and the stack", () => {
    const text = formatError(new TypeError("bad"));
    expect(text.startsWith("TypeError: bad")).toBe(true);
    expect(text).toContain("\n");
  });

  it("handles things that are not errors", () => {
    expect(formatError("text")).toBe("text");
    expect(formatError({ code: 7 })).toBe('{"code":7}');
    expect(formatError(undefined)).toBe("undefined");
  });
});
