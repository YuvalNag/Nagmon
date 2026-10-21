import { describe, expect, it } from "vitest";
import { buildReport, lastLines, MAX_TEXT_CHARS, REPORT_CHIPS, REPORT_LOG_LINES, reportStamp, type ReportInput } from "../../../src/core/report/report";

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  now: new Date("2026-03-04T05:06:07.890Z"),
  version: "0.1.0",
  build: "42",
  child: "p00001",
  chip: "stuck",
  text: "  הכפתור לא עובד  ",
  screen: "quiz",
  context: {},
  screenshot: false,
  log: "line 1\nline 2\n",
  names: ["תמר"],
  ...over,
});

describe("a report", () => {
  it("holds the build, the chip, the typed text, the screen and the time", () => {
    const r = buildReport(input());
    expect(r).toMatchObject({
      schema_version: 1,
      time: "2026-03-04T05:06:07.890Z",
      version: "0.1.0",
      build: "42",
      child: "p00001",
      chip: "stuck",
      text: "הכפתור לא עובד",
      screen: "quiz",
      screenshot: false,
    });
  });

  it("has four chips, and a report with nothing chosen still records the screen", () => {
    expect(REPORT_CHIPS).toHaveLength(4);
    const r = buildReport(input({ chip: null, text: "", screen: "map-menu" }));
    expect(r).toMatchObject({ chip: "none", text: "", screen: "map-menu" });
  });

  it("holds the map, the question, the battle and the bag when they apply, and only then", () => {
    const plain = buildReport(input());
    for (const key of ["map", "question", "battle", "bag"]) expect(plain).not.toHaveProperty(key);
    const r = buildReport(
      input({
        context: {
          map: { name: "town", x: 12, y: 7, facing: "up" },
          question: { item: "add.1", skill: "math.add", level: 3, kind: "choice", choices: [{ id: "a", text: "5" }], figure: "bar", phase: "question" },
          battle: { species: "fox", phase: "turn" },
          bag: { tab: "nets" },
        },
      }),
    );
    expect(r.map).toEqual({ name: "town", x: 12, y: 7, facing: "up" });
    expect(r.question).toMatchObject({ item: "add.1", skill: "math.add", level: 3, figure: "bar", choices: [{ id: "a", text: "5" }] });
    expect(r.battle).toEqual({ species: "fox", phase: "turn" });
    expect(r.bag).toEqual({ tab: "nets" });
  });

  it("keeps the last 30 log lines, with the names hidden", () => {
    const log = Array.from({ length: 100 }, (_, i) => `line ${i + 1}${i === 99 ? " תמר" : ""}`).join("\n") + "\n";
    const r = buildReport(input({ log }));
    const lines = r.log as string[];
    expect(lines).toHaveLength(REPORT_LOG_LINES);
    expect(lines[0]).toBe("line 71");
    expect(lines.at(-1)).toBe("line 100 <child>");
    expect(JSON.stringify(r.log)).not.toContain("תמר");
  });

  it("keeps the text as typed, a name included, but not the names anywhere else", () => {
    const r = buildReport(input({ text: "תמר לא מצליחה", screen: "תמר", context: { map: { name: "תמר", x: 1, y: 1, facing: null } } }));
    expect(r.text).toBe("תמר לא מצליחה");
    expect(r.screen).toBe("<child>");
    expect((r.map as { name: string }).name).toBe("<child>");
  });

  it("cuts a very long text", () => {
    expect((buildReport(input({ text: "א".repeat(5000) })).text as string).length).toBe(MAX_TEXT_CHARS);
  });
});

describe("lastLines", () => {
  it("drops the empty end and caps the count", () => {
    expect(lastLines("a\nb\n\n\n")).toEqual(["a", "b"]);
    expect(lastLines("a\nb\nc", 2)).toEqual(["b", "c"]);
    expect(lastLines("")).toEqual([]);
  });
});

describe("reportStamp", () => {
  it("is the compact UTC time", () => {
    expect(reportStamp(new Date("2026-03-04T05:06:07.890Z"))).toBe("20260304T050607Z");
  });
});
