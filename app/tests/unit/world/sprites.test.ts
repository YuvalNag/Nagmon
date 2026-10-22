import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { frameIndex, heroSheet, npcSheet, worldSize } from "../../../src/core/world/sprites";

const db = (f: string) => JSON.parse(readFileSync(`public/game/db/${f}.json`, "utf8"));

describe("map sheets", () => {
  it("gives each hero its HD sheet, 128x256 per frame", () => {
    expect(heroSheet("girl_teal")).toMatchObject({
      url: "game/sprites/npc/nagmon_hero_girl.png",
      frameWidth: 128,
      frameHeight: 256,
    });
  });

  it("draws an old app's key and an unknown key as a hero", () => {
    expect(heroSheet("girl_dark").url).toBe("game/sprites/npc/nagmon_hero_curly.png");
    expect(heroSheet("nobody").url).toBe("game/sprites/npc/nagmon_hero_boy.png");
  });

  it("finds the owl's sheet", () => {
    expect(npcSheet(db("npcs"), "nagmon_owl")?.url).toBe("game/sprites/npc/nagmon_owl.png");
    expect(npcSheet(db("npcs"), "nobody")).toBeNull();
  });

  it("stands between steps and puts a foot forward mid-step", () => {
    expect(frameIndex("down", null, true)).toBe(1);
    expect(frameIndex("left", 0.1, true)).toBe(4);
    expect(frameIndex("left", 0.5, true)).toBe(3);
    expect(frameIndex("left", 0.5, false)).toBe(5);
    expect(frameIndex("up", 0.9, false)).toBe(10);
    // a prop with one frame (sprites/objects/*) is always frame 0
    expect(frameIndex("down", null, true, 1)).toBe(0);
    expect(frameIndex("left", 0.5, true, 4)).toBe(0);
  });

  it("matches the sheets' size: 3 frames across, 4 directions down", () => {
    // nagmon_hero_boy.png is 384x1024 (checked by the pipeline's tests)
    const png = readFileSync("public/game/sprites/npc/nagmon_hero_boy.png");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([3 * 128, 4 * 256]);
  });

  it("keeps a frame's 1x size when the record gives its scale (app/hd-art records)", () => {
    // the hero: 128x256 HD at 8 per 1x px is 16x32, a tile wide and two tall
    const hero = { url: "h.png", frameWidth: 128, frameHeight: 256, scale: 8 };
    expect(worldSize(hero, 64, 16)).toEqual({ width: 64, height: 128 });
    // the sign, upscaled x4: 64x64 HD is 16x16, one tile
    expect(worldSize({ url: "s.png", frameWidth: 64, frameHeight: 64, scale: 4 }, 64, 16)).toEqual({ width: 64, height: 64 });
    // a record without a scale: a tile wide
    expect(worldSize({ url: "o.png", frameWidth: 128, frameHeight: 256, scale: null }, 64, 16)).toEqual({ width: 64, height: 128 });
  });
});
