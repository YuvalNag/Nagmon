import { beforeAll, describe, expect, it } from "vitest";
import { Battle, type Round } from "../../../src/core/game/battle";
import { QUESTION_CAP, damageOf, MP } from "../../../src/core/game/battleNumbers";
import { addCreature } from "../../../src/core/game/collection";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { economy, give } from "../../../src/core/game/items";
import { monsterTable } from "../../../src/core/game/monsters";
import { WIGGLE } from "../../../src/core/game/moves";
import type { ContentLibrary } from "../../../src/core/learning";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { WorldState } from "../../../src/core/world/worldState";
import { answerWrong, calmIt, cast, engineFor, fixedRng, gameJson, seeded, shipped } from "./helpers";

let content: ContentLibrary;
beforeAll(() => {
  content = shipped();
});
const monsters = monsterTable(gameJson("db/monsters.json"));
const subjects = SubjectMap.fromDoc(gameJson("content/subjects.json"));
const eco = economy(gameJson("economy.json"));

interface Over {
  partner?: number;
  wild?: number;
  species?: string;
  world?: WorldState;
  master?: boolean;
  age?: number;
  rng?: () => number;
  team?: string[];
  debug?: { pep?: number; fog?: number; charges?: number };
  grade?: number;
}

function make(over: Over = {}) {
  const world = over.world ?? new WorldState();
  if (!over.world) for (const sp of over.team ?? ["heliobud"]) addCreature(world, sp, over.partner ?? 6);
  const lines: string[] = [];
  let changes = 0;
  const t = { now: 0 };
  const battle = new Battle({
    engine: engineFor(content, over.grade ?? 3, 5),
    world,
    monsters,
    subjects,
    wild: { species: over.species ?? "lunibble", level: over.wild ?? 6, table: "test" },
    clock: () => (t.now += 1500),
    maxChoices: null,
    ...(over.age ? { age: over.age } : {}),
    field: new FieldLog({ info: (m) => lines.push(m) }),
    economy: eco,
    onChange: () => changes++,
    ...(over.master ? { master: true } : {}),
    rng: over.rng ?? fixedRng(0.5),
    ...(over.debug ? { debug: over.debug } : {}),
  });
  return { battle, world, lines, changes: () => changes };
}

const only = (lines: string[], kind: string) => lines.filter((l) => l.startsWith(`${kind} `));

describe("the four cards", () => {
  it("a Math partner of level 6 has its easy and normal move and two coverage moves (the wheel gives a real choice)", () => {
    const { battle } = make();
    const cards = battle.cards();
    expect(cards.map((c) => c.move.id)).toEqual(["number_nudge", "sum_spark", "block_bounce", "letter_toss"]);
    expect(cards.map((c) => c.home)).toEqual([true, true, false, false]);
    expect(cards.map((c) => [c.left, c.max])).toEqual([
      [15, 15],
      [10, 10],
      [10, 10],
      [15, 15],
    ]);
  });

  it("the question is the cast: it is about the move's subject, not the enemy's", () => {
    const { battle } = make({ species: "lunibble" });
    const c = battle.choose("block_bounce")!;
    expect(c.session!.question!.subject).toBe("geometry");
    expect(battle.stats.questions).toBe(0);
  });

  it("an easy move does not use ordering or letter tiles (the quick shapes only)", () => {
    const { battle } = make();
    for (let i = 0; i < 6; i++) {
      const c = battle.choose("number_nudge")!;
      expect(["order", "letters"]).not.toContain(c.session!.question!.kind);
      battle.cancel();
    }
  });

  it("cancelling an open question counts and spends nothing", () => {
    const { battle } = make();
    battle.choose("sum_spark");
    battle.cancel();
    expect(battle.stats.questions).toBe(0);
    expect(battle.cards()[1]!.left).toBe(10);
    expect(battle.turns).toBe(0);
  });

  it("a card is dimmed at 0 charges and cannot be chosen", () => {
    const m = make({ wild: 30, partner: 1, rng: fixedRng(0.9), debug: { charges: 1 } });
    expect(m.battle.cards().map((c) => c.left)).toEqual([1, 1, 1, 1]);
    cast(m.battle, true, "number_nudge");
    const dim = m.battle.cards().find((c) => c.move.id === "number_nudge")!;
    expect([dim.left, dim.dimmed]).toEqual([0, true]);
    expect(m.battle.choose("number_nudge")).toBeNull();
    expect(m.battle.cards().filter((c) => !c.dimmed)).toHaveLength(3);
  });

  it("all four empty: the Little Wiggle is the only card, with no question, no limit and a small hit", () => {
    const m = make({ wild: 30, partner: 1, rng: fixedRng(0.9), debug: { charges: 1 } });
    for (const id of ["number_nudge", "sum_spark", "block_bounce", "letter_toss"]) cast(m.battle, true, id);
    expect(m.battle.cards().map((c) => c.move.id)).toEqual([WIGGLE]);
    const questions = m.battle.stats.questions;
    const fog = m.battle.fog;
    for (let i = 0; i < 3; i++) {
      const r = m.battle.choose(WIGGLE)!;
      expect(r.session).toBeNull();
      expect(r.round!.damage).toBeGreaterThanOrEqual(1);
      expect(r.round!.correct).toBe(true);
    }
    expect(m.battle.stats.questions).toBe(questions);
    expect(m.battle.fog).toBeLessThan(fog);
    expect(m.battle.cards().map((c) => c.move.id)).toEqual([WIGGLE]);
    expect(only(m.lines, "MOVE").at(-1)).toMatch(/^MOVE n=7 move=little_wiggle subject=none tier=W ok=1 /);
  });
});

describe("a right answer attacks, a wrong one is weak, nobody loses anything", () => {
  it("Sum Spark, right: the formula's number (stats of 5.1, Home bonus, no Mix on the first move)", () => {
    // fixed rng 0.5: roll 0.96, no lucky star. Heliobud 6: Power 38; Lunibble 6: Guard 31
    // a plain matchup: Sailbit is English, and Math is neither a Sparkle nor Sturdy against it
    const { battle } = make({ species: "sailbit" });
    const r = cast(battle, true, "sum_spark");
    const want = damageOf({ level: 6, mp: MP.N, power: 38, guard: 31, home: true, right: true, roll: 0.96 });
    expect(want).toBe(10);
    expect(r.damage).toBe(want);
    expect(battle.fog).toBe(battle.maxFog - want);
    expect(r.correct).toBe(true);
    expect(r.wheel).toBeNull();
  });

  it("a wrong answer takes at least 1, never touches the wallet, the Bag or the creatures' levels", () => {
    const { battle, world } = make();
    give(world, eco, "berry", 2);
    const before = JSON.stringify({ c: world.creatures, items: [...world.items], m: world.money });
    const r = cast(battle, false, "sum_spark");
    expect(r.correct).toBe(false);
    expect(r.damage).toBeGreaterThanOrEqual(1);
    expect(r.damage).toBeLessThan(cast(make().battle, true, "sum_spark").damage);
    expect(r.brilliant).toBe(false);
    expect(JSON.stringify({ c: world.creatures, items: [...world.items], m: world.money })).toBe(before);
    expect(battle.phase).toBe("fighting");
  });

  it("a wrong answer costs its charge like any cast, and nothing more", () => {
    const { battle } = make();
    cast(battle, false, "sum_spark");
    expect(battle.cards()[1]!.left).toBe(9);
  });

  it("the wheel: a move of the subject the enemy is weak to is a Sparkle, and the child can see it (ages 5 to 7)", () => {
    // Lunibble is Science: Geometry beats it (Block Bounce), by the wheel
    const { battle } = make({ age: 6 });
    const cards = battle.cards();
    expect(cards.find((c) => c.move.id === "block_bounce")!.hit).toBe("sparkle");
    // English is Sturdy against Science (the one before it on the wheel); Math is Lunibble's own weak subject (data)
    expect(cards.find((c) => c.move.id === "letter_toss")!.hit).toBe("sturdy");
    expect(cards.find((c) => c.move.id === "sum_spark")!.hit).toBe("sparkle");
    const r = cast(battle, true, "block_bounce");
    expect(r.wheel).toBe("sparkle");
  });

  it("the species' own extra weak subject is a Sparkle too (Lunibble: Math)", () => {
    const { battle } = make({ age: 6 });
    expect(battle.loves().sort()).toEqual(["geometry", "math"]);
    expect(battle.cards().find((c) => c.move.id === "sum_spark")!.hit).toBe("sparkle");
  });

  it("Mix: a move of a different subject than the last one hits a little harder than the same one again", () => {
    const a = make({ rng: fixedRng(0.5) });
    cast(a.battle, true, "sum_spark");
    const same = cast(a.battle, true, "sum_spark").damage;
    const b = make({ rng: fixedRng(0.5) });
    cast(b.battle, true, "letter_toss");
    const mixed = cast(b.battle, true, "sum_spark").damage;
    expect(mixed).toBeGreaterThanOrEqual(same);
  });

  it("the third right answer in a row is Brilliant (x1.5), a wrong one starts the count again", () => {
    const { battle } = make({ wild: 40, partner: 3, rng: fixedRng(0.9) });
    const rs: Round[] = [];
    for (let i = 0; i < 3; i++) rs.push(cast(battle, true, "sum_spark"));
    expect(rs.map((r) => r.brilliant)).toEqual([false, false, true]);
    cast(battle, false, "sum_spark");
    expect(cast(battle, true, "sum_spark").brilliant).toBe(false);
  });

  it("a lucky star: one right answer in sixteen is Brilliant", () => {
    const { battle } = make({ wild: 40, partner: 3, rng: fixedRng(0.9, 0.01, 0.9, 0.9) });
    expect(cast(battle, true, "sum_spark").brilliant).toBe(true);
  });
});

describe("the round: intents, Speed, Pep", () => {
  it("the enemy's intent is shown before the child chooses and is the one it uses", () => {
    const { battle } = make({ species: "mercurip", rng: fixedRng(0.2) });
    expect(battle.intent!.id).toBe("puff");
    expect(battle.intent!.amount).toBeGreaterThan(0);
    const shown = battle.intent!;
    const r = cast(battle, true, "sum_spark");
    expect(r.intent).toBe(shown.id);
    expect(r.enemyDamage).toBeGreaterThan(0);
    expect(r.enemyDamage).toBeLessThanOrEqual(shown.amount);
    expect(battle.partnerPep.now).toBe(battle.partnerPep.max - r.enemyDamage);
  });

  it("the faster creature acts first, ties go to the child", () => {
    // Mercurip has Speed 45 against Heliobud's 35: it goes first. Lunibble 38 against 35 also.
    const fast = make({ species: "mercurip", rng: fixedRng(0.2) });
    expect(fast.battle.intent!.first).toBe(true);
    expect(cast(fast.battle, true, "sum_spark").first).toBe("them");
    expect(cast(fast.battle, true, "sum_spark").events.map((e) => e.who)).toEqual(["them", "me"]);
    // a slower enemy: Asterchip (Speed 7 base)
    const slow = make({ species: "asterchip", rng: fixedRng(0.2) });
    expect(cast(slow.battle, true, "sum_spark").first).toBe("me");
  });

  it("the answered move always plays, even when the enemy's first action brings Pep to 0; the friend falls asleep at the end of the round", () => {
    const m = make({ species: "mercurip", rng: fixedRng(0.2), team: ["heliobud", "lunibble"], debug: { pep: 1 } });
    const fog = m.battle.fog;
    const r = cast(m.battle, true, "sum_spark");
    expect(r.first).toBe("them");
    expect(r.events[0]).toMatchObject({ who: "them", kind: "puff", pep: 0 });
    expect(r.events[1]).toMatchObject({ who: "me", kind: "hit" });
    expect(r.damage).toBeGreaterThan(0);
    expect(m.battle.fog).toBe(fog - r.damage);
    expect(r.fainted).toBe("c1");
    expect(m.world.creatures[0]!.fainted).toBe(true);
  });

  it("a Silly turn takes nothing from anyone; a Giggle gives a little fog back, at most once in three rounds", () => {
    const silly = make({ species: "lunibble", rng: fixedRng(0.9) });
    expect(silly.battle.intent!.id).toBe("silly");
    const r = cast(silly.battle, true, "sum_spark");
    expect(r.enemyDamage).toBe(0);
    expect(silly.battle.partnerPep.now).toBe(silly.battle.partnerPep.max);
    // a Sleepy creature (Puff 30, Giggle 15, Silly 25) draws a Giggle at 0.5 of 70 (x = 35 >= 30)
    const g = make({ species: "terrabub", rng: fixedRng(0.45) });
    const kinds: string[] = [];
    for (let i = 0; i < 6 && g.battle.phase === "fighting"; i++) {
      const round = cast(g.battle, false, "number_nudge");
      kinds.push(round.events.find((e) => e.who === "them")?.kind ?? "-");
    }
    const gi = kinds.flatMap((k, i) => (k === "giggle" ? [i] : []));
    for (let i = 1; i < gi.length; i++) expect(gi[i]! - gi[i - 1]!).toBeGreaterThanOrEqual(3);
  });

  it("never two big Puffs in a row without a Silly turn", () => {
    const m = make({ species: "rustip", wild: 14, partner: 4, rng: fixedRng(0.2), team: ["heliobud", "lunibble", "terrabub"], age: 12 });
    let prevBig = false;
    for (let i = 0; i < 8 && m.battle.phase === "fighting"; i++) {
      if (m.battle.needSwap) m.battle.swap(m.battle.team().find((c) => !c.fainted && c.id !== m.battle.partner.id)!.id);
      const maxBefore = m.battle.partnerPep.max;
      const r = cast(m.battle, false);
      const big = r.enemyDamage > 0.15 * maxBefore;
      expect(prevBig && big, `round ${i + 1}`).toBe(false);
      prevBig = big;
    }
  });

  it("the band's gentle factor: the same Puff is lighter for a 6-year-old than for a 12-year-old", () => {
    const young = make({ species: "mercurip", rng: fixedRng(0.2), age: 6 });
    const old = make({ species: "mercurip", rng: fixedRng(0.2), age: 12 });
    expect(young.battle.intent!.amount).toBeLessThan(old.battle.intent!.amount);
  });
});

describe("fainting is real", () => {
  const two = ["heliobud", "lunibble"];

  it("0 Pep at the end of a round: the friend faints, is not lost, and the battle asks for a free swap", () => {
    const m = make({ species: "mercurip", rng: fixedRng(0.2), team: two, debug: { pep: 1 } });
    const r = cast(m.battle, true, "sum_spark");
    expect(r.fainted).toBe("c1");
    expect(r.needSwap).toBe(true);
    expect(m.battle.needSwap).toBe(true);
    expect(m.world.creatures).toHaveLength(2);
    expect(m.world.creatures[0]!.fainted).toBe(true);
    expect(only(m.lines, "DOZE")).toEqual(["DOZE species=heliobud n=1 awake=1"]);
    // nothing else can be chosen until a friend is picked
    expect(m.battle.choose("sum_spark")).toBeNull();
    const turns = m.battle.turns;
    expect(m.battle.swap("c2")).toBe("free");
    expect(m.battle.turns).toBe(turns);
    expect(m.battle.partner.id).toBe("c2");
    expect(m.battle.needSwap).toBe(false);
    expect(m.battle.partnerPep.now).toBe(m.battle.partnerPep.max);
    expect(m.battle.choose("leaf_flick")).not.toBeNull();
  });

  it("a fainted friend cannot be swapped in, and nothing wakes it: not time, not the end of the fight", () => {
    const m = make({ species: "mercurip", rng: fixedRng(0.2), team: ["heliobud", "lunibble", "terrabub"], debug: { pep: 1 } });
    cast(m.battle, true, "sum_spark");
    m.battle.swap("c2");
    expect(m.battle.swap("c1")).toBeNull();
    for (let i = 0; i < 4 && m.battle.phase === "fighting"; i++) cast(m.battle, true);
    expect(m.world.creatures.find((c) => c.id === "c1")!.fainted).toBe(true);
    calmIt(m.battle);
    expect(m.world.creatures.find((c) => c.id === "c1")!.fainted).toBe(true);
    m.battle.run();
    expect(m.world.creatures.find((c) => c.id === "c1")!.fainted).toBe(true);
  });

  it("the faint is saved at once (the world is saved on every change)", () => {
    const m = make({ species: "mercurip", rng: fixedRng(0.2), team: two, debug: { pep: 1 } });
    const before = m.changes();
    cast(m.battle, true, "sum_spark");
    expect(m.changes()).toBeGreaterThan(before);
    expect(m.world.toDict().creatures![0]!.fainted).toBe(true);
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(m.world.toDict())));
    expect(back.creatures[0]!.fainted).toBe(true);
    expect(back.creatures[1]!.fainted).toBeUndefined();
  });

  it("a battle starts with an awake partner: a fainted first friend is replaced by the first awake one", () => {
    const world = new WorldState();
    addCreature(world, "heliobud", 6);
    addCreature(world, "lunibble", 6);
    world.creatures[0]!.fainted = true;
    const m = make({ world });
    expect(m.battle.phase).toBe("fighting");
    expect(m.battle.partner.id).toBe("c2");
    expect(m.world.creatures.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(m.world.creatures[1]!.fainted).toBe(true);
  });

  it("the whole team asleep at the start: the child is carried back, the team is healed, free, and no fight happens", () => {
    const world = new WorldState();
    addCreature(world, "heliobud", 6);
    addCreature(world, "lunibble", 6);
    for (const c of world.creatures) c.fainted = true;
    world.money = 7;
    const m = make({ world });
    m.battle.start("route");
    expect(m.battle.phase).toBe("carried");
    expect(world.creatures.every((c) => !c.fainted)).toBe(true);
    expect(world.money).toBe(7);
    expect(only(m.lines, "BATTLE").at(-1)).toMatch(/^BATTLE end result=carried questions=0/);
  });

  it("the whole team falls asleep in the fight: carried back, healed, nothing charged", () => {
    const m = make({ species: "mercurip", rng: fixedRng(0.2), team: ["heliobud"], debug: { pep: 1 }, wild: 30 });
    m.world.money = 20;
    const r = cast(m.battle, false, "sum_spark");
    expect(r.fainted).toBe("c1");
    expect(r.carried).toBe(true);
    expect(m.battle.phase).toBe("carried");
    expect(m.world.creatures.every((c) => !c.fainted)).toBe(true);
    expect(m.world.money).toBe(20);
    expect(only(m.lines, "BATTLE").at(-1)).toMatch(/^BATTLE end result=carried /);
  });

  it("Brave Heart (ages 5 to 7): the first hit that would put a friend to sleep leaves it at 1 Pep, once", () => {
    const m = make({ species: "mercurip", rng: fixedRng(0.2), team: two, debug: { pep: 1 }, age: 6, wild: 8 });
    const first = cast(m.battle, false, "number_nudge");
    expect(first.fainted).toBeNull();
    expect(m.battle.partnerPep.now).toBe(1);
    const second = cast(m.battle, false, "number_nudge");
    expect(second.fainted).toBe("c1");
  });

  it("no Brave Heart for ages 8 and up", () => {
    const m = make({ species: "mercurip", rng: fixedRng(0.2), team: two, debug: { pep: 1 }, age: 9 });
    expect(cast(m.battle, false, "number_nudge").fainted).toBe("c1");
  });

  it("a voluntary swap costs the turn: the enemy acts on the friend who comes in, and Pep stays per friend", () => {
    const m = make({ species: "mercurip", rng: fixedRng(0.2), team: two });
    cast(m.battle, true, "sum_spark");
    const hurt = m.battle.partnerPep.now;
    const r = m.battle.swap("c2");
    expect(typeof r).toBe("object");
    const round = r as Round;
    expect(round.kind).toBe("swap");
    expect(round.events[0]).toMatchObject({ who: "me", kind: "swap", creature: "c2" });
    expect(m.battle.partner.id).toBe("c2");
    expect(round.events.find((e) => e.who === "them")?.creature).toBe("c2");
    // going back to the first: its Pep is where it was left
    const back = m.battle.swap("c1") as Round;
    expect(back.kind).toBe("swap");
    expect(m.battle.pepOf(m.world.creatures[0]!)).toBeLessThanOrEqual(hurt);
  });

  it("medicine from the Bag wakes a sleeping friend at half Pep; the friend is awake for good", () => {
    const m = make({ species: "mercurip", rng: fixedRng(0.2), team: ["heliobud", "lunibble", "terrabub"], debug: { pep: 1 } });
    give(m.world, eco, "medicine", 1);
    cast(m.battle, true, "sum_spark");
    expect(m.battle.needSwap).toBe(true);
    expect(m.battle.medicine("c1", "medicine")).toBe("free");
    expect(m.world.creatures.find((c) => c.id === "c1")!.fainted).toBeUndefined();
    const c1 = m.world.creatures.find((c) => c.id === "c1")!;
    expect(m.battle.pepOf(c1)).toBe(Math.ceil(m.battle.maxPepOf(c1) / 2));
    expect(m.world.items.has("medicine")).toBe(false);
    // refused for an awake friend, and when there is none
    expect(m.battle.medicine("c2", "medicine")).toBeNull();
    // the partner itself woke: nobody needs to be picked, and the fight goes on with it
    expect(m.battle.needSwap).toBe(false);
    expect(m.battle.partner.id).toBe("c1");
    expect(m.battle.choose("sum_spark")).not.toBeNull();
  });

  it("Run always works, in the middle of a fight and when a friend must be picked", () => {
    const m = make({ species: "mercurip", rng: fixedRng(0.2), team: two, debug: { pep: 1 } });
    cast(m.battle, true, "sum_spark");
    expect(m.battle.needSwap).toBe(true);
    m.battle.run();
    expect(m.battle.phase).toBe("ran");
    expect(only(m.lines, "BATTLE").at(-1)).toMatch(/^BATTLE end result=ran /);
  });
});

describe("the end: calm, the question cap, rewards", () => {
  it("enough right answers calm it: the fog is gone, a net is the next step, no friend joins by itself", () => {
    const { battle, world } = make();
    expect(calmIt(battle)).toBe(true);
    expect(battle.phase).toBe("calm");
    expect(battle.fog).toBe(0);
    expect(world.seen.has("lunibble")).toBe(true);
    expect(world.caught.has("lunibble")).toBe(false);
    expect(world.creatures).toHaveLength(1);
    expect(battle.last!.calm).toBe(true);
    expect(battle.stats.questions).toBeLessThanOrEqual(QUESTION_CAP.B);
    expect(battle.intent).toBeNull();
  });

  it("a win pays 5 + level coins and the Steady star's 2, and grows the partner by 3 points", () => {
    const { battle, world } = make({ wild: 6, partner: 8, rng: fixedRng(0.9) });
    const level = world.creatures[0]!.level;
    const xp = (c: { level: number; xp: number }) => c.level * 1000 + c.xp;
    const before = xp(world.creatures[0]!);
    calmIt(battle);
    const r = battle.reward!;
    expect(r.stars).toEqual({ calm: true, steady: true, bright: r.brilliant >= 2 });
    expect(r.coins).toBe(5 + 6 + Math.min(5, r.brilliant) + 2 + (r.stars.bright ? 2 : 0));
    expect(world.money).toBe(r.coins);
    expect(xp(world.creatures[0]!)).toBeGreaterThan(before);
    expect(world.creatures[0]!.level).toBeGreaterThanOrEqual(level);
  });

  it("right answers pay nothing by themselves any more: the fight pays when it is won", () => {
    const { battle, world } = make({ wild: 40, partner: 3 });
    cast(battle, true, "sum_spark");
    expect(world.money).toBe(0);
  });

  it("no Steady star when a friend fell asleep, and the reward still comes", () => {
    const m = make({ species: "mercurip", rng: fixedRng(0.2), team: ["heliobud", "lunibble"], debug: { pep: 1 } });
    cast(m.battle, true, "sum_spark");
    m.battle.swap("c2");
    expect(calmIt(m.battle)).toBe(true);
    expect(m.battle.reward!.stars.steady).toBe(false);
    expect(m.battle.reward!.coins).toBeGreaterThanOrEqual(5 + 6);
  });

  it("wrong answers alone never end it before the cap", () => {
    const { battle } = make({ wild: 12, partner: 12 });
    const cap = QUESTION_CAP.B;
    for (let i = 0; i < cap - 1; i++) {
      cast(battle, false);
      if (battle.phase !== "fighting") break;
    }
    expect(battle.stats.correct).toBe(0);
    expect(battle.stats.questions).toBeLessThanOrEqual(cap);
  });

  it.each([
    [6, 10],
    [9, 13],
    [12, 11],
  ] as const)("a %s-year-old: at the cap of %s questions, right or wrong, the creature calms by itself (nobody is punished)", (age, cap) => {
    const m = make({ age, wild: 40, partner: 1, rng: fixedRng(0.9), team: ["heliobud", "lunibble", "terrabub", "heliobud"] });
    m.world.money = 3;
    let last: Round | null = null;
    for (let i = 0; i < cap && m.battle.phase === "fighting"; i++) {
      if (m.battle.needSwap) m.battle.swap(m.battle.team().find((c) => !c.fainted && c.id !== m.battle.partner.id)!.id);
      last = cast(m.battle, false, i % 2 ? "sum_spark" : "letter_toss");
    }
    expect(m.battle.stats.questions).toBe(cap);
    expect(last!.capped).toBe(true);
    expect(m.battle.phase).toBe("calm");
    expect(m.battle.fog).toBe(0);
    expect(m.battle.reward!.capped).toBe(true);
    expect(m.battle.reward!.stars.bright).toBe(false);
    expect(m.world.money).toBeGreaterThanOrEqual(3);
    expect(only(m.lines, "CAP")).toHaveLength(1);
  });

  it("a master's test is won, not befriended, and it asks more before the cap", () => {
    const plain = make({ wild: 12, age: 9 });
    const master = make({ wild: 12, master: true, age: 9, rng: fixedRng(0.9), partner: 12 });
    expect(master.battle.maxFog).toBeGreaterThan(plain.battle.maxFog);
    expect(master.battle.budget.limit).toBeGreaterThan(plain.battle.budget.limit);
    expect(calmIt(master.battle, 80)).toBe(true);
    expect(master.battle.phase).toBe("won");
    expect(master.world.creatures).toHaveLength(1);
  });

  it("is only seen, not caught, when the child goes on their way, and nothing is lost", () => {
    const { battle, world } = make();
    cast(battle, true);
    battle.run();
    expect(battle.phase).toBe("ran");
    expect(world.seen.has("lunibble")).toBe(true);
    expect(world.caught.has("lunibble")).toBe(false);
    expect(world.creatures).toHaveLength(1);
  });

  it("no partner (an old save): the battle cannot start", () => {
    expect(() => make({ world: new WorldState() })).toThrow(/partner/);
  });
});

describe("kindness", () => {
  it("three wrong answers in a row: the owl offers a free hint and the next question is one tier easier", () => {
    const { battle } = make({ wild: 40, partner: 3, rng: fixedRng(0.9) });
    for (let i = 0; i < 3; i++) cast(battle, false, "sum_spark");
    expect(battle.autoHint).toBe(true);
    const c = battle.choose("sum_spark")!;
    expect(c.hint).toBe(true);
    expect(battle.autoHint).toBe(false);
    // and once only
    battle.cancel();
    expect(battle.choose("sum_spark")!.hint).toBe(false);
  });

  it("a right answer clears the count of wrong ones", () => {
    const { battle } = make({ wild: 40, partner: 3, rng: fixedRng(0.9) });
    cast(battle, false, "sum_spark");
    cast(battle, false, "sum_spark");
    cast(battle, true, "sum_spark");
    cast(battle, false, "sum_spark");
    expect(battle.autoHint).toBe(false);
  });
});

describe("the wheel is shown by age (2.3)", () => {
  it("ages 5 to 7 always see it; 8 to 10 after the creature was seen once; 11 and up only after a Sparkle or Sturdy hit, and the Book keeps it", () => {
    const a = make({ age: 6 });
    expect(a.battle.revealed()).toBe(true);
    const unseen = make({ age: 9 });
    expect(unseen.battle.revealed()).toBe(false);
    const seenWorld = new WorldState();
    addCreature(seenWorld, "heliobud", 6);
    seenWorld.seen.add("lunibble");
    expect(make({ world: seenWorld, age: 9 }).battle.revealed()).toBe(true);
    // band C: "?" until a Sparkle or Sturdy hit happens
    const w = new WorldState();
    addCreature(w, "heliobud", 6);
    const c = make({ world: w, age: 13, wild: 40 });
    expect(c.battle.revealed()).toBe(false);
    expect(c.battle.cards().every((x) => x.hit === null)).toBe(true);
    cast(c.battle, true, "block_bounce");
    expect(c.battle.revealed()).toBe(true);
    expect(c.battle.cards().find((x) => x.move.id === "block_bounce")!.hit).toBe("sparkle");
    // a later fight with the same creature: the Book remembers
    expect(make({ world: w, age: 13 }).battle.revealed()).toBe(true);
  });
});

describe("the field log", () => {
  it("one MOVE line for each cast, one ROUND line for each round, ids and numbers only", () => {
    const m = make({ species: "mercurip", rng: fixedRng(0.2) });
    m.battle.partner.name = "יוסי";
    m.battle.start("classic_route_1");
    cast(m.battle, true, "sum_spark");
    cast(m.battle, false, "block_bounce");
    expect(only(m.lines, "MOVE")).toEqual([
      expect.stringMatching(/^MOVE n=1 move=sum_spark subject=math tier=N ok=1 dmg=\d+ wheel=none brilliant=0 ms=\d+ fog=\d+ max=\d+ monster=mercurip partner=heliobud$/),
      expect.stringMatching(/^MOVE n=2 move=block_bounce subject=geometry tier=N ok=0 dmg=\d+ wheel=sparkle brilliant=0 /),
    ]);
    expect(only(m.lines, "ROUND")).toEqual([
      expect.stringMatching(/^ROUND n=1 intent=\w+ enemy=\d+ first=them pep=\d+ pep_max=\d+ fog=\d+ next=\w+ action=move$/),
      expect.stringMatching(/^ROUND n=2 /),
    ]);
    for (const l of m.lines) expect(l).toMatch(/^[\x20-\x7e]+$/);
  });

  it("the end line has the questions, the turns and the seconds", () => {
    const m = make();
    m.battle.start("route");
    cast(m.battle, true, "sum_spark");
    m.battle.run();
    expect(only(m.lines, "BATTLE").at(-1)).toMatch(/^BATTLE end result=ran questions=1 correct=1 ms=\d+ turns=1 secs=\d+$/);
  });

  it("the Wiggle writes a MOVE line with no subject", () => {
    const m = make({ wild: 40 });
    m.battle.choose("sum_spark");
    m.battle.cancel();
    // the wiggle itself is reached through the empty cards in the card test; its line shape is fixed here
    expect(only(m.lines, "MOVE")).toEqual([]);
  });
});

describe("speed counts for nothing in the rating", () => {
  /** One right answer at `ms` per answer, with the learner's timer on. */
  function timed(ms: number) {
    const world = new WorldState();
    addCreature(world, "heliobud", 6);
    const engine = engineFor(content, 5, 5, { timer: true });
    const t = { now: 0 };
    const battle = new Battle({
      engine,
      world,
      monsters,
      subjects,
      wild: { species: "lunibble", level: 6, table: "test" },
      clock: () => (t.now += ms),
      maxChoices: null,
      age: 10,
      field: new FieldLog({ info: () => {} }),
      onChange: () => {},
      rng: seeded(3),
    });
    const r = cast(battle, true, "sum_spark");
    return { battle, engine, world, r };
  }

  it("a fast right answer and a slow one take the same fog and give the same growth", () => {
    const fast = timed(300);
    const slow = timed(90_000);
    expect(fast.r.damage).toBe(slow.r.damage);
    expect(fast.world.creatures[0]!.xp).toBe(slow.world.creatures[0]!.xp);
  });

  it("and move the rating the same: the Elo speed bonus is off", () => {
    const fast = timed(300);
    const slow = timed(90_000);
    const last = (e: typeof fast.engine) => [...e.learner.skills.values()].map((s) => s.theta);
    expect(last(fast.engine)).toEqual(last(slow.engine));
  });
});
