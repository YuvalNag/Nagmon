import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CollisionGrid, type CollisionData } from "../../../src/core/world/grid";

const open = (rows: string[], extra: Partial<CollisionData> = {}): CollisionGrid =>
  new CollisionGrid({ rows, regions: {}, lines: [], ...extra }, rows[0].length, rows.length);

describe("the collision grid", () => {
  it("lets a walker onto free tiles and stops it at walls and the map's edge", () => {
    const g = open(["...", ".#.", "..."]);
    expect(g.canStep(0, 0, "right")).toBe(true);
    expect(g.canStep(0, 1, "right")).toBe(false);
    expect(g.canStep(1, 0, "down")).toBe(false);
    expect(g.canStep(0, 0, "left")).toBe(false);
    expect(g.canStep(0, 0, "up")).toBe(false);
    expect(g.canStep(2, 2, "down")).toBe(false);
    expect(g.canStep(2, 2, "right")).toBe(false);
  });

  it("enters a region only from the sides it lists", () => {
    // (1,0) may be entered from above, below or the left: not from the right
    const g = open(["..."], { regions: {} });
    const r = new CollisionGrid(
      { rows: [".r."], regions: { "1,0": { enter_from: ["up", "down", "left"], exit_from: ["up", "down", "left"] } }, lines: [] },
      3,
      1,
    );
    expect(g.canStep(0, 0, "right")).toBe(true);
    expect(r.canStep(0, 0, "right")).toBe(true); // comes from its left
    expect(r.canStep(2, 0, "left")).toBe(false); // comes from its right
  });

  it("leaves a region only towards its exits", () => {
    const g = new CollisionGrid(
      { rows: [".r."], regions: { "1,0": { enter_from: ["left", "right"], exit_from: ["left"] } }, lines: [] },
      3,
      1,
    );
    expect(g.canStep(1, 0, "left")).toBe(true);
    expect(g.canStep(1, 0, "right")).toBe(false);
  });

  it("treats a region with no entry as a wall", () => {
    const g = new CollisionGrid({ rows: ["r."], regions: { "0,0": { enter_from: [], exit_from: [] } }, lines: [] }, 2, 1);
    expect(g.canStep(1, 0, "left")).toBe(false);
  });

  it("is blocked by a line on one side of a tile", () => {
    const g = open(["..", ".."], { lines: [[0, 0, "right"]] });
    expect(g.canStep(0, 0, "right")).toBe(false);
    expect(g.canStep(0, 1, "right")).toBe(true);
  });

  it("is blocked by someone standing there", () => {
    const g = open(["..."]);
    expect(g.canStep(0, 0, "right", (x, y) => x === 1 && y === 0)).toBe(false);
  });

  it("refuses a grid of the wrong size", () => {
    expect(() => new CollisionGrid({ rows: ["..", "."], regions: {}, lines: [] }, 2, 2)).toThrow();
  });
});

describe("Hearthrock's own collision data", () => {
  const map = JSON.parse(readFileSync("public/game/maps/classic_hearthrock_city.json", "utf8"));
  const data = map.properties.find((p: { name: string }) => p.name === "collision").value as CollisionData;
  const g = new CollisionGrid(data, map.width, map.height);

  it("has the start (29,16) free, a wall below the start's row, and the owl's house above", () => {
    expect(g.cell(29, 16)).toBe(".");
    expect(g.canStep(29, 16, "down")).toBe(true);
    expect(g.canStep(29, 17, "down")).toBe(false);
    expect(g.isWall(30, 14)).toBe(true);
  });

  it("walls off the way to route 8 (39, 15-17)", () => {
    for (const y of [15, 16, 17]) expect(g.canStep(38, y, "right")).toBe(false);
  });
});
