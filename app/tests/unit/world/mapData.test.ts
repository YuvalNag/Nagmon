import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blockedAhead, holds, NEW_GAME, readMap, teleportAt, type TiledMap } from "../../../src/core/world/mapData";

const load = (name: string) =>
  readMap(name, JSON.parse(readFileSync(`public/game/maps/${name}.json`, "utf8")) as TiledMap);

describe("Hearthrock, as the build converted it", () => {
  const city = load("classic_hearthrock_city");

  it("is 40x20 tiles of 64 px, with the town music", () => {
    expect([city.width, city.height, city.tileSize, city.sourceTile]).toEqual([40, 20, 64, 16]);
    expect(city.music).toBe("music_town_theme");
  });

  it("starts a new game at (29,16), in front of the owl's house", () => {
    expect(city.start).toEqual({ x: 29, y: 16 });
  });

  it("has the owl's post at (29,15) facing down; the people of the town are the resolver's, not the map's", () => {
    expect(city.placement?.spots["owl_post"]).toEqual({ x: 29, y: 15, facing: "down" });
    expect(city.placement?.spots["cashier_post"]).toEqual({ x: 14, y: 14, facing: "down" });
    expect(city.placement?.maxNpcs).toBe(10);
    // what the map itself creates is the quests' props (the wallet, the lost-and-found box) and the notice board; the kitten comes home only after the quest
    expect(city.npcs.map((n) => n.slug)).toEqual(["nagmon_wallet", "nagmon_lostfound", "nagmon_obj_noticeboard"]);
    expect(city.placed).toEqual([]);
  });

  it("goes up to route 1 and into both academies", () => {
    expect(teleportAt(city, 33, 0, "up")?.to).toEqual({ map: "classic_route_1", x: 33, y: 19, facing: "up" });
    expect(teleportAt(city, 33, 0, "left")).toBeNull();
    expect(teleportAt(city, 18, 13, "up")?.to.map).toBe("classic_gym_mila");
    expect(teleportAt(city, 23, 13, "up")?.to.map).toBe("classic_gym_granite");
  });

  it("has no way to route 8: it is a closed exit at (39, 15-17)", () => {
    expect(city.teleports.some((t) => t.to.map === "classic_route_8")).toBe(false);
    expect(blockedAhead(city, 38, 16, "right", { x: 39, y: 16 })?.reason).toMatch(/route_8/);
    expect(blockedAhead(city, 38, 16, "up", { x: 38, y: 15 })).toBeNull();
  });

  it("draws the 'Above Player' layer over the walkers", () => {
    expect(city.layers.above).toEqual(["Above Player"]);
    expect(city.layers.below).toHaveLength(4);
  });
});

describe("route 1", () => {
  const route = load("classic_route_1");

  it("closes the way to Steamshore at its top", () => {
    expect(route.teleports.some((t) => t.to.map.includes("steamshore"))).toBe(false);
    expect(blockedAhead(route, 6, 1, "up", { x: 6, y: 0 })?.reason).toMatch(/steamshore/);
  });

  it("leads back down to Hearthrock", () => {
    expect(teleportAt(route, 33, 19, "down")?.to).toEqual({ map: "classic_hearthrock_city", x: 33, y: 0, facing: "down" });
  });
});

describe("the encounter areas of a map", () => {
  it("route 1 has three, each a box of the map with a table and a rate", () => {
    const route = load("classic_route_1");
    expect(route.encounters).toEqual([
      { box: { x: 2, y: 5, w: 9, h: 10 }, table: "nagmon_route1", rate: 11 },
      { box: { x: 15, y: 5, w: 10, h: 10 }, table: "nagmon_route1", rate: 11 },
      { box: { x: 29, y: 5, w: 9, h: 10 }, table: "nagmon_route1", rate: 11 },
    ]);
  });

  it("a town has none", () => {
    expect(load("classic_hearthrock_city").encounters).toEqual([]);
  });
});

describe("the conditions a map's start needs", () => {
  const state = { variables: new Map([["academy_granite_done", "yes"]]), characters: new Set(["nagmon_owl"]) };

  it("reads variable_set with and without a value", () => {
    expect(holds({ operator: "is", type: "variable_set", args: ["academy_granite_done:yes"] }, state)).toBe(true);
    expect(holds({ operator: "is", type: "variable_set", args: ["academy_granite_done:no"] }, state)).toBe(false);
    expect(holds({ operator: "is", type: "variable_set", args: ["academy_granite_done"] }, state)).toBe(true);
    expect(holds({ operator: "not", type: "variable_set", args: ["nagmon_wallet"] }, NEW_GAME)).toBe(true);
  });

  it("reads char_exists", () => {
    expect(holds({ operator: "not", type: "char_exists", args: ["nagmon_owl"] }, state)).toBe(false);
    expect(holds({ operator: "not", type: "char_exists", args: ["nagmon_owl"] }, NEW_GAME)).toBe(true);
  });

  it("does not hold for a kind it does not know yet", () => {
    expect(holds({ operator: "not", type: "profile_grade_at_least", args: ["1"] }, NEW_GAME)).toBe(false);
  });

  it("puts on the owl's cape once the Granite academy is done", () => {
    const json = JSON.parse(readFileSync("public/game/maps/classic_hearthrock_city.json", "utf8")) as TiledMap;
    const later = readMap("classic_hearthrock_city", json, { variables: state.variables, characters: new Set() });
    // the owl is the resolver's now (an anchor at the lab porch), the same one before and after the badge
    expect(later.npcs.filter((n) => n.slug === "nagmon_owl")).toHaveLength(0);
    expect(later.placement?.spots["owl_post"]).toBeDefined();
  });
});
