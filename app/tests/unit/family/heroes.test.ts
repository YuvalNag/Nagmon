import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type Hero, type HeroesFile, heroChoices, heroes, makeRoster } from "../../../src/core/family/heroes";
import { ProfileStore } from "../../../src/core/family/profiles";
import { heroSheet } from "../../../src/core/world/sprites";
import { setArtMissing } from "../../../src/game/artSource";
import { MemoryFileStore } from "../../../src/platform/storage";

function hero(id: string, order: number, extra: Partial<Hero> = {}): Hero {
  return {
    id,
    order,
    enabled: true,
    name: { he: `גיבור ${id}`, en: id },
    colors: { primary: "#112233", secondary: "#445566" },
    art: { map: `sprite.npc.${id}`, portrait: `sprite.portrait.${id}`, face: `sprite.avatar.${id}` },
    files: {
      map: { file: `sprites/npc/nagmon_${id}.png`, frame: [128, 256], scale: 8 },
      portrait: { file: `sprites/portraits/nagmon_${id}.png` },
      face: { file: `avatars/${id}.png` },
    },
    ...extra,
  };
}

function file(n: number, fallback = "h0"): HeroesFile {
  return { version: 1, max: 12, fallback, legacy: { old_key: "h1" }, heroes: Array.from({ length: n }, (_, i) => hero(`h${i}`, i * 10)) };
}

afterEach(() => setArtMissing([]));

describe("the shipped roster (game/heroes.json)", () => {
  it("offers the three modest heroes in order, each with its own name", () => {
    expect(heroes.offered.map((h) => h.id)).toEqual(["boy_blue", "girl_teal", "girl_curly"]);
    const names = heroes.offered.map((h) => h.name.he);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[֐-׿ ]+$/);
    // named by look, not as a boy or a girl
    for (const n of names) expect(["בן", "בת"]).not.toContain(n);
  });

  it("draws each hero from its own picture and sheet", () => {
    for (const h of heroes.offered) {
      expect(heroes.faceUrl(h.id)).toBe(`game/avatars/${h.id}.png`);
      expect(heroes.portraitUrl(h.id)).toMatch(/^game\/sprites\/portraits\/nagmon_hero_/);
    }
    expect(heroSheet("girl_teal")).toMatchObject({ url: "game/sprites/npc/nagmon_hero_girl.png", frameWidth: 128, frameHeight: 256, scale: 8 });
  });

  it("accepts the heroes and the old app's keys, nothing else", () => {
    expect([...heroes.keys].sort()).toEqual(["boy_blue", "boy_dark", "boy_light", "girl_curly", "girl_dark", "girl_light", "girl_teal"]);
  });

  it("builds the picker's choices from the data", () => {
    expect(heroChoices()).toEqual(heroes.offered.map((h) => ({ id: h.id, label: h.name.he, image: heroes.faceUrl(h.id) })));
  });
});

describe("saves made before the roster was data keep working (migration)", () => {
  it("draws the old app's keys as the nearest hero, face and map sheet", () => {
    expect(heroes.faceUrl("boy_light")).toBe("game/avatars/boy_blue.png");
    expect(heroes.faceUrl("boy_dark")).toBe("game/avatars/boy_blue.png");
    expect(heroes.faceUrl("girl_light")).toBe("game/avatars/girl_teal.png");
    expect(heroes.faceUrl("girl_dark")).toBe("game/avatars/girl_curly.png");
    expect(heroSheet("girl_dark").url).toBe("game/sprites/npc/nagmon_hero_curly.png");
  });

  it("draws an unknown key as the fallback hero", () => {
    expect(heroes.faceUrl("tuxemon_heroine")).toBe("game/avatars/boy_blue.png");
    expect(heroSheet("nobody").url).toBe("game/sprites/npc/nagmon_hero_boy.png");
  });

  it("a saved child with an old key loads, is kept as saved and can be updated", async () => {
    const fs = new MemoryFileStore();
    const store = new ProfileStore(fs, { avatars: heroes.keys });
    const p = await store.create({ name: "גל", avatar: "girl_light", grade: 2 });
    const again = new ProfileStore(fs, { avatars: heroes.keys });
    const loaded = (await again.list()).find((x) => x.id === p.id)!;
    expect(loaded.avatar).toBe("girl_light");
    expect(heroes.hero(loaded.avatar).id).toBe("girl_teal");
    loaded.name = "גלי";
    await again.save(loaded);
    expect((await again.list())[0]!.avatar).toBe("girl_light");
  });

  it("stores the hero's id when a child picks one", async () => {
    const store = new ProfileStore(new MemoryFileStore(), { avatars: heroes.keys });
    for (const [i, h] of heroes.offered.entries()) {
      const p = await store.create({ name: "אבג".slice(i, i + 1).repeat(i + 1), avatar: h.id, grade: 1 });
      expect(p.avatar).toBe(h.id);
    }
  });
});

describe("a roster of any size", () => {
  for (const n of [3, 8, 12]) {
    it(`${n} heroes: all offered, each drawn from its own picture`, () => {
      const r = makeRoster(file(n));
      expect(r.offered).toHaveLength(n);
      for (const h of r.offered) expect(r.faceUrl(h.id)).toBe(`game/avatars/${h.id}.png`);
      expect(new Set(r.offered.map((h) => r.faceUrl(h.id))).size).toBe(n);
    });
  }

  it("orders by `order`, then by id", () => {
    const f = file(0);
    f.heroes = [hero("c", 20), hero("a", 20), hero("b", 5)];
    f.fallback = "a";
    f.legacy = {};
    expect(makeRoster(f).offered.map((h) => h.id)).toEqual(["b", "a", "c"]);
  });

  it("a disabled hero is not offered but a child who has it still sees it", () => {
    const f = file(3);
    f.heroes[2]!.enabled = false;
    const r = makeRoster(f);
    expect(r.offered.map((h) => h.id)).toEqual(["h0", "h1"]);
    expect(r.keys.has("h2")).toBe(true);
    expect(r.faceUrl("h2")).toBe("game/avatars/h2.png");
  });

  it("an old key goes to its hero; an unknown one to the fallback", () => {
    const r = makeRoster(file(3, "h2"));
    expect(r.faceUrl("old_key")).toBe("game/avatars/h1.png");
    expect(r.faceUrl("zzz")).toBe("game/avatars/h2.png");
  });

  it("art that is not in the build is drawn from its placeholder", () => {
    const r = makeRoster(file(4));
    setArtMissing(["avatars/h3.png", "sprites/npc/nagmon_h3.png"]);
    expect(r.faceUrl("h3")).toBe("game/placeholders/avatars/h3.png");
    expect(heroSheet("h3", undefined, r).url).toBe("game/placeholders/sprites/npc/nagmon_h3.png");
    expect(r.faceUrl("h2")).toBe("game/avatars/h2.png");
  });

  it("a variant swaps only the pictures it lists", () => {
    const f = file(2);
    f.heroes[0]!.variants = [
      {
        id: "kippah",
        kind: "head_covering",
        name: { he: "כיפה", en: "Kippah" },
        art: { map: "sprite.npc.h0_kippah" },
        files: { map: { file: "sprites/npc/nagmon_h0_kippah.png", frame: [128, 256], scale: 8 } },
      },
    ];
    const r = makeRoster(f);
    expect(heroSheet("h0", "kippah", r).url).toBe("game/sprites/npc/nagmon_h0_kippah.png");
    expect(heroSheet("h0", undefined, r).url).toBe("game/sprites/npc/nagmon_h0.png");
    expect(r.faceUrl("h0", "kippah")).toBe("game/avatars/h0.png");
    expect(heroSheet("h0", "no_such_look", r).url).toBe("game/sprites/npc/nagmon_h0.png");
  });
});

describe("no hero list in the code", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }

  it("src/ names no hero id", () => {
    const ids = [...heroes.keys];
    for (const f of sources(join(__dirname, "..", "..", "..", "src"))) {
      const text = readFileSync(f, "utf8");
      for (const id of ids) expect(text, `${f} names the hero ${id}`).not.toMatch(new RegExp(`["'\`]${id}["'\`]`));
    }
  });
});
