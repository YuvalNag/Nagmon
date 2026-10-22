import { beforeAll, describe, expect, it } from "vitest";
import {
  autoPick,
  type Chance,
  type ChanceInput,
  chanceOf,
  befriendRules,
  type BefriendRules,
  hpFactor,
  likedTreat,
  levelMod,
  MAX_P,
  mercyTry,
  nextWord,
  rollShakes,
  shakeChance,
  statusMult,
  toolsIn,
  treatsIn,
  wordOf,
} from "../../../src/core/game/befriend";
import { economy } from "../../../src/core/game/items";
import { seededRng } from "../../../src/core/game/rng";
import type { Band, BattleData } from "../../../src/core/data/battleTypes";
import { battleData, gameJson } from "./helpers";

let data: BattleData;
let A: BefriendRules;
let B: BefriendRules;
let C: BefriendRules;
beforeAll(async () => {
  data = await battleData();
  A = befriendRules(data, "A");
  B = befriendRules(data, "B");
  C = befriendRules(data, "C");
});
const eco = economy(gameJson("economy.json"));

const base = (o: Partial<ChanceInput> = {}): ChanceInput => ({
  rate: 200,
  fogNow: 50,
  fogMax: 100,
  level: 10,
  tool: 1,
  treat: 1,
  statuses: [],
  gift: false,
  curious: false,
  failed: 0,
  firstSafe: false,
  tryNo: 1,
  ...o,
});
const pct = (c: Chance) => Math.round(c.p * 100);

describe("8.2: the formula against the spec's worked table", () => {
  it("hpFactor is 1/3 at full Fog and 1 at none; level mod is clamped", () => {
    expect(hpFactor(100, 100)).toBeCloseTo(1 / 3, 10);
    expect(hpFactor(0, 100)).toBe(1);
    expect(hpFactor(50, 100)).toBeCloseTo(2 / 3, 10);
    expect(levelMod(10, B)).toBeCloseTo(1.1, 10);
    expect(levelMod(1, B)).toBe(1.2);
    expect(levelMod(60, B)).toBe(0.7);
  });

  // Magic Net, level 10, no status (Calm at Fog 0 uses the x2 status bonus)
  const table: [number, number, number, number][] = [
    // fog left %, rate 200, 150, 100
    [100, 29, 22, 14],
    [75, 43, 32, 22],
    [50, 58, 43, 29],
    [25, 72, 54, 36],
    [10, 81, 60, 40],
    [0, 97, 97, 86],
  ];
  for (const [fog, p200, p150, p100] of table) {
    it(`fog ${fog}%: ${p200} / ${p150} / ${p100} for rates 200 / 150 / 100`, () => {
      const statuses = fog === 0 ? ["calm"] : [];
      expect(pct(chanceOf(base({ rate: 200, fogNow: fog, statuses }), B))).toBe(p200);
      expect(pct(chanceOf(base({ rate: 150, fogNow: fog, statuses }), B))).toBe(p150);
      expect(pct(chanceOf(base({ rate: 100, fogNow: fog, statuses }), B))).toBe(p100);
    });
  }

  it("the combinations at 50% Fog, rate 200", () => {
    expect(pct(chanceOf(base({ tool: 1 }), B))).toBe(58); // Magic Net
    expect(pct(chanceOf(base({ tool: 1.5 }), B))).toBe(86); // Silver Net
    expect(pct(chanceOf(base({ tool: 1.5, treat: 1.2 }), B))).toBe(97); // Silver Net + Berry
    expect(pct(chanceOf(base({ gift: true }), B))).toBe(86); // Magic Net + Gift question
    expect(pct(chanceOf(base({ statuses: ["drowsy"] }), B))).toBe(97); // after a Lullaby
  });

  it("a stage 2 creature (rate 100, level 18) at 50% Fog", () => {
    const s2 = (o: Partial<ChanceInput>) => base({ rate: 100, level: 18, ...o });
    expect(pct(chanceOf(s2({}), B))).toBe(25);
    expect(pct(chanceOf(s2({ tool: 1.5 }), B))).toBe(37);
    expect(pct(chanceOf(s2({ tool: 1.5, gift: true }), B))).toBe(55);
    expect(pct(chanceOf(s2({ tool: 1.5, gift: true, statuses: ["drowsy"] }), B))).toBe(97);
  });

  it("only the largest status counts (no stacking); Shield alone is a penalty", () => {
    expect(statusMult([], B)).toBe(1);
    expect(statusMult(["drowsy", "dizzy", "slow"], B)).toBe(2);
    expect(statusMult(["dizzy", "slow"], B)).toBe(1.5);
    expect(statusMult(["shield"], B)).toBe(0.8);
    expect(statusMult(["shield", "giggly"], B)).toBe(1.25);
    expect(statusMult(["windup"], B)).toBe(0.8);
    expect(statusMult(["regen"], B)).toBe(1);
  });

  it("the Curious gift is a little easier (x1.15)", () => {
    const plain = chanceOf(base({ fogNow: 100 }), B).p;
    const cur = chanceOf(base({ fogNow: 100, curious: true }), B).p;
    expect(cur / plain).toBeCloseTo(1.15, 2);
  });
});

describe("chance words: Low under 25%, Fair 25 to 49%, Good 50 to 79%, Great 80% and over", () => {
  it("the boundaries", () => {
    expect(wordOf(0.2499, B)).toBe("low");
    expect(wordOf(0.25, B)).toBe("fair");
    expect(wordOf(0.4999, B)).toBe("fair");
    expect(wordOf(0.5, B)).toBe("good");
    expect(wordOf(0.7999, B)).toBe("good");
    expect(wordOf(0.8, B)).toBe("great");
    expect(wordOf(0.97, B)).toBe("great");
    expect(wordOf(0, B)).toBe("low");
  });
  it("nextWord moves one step up and stops at Great", () => {
    expect(nextWord("low")).toBe("fair");
    expect(nextWord("fair")).toBe("good");
    expect(nextWord("good")).toBe("great");
    expect(nextWord("great")).toBe("great");
  });
});

describe("pity and Mercy (the parent's decision: Mercy only for ages 5 to 7)", () => {
  it("pity adds 45 / 30 / 25 to a after each failed try", () => {
    expect(A.pity).toBe(45);
    expect(B.pity).toBe(30);
    expect(C.pity).toBe(25);
    for (const [r, add] of [[A, 45], [B, 30], [C, 25]] as const) {
      const none = chanceOf(base({ fogNow: 100 }), r);
      const one = chanceOf(base({ fogNow: 100, failed: 1 }), r);
      const two = chanceOf(base({ fogNow: 100, failed: 2, tryNo: 1 }), r);
      expect(one.p - none.p).toBeCloseTo(add / 255, 10);
      expect(two.p - none.p).toBeCloseTo((2 * add) / 255, 10);
    }
  });
  it("Mercy: the 3rd try of band A always succeeds; B and C have none, even on the 4th or 9th", () => {
    expect(A.mercy).toBe(3);
    expect(B.mercy).toBeNull();
    expect(C.mercy).toBeNull();
    const hard = { rate: 100, fogNow: 100, level: 18 };
    expect(chanceOf(base({ ...hard, failed: 1, tryNo: 2 }), A).mercy).toBe(false);
    const m = chanceOf(base({ ...hard, failed: 2, tryNo: 3 }), A);
    expect(m).toMatchObject({ mercy: true, p: 1, word: "great" });
    for (const r of [B, C]) for (const n of [4, 5, 9]) expect(chanceOf(base({ ...hard, failed: n - 1, tryNo: n }), r).mercy).toBe(false);
  });
  it("without Mercy the chance is still capped at 97% however many pities", () => {
    expect(chanceOf(base({ failed: 20, tryNo: 21 }), B).p).toBe(MAX_P);
  });
  it("mercyTry is band A only", () => {
    const bands: Band[] = ["A", "B", "C"];
    expect(bands.map((b) => mercyTry(b, 4))).toEqual([4, null, null]);
  });
  it("band A with a sure 3rd try never needs more than three tries, over many seeded fights", () => {
    const rng = seededRng(5);
    for (let f = 0; f < 2000; f++) {
      let failed = 0;
      for (let n = 1; n <= 3; n++) {
        const c = chanceOf(base({ rate: 100, fogNow: 100, level: 18, failed, tryNo: n }), A);
        const r = rollShakes(c.p, rng);
        if (r.ok) break;
        failed++;
        expect(n).toBeLessThan(3);
      }
    }
  });
});

describe("the shakes: q = p^(1/3) per check, the product is p", () => {
  it("over 100,000 seeded tries the success rate is within 1% of p", () => {
    for (const p of [0.15, 0.4, 0.72, 0.97]) {
      const rng = seededRng(Math.round(p * 1000));
      let ok = 0;
      const n = 100_000;
      for (let i = 0; i < n; i++) if (rollShakes(p, rng).ok) ok++;
      expect(Math.abs(ok / n - p)).toBeLessThan(0.01);
    }
  });
  it("each check passes with p^(1/3); a failure lands on shake 1, 2 or 3 and shows that many shakes", () => {
    expect(shakeChance(0.64, 3) ** 3).toBeCloseTo(0.64, 10);
    const rng = seededRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 4000; i++) {
      const r = rollShakes(0.3, rng);
      if (r.ok) expect(r).toMatchObject({ shakes: 3, failedAt: null });
      else {
        expect(r.shakes).toBe(r.failedAt);
        seen.add(r.failedAt!);
      }
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
    // the first check is the most likely to fail by itself, the others follow only when it passed
    const first = (() => {
      const g = seededRng(11);
      let f1 = 0;
      for (let i = 0; i < 20000; i++) if (rollShakes(0.3, g).failedAt === 1) f1++;
      return f1 / 20000;
    })();
    expect(first).toBeCloseTo(1 - 0.3 ** (1 / 3), 1);
  });
  it("a sure try passes every check; p 0 fails on the first", () => {
    expect(rollShakes(1, () => 0.999999)).toMatchObject({ ok: true, shakes: 3 });
    expect(rollShakes(0, () => 0)).toMatchObject({ ok: false, shakes: 1 });
  });
  it("the Star Net: the first shake never fails, and the whole try still succeeds with p", () => {
    const p = chanceOf(base({ fogNow: 100, tool: 2.2, firstSafe: true }), B).p;
    expect(p).toBeGreaterThan(chanceOf(base({ fogNow: 100, tool: 2.2 }), B).p);
    const rng = seededRng(9);
    let ok = 0;
    let firstFail = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const r = rollShakes(p, rng, 3, true);
      if (r.ok) ok++;
      if (r.failedAt === 1) firstFail++;
    }
    expect(firstFail).toBe(0);
    expect(Math.abs(ok / n - p)).toBeLessThan(0.01);
  });
});

describe("properties: never above the cap, rising as the Fog falls", () => {
  it("over a large seeded sweep the chance is at most 97% (unless Mercy) and never falls as the Fog goes down", () => {
    const rng = seededRng(77);
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!;
    for (let i = 0; i < 4000; i++) {
      const rules = pick([A, B, C]);
      const fogMax = 20 + Math.floor(rng() * 200);
      const common = {
        rate: pick([100, 130, 150, 190, 200]),
        level: 1 + Math.floor(rng() * 25),
        tool: pick([1, 1.5, 1.8, 2, 2.2]),
        treat: pick([1, 1.2, 1.4, 1.5, 1.9]),
        statuses: pick([[], ["drowsy"], ["dizzy"], ["shield"], ["slow", "giggly"]] as string[][]),
        gift: rng() < 0.5,
        curious: rng() < 0.3,
        failed: Math.floor(rng() * 4),
        firstSafe: rng() < 0.2,
        tryNo: 1 + Math.floor(rng() * 5),
        fogMax,
      };
      let prev = -1;
      for (let fog = fogMax; fog >= 0; fog -= Math.max(1, Math.floor(fogMax / 12))) {
        const c = chanceOf(base({ ...common, fogNow: fog }), rules);
        if (!c.mercy) expect(c.p).toBeLessThanOrEqual(MAX_P + 1e-12);
        expect(c.p).toBeGreaterThanOrEqual(0);
        expect(c.p).toBeGreaterThanOrEqual(prev - 1e-12);
        prev = c.p;
      }
    }
  });
  it("more tool, more treat, more gift never lowers it", () => {
    for (const rules of [A, B, C]) {
      const lo = chanceOf(base({ fogNow: 80 }), rules).p;
      expect(chanceOf(base({ fogNow: 80, tool: 1.5 }), rules).p).toBeGreaterThanOrEqual(lo);
      expect(chanceOf(base({ fogNow: 80, treat: 1.4 }), rules).p).toBeGreaterThanOrEqual(lo);
      expect(chanceOf(base({ fogNow: 80, gift: true }), rules).p).toBeGreaterThanOrEqual(lo);
    }
  });
});

describe("statistics: the simulated catch rate matches the chance word", () => {
  it("a Good chance succeeds about 2 times in 3 over many tries", () => {
    // 50% Fog, rate 200, Magic Net: 58% (Good); Silver: 86% (Great)
    const rng = seededRng(21);
    const p = chanceOf(base(), B).p;
    expect(wordOf(p, B)).toBe("good");
    let ok = 0;
    for (let i = 0; i < 20000; i++) if (rollShakes(p, rng).ok) ok++;
    expect(ok / 20000).toBeGreaterThan(0.54);
    expect(ok / 20000).toBeLessThan(0.62);
  });
  it("band A: a fight of up to three tries always ends in a friend; band B has real failures", () => {
    const rng = seededRng(4);
    const fight = (rules: BefriendRules, tries: number): boolean => {
      let failed = 0;
      for (let n = 1; n <= tries; n++) {
        const c = chanceOf(base({ rate: 100, level: 18, fogNow: 100, failed, tryNo: n }), rules);
        if (rollShakes(c.p, rng).ok) return true;
        failed++;
      }
      return false;
    };
    let a = 0;
    let b = 0;
    for (let i = 0; i < 3000; i++) {
      if (fight(A, 3)) a++;
      if (fight(B, 3)) b++;
    }
    expect(a).toBe(3000);
    expect(b).toBeLessThan(3000);
  });
});

describe("the Bag: tools, treats and Auto", () => {
  const have = (m: Record<string, number>) => (id: string) => m[id] ?? 0;
  const moon = { species: "lunibble", subject: "science", zone: "moon" };

  it("the economy parses the tools and treats from the data", () => {
    expect(eco.items["magic_net"]).toMatchObject({ kind: "net", toolMult: 1 });
    expect(eco.items["silver_net"]!.toolMult).toBe(1.5);
    expect(eco.items["star_net"]).toMatchObject({ kind: "befriend_tool", toolMult: 2.2, firstShakeSafe: true, forSale: false });
    expect(eco.items["friend_card_science"]).toMatchObject({ scope: "subject", scopeId: "science", toolMult: 2, soldAfter: "keeper:1" });
    expect(eco.items["zone_friend_card_moon"]).toMatchObject({ scope: "zone", scopeId: "moon", toolMult: 1.8 });
    expect([eco.items["berry"]!.treatMult, eco.items["biscuit"]!.treatMult, eco.items["pie"]!.treatMult]).toEqual([1.2, 1.4, 1.6]);
  });

  it("a card counts only on its subject or zone; a net always", () => {
    const tools = toolsIn(eco, have({ magic_net: 2, friend_card_math: 1, friend_card_science: 1, zone_friend_card_moon: 1, zone_friend_card_sun: 1 }), moon);
    const by = Object.fromEntries(tools.map((t) => [t.item.id, t]));
    expect(by["magic_net"]).toMatchObject({ mult: 1, applies: true, net: true, rare: false });
    expect(by["friend_card_science"]).toMatchObject({ mult: 2, applies: true, net: false });
    expect(by["friend_card_math"]).toMatchObject({ mult: 1, applies: false });
    expect(by["zone_friend_card_moon"]).toMatchObject({ mult: 1.8, applies: true });
    expect(by["zone_friend_card_sun"]).toMatchObject({ mult: 1, applies: false });
  });

  it("the favourite treat gets +0.3 and is stable for a species", () => {
    const ids = ["berry", "biscuit", "pie"];
    const a = likedTreat("lunibble", ids);
    expect(a).toBe(likedTreat("lunibble", ids));
    expect(ids).toContain(a);
    const treats = treatsIn(eco, have({ berry: 1, biscuit: 1, pie: 1 }), "lunibble", B);
    const liked = treats.find((t) => t.liked)!;
    expect(liked.mult).toBeCloseTo(eco.items[liked.item.id]!.treatMult + 0.3, 10);
    expect(treats.filter((t) => t.liked)).toHaveLength(1);
  });

  it("Auto picks the best matching tool and a liked treat, and never a rare tool unasked", () => {
    const tools = toolsIn(eco, have({ magic_net: 1, silver_net: 1, star_net: 1, friend_card_math: 1 }), moon);
    const treats = treatsIn(eco, have({ berry: 1, biscuit: 1, pie: 1 }), "lunibble", B);
    const pick = autoPick(tools, treats);
    expect(pick.tool).toBe("silver_net");
    expect(pick.treat).toBe(treats.find((t) => t.liked)!.item.id);
    // only a Star Net: nothing is chosen for the child
    expect(autoPick(toolsIn(eco, have({ star_net: 2 }), moon), []).tool).toBeNull();
    // a card of the creature's subject beats a net
    expect(autoPick(toolsIn(eco, have({ silver_net: 1, friend_card_science: 1 }), moon), []).tool).toBe("friend_card_science");
    // no treat is chosen when the liked one is not owned
    const other = treatsIn(eco, have({ [treats.find((t) => !t.liked)!.item.id]: 3 }), "lunibble", B);
    expect(autoPick([], other).treat).toBeNull();
  });
});
