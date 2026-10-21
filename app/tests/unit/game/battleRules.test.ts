import { beforeAll, describe, expect, it } from "vitest";
import type { BattleData } from "../../../src/core/data/battleTypes";
import { WHEEL } from "../../../src/core/game/battleNumbers";
import { creatureStats, speciesBattle } from "../../../src/core/game/battleSpecies";
import { addCreature } from "../../../src/core/game/collection";
import { awakeParty, faint, fainted, nurseHeals, partyDown, usable, wakeWith } from "../../../src/core/game/faint";
import { BIG_PUFF, drawIntent, giggleEvery, giggleShare, type IntentId, puffPower, weightsOf } from "../../../src/core/game/intents";
import { countOf, economy, give } from "../../../src/core/game/items";
import { cardMoves, flames, isHit, WIGGLE } from "../../../src/core/game/moves";
import { WorldState } from "../../../src/core/world/worldState";
import { battleData, gameJson } from "./helpers";

const eco = economy(gameJson("economy.json"));
let data: BattleData;
beforeAll(async () => {
  data = await battleData();
});

describe("the battle data is the app's own (core/data/battleTypes.ts)", () => {
  it("loads and checks the seven files: 50 moves, 14 statuses, 9 intents, 5 temperaments, 8 gifts, 25 families, 70 species", () => {
    expect([data.moves.length, data.statuses.length, data.intents.length, Object.keys(data.temperaments).length, Object.keys(data.gifts).length, Object.keys(data.families).length, Object.keys(data.species).length]).toEqual([50, 14, 9, 5, 8, 25, 70]);
  });

  it("the rules are the numbers of BATTLE_V3 section 5 (the code's own constants agree with the file)", () => {
    const r = data.rules;
    expect(r.wheel).toEqual(WHEEL);
    expect([r.wheel_mult.sparkle, r.wheel_mult.sturdy]).toEqual([1.5, 0.67]);
    expect([r.fog_kind.wild, r.fog_kind.master, r.bands.A.gentle, r.bands.B.gentle, r.bands.C.gentle]).toEqual([2.0, 4.2, 0.55, 0.9, 1.15]);
    expect(r.dozing.heal_only_with).toEqual(["medicine", "nurse"]);
    expect(r.dozing.wakes_at_battle_end).toBe(false);
  });
});

describe("enemy intents (4.3), from intents.json", () => {
  const calm = { lastWasBigPuff: false, sinceGiggle: 99, fogFull: false, puffIsBig: false };

  it("a temperament's weights are folded onto Puff, Giggle and Silly and still add up to 100", () => {
    for (const t of Object.keys(data.temperaments)) {
      const w = weightsOf(data, t);
      expect(w.puff + w.giggle + w.silly, t).toBe(100);
    }
    // attacks (Big Puff, Dizzy Swirl, Sticky Mud) are a Puff; self-care (Thicken, Cheer Up, Drowsy Mist) a Silly Dance
    expect(weightsOf(data, "shy")).toEqual({ puff: 30, giggle: 20, silly: 50 });
    expect(weightsOf(data, "playful")).toEqual({ puff: 55, giggle: 0, silly: 45 });
    expect(weightsOf(data, "grumpy")).toEqual({ puff: 85, giggle: 0, silly: 15 });
    expect(weightsOf(data, "sleepy")).toEqual({ puff: 30, giggle: 15, silly: 55 });
    expect(weightsOf(data, "proud")).toEqual({ puff: 60, giggle: 0, silly: 40 });
  });

  it("the numbers come from the data: a Puff is 50 (40 for a boss), a Giggle gives back 5% at most once in 3 rounds", () => {
    expect([puffPower(data, false), puffPower(data, true), giggleShare(data), giggleEvery(data)]).toEqual([50, 40, 0.05, 3]);
  });

  it("a draw follows the weights", () => {
    const shy = weightsOf(data, "shy");
    expect(drawIntent(0.0, shy, calm)).toBe("puff");
    expect(drawIntent(0.29, shy, calm)).toBe("puff");
    expect(drawIntent(0.3, shy, calm)).toBe("giggle");
    expect(drawIntent(0.5, shy, calm)).toBe("silly");
  });

  it("over many draws every temperament gets its own mix", () => {
    for (const t of Object.keys(data.temperaments)) {
      const w = weightsOf(data, t);
      const n = 4000;
      const count: Record<IntentId, number> = { puff: 0, giggle: 0, silly: 0 };
      for (let i = 0; i < n; i++) count[drawIntent((i + 0.5) / n, w, calm)]++;
      expect(count.puff / n).toBeCloseTo(w.puff / 100, 2);
    }
  });

  it("a Giggle at most once in three rounds and only with fog to give back; after a big Puff a Silly turn", () => {
    const shy = weightsOf(data, "shy");
    expect(drawIntent(0.4, shy, { ...calm, sinceGiggle: 2 })).toBe("silly");
    expect(drawIntent(0.4, shy, { ...calm, sinceGiggle: 3 })).toBe("giggle");
    expect(drawIntent(0.4, shy, { ...calm, fogFull: true })).toBe("silly");
    const grumpy = weightsOf(data, "grumpy");
    expect(drawIntent(0.1, grumpy, { ...calm, lastWasBigPuff: true, puffIsBig: true })).toBe("silly");
    expect(drawIntent(0.1, grumpy, { ...calm, lastWasBigPuff: true, puffIsBig: false })).toBe("puff");
    expect(BIG_PUFF).toBe(0.15);
  });
});

describe("the cards of a creature (3)", () => {
  const ids = (slug: string, level: number, subject: string) => cardMoves(data, slug, level, subject).map((m) => m.id);

  it("a Math starter at level 6: its own hits from the data's equipped list, then coverage from other subjects", () => {
    const m = cardMoves(data, "heliobud", 6, "math");
    expect(m).toHaveLength(4);
    expect(m.slice(0, 3).map((x) => x.id)).toEqual(["sum_spark", "add_it_up", "number_nudge"]);
    expect(m.slice(0, 3).every((x) => x.subject === "math")).toBe(true);
    expect(m[3]!.subject).not.toBe("math");
  });

  it("only moves that are a hit with a question reach the cards: no utility, no Finale, no Wiggle among real ones", () => {
    for (const slug of ["heliobud", "lunibble", "terrabub", "mercurip", "heliolynx"]) {
      for (const level of [1, 3, 6, 10, 15]) {
        const m = cardMoves(data, slug, level, data.species[slug]!.subject);
        expect(m.length, `${slug} ${level}`).toBeGreaterThanOrEqual(1);
        expect(m.length).toBeLessThanOrEqual(4);
        expect(m.every(isHit), `${slug} ${level}`).toBe(true);
        expect(new Set(m.map((x) => x.id)).size).toBe(m.length);
      }
    }
    expect(ids("lunibble", 6, "science")).not.toContain("healing_rain");
  });

  it("what a creature knows follows its level: a move is not offered before it is learned", () => {
    expect(ids("heliobud", 3, "math")).not.toContain("add_it_up");
    expect(ids("heliobud", 4, "math")).toContain("add_it_up");
    expect(ids("heliobud", 8, "math")).toContain("times_twister");
  });

  it("a stretch move asks a stretch question; the Wiggle asks none and has no limit", () => {
    expect(data.movesById["times_twister"]).toMatchObject({ tier: "S", question: "S", power: 85 });
    expect(data.movesById[WIGGLE]).toMatchObject({ tier: "W", question: "none", charges: null, power: 25 });
    expect(flames("E")).toBeLessThan(flames("N"));
  });

  it("an unknown species still gets cards (the plain attacks of the wheel's coverage), never an empty grid", () => {
    expect(cardMoves(data, "nobody", 5, "math").length).toBeGreaterThanOrEqual(1);
  });
});

describe("species in a battle (5.7), from species_battle.json", () => {
  it("every species has stats of the starters' table: Heliobud level 10 is Pep 50, Power 49, Guard 36, Speed 45", () => {
    const sp = speciesBattle(data, "heliobud");
    expect(creatureStats(sp, 10)).toEqual({ pep: 50, power: 49, guard: 36, speed: 45 });
    expect(creatureStats(speciesBattle(data, "heliolynx"), 14)).toEqual({ pep: 72, power: 72, guard: 52, speed: 66 });
    expect(creatureStats(speciesBattle(data, "heliarch"), 24)).toEqual({ pep: 123, power: 127, guard: 92, speed: 116 });
  });

  it("the subject, the extra weak subject and the temperament come from the data", () => {
    expect(speciesBattle(data, "mercurip")).toMatchObject({ subject: "science", weak: ["hebrew"], temperament: "playful" });
    expect(speciesBattle(data, "rustip")).toMatchObject({ subject: "logic", weak: ["hebrew"], temperament: "grumpy" });
    expect(speciesBattle(data, "terrabub")).toMatchObject({ subject: "geometry", weak: ["science"] });
  });

  it("an unknown species is plain", () => {
    expect(speciesBattle(data, "nobody", "geometry")).toMatchObject({ subject: "geometry", temperament: "playful", weak: [], bases: { bp: 10, bw: 10, bg: 10, bs: 10 } });
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

  it("only medicine that wakes can wake: the Wake Berry (half Pep) and the Sunrise Berry (full), not the heals", () => {
    const w = team();
    give(w, eco, "wake_berry", 1);
    give(w, eco, "sunrise_berry", 1);
    give(w, eco, "spring_tonic", 1);
    faint(w.creatures[1]!);
    expect(wakeWith(w, eco, "c1", "wake_berry")).toBe(0);
    expect(wakeWith(w, eco, "c2", "spring_tonic")).toBe(0);
    expect(wakeWith(w, eco, "nope", "wake_berry")).toBe(0);
    expect(w.creatures[1]!.fainted).toBe(true);
    expect(wakeWith(w, eco, "c2", "wake_berry")).toBe(0.5);
    expect(w.creatures[1]!.fainted).toBeUndefined();
    expect(countOf(w, "wake_berry")).toBe(0);
    faint(w.creatures[2]!);
    expect(wakeWith(w, eco, "c3", "sunrise_berry")).toBe(1);
  });

  it("the shop sells the waking medicine: the Wake Berry for 25 coins on the medicine shelf", () => {
    expect(eco.items["wake_berry"]).toMatchObject({ kind: "medicine", price: 25, shelf: "medicine", healsDozing: true, effect: "wake" });
    expect(Object.values(eco.items).filter((i) => i.healsDozing).map((i) => i.id)).toEqual(["wake_berry", "sunrise_berry"]);
  });

  it("fainted is saved with the creature and comes back; an awake creature writes nothing extra", () => {
    const w = team();
    faint(w.creatures[2]!);
    const d = JSON.parse(JSON.stringify(w.toDict())) as { creatures: Record<string, unknown>[] };
    expect(d.creatures[2]!["fainted"]).toBe(true);
    expect("fainted" in d.creatures[0]!).toBe(false);
    const back = WorldState.fromDict(d);
    expect(back.creatures.map((c) => c.fainted === true)).toEqual([false, false, true, false, false]);
    expect(WorldState.fromDict({ schema_version: 1, money: 0, variables: {}, creatures: [{ id: "c1", species: "heliobud", level: 3, xp: 0 }] }).creatures[0]!.fainted).toBeUndefined();
  });
});
