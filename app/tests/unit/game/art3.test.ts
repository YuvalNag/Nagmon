import { describe, expect, it } from "vitest";
import { artEntry, artUsable, draftsEnabled, frameRect, frameStyle, itemIcon, npcBattleFrame, npcIconId, npcSprite, npcSpriteIds, npcWalkFrame, uiIcon } from "../../../src/game/art";
import { gameJson } from "./helpers";

describe("the art registries (art/manifest.json, tools/app/art3.py)", () => {
  it("allows drafts, and says which pictures are drafts", () => {
    expect(draftsEnabled()).toBe(true);
    expect(artEntry("interior.home")?.status).toBe("draft");
    expect(artEntry("npc.nagmon_baker.map_a")?.status).toBe("accepted");
    expect(artUsable("interior.home")).toBe(true);
    expect(artUsable("nope")).toBe(false);
  });

  it("finds a frame of a sheet in the sheet's pixels and as a background", () => {
    const e = artEntry("icon.items")!;
    const r = frameRect("icon.items", 9);
    expect(r).toEqual({ x: (9 % e.cols) * e.frame[0], y: Math.floor(9 / e.cols) * e.frame[1], w: e.frame[0], h: e.frame[1] });
    const s = frameStyle("icon.items", 9, "2em");
    expect(s["backgroundSize"]).toBe(`${e.cols * 100}% ${e.rows * 100}%`);
    expect(s["backgroundImage"]).toContain("game/art/icon/items.webp");
  });

  it("gives every item with an icon a frame that holds a picture", () => {
    const eco = gameJson("economy.json") as { items: { id: string }[] };
    const sheet = artEntry("icon.items")!;
    let n = 0;
    for (const it of eco.items) {
      const icon = itemIcon(it.id);
      if (!icon) continue;
      n += 1;
      expect(icon.frame).toBeLessThan(sheet.frames);
      expect(sheet.empty_frames ?? []).not.toContain(icon.frame);
    }
    expect(n).toBeGreaterThanOrEqual(12);
    expect(itemIcon("friend_card_math")).toBeNull();
    expect(uiIcon("heart_full")).not.toBeNull();
    expect(uiIcon("nope")).toBeNull();
  });

  it("has the fourteen people, with walks in four directions, a portrait, an icon and feet inside the frame", () => {
    const ids = npcSpriteIds().filter((i) => npcSprite(i)?.pack === "people");
    expect(ids).toHaveLength(14);
    for (const id of ids) {
      const rec = npcSprite(id)!;
      for (const dir of ["down", "left", "right", "up"] as const) {
        for (let step = 0; step < 3; step++) {
          const w = npcWalkFrame(id, dir, step)!;
          expect(w, `${id} ${dir} ${step}`).not.toBeNull();
          expect(w.anchor[0]).toBeGreaterThan(0);
          expect(w.anchor[0]).toBeLessThanOrEqual(rec.frame![0]);
          expect(w.anchor[1]).toBeLessThanOrEqual(rec.frame![1]);
          expect(w.url).toMatch(/^game\/art\/npc\//);
        }
      }
      expect(npcBattleFrame(id, "front")!.frame).toBe(1);
      expect(npcBattleFrame(id, "back")!.frame).toBe(0);
      expect(npcIconId(id)).not.toBeNull();
    }
    expect(npcWalkFrame("nobody", "down", 0)).toBeNull();
  });

  it("has Mila and the owl as upgrades with all their sheets", () => {
    for (const id of ["nagmon_mila", "nagmon_owl"]) {
      const rec = npcSprite(id)!;
      expect(rec.pack).toBe("upgrades");
      expect(rec.status).toBe("accepted");
      expect(npcBattleFrame(id)).not.toBeNull();
    }
  });

  it("marks the four people whose walk still needs repair", () => {
    const draft = npcSpriteIds().filter((i) => npcSprite(i)!.pack === "people" && npcSprite(i)!.sheet_status["map_a"] !== "accepted");
    expect(draft.sort()).toEqual(["nagmon_artist", "nagmon_grandpa", "nagmon_scientist", "nagmon_scout_girl"]);
    expect(npcSprite("nagmon_grandpa")!.known_issues).toContain("foot_order");
  });
});
