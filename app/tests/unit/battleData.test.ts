/// <reference types="node" />
// @vitest-environment node
/**
 * The battle data of docs/app/BATTLE_V3.md as the engine will read it:
 * the seven files load through `loadBattleData`, hold the counts of the
 * spec, and a broken file stops the load with the file's name.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BATTLE_COUNTS,
  BATTLE_FILES,
  loadBattleData,
  type BattleData,
  type FetchJson,
  type Move,
} from "../../src/core/data/battleTypes";

const shipped: FetchJson = async (path) => JSON.parse(readFileSync(`public/game/${path}`, "utf8")) as unknown;

/** The shipped files with one file changed. */
const patched = (file: string, change: (doc: any) => void): FetchJson => async (path) => {
  const doc = (await shipped(path)) as any;
  if (path === file) change(doc);
  return doc;
};

describe("loadBattleData", () => {
  let data: BattleData;
  it("loads the seven files the build writes", async () => {
    const asked: string[] = [];
    data = await loadBattleData(async (p) => {
      asked.push(p);
      return shipped(p);
    });
    expect(asked.sort()).toEqual([...BATTLE_FILES].sort());
    expect(data.moves).toHaveLength(BATTLE_COUNTS.moves);
    expect(data.statuses).toHaveLength(BATTLE_COUNTS.statuses);
    expect(data.intents).toHaveLength(BATTLE_COUNTS.intents);
    expect(Object.keys(data.temperaments)).toHaveLength(BATTLE_COUNTS.temperaments);
    expect(Object.keys(data.gifts)).toHaveLength(BATTLE_COUNTS.gifts);
    expect(Object.keys(data.families)).toHaveLength(BATTLE_COUNTS.families);
    expect(Object.keys(data.species)).toHaveLength(BATTLE_COUNTS.species);
  });

  it("indexes moves, statuses and intents by id", async () => {
    data = await loadBattleData(shipped);
    const sum: Move = data.movesById["sum_spark"]!;
    expect(sum).toMatchObject({ n: 2, he: "ניצוץ סכום", subject: "math", tier: "N", power: 60, charges: 10, unlock_level: 1 });
    expect(data.movesById["little_wiggle"]).toMatchObject({ charges: null, question: "none", power: 25 });
    expect(data.statusesById["drowsy"]!.he).toBe("מנומנם");
    expect(data.intentsById["fog_puff"]!.power).toBe(50);
    expect(data.temperaments["grumpy"]!.weights.fog_puff).toBe(50);
  });

  it("gives the numbers of the spec: stats, Fog, the wheel and the master", async () => {
    data = await loadBattleData(shipped);
    const heliobud = data.species["heliobud"]!;
    expect(heliobud).toMatchObject({ subject: "math", bases: [10, 11, 8, 10], stage: 0, stage_mult: 1, catch_rate: 200 });
    expect(data.species["heliarch"]).toMatchObject({ stage: 2, stage_mult: 1.45, catch_rate: 100 });
    expect(heliobud.equipped["10"]).toEqual(["sum_spark", "add_it_up", "total", "times_twister"]);
    expect(data.rules.wheel).toEqual(["math", "logic", "geometry", "science", "english", "hebrew"]);
    expect(data.rules.damage.wrong_quality).toBe(0.35);
    expect(data.rules.bands.A.gentle).toBe(0.55);
    expect(data.rules.dozing.wakes_at_battle_end).toBe(false);
    expect(data.encounters.master).toMatchObject({ species: "jovigale", level_floor: 18 });
    expect(data.encounters.guardians.map((g) => g.species)).toEqual(["lunwarden", "heliarch", "marstrix", "ringwarden", "nepstorm"]);
    expect(data.encounters.zones["route1"]!.levels).toEqual([3, 8]);
  });

  it("gives every creature four real moves by level 10, all known moves", async () => {
    data = await loadBattleData(shipped);
    for (const [slug, s] of Object.entries(data.species)) {
      const slot = s.equipped["10"]!;
      expect(slot, slug).toHaveLength(4);
      expect(slot, slug).not.toContain("little_wiggle");
      for (const id of slot) expect(data.movesById[id], `${slug} ${id}`).toBeDefined();
    }
  });

  it("covers the six subjects in every zone but the first", async () => {
    data = await loadBattleData(shipped);
    for (const [zone, t] of Object.entries(data.encounters.zones)) {
      const share = Object.values(t.subject_share);
      expect(Math.max(...share), zone).toBeLessThanOrEqual(0.5);
      if (zone !== "moon") expect(share.length, zone).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("loadBattleData stops at the door", () => {
  it("names the file when one is missing", async () => {
    const missing: FetchJson = async (p) => {
      if (p === "gifts.json") throw new Error("404 gifts.json");
      return shipped(p);
    };
    await expect(loadBattleData(missing)).rejects.toThrow("gifts.json");
  });

  it("refuses a move list of the wrong size", async () => {
    await expect(loadBattleData(patched("moves.json", (d) => d.moves.pop()))).rejects.toThrow(/moves\.json: moves must be a list of 50/);
  });

  it("refuses a species that learns a move that does not exist", async () => {
    const bad = patched("species_battle.json", (d) => {
      d.species.heliobud.learnset.push({ level: 3, move: "ghost_move", from: "home" });
    });
    await expect(loadBattleData(bad)).rejects.toThrow(/heliobud learns ghost_move/);
  });

  it("refuses a move that names a status that does not exist", async () => {
    const bad = patched("moves.json", (d) => {
      d.moves[11].effects = [{ type: "status", status: "ghost", chance: 0.3 }];
    });
    await expect(loadBattleData(bad)).rejects.toThrow(/unknown status ghost/);
  });

  it("refuses a temperament that weighs an intent that does not exist", async () => {
    const bad = patched("intents.json", (d) => {
      d.temperaments[0].weights.ghost = 5;
    });
    await expect(loadBattleData(bad)).rejects.toThrow(/unknown intent ghost/);
  });

  it("refuses a rules file without a wheel", async () => {
    await expect(loadBattleData(patched("battle_rules.json", (d) => delete d.wheel))).rejects.toThrow(/battle_rules\.json/);
  });
});
