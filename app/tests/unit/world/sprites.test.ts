import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { avatarSheet, frameIndex, npcSheet } from "../../../src/core/world/sprites";

const db = (f: string) => JSON.parse(readFileSync(`public/game/db/${f}.json`, "utf8"));

describe("map sheets", () => {
  it("gives each hero its HD sheet, 128x256 per frame", () => {
    expect(avatarSheet(db("avatars"), "girl_teal")).toEqual({
      url: "game/sprites/npc/nagmon_hero_girl.png",
      frameWidth: 128,
      frameHeight: 256,
    });
  });

  it("draws an old app's key and an unknown key as a hero", () => {
    expect(avatarSheet(db("avatars"), "girl_dark").url).toBe("game/sprites/npc/nagmon_hero_curly.png");
    expect(avatarSheet(db("avatars"), "nobody").url).toBe("game/sprites/npc/nagmon_hero_boy.png");
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
  });

  it("matches the sheets' size: 3 frames across, 4 directions down", () => {
    // nagmon_hero_boy.png is 384x1024 (checked by the pipeline's tests)
    const png = readFileSync("public/game/sprites/npc/nagmon_hero_boy.png");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([3 * 128, 4 * 256]);
  });
});
