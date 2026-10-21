import { describe, expect, it } from "vitest";
import {
  BONUS_CAP,
  bandOf,
  damageOf,
  fogOf,
  GENTLE,
  statsOf,
  WHEEL,
  wheelHit,
  wheelMult,
  weakSubjects,
  type Bases,
  MP,
} from "../../../src/core/game/battleNumbers";

/** docs/app/BATTLE_V3.md 5.1 and 5.2: every number of the worked examples. */
describe("stats and Fog (5.1)", () => {
  it("Fog of a wild fight, band B, Normal: levels 3, 5, 10, 15, 18 give 64, 74, 100, 124, 140", () => {
    expect([3, 5, 10, 15, 18].map((l) => fogOf(l, "wild", "B"))).toEqual([64, 74, 100, 124, 140]);
  });

  it("Fog by band, kind and the Length knob", () => {
    expect(fogOf(10, "wild", "A")).toBe(80);
    expect(fogOf(10, "wild", "C")).toBe(90);
    expect(fogOf(10, "wild", "B", 0.75)).toBe(75);
    expect(fogOf(10, "wild", "B", 1.3)).toBe(130);
    expect(fogOf(10, "guardian", "B")).toBe(180);
    expect(fogOf(10, "master", "B")).toBe(210);
    expect(fogOf(10, "keeper", "B")).toBe(70);
  });

  it("Pep of a basic creature with bp 10: level 5, 10, 15, 20 give 37, 50, 62, 75; stage 2 at level 20 gives 108", () => {
    const b: Bases = { bp: 10, bw: 10, bg: 10, bs: 10 };
    expect([5, 10, 15, 20].map((l) => statsOf(b, l).pep)).toEqual([37, 50, 62, 75]);
    expect(statsOf(b, 20, "stage2").pep).toBe(108);
  });

  // the chapter's starters (5.7): Pep / Power / Guard / Speed at levels 6, 10 (stage 0), 14, 20 (stage 1), 24 (stage 2)
  const starters: [string, Bases, [number, string, number[]][]][] = [
    [
      "Heliobud line",
      { bp: 10, bw: 11, bg: 8, bs: 10 },
      [
        [6, "basic", [40, 38, 28, 35]],
        [10, "basic", [50, 49, 36, 45]],
        [14, "stage1", [72, 72, 52, 66]],
        [20, "stage1", [90, 92, 67, 84]],
        [24, "stage2", [123, 127, 92, 116]],
      ],
    ],
    [
      "Terrabub line",
      { bp: 11, bw: 8, bg: 11, bs: 8 },
      [
        [6, "basic", [44, 28, 38, 28]],
        [10, "basic", [55, 36, 49, 36]],
        [14, "stage1", [79, 52, 72, 52]],
        [20, "stage1", [99, 67, 92, 67]],
        [24, "stage2", [135, 92, 127, 92]],
      ],
    ],
    [
      "Lunibble line",
      { bp: 10, bw: 9, bg: 9, bs: 11 },
      [
        [6, "basic", [40, 31, 31, 38]],
        [10, "basic", [50, 40, 40, 49]],
        [14, "stage1", [72, 59, 59, 72]],
        [20, "stage1", [90, 75, 75, 92]],
        [24, "stage2", [123, 104, 104, 127]],
      ],
    ],
  ];
  for (const [name, bases, rows] of starters) {
    it(`${name}: the table of 5.7`, () => {
      for (const [level, stage, want] of rows) {
        const s = statsOf(bases, level, stage);
        expect([s.pep, s.power, s.guard, s.speed], `${name} level ${level}`).toEqual(want);
      }
    });
  }
});

describe("the damage formula (5.2)", () => {
  const heli = { level: 10, power: 49 };
  it("Sum Spark, right: 11", () => {
    expect(damageOf({ ...heli, mp: MP.N, guard: 45, home: true, right: true, roll: 0.96 })).toBe(11);
  });
  it("Sum Spark, wrong: 4 (at least 1)", () => {
    expect(damageOf({ ...heli, mp: MP.N, guard: 45, home: true, right: false, roll: 0.96 })).toBe(4);
    expect(damageOf({ level: 1, mp: 1, power: 1, guard: 99, right: false, roll: 0.92 })).toBe(1);
  });
  it("Times Twister (stretch), right, Brilliant: 23", () => {
    expect(damageOf({ ...heli, mp: MP.S, guard: 45, home: true, brilliant: true, right: true, roll: 0.96 })).toBe(23);
  });
  it("Total! with a Math Mark and Brilliant: the bonus is capped at 2.5, so 25", () => {
    const d = damageOf({ ...heli, mp: MP.finisher, guard: 45, home: true, mark: 1.75, brilliant: true, right: true, roll: 0.96 });
    expect(d).toBe(25);
    expect(BONUS_CAP).toBe(2.5);
  });
  it("a Terrabub's Block Bounce: 9 without the wheel, 13 with a Sparkle", () => {
    const base = { level: 10, mp: MP.N, power: 36, guard: 45, home: true, right: true, roll: 0.96 };
    expect(damageOf(base)).toBe(9);
    expect(damageOf({ ...base, wheel: 1.5 })).toBe(13);
  });
  it("the enemy's Fog Puff on Heliobud: 7 in band B, 4 in band A, 9 in band C", () => {
    const puff = { level: 10, mp: MP.puff, power: 40, guard: 36, right: true, roll: 0.96 };
    expect(damageOf({ ...puff, gentle: GENTLE.B })).toBe(7);
    expect(damageOf({ ...puff, gentle: GENTLE.A })).toBe(4);
    expect(damageOf({ ...puff, gentle: GENTLE.C })).toBe(9);
  });
  it("a wrong answer ignores the Mix, Mark and Brilliant bonuses but keeps Home and the wheel", () => {
    const base = { level: 10, mp: MP.N, power: 49, guard: 45, home: true, wheel: 1.5, right: false, roll: 1 };
    expect(damageOf({ ...base, mix: true, brilliant: true, mark: 2 })).toBe(damageOf(base));
  });
});

describe("the subject wheel (2.3), all 36 pairs", () => {
  it("each subject is a Sparkle against the next, Sturdy against the one before, plain otherwise", () => {
    let sparkle = 0;
    let sturdy = 0;
    for (let m = 0; m < 6; m++) {
      for (let e = 0; e < 6; e++) {
        const hit = wheelHit(WHEEL[m]!, WHEEL[e]!);
        const want = e === (m + 1) % 6 ? "sparkle" : e === (m + 5) % 6 ? "sturdy" : null;
        expect(hit, `${WHEEL[m]} vs ${WHEEL[e]}`).toBe(want);
        if (hit === "sparkle") sparkle++;
        if (hit === "sturdy") sturdy++;
      }
    }
    expect([sparkle, sturdy]).toEqual([6, 6]);
  });

  it("the named chain: math beats logic beats geometry beats science beats english beats hebrew beats math", () => {
    const chain = ["math", "logic", "geometry", "science", "english", "hebrew", "math"];
    for (let i = 0; i < 6; i++) expect(wheelHit(chain[i]!, chain[i + 1]!)).toBe("sparkle");
    expect(wheelHit("math", "hebrew")).toBe("sturdy");
  });

  it("multipliers: 1.5, 0.67, 1", () => {
    expect([wheelMult("sparkle"), wheelMult("sturdy"), wheelMult(null)]).toEqual([1.5, 0.67, 1]);
  });

  it("a species' own weak subject is a Sparkle too, even where the wheel says Sturdy", () => {
    expect(wheelHit("science", "hebrew")).toBeNull();
    expect(wheelHit("science", "hebrew", ["science"])).toBe("sparkle");
    expect(wheelHit("math", "hebrew", ["math"])).toBe("sparkle");
  });

  it("an unknown subject is plain", () => {
    expect(wheelHit("art", "math")).toBeNull();
  });

  it("the weak subjects of an enemy: the wheel's, then the data's", () => {
    expect(weakSubjects("logic")).toEqual(["math"]);
    expect(weakSubjects("science", ["hebrew"])).toEqual(["geometry", "hebrew"]);
  });
});

describe("bands", () => {
  it("5 to 7 is A, 8 to 10 B, 11 and up C", () => {
    expect([5, 7, 8, 10, 11, 14].map(bandOf)).toEqual(["A", "A", "B", "B", "C", "C"]);
  });
});
