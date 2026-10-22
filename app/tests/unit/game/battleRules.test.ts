import { beforeAll, describe, expect, it } from "vitest";
import type { BattleData } from "../../../src/core/data/battleTypes";
import { WHEEL } from "../../../src/core/game/battleNumbers";
import { creatureStats, speciesBattle } from "../../../src/core/game/battleSpecies";
import { addCreature } from "../../../src/core/game/collection";
import { awakeParty, faint, fainted, nurseHeals, partyDown, usable, wakeWith } from "../../../src/core/game/faint";
import { BIG_PUFF, bigPuffPower, drawIntent, giggleEvery, giggleShare, type IntentId, puffPower, weightsOf } from "../../../src/core/game/intents";
import { countOf, economy, give } from "../../../src/core/game/items";
import { cardMoves, flames, isCard, finaleOf, WIGGLE } from "../../../src/core/game/moves";
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
  const calm = { lastWasBigPuff: false, sinceGiggle: 99, fogFull: false, puffIsBig: false, level: 10 };

  it("the five temperaments' weights are the data's own and add up to 100; the spec's table", () => {
    for (const t of Object.keys(data.temperaments)) {
      const w = weightsOf(data, t);
      expect(Object.values(w).reduce((a, b) => a + (b ?? 0), 0), t).toBe(100);
    }
    expect(weightsOf(data, "shy")).toEqual({ thicken: 30, giggle: 20, fog_puff: 30, silly_dance: 20 });
    expect(weightsOf(data, "playful")).toEqual({ silly_dance: 30, fog_puff: 30, dizzy_swirl: 15, sticky_mud: 10, cheer_up: 15 });
    expect(weightsOf(data, "grumpy")).toEqual({ fog_puff: 50, big_puff: 20, cheer_up: 15, sticky_mud: 15 });
    expect(weightsOf(data, "sleepy")).toEqual({ drowsy_mist: 30, silly_dance: 25, fog_puff: 30, giggle: 15 });
    expect(weightsOf(data, "proud")).toEqual({ cheer_up: 20, big_puff: 25, fog_puff: 35, thicken: 20 });
  });

  it("the numbers come from the data: a Puff is 50 (40 for a boss), a Big Puff 60, a Giggle gives back 5% at most once in 3 rounds", () => {
    expect([puffPower(data, false), puffPower(data, true), bigPuffPower(data), giggleShare(data), giggleEvery(data)]).toEqual([50, 40, 60, 0.05, 3]);
  });

  it("a draw follows the weights, in the order of the nine intents", () => {
    const shy = weightsOf(data, "shy");
    expect(drawIntent(0.0, shy, calm)).toBe("fog_puff");
    expect(drawIntent(0.29, shy, calm)).toBe("fog_puff");
    expect(drawIntent(0.3, shy, calm)).toBe("thicken");
    expect(drawIntent(0.6, shy, calm)).toBe("giggle");
    expect(drawIntent(0.9, shy, calm)).toBe("silly_dance");
  });

  it("over many draws every temperament gets its own mix", () => {
    for (const t of Object.keys(data.temperaments)) {
      const w = weightsOf(data, t);
      const n = 4000;
      const count: Partial<Record<IntentId, number>> = {};
      // level 20 and a calm state: nothing is replaced
      for (let i = 0; i < n; i++) {
        const id = drawIntent((i + 0.5) / n, w, { ...calm, level: 20 });
        count[id] = (count[id] ?? 0) + 1;
      }
      for (const [id, pct] of Object.entries(w)) expect((count[id as IntentId] ?? 0) / n, `${t} ${id}`).toBeCloseTo((pct ?? 0) / 100, 2);
    }
  });

  it("the rules: Giggle once in three rounds and only with fog to give; a Silly turn after a big hit; no Big Puff before level 8; never two statuses in a row; Drowsy Mist is a Silly Dance in band A", () => {
    const shy = weightsOf(data, "shy");
    expect(drawIntent(0.6, shy, { ...calm, sinceGiggle: 2 })).toBe("silly_dance");
    expect(drawIntent(0.6, shy, { ...calm, sinceGiggle: 3 })).toBe("giggle");
    expect(drawIntent(0.6, shy, { ...calm, fogFull: true })).toBe("silly_dance");
    const grumpy = weightsOf(data, "grumpy");
    expect(drawIntent(0.1, grumpy, { ...calm, lastWasBigPuff: true, puffIsBig: true })).toBe("silly_dance");
    expect(drawIntent(0.1, grumpy, { ...calm, lastWasBigPuff: true, puffIsBig: false })).toBe("fog_puff");
    expect(drawIntent(0.6, grumpy, calm)).toBe("big_puff");
    expect(drawIntent(0.6, grumpy, { ...calm, level: 7 })).toBe("fog_puff");
    const playful = weightsOf(data, "playful");
    expect(drawIntent(0.4, playful, calm)).toBe("dizzy_swirl");
    expect(drawIntent(0.4, playful, { ...calm, lastWasStatus: true })).toBe("silly_dance");
    expect(drawIntent(0.4, playful, { ...calm, childMajor: true })).toBe("silly_dance");
    const sleepy = weightsOf(data, "sleepy");
    expect(drawIntent(0.1, sleepy, calm)).toBe("drowsy_mist");
    expect(drawIntent(0.1, sleepy, { ...calm, bandA: true })).toBe("silly_dance");
    expect(drawIntent(0.1, sleepy, { ...calm, childMajor: true })).toBe("silly_dance");
    expect(drawIntent(0.1, weightsOf(data, "proud"), { ...calm, powerMax: true })).toBe("fog_puff");
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

  it("the grid holds up to four of the creature's real moves (utility moves too); no Finale, no Wiggle among them", () => {
    for (const slug of ["heliobud", "lunibble", "terrabub", "mercurip", "heliolynx", "venubud", "rustip"]) {
      for (const level of [1, 3, 6, 10, 15]) {
        const m = cardMoves(data, slug, level, data.species[slug]!.subject);
        expect(m.length, `${slug} ${level}`).toBeGreaterThanOrEqual(1);
        expect(m.length).toBeLessThanOrEqual(4);
        expect(m.every(isCard), `${slug} ${level}`).toBe(true);
        expect(m.every((x) => x.unlock_level <= level), `${slug} ${level}`).toBe(true);
        expect(new Set(m.map((x) => x.id)).size).toBe(m.length);
      }
    }
    expect(ids("lunibble", 6, "science")).toContain("healing_rain");
    expect(ids("terrabub", 3, "geometry")).toContain("round_bubble");
    expect(ids("venubud", 5, "hebrew")).toContain("lullaby");
  });

  it("the Finale has its own slot, from level 6, the creature's subject", () => {
    expect(finaleOf(data, "heliobud", 5)).toBeNull();
    expect(finaleOf(data, "heliobud", 6)?.id).toBe("star_shower");
    expect(finaleOf(data, "lunibble", 6)?.id).toBe("comet_parade");
    expect(finaleOf(data, "venubud", 9)?.id).toBe("song_of_letters");
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
