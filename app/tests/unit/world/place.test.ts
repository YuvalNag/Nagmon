import { describe, expect, it } from "vitest";
import { CollisionGrid } from "../../../src/core/world/grid";
import { PlaceSaver, parsePlace, placeIsFree } from "../../../src/core/world/place";
import { WorldState } from "../../../src/core/world/worldState";

const grid = new CollisionGrid({ rows: ["...", ".#.", "..r"], regions: { "2,2": { enter_from: ["up"], exit_from: [] } }, lines: [] }, 3, 3);

describe("the saved place", () => {
  it("reads a good place and drops anything else", () => {
    expect(parsePlace({ map: "m", x: 2, y: 3, facing: "left" })).toEqual({ map: "m", x: 2, y: 3, facing: "left" });
    expect(parsePlace({ map: "m", x: 2, y: 3 })).toEqual({ map: "m", x: 2, y: 3, facing: "down" });
    for (const bad of [null, 5, [], {}, { map: "", x: 1, y: 1 }, { map: "m", x: -1, y: 1 }, { map: "m", x: 1.5, y: 1 }, { map: "../x", x: 1, y: 1 }, { map: "m", x: "1", y: 1 }]) {
      expect(parsePlace(bad)).toBeNull();
    }
    expect(parsePlace({ map: "m", x: 1, y: 1, facing: "sideways" })?.facing).toBe("down");
  });

  it("is saved in world.json only when there is one, and an old save loads as before", () => {
    const w = new WorldState();
    expect(w.toDict()).not.toHaveProperty("place");
    w.place = { map: "m", x: 1, y: 2, facing: "up" };
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict())));
    expect(back.place).toEqual({ map: "m", x: 1, y: 2, facing: "up" });
    expect(WorldState.fromDict({ schema_version: 1, money: 3, variables: {} }).place).toBeNull();
    expect(WorldState.fromDict({ money: 3, place: "junk" }).place).toBeNull();
  });

  it("is a free tile: inside, not a wall, not a region edge, nobody on it", () => {
    expect(placeIsFree(grid, 0, 0, () => false)).toBe(true);
    expect(placeIsFree(grid, 1, 1, () => false)).toBe(false);
    expect(placeIsFree(grid, 2, 2, () => false)).toBe(false);
    expect(placeIsFree(grid, 3, 0, () => false)).toBe(false);
    expect(placeIsFree(grid, 0, 0, (x, y) => x === 0 && y === 0)).toBe(false);
  });
});

describe("saving the place", () => {
  function saver() {
    let now = 0;
    const writes: unknown[] = [];
    const s = new PlaceSaver((p) => writes.push(p), () => now);
    return { s, writes, at: (t: number) => (now = t) };
  }
  const p = (x: number) => ({ map: "m", x, y: 0, facing: "down" as const });

  it("writes the first step, then at most once in two seconds", () => {
    const { s, writes, at } = saver();
    at(10_000);
    s.step(p(1));
    s.step(p(2));
    at(11_000);
    s.step(p(3));
    expect(writes).toEqual([p(1)]);
    at(12_000);
    s.step(p(4));
    expect(writes).toEqual([p(1), p(4)]);
  });

  it("writes a map change and a flush at once, and a flush has nothing to say twice", () => {
    const { s, writes, at } = saver();
    at(10_000);
    s.step(p(1));
    at(10_100);
    s.step(p(2));
    s.now(p(5));
    expect(writes).toEqual([p(1), p(5)]);
    at(10_200);
    s.step(p(6));
    s.flush();
    s.flush();
    expect(writes).toEqual([p(1), p(5), p(6)]);
  });

  it("does not write the same place again", () => {
    const { s, writes, at } = saver();
    at(10_000);
    s.step(p(1));
    at(20_000);
    s.step(p(1));
    expect(writes).toHaveLength(1);
  });
});
