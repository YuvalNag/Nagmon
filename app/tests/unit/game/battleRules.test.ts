import { describe, expect, it } from "vitest";
import { addCreature } from "../../../src/core/game/collection";
import { awakeParty, faint, fainted, nurseHeals, partyDown, usable, useMedicine } from "../../../src/core/game/faint";
import { BIG_PUFF, drawIntent, GIGGLE_EVERY, type IntentId, WEIGHTS } from "../../../src/core/game/intents";
import { countOf, economy, give } from "../../../src/core/game/items";
import { equipped, flames, movesFrom, DEFAULT_MOVES, WIGGLE } from "../../../src/core/game/moves";
import { monsterTable } from "../../../src/core/game/monsters";
import { CHAPTER1, speciesBattle } from "../../../src/core/game/battleSpecies";
import { WHEEL } from "../../../src/core/game/battleNumbers";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { WorldState } from "../../../src/core/world/worldState";
import { gameJson } from "./helpers";

const eco = economy(gameJson("economy.json"));
const monsters = monsterTable(gameJson("db/monsters.json"));
const subjects = SubjectMap.fromDoc(gameJson("content/subjects.json"));

describe("enemy intents (4.3)", () => {
  const calm = { lastWasBigPuff: false, sinceGiggle: 99, fogFull: false, puffIsBig: false };

  it("the weights add up to the spec's table: a Puff is its attacks, a Silly Dance is its self-care", () => {
    // the spec's 4.3 table, with Big Puff, Dizzy Swirl and Sticky Mud as attacks and Thicken, Cheer Up, Drowsy Mist as self-care
    expect(WEIGHTS.shy).toEqual({ puff: 30, giggle: 20, silly: 30 + 20 });
    expect(WEIGHTS.playful).toEqual({ puff: 30 + 15 + 10, giggle: 0, silly: 30 + 15 });
    expect(WEIGHTS.grumpy).toEqual({ puff: 50 + 20 + 15, giggle: 0, silly: 15 });
    expect(WEIGHTS.sleepy).toEqual({ puff: 30, giggle: 15, silly: 25 + 30 });
    expect(WEIGHTS.proud).toEqual({ puff: 35 + 25, giggle: 0, silly: 20 + 20 });
    for (const w of Object.values(WEIGHTS)) expect(w.puff + w.giggle + w.silly).toBe(100);
  });

  it("a draw follows the weights", () => {
    expect(drawIntent(0.0, "shy", calm)).toBe("puff");
    expect(drawIntent(0.29, "shy", calm)).toBe("puff");
    expect(drawIntent(0.3, "shy", calm)).toBe("giggle");
    expect(drawIntent(0.5, "shy", calm)).toBe("silly");
    expect(drawIntent(0.99, "grumpy", calm)).toBe("silly");
  });

  it("over many draws every temperament gets its own mix", () => {
    for (const [t, w] of Object.entries(WEIGHTS)) {
      const n = 4000;
      const count: Record<IntentId, number> = { puff: 0, giggle: 0, silly: 0 };
      for (let i = 0; i < n; i++) count[drawIntent((i + 0.5) / n, t as keyof typeof WEIGHTS, calm)]++;
      expect(count.puff / n).toBeCloseTo(w.puff / 100, 2);
    }
  });

  it("a Giggle comes at most once in three rounds and only when there is fog to give back; otherwise it is a Silly turn", () => {
    expect(drawIntent(0.4, "shy", { ...calm, sinceGiggle: GIGGLE_EVERY - 1 })).toBe("silly");
    expect(drawIntent(0.4, "shy", { ...calm, sinceGiggle: GIGGLE_EVERY })).toBe("giggle");
    expect(drawIntent(0.4, "shy", { ...calm, fogFull: true })).toBe("silly");
  });

  it("after a big Puff the child gets a Silly turn rather than another big Puff; a small Puff may follow", () => {
    expect(drawIntent(0.1, "grumpy", { ...calm, lastWasBigPuff: true, puffIsBig: true })).toBe("silly");
    expect(drawIntent(0.1, "grumpy", { ...calm, lastWasBigPuff: true, puffIsBig: false })).toBe("puff");
    expect(BIG_PUFF).toBe(0.15);
  });
});

describe("the moves table (3)", () => {
  it("the default has the plain attacks of the six subjects and the Little Wiggle", () => {
    const subjectsOf = new Set(Object.values(DEFAULT_MOVES).map((m) => m.subject));
    for (const s of WHEEL) expect(subjectsOf.has(s)).toBe(true);
    for (const s of WHEEL) {
      const mine = Object.values(DEFAULT_MOVES).filter((m) => m.subject === s);
      expect(mine.map((m) => [m.tier, m.mp, m.charges]).sort()).toEqual([["E", 40, 15], ["N", 60, 10]]);
    }
    expect(DEFAULT_MOVES[WIGGLE]).toMatchObject({ tier: "W", mp: 25, charges: null });
    expect(flames("E")).toBeLessThan(flames("N"));
  });

  it("the spec's names for the first six: Number Nudge, Sum Spark, Dot Tap, Block Bounce, Leaf Flick, Splash", () => {
    for (const id of ["number_nudge", "sum_spark", "dot_tap", "block_bounce", "leaf_flick", "splash"]) expect(DEFAULT_MOVES[id]).toBeDefined();
  });

  it("a loaded table adds moves and keeps the plain attacks and the Wiggle; unreadable rows are left out", () => {
    const t = movesFrom({
      moves: [
        { id: "times_twister", subject: "math", tier: "S", mp: 85, charges: 6, lv: 8 },
        { id: "bad_tier", subject: "math", tier: "X", mp: 1, charges: 1, lv: 1 },
        { id: "bad_subject", subject: "art", tier: "E", mp: 1, charges: 1, lv: 1 },
        { subject: "math", tier: "E" },
        "nonsense",
      ],
    });
    expect(t["times_twister"]).toEqual({ id: "times_twister", subject: "math", tier: "S", mp: 85, charges: 6, lv: 8 });
    expect(t["bad_tier"]).toBeUndefined();
    expect(t["bad_subject"]).toBeUndefined();
    expect(t["sum_spark"]).toBeDefined();
    expect(t[WIGGLE]).toBeDefined();
    expect(Object.keys(movesFrom(null))).toEqual(Object.keys(DEFAULT_MOVES));
  });

  it("a creature knows the plain attacks of its own subject up to its level, and two coverage moves besides", () => {
    for (const s of WHEEL) {
      const m = equipped(s, 6);
      expect(m).toHaveLength(4);
      expect(m.slice(0, 2).map((x) => [x.subject, x.tier])).toEqual([[s, "E"], [s, "N"]]);
      expect(new Set(m.map((x) => x.subject)).size).toBe(3);
    }
    const heavy = movesFrom({ moves: [{ id: "late", subject: "math", tier: "N", mp: 70, charges: 8, lv: 9 }] });
    expect(equipped("math", 5, heavy).map((x) => x.id)).not.toContain("late");
  });
});

describe("species in a battle (5.7)", () => {
  it("the first chapter's table: 25 families, each with a subject, bases around 8 to 13 and one extra weak subject", () => {
    expect(Object.keys(CHAPTER1)).toHaveLength(25);
    for (const [slug, row] of Object.entries(CHAPTER1)) {
      expect(WHEEL, slug).toContain(row.subject);
      expect(WHEEL, slug).toContain(row.weak);
      for (const b of row.bases) expect(b, slug).toBeGreaterThanOrEqual(7);
      for (const b of row.bases) expect(b, slug).toBeLessThanOrEqual(13);
    }
    // every family of the first chapter's zones is in the table
    const roots = Object.values(monsters).filter((m) => m.family === m.slug && m.slug in CHAPTER1);
    expect(roots.length).toBeGreaterThanOrEqual(20);
  });

  it("a grown-up form uses its family's table and its own stage", () => {
    const sp = speciesBattle(monsters["heliolynx"], "heliolynx", subjects);
    expect(sp).toMatchObject({ stage: "stage1", subject: "math", weak: ["science"], temperament: "playful", bases: { bp: 10, bw: 11, bg: 8, bs: 10 } });
  });

  it("the data's own fields win over the table, and an unknown species is plain", () => {
    const info = { slug: "x", types: [], stage: "basic", evolutions: [], hasSprite: true, battle: { bp: 12, weak: ["logic"], temperament: "shy", subject: "hebrew" } };
    expect(speciesBattle(info, "x", subjects)).toMatchObject({ subject: "hebrew", weak: ["logic"], temperament: "shy", bases: { bp: 12, bw: 10, bg: 10, bs: 10 } });
    expect(speciesBattle(undefined, "nobody", subjects)).toMatchObject({ temperament: "playful", weak: [], bases: { bp: 10, bw: 10, bg: 10, bs: 10 } });
  });

  it("the db's own battle fields are read from the monsters table, nested or at the top", () => {
    const t = monsterTable({
      a: { stage: "basic", types: [], sprites: null, evolutions: [], history: [{ slug: "a" }], battle: { bp: 11, bw: 9, weak: ["math"] } },
      b: { stage: "basic", types: [], sprites: null, evolutions: [], bp: 8, bs: 12, temperament: "grumpy" },
    });
    expect(t["a"]!.battle).toEqual({ bp: 11, bw: 9, weak: ["math"] });
    expect(t["a"]!.family).toBe("a");
    expect(t["b"]!.battle).toEqual({ bp: 8, bs: 12, temperament: "grumpy" });
  });
});

describe("fainting rules (the parent's decision)", () => {
  function team() {
    const w = new WorldState();
    for (const sp of ["heliobud", "lunibble", "terrabub", "heliobud", "lunibble"]) addCreature(w, sp, 5);
    return w;
  }

  it("a fainted creature is not usable, not in the awake party, and the whole party can be down", () => {
    const w = team();
    expect(awakeParty(w)).toHaveLength(4);
    faint(w.creatures[0]!);
    expect(usable(w.creatures[0]!)).toBe(false);
    expect(awakeParty(w).map((c) => c.id)).toEqual(["c2", "c3", "c4"]);
    expect(partyDown(w)).toBe(false);
    for (const c of w.creatures.slice(0, 4)) faint(c);
    expect(partyDown(w)).toBe(true);
    expect(fainted(w)).toHaveLength(4);
  });

  it("the nurse heals everybody, the Meadow too, free", () => {
    const w = team();
    for (const c of w.creatures) faint(c);
    w.money = 9;
    expect(nurseHeals(w)).toBe(5);
    expect(fainted(w)).toEqual([]);
    expect(w.money).toBe(9);
    expect(nurseHeals(w)).toBe(0);
  });

  it("medicine heals one sleeping friend and is used up; it does nothing for an awake one, an unknown one, or another item", () => {
    const w = team();
    give(w, eco, "medicine", 2);
    give(w, eco, "berry", 1);
    faint(w.creatures[1]!);
    expect(useMedicine(w, eco, "c1", "medicine")).toBe(false);
    expect(countOf(w, "medicine")).toBe(2);
    expect(useMedicine(w, eco, "nope", "medicine")).toBe(false);
    expect(useMedicine(w, eco, "c2", "berry")).toBe(false);
    expect(useMedicine(w, eco, "c2", "medicine")).toBe(true);
    expect(w.creatures[1]!.fainted).toBeUndefined();
    expect(countOf(w, "medicine")).toBe(1);
  });

  it("the shop sells the medicine for 25 coins, in the snacks tab", () => {
    expect(eco.items["medicine"]).toMatchObject({ kind: "medicine", price: 25, tab: "snacks" });
  });

  it("fainted is saved with the creature and comes back; an awake creature writes nothing extra", () => {
    const w = team();
    faint(w.creatures[2]!);
    const d = JSON.parse(JSON.stringify(w.toDict())) as { creatures: Record<string, unknown>[] };
    expect(d.creatures[2]!["fainted"]).toBe(true);
    expect("fainted" in d.creatures[0]!).toBe(false);
    const back = WorldState.fromDict(d);
    expect(back.creatures.map((c) => c.fainted === true)).toEqual([false, false, true, false, false]);
    // an old save has none
    expect(WorldState.fromDict({ schema_version: 1, money: 0, variables: {}, creatures: [{ id: "c1", species: "heliobud", level: 3, xp: 0 }] }).creatures[0]!.fainted).toBeUndefined();
  });
});
