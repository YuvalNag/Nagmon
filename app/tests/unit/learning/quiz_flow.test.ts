// @vitest-environment node
/// <reference types="node" />
/** Pure logic behind the question screen (test_quiz_flow.py, test_math_isolation.py). */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BattleQuizBudget, comboBonus, LetterTiles, NumberPad, OrderPicker, powerWithCombo, SubjectMap } from "../../../src/core/learning/quiz_flow";
import { isolateMath } from "../../../src/core/learning/text";
import { CONTENT_DIR, parseYaml, REPO_ROOT } from "./helpers";

const smap = (): SubjectMap => SubjectMap.fromDoc(parseYaml(readFileSync(join(CONTENT_DIR, "subjects.yaml"), "utf8")));

describe("quiz flow", () => {
  it("every tuxemon element has a subject", () => {
    const dir = join(REPO_ROOT, "mods", "tuxemon", "db", "element");
    const elements = readdirSync(dir)
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => f.slice(0, -5));
    const known = new Set(Object.keys(smap().elementToSubject));
    expect(elements.filter((e) => !known.has(e))).toEqual([]);
  });

  it("subject for types uses first known type", () => {
    const s = smap();
    expect(s.subjectFor(["fire"])).toBe("math");
    expect(s.subjectFor(["unknown", "earth"])).toBe("geometry");
    expect(s.subjectFor([])).toBe("math"); // default
  });

  it("child override wins", () => {
    expect(smap().subjectFor(["fire"], { fire: "english" })).toBe("english");
  });

  it("a monster can have its own subject", () => {
    const s = smap();
    expect(s.subjectFor(["normal"], null, "ringlet")).toBe("hebrew");
    expect(s.subjectFor(["fire"], { fire: "english" }, "saturnip")).toBe("hebrew");
    expect(s.subjectFor(["normal"], null, "sailbit")).toBe("english");
    expect(s.subjectFor(["normal"])).toBe("english");
  });

  it("the parent choice comes first", () => {
    const s = smap();
    const choice = { ringlet: "math", normal: "logic" };
    expect(s.subjectFor(["normal"], choice, "ringlet")).toBe("math");
    expect(s.subjectFor(["normal"], { normal: "logic" }, "ringlet")).toBe("hebrew");
    expect(s.subjectFor(["normal"], choice, "lunibble")).toBe("logic");
  });

  it("subject titles and colors", () => {
    const s = smap();
    expect(s.title("science")).toBe("מדעים");
    expect(s.color("math").startsWith("#")).toBe(true);
    expect(s.title("nope")).toBe("nope");
  });

  it("combo bonus every third correct", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(comboBonus)).toEqual([0, 0, 0, 0.5, 0, 0, 0.5]);
  });

  it("power with combo", () => {
    expect(powerWithCombo(1.5, 3)).toBeCloseTo(2.0, 12);
    expect(powerWithCombo(1.5, 2)).toBeCloseTo(1.5, 12);
    expect(powerWithCombo(1.0, 0)).toBeCloseTo(1.0, 12);
  });

  it("battle budget caps questions", () => {
    const budget = new BattleQuizBudget(2);
    expect(budget.take() && budget.take()).toBe(true);
    expect(budget.take()).toBe(false);
    expect(budget.asked).toBe(2);
  });

  it("battle budget zero means no questions", () => {
    expect(new BattleQuizBudget(0).take()).toBe(false);
  });

  it.each([
    [["1", "2"], "12"],
    [["1", ".", "5"], "1.5"],
    [["3", "/", "4"], "3/4"],
    [["-", "7"], "-7"],
    [["1", "2", "back"], "1"],
    [[".", ".", "5"], ".5"],
    [["5", "-"], "5"],
    [["/", "1"], "1"],
  ])("number pad %j -> %j", (keys, shown) => {
    const pad = new NumberPad(8);
    for (const k of keys) pad.press(k);
    expect(pad.text).toBe(shown);
  });

  it("number pad max length", () => {
    const pad = new NumberPad(3);
    for (const k of "12345") pad.press(k);
    expect(pad.text).toBe("123");
  });

  it("order picker collects unique ids and undo", () => {
    const picker = new OrderPicker(["a", "b", "c"]);
    picker.pick("b");
    picker.pick("b"); // ignored
    picker.pick("a");
    expect(picker.picked).toEqual(["b", "a"]);
    expect(picker.complete).toBe(false);
    picker.undo();
    picker.pick("c");
    picker.pick("a");
    expect(picker.complete).toBe(true);
    expect(picker.picked).toEqual(["b", "c", "a"]);
  });

  it("letter tiles spell and undo", () => {
    const tiles = new LetterTiles(Array.from("tac"));
    for (const i of [2, 1, 0]) tiles.pick(i); // c, a, t
    expect(tiles.word).toBe("cat");
    tiles.pick(0); // used already
    expect(tiles.word).toBe("cat");
    tiles.undo();
    expect(tiles.word).toBe("ca");
    expect(tiles.available(0)).toBe(true);
  });
});

describe("math isolation", () => {
  const LRI = "⁦";
  const PDI = "⁩";
  it.each([
    ["עודף: 20 - 9 = 11 ₪.", `עודף: ${LRI}20 - 9 = 11${PDI} ₪.`],
    ["כמה זה 7×8?", `כמה זה ${LRI}7×8${PDI}?`],
    ["3/4 מהעוגה", `${LRI}3/4${PDI} מהעוגה`],
    ["יש 5 תפוחים", "יש 5 תפוחים"],
    [`כמה זה ${LRI}13 + 10${PDI}?`, `כמה זה ${LRI}13 + 10${PDI}?`],
    ["Hello 2 + 2", "Hello 2 + 2"],
    ["כמה זה ٣ + ٤?", `כמה זה ${LRI}٣ + ٤${PDI}?`],
  ])("isolate math %j", (text, expected) => {
    expect(isolateMath(text)).toBe(expected);
  });
});
