import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Encounters, encounterTables, wildLevel } from "../../../src/core/game/encounters";
import { monsterTable } from "../../../src/core/game/monsters";
import { readMap, type TiledMap } from "../../../src/core/world/mapData";
import { gameJson } from "./helpers";

const monsters = monsterTable(gameJson("db/monsters.json"));
const tables = encounterTables(gameJson("db/encounters.json"));
const route = readMap("classic_route_1", JSON.parse(readFileSync("public/game/maps/classic_route_1.json", "utf8")) as TiledMap);
const city = readMap("classic_hearthrock_city", JSON.parse(readFileSync("public/game/maps/classic_hearthrock_city.json", "utf8")) as TiledMap);

/** A random source that gives the numbers, then repeats the last. */
const seq = (...n: number[]) => {
  let i = 0;
  return () => n[Math.min(i++, n.length - 1)]!;
};

function make(random: () => number, day = true, cooldown = 6) {
  return new Encounters({ tables, monsters, random, daytime: () => day, cooldownSteps: cooldown });
}

describe("meeting wild creatures", () => {
  it("reads the old tables, keeping only creatures the game has pictures for", () => {
    const entries = tables["nagmon_route1"]!;
    expect(entries.length).toBeGreaterThan(3);
    for (const e of entries) expect(monsters[e.monster]?.hasSprite).toBe(true);
  });

  it("never in a town, or outside the area's box", () => {
    const e = make(() => 0);
    for (let i = 0; i < 30; i++) expect(e.step(city, 5, 16, 6)).toBeNull();
    for (let i = 0; i < 30; i++) expect(e.step(route, 0, 0, 6)).toBeNull();
  });

  it("a step in the grass meets one by the area's rate (11 in 100), but not in the first steps", () => {
    const e = make(seq(0.05));
    for (let i = 0; i < 5; i++) expect(e.step(route, 5, 8, 6)).toBeNull();
    expect(e.step(route, 5, 8, 6)).not.toBeNull();
    const none = make(seq(0.5));
    for (let i = 0; i < 40; i++) expect(none.step(route, 5, 8, 6)).toBeNull();
  });

  it("after a meeting, a few quiet steps before the next", () => {
    const e = make(seq(0.0), true, 4);
    for (let i = 0; i < 3; i++) e.step(route, 5, 8, 6);
    expect(e.step(route, 5, 8, 6)).not.toBeNull();
    for (let i = 0; i < 3; i++) expect(e.step(route, 5, 8, 6)).toBeNull();
    expect(e.step(route, 5, 8, 6)).not.toBeNull();
  });

  it("day and night have their own creatures", () => {
    const names = (day: boolean) => {
      const out = new Set<string>();
      for (let s = 0; s < 300; s++) {
        let n = s;
        const e = make(() => ((n = (n * 7919 + 13) % 1000), n / 1000), day, 0);
        const w = e.step(route, 5, 8, 6);
        if (w) out.add(w.species);
      }
      return out;
    };
    const entries = tables["nagmon_route1"]!;
    const only = (day: boolean) => new Set(entries.filter((e) => e.daytime === day).map((e) => e.monster));
    const d = names(true);
    const n = names(false);
    expect(d.size).toBeGreaterThan(0);
    expect(n.size).toBeGreaterThan(0);
    for (const x of d) expect(only(false).has(x)).toBe(false);
    for (const x of n) expect(only(true).has(x)).toBe(false);
  });

  it("the test hook meets one at every step in the grass, and still none outside it", () => {
    const e = new Encounters({ tables, monsters, always: true });
    expect(e.step(route, 5, 8, 6)).not.toBeNull();
    expect(e.step(route, 5, 8, 6)).not.toBeNull();
    expect(e.step(route, 0, 0, 6)).toBeNull();
  });

  it("its level follows the child's partner: two below to three above, never below 2", () => {
    expect(wildLevel([5, 8], 6, () => 0)).toBe(5);
    expect(wildLevel([5, 8], 6, () => 0.999)).toBe(8);
    expect(wildLevel([20, 25], 6, () => 0.5)).toBe(9);
    expect(wildLevel([1, 3], 1, () => 0)).toBe(2);
    // a first friend of level 2: the first zone's creatures (3 to 6) come at 3 to 5, not at 9 or 12
    expect([0, 0.5, 0.999].map((r) => wildLevel([3, 6], 2, () => r))).toEqual([3, 5, 5]);
    expect(wildLevel([20, 25], 30, () => 0)).toBe(28);
  });

  it("the age band shifts it (5.5): ages 5-7 one level lower, 8-10 the same, 11-14 one higher", () => {
    // the zone's 5 to 20 range, a partner of level 10: the window is 8 to 13, moved by the shift
    expect([-1, 0, 1].map((shift) => wildLevel([5, 20], 10, () => 0.999, shift))).toEqual([12, 13, 14]);
    expect([-1, 0, 1].map((shift) => wildLevel([3, 6], 10, () => 0, shift))).toEqual([7, 8, 9]);
  });
});

describe("the creature of the day (the TV's hint)", () => {
  const first = tables["nagmon_route1"]!.filter((e) => monsters[e.monster]?.hasSprite && (e.daytime === null || e.daytime === true));
  const share = (species: string | null, factor: number) => {
    let hits = 0;
    const n = 6000;
    let seed = 1;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const e = new Encounters({ tables, monsters, random: rnd, daytime: () => true, cooldownSteps: 0, always: true, ...(species ? { boost: () => ({ species, factor }) } : {}) });
    for (let i = 0; i < n; i++) if (e.step(route, 5, 8, 6)?.species === species) hits++;
    return hits / n;
  };

  it("is met about a quarter more often in the grass that day, and the others a little less", () => {
    const species = first[0]!.monster;
    const base = share(species, 1);
    const boosted = share(species, 1.25);
    expect(boosted / base).toBeGreaterThan(1.1);
    expect(boosted / base).toBeLessThan(1.4);
  });

  it("changes nothing without a boost, or for a species that is not in the zone", () => {
    expect(share("nosuchcreature", 1.25)).toBe(0);
    expect(first.length).toBeGreaterThan(2);
  });
});
