import { describe, expect, it } from "vitest";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { MAX_WAITING, Reports, type SaveReport } from "../../../src/core/report/reports";
import { MemoryFileStore } from "../../../src/platform/storage";

function setup(now = Date.parse("2026-03-04T05:06:07Z")) {
  const fs = new MemoryFileStore();
  const lines: string[] = [];
  const clock = { now };
  const reports = new Reports({
    fs,
    field: new FieldLog({ info: (m) => lines.push(m) }),
    build: () => ({ version: "0.1.0", build: "7" }),
    log: () => "old line\nTamar was here תמר\n",
    names: async () => ["תמר"],
    clock: () => clock.now,
  });
  return { fs, lines, reports, clock };
}

const one = (over: Partial<SaveReport> = {}): SaveReport => ({
  child: "p00001",
  chip: "stuck",
  text: "",
  screen: "bag",
  context: { bag: { tab: "nets" } },
  screenshot: null,
  ...over,
});

describe("saving a report", () => {
  it("one tap on a chip: the JSON in the child's folder and one log line", async () => {
    const { fs, lines, reports } = setup();
    const saved = await reports.save(one());
    expect(saved.jsonPath).toBe("profiles/p00001/reports/20260304T050607Z.json");
    const json = JSON.parse((await fs.readText(saved.jsonPath))!);
    expect(json).toMatchObject({ chip: "stuck", screen: "bag", bag: { tab: "nets" }, build: "7", screenshot: false });
    expect(json.log).toEqual(["old line", "Tamar was here <child>"]);
    // no screenshot: no picture file
    expect(saved.imagePath).toBeNull();
    expect((await fs.list("profiles/p00001/reports")).map((f) => f.name)).toEqual(["20260304T050607Z.json"]);
    expect(lines).toEqual(["REPORT screen=bag chip=stuck"]);
  });

  it("with nothing chosen it is still written, and says chip=none", async () => {
    const { lines, reports } = setup();
    await reports.save(one({ chip: null, screen: "play" }));
    expect(lines).toEqual(["REPORT screen=play chip=none"]);
    expect(await reports.count()).toBe(1);
  });

  it("the log line has no free text and no name", async () => {
    const { lines, reports } = setup();
    await reports.save(one({ text: "תמר נתקעה בשאלה", screen: "quiz" }));
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toMatch(/[֐-׿]/);
    expect(lines[0]).toBe("REPORT screen=quiz chip=stuck");
  });

  it("the screenshot is written beside it", async () => {
    const { fs, reports } = setup();
    const saved = await reports.save(one({ screenshot: "/9j/AAAA" }));
    expect(saved.imagePath).toBe("profiles/p00001/reports/20260304T050607Z.jpg");
    expect(await fs.readBase64(saved.imagePath!)).toBe("/9j/AAAA");
    expect(JSON.parse((await fs.readText(saved.jsonPath))!).screenshot).toBe(true);
  });

  it("two in one second do not overwrite each other", async () => {
    const { reports } = setup();
    const a = await reports.save(one());
    const b = await reports.save(one({ chip: "other" }));
    expect(b.jsonPath).not.toBe(a.jsonPath);
    expect(await reports.count()).toBe(2);
  });
});

describe("the waiting reports", () => {
  it("are listed oldest first across children, and gone after done", async () => {
    const { reports, clock } = setup();
    await reports.save(one({ child: "p00002" }));
    clock.now += 5000;
    const second = await reports.save(one({ screenshot: "AAAA" }));
    const list = await reports.waiting();
    expect(list.map((r) => r.child)).toEqual(["p00002", "p00001"]);
    expect(list[1]!.imagePath).toBe(second.imagePath);
    expect(list[1]!.imageSent).toBe(false);
    await reports.markImageSent(list[1]!);
    expect((await reports.waiting())[1]!.imageSent).toBe(true);
    await reports.done(list[1]!);
    expect((await reports.waiting()).map((r) => r.child)).toEqual(["p00002"]);
  });

  it("keep at most the newest few: the oldest go", async () => {
    const { reports, clock } = setup();
    for (let i = 0; i < MAX_WAITING + 3; i++) {
      await reports.save(one());
      clock.now += 1000;
    }
    const list = await reports.waiting();
    expect(list).toHaveLength(MAX_WAITING);
    expect(list[0]!.stamp).toBe("20260304T050610Z");
  });
});
