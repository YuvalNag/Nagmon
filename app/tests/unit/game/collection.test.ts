import { describe, expect, it } from "vitest";
import { addCreature, bestiary, evolveLevel, giveXp, markSeen, needFor, partner, MAX_LEVEL, type MonsterInfo } from "../../../src/core/game/collection";
import { WorldState } from "../../../src/core/world/worldState";

const monsters: Record<string, MonsterInfo> = {
  heliobud: { slug: "heliobud", types: ["fire"], stage: "basic", evolutions: [{ at_level: 24, monster_slug: "heliolynx" }], hasSprite: true },
  heliolynx: { slug: "heliolynx", types: ["fire"], stage: "stage1", evolutions: [{ at_level: 36, monster_slug: "heliarch" }], hasSprite: true },
  heliarch: { slug: "heliarch", types: ["fire"], stage: "stage2", evolutions: [], hasSprite: true },
  ghost: { slug: "ghost", types: ["shadow"], stage: "basic", evolutions: [{ at_level: 10, monster_slug: "nosprite" }], hasSprite: true },
  nosprite: { slug: "nosprite", types: [], stage: "stage1", evolutions: [], hasSprite: false },
};

describe("the child's creatures", () => {
  it("the first one is the partner; each is seen and caught", () => {
    const w = new WorldState();
    expect(partner(w)).toBeNull();
    const a = addCreature(w, "heliobud", 5);
    const b = addCreature(w, "ghost", 3);
    expect(partner(w)).toBe(a);
    expect(a.id).not.toBe(b.id);
    expect([...w.caught].sort()).toEqual(["ghost", "heliobud"]);
    expect(w.seen.has("heliobud")).toBe(true);
  });

  it("a creature met but not caught is seen only", () => {
    const w = new WorldState();
    markSeen(w, "heliolynx");
    expect(bestiary(w, Object.keys(monsters))).toEqual({ seen: 1, caught: 0, total: 5 });
  });

  it("a level costs 6 + the level: 99 points to level 10, 132 to 12, 414 to 24 (about twice as slow as before)", () => {
    expect(needFor(1)).toBe(7);
    expect(needFor(10)).toBe(16);
    const to = (level: number) => Array.from({ length: level - 1 }, (_, i) => needFor(i + 1)).reduce((a, b) => a + b, 0);
    expect([to(10), to(24)]).toEqual([99, 414]);
    expect(to(12)).toBe(132);
    // ten right answers a fight and a few fights a level, not a level a fight
    const w = new WorldState();
    const c = addCreature(w, "heliobud", 3);
    for (let i = 0; i < 8; i++) giveXp(w, c.id, 1, monsters);
    expect(c.level).toBe(3);
  });

  it("grows with correct answers: a level takes a few points", () => {
    const w = new WorldState();
    const c = addCreature(w, "heliobud", 5);
    const need = needFor(5);
    expect(need).toBeGreaterThan(1);
    for (let i = 0; i < need - 1; i++) expect(giveXp(w, c.id, 1, monsters).leveled).toBe(false);
    expect(giveXp(w, c.id, 1, monsters)).toMatchObject({ leveled: true, level: 6 });
    expect(c.xp).toBe(0);
    giveXp(w, c.id, needFor(6) - 1, monsters);
    expect(c.level).toBe(6);
    giveXp(w, c.id, 1, monsters);
    expect(c.level).toBe(7);
  });

  it("evolves when its species says, a third of the way: level 24 becomes 8", () => {
    expect(evolveLevel(24)).toBe(8);
    expect(evolveLevel(36)).toBe(12);
    const w = new WorldState();
    const c = addCreature(w, "heliobud", 7);
    let r = { evolvedTo: null as string | null };
    while (c.level < 8) r = giveXp(w, c.id, needFor(c.level), monsters);
    expect(r.evolvedTo).toBe("heliolynx");
    expect(c.species).toBe("heliolynx");
    expect(w.caught.has("heliolynx")).toBe(true);
  });

  it("does not evolve into a creature with no picture", () => {
    const w = new WorldState();
    const c = addCreature(w, "ghost", 9);
    giveXp(w, c.id, needFor(9), monsters);
    expect(c.level).toBe(10);
    expect(c.species).toBe("ghost");
  });

  it("stops growing at the top level", () => {
    const w = new WorldState();
    const c = addCreature(w, "heliarch", MAX_LEVEL);
    expect(giveXp(w, c.id, 99, monsters)).toMatchObject({ leveled: false, level: MAX_LEVEL });
  });

  it("is saved with the world and comes back; an old world file has none", () => {
    const w = new WorldState();
    addCreature(w, "heliobud", 5);
    markSeen(w, "ghost");
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict())));
    expect(back.creatures).toEqual(w.creatures);
    expect([...back.seen].sort()).toEqual(["ghost", "heliobud"]);
    expect(WorldState.fromDict({ schema_version: 1, money: 3, variables: {} }).creatures).toEqual([]);
    expect(new WorldState().toDict()).toEqual({ schema_version: 1, money: 0, variables: {} });
  });

  it("a damaged creature in the file is dropped, not a crash", () => {
    const back = WorldState.fromDict({ creatures: [{ species: "heliobud", level: 4, xp: 1, id: "c1" }, { level: "x" }, null, 5] });
    expect(back.creatures.map((c) => c.species)).toEqual(["heliobud"]);
  });
});
