import { beforeAll, describe, expect, it } from "vitest";
import { Battle, MAX_CREATURES, PARTY_SIZE } from "../../../src/core/game/battle";
import { addCreature } from "../../../src/core/game/collection";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { countOf, economy, give } from "../../../src/core/game/items";
import { monsterTable } from "../../../src/core/game/monsters";
import type { ContentLibrary } from "../../../src/core/learning";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { WorldState } from "../../../src/core/world/worldState";
import type { BattleData } from "../../../src/core/data/battleTypes";
import { battleData, answerRight, answerWrong, calmIt, cast, engineFor, gameJson, shipped } from "./helpers";

let content: ContentLibrary;
let data: BattleData;
beforeAll(async () => {
  content = shipped();
  data = await battleData();
});
const monsters = monsterTable(gameJson("db/monsters.json"));
const subjects = SubjectMap.fromDoc(gameJson("content/subjects.json"));
const eco = economy(gameJson("economy.json"));

interface Over {
  species?: string;
  level?: number;
  world?: WorldState;
  bag?: Record<string, number>;
  /** The child's grade: 1 is band A (ages 5-7), 3 is band B. */
  grade?: number;
  master?: boolean;
  /** Start fog at this number (the default is a calm creature). */
  fog?: number;
}

/** A battle with a controllable "random" number: `dice.v` is what every draw returns (0 = every shake holds, 0.999 = every shake pops). */
function make(over: Over = {}) {
  const world = over.world ?? new WorldState();
  if (!over.world) addCreature(world, "heliobud", 6);
  for (const [id, n] of Object.entries(over.bag ?? { magic_net: 3 })) give(world, eco, id, n);
  const lines: string[] = [];
  const t = { now: 0 };
  const dice = { v: 0.5, q: [] as number[] };
  const grade = over.grade ?? 3;
  const battle = new Battle({
    engine: engineFor(content, grade, 5),
    data,
    world,
    monsters,
    subjects,
    wild: { species: over.species ?? "lunibble", level: over.level ?? 6, table: "test" },
    clock: () => (t.now += 1500),
    maxChoices: null,
    field: new FieldLog({ info: (m) => lines.push(m) }),
    economy: eco,
    onChange: () => {},
    rng: () => (dice.q.length ? dice.q.shift()! : dice.v),
    ...(over.master ? { master: true } : {}),
    ...(over.fog !== undefined ? { debug: { fog: over.fog } } : {}),
  });
  return { battle, world, lines, dice };
}

/** One that is already calm. */
function calm(over: Over = {}) {
  const m = make(over);
  expect(calmIt(m.battle)).toBe(true);
  expect(m.battle.phase).toBe("calm");
  m.lines.length = 0;
  return m;
}

const magic = { tool: "magic_net", treat: null };

describe("befriending: one try with a tool, at any time", () => {
  it("is open while fighting, with no question and no calm needed; refused with no tool, for a master, or while a friend must be picked", () => {
    const { battle, world, dice } = make({ fog: 40 });
    expect(battle.phase).toBe("fighting");
    expect(battle.canBefriend()).toBe(true);
    expect(battle.tryBefriend({ tool: null, treat: null })).toMatchObject({ kind: "refused", refusal: "no_tool" });
    expect(battle.tryBefriend({ tool: "silver_net", treat: null })).toMatchObject({ kind: "refused", refusal: "no_tool" });
    expect(countOf(world, "magic_net")).toBe(3);
    dice.v = 0;
    expect(battle.tryBefriend(magic).kind).toBe("caught");
    const master = make({ master: true, bag: { magic_net: 1 } });
    expect(master.battle.canBefriend()).toBe(false);
    expect(master.battle.tryBefriend(magic)).toMatchObject({ kind: "refused", refusal: "not_now" });
    expect(countOf(master.world, "magic_net")).toBe(1);
  });

  it("a friend joins at the wild level, the tool is used up, 5 coins and growth, the fight ends", () => {
    const { battle, world, dice } = calm({ level: 7 });
    const money = world.money;
    dice.v = 0;
    const r = battle.tryBefriend(magic);
    expect(r).toMatchObject({ kind: "caught", shakes: 3, failedAt: null, netBack: false, coins: eco.sealCoins, toMeadow: false });
    expect(r.chance!.word).toBe("great");
    expect(battle.phase).toBe("caught");
    expect(world.creatures).toHaveLength(2);
    expect(world.creatures[1]).toMatchObject({ species: "lunibble", level: 7, xp: 0 });
    expect(world.caught.has("lunibble")).toBe(true);
    expect(countOf(world, "magic_net")).toBe(2);
    expect(world.money).toBe(money + eco.sealCoins);
    expect(battle.canBefriend()).toBe(false);
  });

  it("a failed try changes nothing but the next chance: the fight goes on, the creature does not run, the intent stays", () => {
    const { battle, world, dice } = make({ fog: 100 });
    const before = battle.befriend.chance({ tool: "magic_net", treat: null });
    const intent = battle.intent?.id;
    dice.v = 0.999;
    const r = battle.tryBefriend(magic);
    expect(r).toMatchObject({ kind: "failed", caught: null });
    expect(r.failedAt).not.toBeNull();
    expect(battle.phase).toBe("fighting");
    expect(battle.intent?.id).toBe(intent);
    expect(world.creatures).toHaveLength(1);
    const after = battle.befriend.chance({ tool: "magic_net", treat: null });
    expect(after.p).toBeGreaterThan(before.p);
    expect(r.nextWord).not.toBeNull();
  });

  it("a failed net comes back with the band's chance: always for ages 5-7, about half for the rest; cards and treats never", () => {
    const a = make({ grade: 1, bag: { magic_net: 2, berry: 2 }, fog: 100 });
    a.dice.v = 0.999;
    expect(a.battle.tryBefriend({ tool: "magic_net", treat: "berry" })).toMatchObject({ kind: "failed", netBack: true });
    expect(countOf(a.world, "magic_net")).toBe(2);
    expect(countOf(a.world, "berry")).toBe(1);
    // band B: the draw after the shakes decides (below 0.5 it comes back)
    const b = make({ grade: 3, bag: { magic_net: 3 }, fog: 100 });
    b.dice.q = [0.999, 0.4];
    expect(b.battle.tryBefriend(magic)).toMatchObject({ kind: "failed", netBack: true });
    expect(countOf(b.world, "magic_net")).toBe(3);
    b.dice.q = [0.999, 0.6];
    expect(b.battle.tryBefriend(magic)).toMatchObject({ kind: "failed", netBack: false });
    expect(countOf(b.world, "magic_net")).toBe(2);
    const c = make({ grade: 3, bag: { friend_card_science: 1 }, fog: 100 });
    c.dice.v = 0.999;
    expect(c.battle.tryBefriend({ tool: "friend_card_science", treat: null })).toMatchObject({ kind: "failed", netBack: false });
    expect(countOf(c.world, "friend_card_science")).toBe(0);
  });

  it("pity: after each failed try the next chance rises by the band's number; Mercy: the 3rd try of ages 5-7 always succeeds, nobody else has one", () => {
    const hard = { species: "lunwarden", level: 18, fog: 100, bag: { magic_net: 9 } };
    const a = make({ ...hard, grade: 1 });
    a.dice.v = 0.999;
    // a net comes back for band A, so the bag stays and the fight can go on
    const p1 = a.battle.befriend.chance(magic).p;
    expect(a.battle.tryBefriend(magic).kind).toBe("failed");
    const p2 = a.battle.befriend.chance(magic);
    expect(p2.p - p1).toBeCloseTo(45 / 255, 6);
    expect(a.battle.tryBefriend(magic).kind).toBe("failed");
    const p3 = a.battle.befriend.chance(magic);
    expect(p3).toMatchObject({ mercy: true, p: 1, word: "great" });
    expect(a.battle.tryBefriend(magic).kind).toBe("caught");
    // band B: pity 30, and no try is ever sure
    const b = make({ ...hard, grade: 3 });
    b.dice.v = 0.999;
    const q1 = b.battle.befriend.chance(magic).p;
    for (let n = 0; n < 6; n++) {
      expect(b.battle.befriend.chance(magic).mercy).toBe(false);
      expect(b.battle.tryBefriend(magic).kind).toBe("failed");
    }
    expect(b.battle.befriend.chance(magic).p).toBeGreaterThan(q1);
    expect(b.battle.befriend.failed).toBe(6);
    expect(b.battle.phase).toBe("fighting");
  });

  it("with the friend count full it is in the Book, nothing is used up and nobody joins", () => {
    const world = new WorldState();
    for (let i = 0; i < MAX_CREATURES; i++) addCreature(world, "heliobud", 5);
    const { battle, dice } = make({ world, fog: 30 });
    dice.v = 0;
    expect(battle.tryBefriend(magic)).toMatchObject({ kind: "refused", refusal: "full", full: true });
    expect(world.creatures).toHaveLength(MAX_CREATURES);
    expect(world.caught.has("lunibble")).toBe(true);
    expect(countOf(world, "magic_net")).toBe(3);
  });

  it("the fifth friend waits in the Meadow", () => {
    const world = new WorldState();
    for (let i = 0; i < PARTY_SIZE; i++) addCreature(world, "heliobud", 5);
    const { battle, dice } = make({ world, fog: 10 });
    dice.v = 0;
    expect(battle.tryBefriend(magic)).toMatchObject({ kind: "caught", toMeadow: true });
    expect(world.creatures).toHaveLength(PARTY_SIZE + 1);
  });

  it("a treat is used up and adds a heart to the new friend; a second friend of a kind gets a gift", () => {
    const world = new WorldState();
    addCreature(world, "heliobud", 6);
    addCreature(world, "lunibble", 5);
    world.caught.add("lunibble");
    const { battle, dice } = make({ world, bag: { magic_net: 1, biscuit: 1 }, fog: 20 });
    dice.v = 0;
    const r = battle.tryBefriend({ tool: "magic_net", treat: "biscuit" });
    expect(r).toMatchObject({ kind: "caught", another: true, giftItem: "berry" });
    expect(world.creatures[2]!.hearts).toBe(1);
    expect(countOf(world, "biscuit")).toBe(0);
    expect(countOf(world, "berry")).toBe(1);
  });

  it("a right Gift question lifts the chance by x1.5 for the next try only; a wrong or skipped one is x1", () => {
    const { battle, world } = make({ fog: 60, bag: { magic_net: 4 } });
    const base = battle.befriend.chance(magic).p;
    const q = battle.giftQuestion()!;
    expect(q.question).not.toBeNull();
    answerRight(q);
    expect(battle.befriend.gift).toBe(true);
    expect(battle.befriend.chance(magic).p).toBeGreaterThan(base * 1.3);
    expect(battle.stats).toMatchObject({ questions: 1, correct: 1 });
    battle.befriend.attempt(magic); // roll at 0.5: whatever happens, the gift is spent
    expect(battle.befriend.gift).toBeNull();
    const w = make({ fog: 60 });
    const w0 = w.battle.befriend.chance(magic).p;
    answerWrong(w.battle.giftQuestion()!);
    expect(w.battle.befriend.gift).toBe(false);
    expect(w.battle.befriend.chance(magic).p).toBe(w0);
    expect(w.battle.stats).toMatchObject({ questions: 1, correct: 0 });
    expect(world.creatures.length).toBeGreaterThan(0);
  });

  it("Auto never spends a Star Net, the tray starts on Auto and then on the last choice", () => {
    const { battle, world, dice } = make({ fog: 100, bag: { magic_net: 1, silver_net: 1, star_net: 1 } });
    expect(battle.befriend.initial()).toEqual({ tool: "silver_net", treat: null });
    dice.v = 0.999;
    battle.befriend.attempt({ tool: "star_net", treat: null });
    expect(countOf(world, "star_net")).toBe(0);
    expect(battle.befriend.initial().tool).toBe("silver_net");
    battle.befriend.attempt({ tool: "magic_net", treat: null });
    expect(battle.befriend.initial().tool).toBe("silver_net"); // the magic net is gone: back to Auto
  });

  it("a Star Net's chance counts its free first shake", () => {
    const { battle } = make({ fog: 100, bag: { magic_net: 1, star_net: 1 } });
    const star = battle.befriend.chance({ tool: "star_net", treat: null });
    const net2 = battle.befriend.chance({ tool: "magic_net", treat: null });
    expect(star.p).toBeGreaterThan(net2.p * 2.2);
  });

  it("naming is optional; skip keeps no name, and a name is trimmed and cut short", () => {
    const { battle, world, dice } = calm();
    dice.v = 0;
    battle.tryBefriend(magic);
    const id = world.creatures[1]!.id;
    battle.nameIt(id, null);
    battle.nameIt(id, "   ");
    expect(world.creatures[1]!.name).toBeUndefined();
    battle.nameIt(id, "  נוגה   הקטנה והמתוקה מאוד  ");
    expect(world.creatures[1]!.name).toBe("נוגה הקטנה והמתו");
  });

  it("the owl's spare net: with no net, once a day, then the try goes on", () => {
    const { battle, world, dice } = calm({ bag: {} });
    expect(battle.spareNet(eco, "2026-10-20")?.id).toBe("magic_net");
    expect(battle.spareNet(eco, "2026-10-20")).toBeNull();
    dice.v = 0;
    expect(battle.tryBefriend(magic).kind).toBe("caught");
    expect(world.creatures).toHaveLength(2);
    expect(countOf(world, "magic_net")).toBe(0);
  });

  it("going on from a calm creature costs nothing: it stays, the nets stay", () => {
    const { battle, world, lines } = calm();
    battle.run();
    expect(battle.phase).toBe("ran");
    expect(world.creatures).toHaveLength(1);
    expect(countOf(world, "magic_net")).toBe(3);
    expect(lines).toEqual([expect.stringMatching(new RegExp(`^BATTLE end result=calm_left questions=${battle.stats.questions} correct=${battle.stats.correct} ms=${Math.round(battle.stats.ms)} turns=\\d+ secs=\\d+$`))]);
  });

  it("logs each try and the result in one line, with ids and numbers only", () => {
    const { battle, world, lines, dice } = make({ fog: 100 });
    dice.v = 0.999;
    battle.tryBefriend(magic);
    dice.v = 0;
    battle.tryBefriend(magic);
    battle.nameIt(world.creatures[1]!.id, "נוגה");
    const l = lines.filter((x) => /^(BEFRIEND|CATCH)/.test(x));
    expect(l).toHaveLength(3);
    expect(l[0]).toMatch(/^BEFRIEND try species=lunibble tool=magic_net treat=none gift=0 ok=0 shakes=[123] chance=\d+ tries=1 mercy=0 back=0 fog=\d+ max=\d+$/);
    expect(l[1]).toMatch(/^BEFRIEND try species=lunibble tool=magic_net treat=none gift=0 ok=1 shakes=3 chance=\d+ tries=2 mercy=0 back=0/);
    expect(l[2]).toBe("CATCH species=lunibble level=6 party=1");
    expect(lines.join("\n")).not.toContain("נוגה");
  });

  it("a growth tonic doubles the partner's growth for its five right answers", () => {
    const world = new WorldState();
    const c = addCreature(world, "heliobud", 6);
    world.variables.set("nagmon_growth_boost", "5");
    const t = { now: 0 };
    const battle = new Battle({ engine: engineFor(content, 3, 5), data, world, monsters, subjects, wild: { species: "lunibble", level: 6, table: "t" }, clock: () => (t.now += 20000), maxChoices: null, field: new FieldLog({ info: () => {} }), onChange: () => {} });
    cast(battle, true, "sum_spark");
    expect(c.xp).toBe(2);
    expect(world.variables.get("nagmon_growth_boost")).toBe("4");
  });
});
