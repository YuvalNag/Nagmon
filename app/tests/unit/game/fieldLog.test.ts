import { describe, expect, it } from "vitest";
import { Crumb } from "../../../src/core/game/breadcrumb";
import { FieldLog } from "../../../src/core/game/fieldLog";

function make() {
  const lines: string[] = [];
  const crumb = new Crumb();
  return { lines, crumb, log: new FieldLog({ info: (m) => lines.push(m) }, crumb) };
}

describe("the field log", () => {
  it("writes one line per question: subject, skill, level, right or not, milliseconds", () => {
    const { log, lines } = make();
    log.question({ subject: "math", skill: "math.add_10", grade: 2, theta: 0.3456, correct: true, ms: 4210.7, context: "battle" });
    expect(lines).toEqual(["Q subject=math skill=math.add_10 grade=2 theta=0.35 ok=1 ms=4211 ctx=battle"]);
  });

  it("keeps every line to one line, with no spaces inside a value", () => {
    const { log, lines } = make();
    log.dialogStart("nagmon owl\nintro");
    log.mapChange("a b", "c");
    for (const l of lines) expect(l).not.toMatch(/\n/);
    expect(lines[0]).toBe("DIALOG start id=nagmon_owl_intro");
    expect(lines[1]).toBe("MAP from=a_b to=c");
  });

  it("logs battles, purchases, dialogs and the placement", () => {
    const { log, lines } = make();
    log.battleStart({ monster: "heliobud", level: 5, map: "route_1" });
    log.battleEnd({ result: "won", questions: 4, correct: 3, ms: 61000 });
    log.dialogEnd("x", 1500);
    log.purchase({ what: "trip:moon", price: 15, coins: 5 });
    log.placement({ math: 3, english: 1 });
    expect(lines).toEqual([
      "BATTLE start monster=heliobud level=5 map=route_1",
      "BATTLE end result=won questions=4 correct=3 ms=61000",
      "DIALOG end id=x ms=1500",
      "BUY what=trip:moon price=15 coins_left=5",
      "PLACEMENT english=1 math=3",
    ]);
  });

  it("writes an item use, a capture try, a helper and a partner change as one short line each", () => {
    const { log, lines } = make();
    log.item({ item: "berry", where: "bag", ok: true });
    log.capture({ species: "lunibble", net: "magic_net", ok: false, left: 2, tries: 1 });
    log.helper({ kind: "fifty", skill: "math.add_20" });
    log.note("partner", { species: "lunibble" });
    log.note("catch", { species: "lunibble", level: 6, party: 1 });
    expect(lines).toEqual([
      "ITEM use item=berry where=bag ok=1",
      "CAPTURE try species=lunibble net=magic_net ok=0 left=2 tries=1",
      "HELPER use kind=fifty skill=math.add_20",
      "PARTNER species=lunibble",
      "CATCH species=lunibble level=6 party=1",
    ]);
  });

  it("keeps free text out of the new lines: a line break or a long value stays one short line", () => {
    const { log, lines } = make();
    log.item({ item: "a\nname with spaces ".repeat(20), where: "bag", ok: true });
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("\n");
    expect(lines[0]!.length).toBeLessThan(80);
  });

  it("never carries a name: a value that looks like free text is cut", () => {
    const { log, lines } = make();
    log.dialogStart("x".repeat(200));
    expect(lines[0]!.length).toBeLessThan(80);
  });

  it("remembers the last screen and position for a 'something is wrong' report", () => {
    const { log, lines, crumb } = make();
    crumb.screen("quiz");
    crumb.position("classic_route_1", 12, 7);
    crumb.screen("parents");
    log.report();
    expect(lines.at(-1)).toBe("REPORT screen=quiz map=classic_route_1 x=12 y=7");
  });

  it("reports an unknown place as such", () => {
    const { log, lines } = make();
    log.report();
    expect(lines[0]).toBe("REPORT screen=none map=none x=? y=?");
  });
});

describe("the lesson lines", () => {
  it("write ids and numbers only: the lesson, the step, the coins", () => {
    const { log, lines } = make();
    log.lesson({ step: "open", id: "moon" });
    log.lesson({ step: "practice", id: "moon", ok: false });
    log.lesson({ step: "pass", id: "moon", ok: true, coins: 40, first: true });
    log.noteUse({ skill: "science.space.moon", free: false, charges: 2 });
    log.noteUse({ skill: "science.space.moon", free: true });
    expect(lines).toEqual([
      "LESSON open id=moon",
      "LESSON practice id=moon ok=0",
      "LESSON pass id=moon ok=1 coins=40 first=1",
      "NOTE open skill=science.space.moon free=0 charges=2",
      "NOTE open skill=science.space.moon free=1",
    ]);
  });
});

