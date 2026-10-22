import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { propsNow } from "../../../src/core/game/questWhere";
import { readMap, type TiledMap } from "../../../src/core/world/mapData";

const read = (name: string) => readMap(name, JSON.parse(readFileSync(`public/game/maps/${name}.json`, "utf8")) as TiledMap);
const city = read("classic_hearthrock_city");
const route = read("classic_route_1");
const vars = (o: Record<string, string> = {}) => new Map(Object.entries(o));
const slugs = (p: { slug: string }[]) => p.map((x) => x.slug).sort();

describe("props that follow what the child has done (the quests' stage)", () => {
  it("the kitten waits on Route 1 only while the story says she is lost, at the tile the map names", () => {
    expect(slugs(propsNow(route.events, vars()))).toEqual(["nagmon_sign_route1"]);
    const asked = propsNow(route.events, vars({ nagmon_kitten: "asked" }));
    expect(slugs(asked)).toEqual(["nagmon_kitten", "nagmon_sign_route1"]);
    expect(asked.find((p) => p.slug === "nagmon_kitten")).toMatchObject({ x: 21, y: 16 });
    // found: she is gone from the road, and at home she comes to the town
    expect(slugs(propsNow(route.events, vars({ nagmon_kitten: "found" })))).toEqual(["nagmon_sign_route1"]);
    expect(slugs(propsNow(city.events, vars({ nagmon_kitten: "home" })))).toContain("nagmon_kitten");
    expect(slugs(propsNow(city.events, vars({ nagmon_kitten: "found" })))).not.toContain("nagmon_kitten");
  });

  it("the wallet is on the bench until the quest has dealt with it, and the lost-and-found box is always there", () => {
    expect(slugs(propsNow(city.events, vars()))).toEqual(["nagmon_lostfound", "nagmon_obj_noticeboard", "nagmon_wallet"]);
    expect(slugs(propsNow(city.events, vars({ nagmon_wallet: "done" })))).toEqual(["nagmon_lostfound", "nagmon_obj_noticeboard"]);
  });

  it("a prop that exists already is not made twice", () => {
    expect(slugs(propsNow(city.events, vars(), new Set(["nagmon_wallet"])))).toEqual(["nagmon_lostfound", "nagmon_obj_noticeboard"]);
  });

  it("the lost-and-found box stands on open ground, off the paths the walks of the tests use and off every named spot", () => {
    const box = propsNow(city.events, vars()).find((p) => p.slug === "nagmon_lostfound")!;
    expect(city.collision.isWall(box.x, box.y)).toBe(false);
    // and the child can stand in front of it, below it, and face it
    expect(city.collision.isWall(box.x, box.y + 1)).toBe(false);
    for (const [name, s] of Object.entries(city.placement!.spots)) expect([s.x, s.y], name).not.toEqual([box.x, box.y]);
    // not on row 16 (the walk from the start to the shop) and not in front of the notice board
    expect(box.y).not.toBe(16);
  });
});
