import { beforeAll, describe, expect, it } from "vitest";
import { Battle, MAX_CREATURES, PARTY_SIZE } from "../../../src/core/game/battle";
import { addCreature } from "../../../src/core/game/collection";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { countOf, economy, give } from "../../../src/core/game/items";
import { monsterTable } from "../../../src/core/game/monsters";
import type { ContentLibrary } from "../../../src/core/learning";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { WorldState } from "../../../src/core/world/worldState";
import { answerRight, answerWrong, engineFor, gameJson, shipped } from "./helpers";

let content: ContentLibrary;
beforeAll(() => {
  content = shipped();
});
const monsters = monsterTable(gameJson("db/monsters.json"));
const subjects = SubjectMap.fromDoc(gameJson("content/subjects.json"));
const eco = economy(gameJson("economy.json"));

/** A battle whose creature is already calm. */
function calm(over: { species?: string; world?: WorldState; nets?: Record<string, number> } = {}) {
  const world = over.world ?? new WorldState();
  if (!over.world) addCreature(world, "heliobud", 6);
  for (const [id, n] of Object.entries(over.nets ?? { magic_net: 2 })) give(world, eco, id, n);
  const lines: string[] = [];
  const t = { now: 0 };
  const battle = new Battle({
    engine: engineFor(content, 3, 5),
    world,
    monsters,
    subjects,
    wild: { species: over.species ?? "lunibble", level: 6, table: "test" },
    clock: () => (t.now += 1500),
    maxChoices: null,
    field: new FieldLog({ info: (m) => lines.push(m) }),
    onChange: () => {},
  });
  for (let i = 0; i < 40 && battle.phase === "fighting"; i++) answerRight(battle.next()!);
  expect(battle.phase).toBe("calm");
  lines.length = 0;
  return { battle, world, lines };
}

describe("capture: calm, the net, a seal question, a friend", () => {
  it("a net cannot be thrown before the creature is calm, or with none in the Bag", () => {
    const world = new WorldState();
    addCreature(world, "heliobud", 6);
    give(world, eco, "magic_net", 1);
    const fresh = new Battle({ engine: engineFor(content, 3, 5), world, monsters, subjects, wild: { species: "lunibble", level: 6, table: "t" }, clock: () => 0, maxChoices: null, field: new FieldLog({ info: () => {} }), onChange: () => {} });
    expect(fresh.throwNet(eco, "magic_net")).toBeNull();
    const { battle } = calm({ nets: {} });
    expect(battle.throwNet(eco, "magic_net")).toBeNull();
    expect(battle.throwNet(eco, "berry")).toBeNull();
  });

  it("a right seal answer catches: the friend joins at the wild level, the net is used up, 5 coins", () => {
    const { battle, world } = calm();
    const money = world.money;
    expect(battle.throwNet(eco, "magic_net")?.id).toBe("magic_net");
    expect(countOf(world, "magic_net")).toBe(2);
    const seal = battle.nextSeal(eco)!;
    expect(seal.question).not.toBeNull();
    answerRight(seal);
    expect(battle.lastSeal).toMatchObject({ correct: true, left: 0, toMeadow: false, full: false, coins: eco.sealCoins });
    expect(battle.phase).toBe("caught");
    expect(world.creatures.map((c) => c.species)[1]).toBe("lunibble");
    expect(world.creatures).toHaveLength(2);
    expect(world.creatures[1]!.level).toBe(6);
    expect(world.caught.has("lunibble")).toBe(true);
    expect(countOf(world, "magic_net")).toBe(1);
    expect(world.money).toBe(money + eco.sealCoins);
  });

  it("a wrong seal answer never punishes: the creature stays calm, the net is kept, and another try is allowed, as many as it takes", () => {
    const { battle, world } = calm();
    battle.throwNet(eco, "magic_net");
    for (let i = 0; i < 4; i++) {
      answerWrong(battle.nextSeal(eco)!);
      expect(battle.lastSeal).toMatchObject({ correct: false, caught: null });
      expect(battle.phase).toBe("calm");
      expect(countOf(world, "magic_net")).toBe(2);
      expect(world.creatures).toHaveLength(1);
    }
    expect(battle.tries).toBe(4);
    answerRight(battle.nextSeal(eco)!);
    expect(battle.phase).toBe("caught");
    expect(countOf(world, "magic_net")).toBe(1);
  });

  it("a rare (grown-up) creature needs three seal answers; a silver net, one fewer", () => {
    const rare = Object.values(monsters).find((m) => m.stage !== "basic" && m.hasSprite)!.slug;
    const a = calm({ species: rare });
    a.battle.throwNet(eco, "magic_net");
    expect(a.battle.sealLeft).toBe(3);
    answerRight(a.battle.nextSeal(eco)!);
    expect(a.battle.lastSeal).toMatchObject({ left: 2, caught: null });
    expect(a.battle.phase).toBe("calm");
    expect(a.world.creatures).toHaveLength(1);
    const b = calm({ species: rare, nets: { silver_net: 1 } });
    b.battle.throwNet(eco, "silver_net");
    expect(b.battle.sealLeft).toBe(2);
    const plain = calm({ nets: { silver_net: 1 } });
    plain.battle.throwNet(eco, "silver_net");
    expect(plain.battle.sealLeft).toBe(1);
  });

  it("throwing the same net again goes on with the seals already broken", () => {
    const rare = Object.values(monsters).find((m) => m.stage !== "basic" && m.hasSprite)!.slug;
    const { battle, world } = calm({ species: rare });
    for (let i = 0; i < 3; i++) {
      expect(battle.throwNet(eco, "magic_net")).not.toBeNull();
      answerRight(battle.nextSeal(eco)!);
    }
    expect(battle.phase).toBe("caught");
    expect(world.creatures).toHaveLength(2);
    expect(countOf(world, "magic_net")).toBe(1);
  });

  it("the fifth friend waits in the Meadow, not the party of four", () => {
    const world = new WorldState();
    for (let i = 0; i < PARTY_SIZE; i++) addCreature(world, "heliobud", 5);
    const { battle } = calm({ world });
    battle.throwNet(eco, "magic_net");
    answerRight(battle.nextSeal(eco)!);
    expect(battle.lastSeal).toMatchObject({ toMeadow: true });
    expect(world.creatures).toHaveLength(PARTY_SIZE + 1);
  });

  it("with the friend count full it is in the Book but does not join, and the net is kept", () => {
    const world = new WorldState();
    for (let i = 0; i < MAX_CREATURES; i++) addCreature(world, "heliobud", 5);
    const { battle } = calm({ world });
    battle.throwNet(eco, "magic_net");
    answerRight(battle.nextSeal(eco)!);
    expect(battle.lastSeal).toMatchObject({ full: true, caught: null });
    expect(world.creatures).toHaveLength(MAX_CREATURES);
    expect(world.caught.has("lunibble")).toBe(true);
    expect(countOf(world, "magic_net")).toBe(2);
  });

  it("naming is optional; skip keeps no name, and a name is trimmed and cut short", () => {
    const { battle, world } = calm();
    battle.throwNet(eco, "magic_net");
    answerRight(battle.nextSeal(eco)!);
    const id = world.creatures[1]!.id;
    battle.nameIt(id, null);
    battle.nameIt(id, "   ");
    expect(world.creatures[1]!.name).toBeUndefined();
    battle.nameIt(id, "  נוגה   הקטנה והמתוקה מאוד  ");
    expect(world.creatures[1]!.name).toBe("נוגה הקטנה והמתו");
  });

  it("the owl's spare net: with no net, once a day, then the capture goes on", () => {
    const { battle, world } = calm({ nets: {} });
    expect(battle.spareNet(eco, "2026-10-20")?.id).toBe("magic_net");
    expect(battle.spareNet(eco, "2026-10-20")).toBeNull();
    expect(battle.throwNet(eco, "magic_net")).not.toBeNull();
    answerRight(battle.nextSeal(eco)!);
    expect(world.creatures).toHaveLength(2);
    expect(countOf(world, "magic_net")).toBe(0);
  });

  it("going on from a calm creature costs nothing: it stays, the nets stay", () => {
    const { battle, world, lines } = calm();
    battle.run();
    expect(battle.phase).toBe("ran");
    expect(world.creatures).toHaveLength(1);
    expect(countOf(world, "magic_net")).toBe(2);
    expect(lines).toEqual(["BATTLE end result=calm_left questions=" + battle.stats.questions + " correct=" + battle.stats.correct + " ms=" + Math.round(battle.stats.ms)]);
  });

  it("logs each net, each try and the result in one line, with no names", () => {
    const { battle, world, lines } = calm();
    battle.throwNet(eco, "magic_net");
    answerWrong(battle.nextSeal(eco)!);
    answerRight(battle.nextSeal(eco)!);
    battle.nameIt(world.creatures[1]!.id, "נוגה");
    expect(lines.filter((l) => /^(ITEM|CAPTURE|CATCH)/.test(l))).toEqual([
      "ITEM use item=magic_net where=battle ok=1",
      "CAPTURE try species=lunibble net=magic_net ok=0 left=1 tries=1",
      "CAPTURE try species=lunibble net=magic_net ok=1 left=0 tries=2",
      "CATCH species=lunibble level=6 party=1",
    ]);
    expect(lines.join("\n")).not.toContain("נוגה");
  });

  it("a growth tonic doubles the partner's growth for its five right answers", () => {
    const world = new WorldState();
    const c = addCreature(world, "heliobud", 6);
    world.variables.set("nagmon_growth_boost", "5");
    const t = { now: 0 };
    const battle = new Battle({ engine: engineFor(content, 3, 5), world, monsters, subjects, wild: { species: "lunibble", level: 6, table: "t" }, clock: () => (t.now += 20000), maxChoices: null, field: new FieldLog({ info: () => {} }), onChange: () => {} });
    answerRight(battle.next()!);
    expect(c.xp).toBe(2);
    expect(world.variables.get("nagmon_growth_boost")).toBe("4");
  });
});
