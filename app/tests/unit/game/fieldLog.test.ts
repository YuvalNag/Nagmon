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
    log.battleStart({ monster: "agnite", level: 5, map: "route_1" });
    log.battleEnd({ result: "won", questions: 4, correct: 3, ms: 61000 });
    log.dialogEnd("x", 1500);
    log.purchase({ what: "trip:moon", price: 15, coins: 5 });
    log.placement({ math: 3, english: 1 });
    expect(lines).toEqual([
      "BATTLE start monster=agnite level=5 map=route_1",
      "BATTLE end result=won questions=4 correct=3 ms=61000",
      "DIALOG end id=x ms=1500",
      "BUY what=trip:moon price=15 coins_left=5",
      "PLACEMENT english=1 math=3",
    ]);
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
