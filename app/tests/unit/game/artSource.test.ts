import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../../../public/game/art/manifest.json";
import { artState, artUrl, backdropFor, frameStyle } from "../../../src/game/art";
import { artFile, artFileState, forcePlaceholders, isOwnerArt, onArtChanged, placeholderFile, setArtMissing } from "../../../src/game/artSource";

const GAME = join(__dirname, "..", "..", "..", "public", "game");
const assets = manifest.assets as unknown as { id: string; file: string; size: [number, number]; frame: [number, number]; pack?: string; status?: string; kind: string }[];

afterEach(() => {
  setArtMissing([]);
  forcePlaceholders(false);
});

describe("which files are the owner's", () => {
  it("covers every picture of the manifest", () => {
    for (const a of assets) expect(isOwnerArt(a.file), a.id).toBe(true);
  });
  it("leaves Tuxemon's and the app's own files alone", () => {
    for (const f of ["sprites/npc/rockitten.png", "sprites/ui/hp.png", "atlas/classic_x.png", "emoji/1f600.svg", "audio/music/a.ogg", "sprites/items/potion.png"]) {
      expect(isOwnerArt(f), f).toBe(false);
    }
  });
  it("matches the credits rule's paths", () => {
    expect(isOwnerArt("sprites/npc/nagmon_owl.png")).toBe(true);
    expect(isOwnerArt("sprites/monsters/asterchip-sheet.png")).toBe(true);
    expect(isOwnerArt("sprites/portraits/nagmon_mila.png")).toBe(true);
    expect(isOwnerArt("avatars/boy_blue.png")).toBe(true);
  });
});

describe("the placeholder of a picture", () => {
  it("is a PNG under placeholders/ with the same path", () => {
    expect(placeholderFile("art/backdrops/moon.webp")).toBe("placeholders/art/backdrops/moon.png");
    expect(placeholderFile("sprites/monsters/asterchip-sheet.png")).toBe("placeholders/sprites/monsters/asterchip-sheet.png");
    expect(placeholderFile("avatars/boy_blue.png")).toBe("placeholders/avatars/boy_blue.png");
  });
  it("exists for every id (the generator and the app agree on the path)", () => {
    for (const a of assets) expect(existsSync(join(GAME, placeholderFile(a.file))), a.id).toBe(true);
  });
});

describe("the resolver, with all the art present", () => {
  it("returns the real address, as before", () => {
    expect(artUrl("backdrop_moon")).toBe("game/art/backdrops/moon.webp");
    expect(backdropFor("solar_giants").url).toBe("game/art/backdrops/giants.webp");
    expect(artState("backdrop_moon")).toBe("real");
    expect(artFile("avatars/boy_blue.png")).toBe("game/avatars/boy_blue.png");
    expect(artFile("sprites/monsters/asterchip-sheet.png")).toBe("game/sprites/monsters/asterchip-sheet.png");
    expect(artFile("sprites/ui/hp.png")).toBe("game/sprites/ui/hp.png");
  });
  it("gives every manifest id its real file", () => {
    for (const a of assets) expect(artUrl(a.id), a.id).toBe(`game/${a.file}`);
  });
  it("still refuses an id that is not in the manifest", () => {
    expect(() => artUrl("nope")).toThrow();
    expect(() => artState("nope")).toThrow();
  });
});

describe("the resolver, with a file missing", () => {
  it("draws the placeholder of that file only", () => {
    setArtMissing(["art/backdrops/moon.webp"]);
    expect(artUrl("backdrop_moon")).toBe("game/placeholders/art/backdrops/moon.png");
    expect(artState("backdrop_moon")).toBe("placeholder");
    expect(artUrl("backdrop_sun")).toBe("game/art/backdrops/sun.webp");
  });
  it("covers the sprites that are not under art/", () => {
    setArtMissing(["sprites/monsters/asterchip-sheet.png", "avatars/girl_teal.png", "sprites/npc/nagmon_owl.png"]);
    expect(artFile("sprites/monsters/asterchip-sheet.png")).toBe("game/placeholders/sprites/monsters/asterchip-sheet.png");
    expect(artFile("avatars/girl_teal.png")).toBe("game/placeholders/avatars/girl_teal.png");
    expect(artFileState("sprites/npc/nagmon_owl.png")).toBe("placeholder");
  });
  it("never swaps a file that is not the owner's", () => {
    setArtMissing(["sprites/npc/rockitten.png"]);
    expect(artFile("sprites/npc/rockitten.png")).toBe("game/sprites/npc/rockitten.png");
  });
  it("keeps the frame geometry: the CSS of a sheet is the same for the placeholder", () => {
    const real = frameStyle("fx_effect_hit", 2, "100px");
    setArtMissing(["art/effects/effect_hit.webp"]);
    const stand = frameStyle("fx_effect_hit", 2, "100px");
    const { backgroundImage: a, ...restReal } = real;
    const { backgroundImage: b, ...restStand } = stand;
    expect(restStand).toEqual(restReal);
    expect(a).not.toBe(b);
    expect(b).toContain("placeholders/art/effects/effect_hit.png");
  });
  it("tells the listeners when the set changes, and stops after unsubscribe", () => {
    const cb = vi.fn();
    const off = onArtChanged(cb);
    setArtMissing(["art/ui/combo_medal.webp"]);
    forcePlaceholders(true);
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    setArtMissing([]);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});

describe("forced placeholders (?art=placeholder)", () => {
  it("draws every owner picture from its placeholder and nothing else", () => {
    forcePlaceholders(true);
    for (const a of assets) expect(artUrl(a.id), a.id).toBe(`game/${placeholderFile(a.file)}`);
    expect(artFile("sprites/ui/hp.png")).toBe("game/sprites/ui/hp.png");
    forcePlaceholders(false);
    expect(artUrl("backdrop_moon")).toBe("game/art/backdrops/moon.webp");
  });
});

describe("the manifest the app reads", () => {
  it("gives every picture a pack and a status", () => {
    for (const a of assets) {
      expect(a.pack, a.id).toBeTruthy();
      expect(["accepted", "draft", "needs_revision"]).toContain(a.status);
    }
  });
  it("lists the sprites with the same sizes as their files", () => {
    const sprites = assets.filter((a) => a.id.startsWith("sprite."));
    expect(sprites.length).toBeGreaterThanOrEqual(100);
    for (const a of sprites) {
      const png = readFileSync(join(GAME, a.file));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], a.id).toEqual(a.size);
    }
  });
});
