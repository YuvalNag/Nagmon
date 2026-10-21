import { beforeAll, describe, expect, it } from "vitest";
import { addCreature } from "../../../src/core/game/collection";
import { Battle, damageFor, hpFor } from "../../../src/core/game/battle";
import { QUIZ_CAP, questionHit } from "../../../src/core/game/battleBeats";
import { FieldLog } from "../../../src/core/game/fieldLog";
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

function make(over: { partner?: number; wild?: number; species?: string; world?: WorldState; master?: boolean; age?: number } = {}) {
  const world = over.world ?? new WorldState();
  if (!over.world) addCreature(world, "heliobud", over.partner ?? 6);
  const lines: string[] = [];
  let changes = 0;
  const t = { now: 0 };
  const battle = new Battle({
    engine: engineFor(content, 3, 5),
    world,
    monsters,
    subjects,
    wild: { species: over.species ?? "lunibble", level: over.wild ?? 6, table: "test" },
    clock: () => (t.now += 1500),
    maxChoices: null,
    ...(over.age ? { age: over.age } : {}),
    field: new FieldLog({ info: (m) => lines.push(m) }),
    onChange: () => changes++,
    ...(over.master ? { master: true } : {}),
  });
  return { battle, world, lines, changes: () => changes };
}

/** Plays one question: right or wrong. */
function play(b: Battle, right: boolean) {
  const s = b.next()!;
  if (right) answerRight(s);
  else answerWrong(s);
  return b.last!;
}

describe("a battle", () => {
  it("asks about the wild creature's subject: a science creature, a science question", () => {
    const { battle } = make({ species: "lunibble" });
    const s = battle.next()!;
    expect(subjects.subjectFor(monsters["lunibble"]!.types, null, "lunibble")).toBe("science");
    expect(s.question!.subject).toBe("science");
  });

  it("a right answer attacks: it takes health, by the partner's level and how well it was answered", () => {
    const { battle } = make();
    const hp = battle.hp;
    expect(hp).toBe(hpFor(6));
    const r = play(battle, true);
    expect(r.correct).toBe(true);
    expect(r.damage).toBe(questionHit(damageFor(6, 1.5), battle.maxHp, battle.target));
    expect(battle.hp).toBe(hp - r.damage);
  });

  it("a wrong answer does no damage and punishes nothing: not the wild creature's health, not the partner's", () => {
    const { battle, world } = make();
    const before = JSON.stringify(world.creatures);
    const hp = battle.hp;
    const r = play(battle, false);
    expect(r).toMatchObject({ correct: false, damage: 0, won: false });
    expect(battle.hp).toBe(hp);
    expect(JSON.stringify(world.creatures)).toBe(before);
    expect(battle.phase).toBe("fighting");
  });

  it("wrong answers alone never end it before the cap: only a win, the cap, or the child going on their way", () => {
    const { battle } = make();
    const cap = QUIZ_CAP[battle.band];
    for (let i = 0; i < cap - 1; i++) expect(play(battle, false).won).toBe(false);
    expect(battle.phase).toBe("fighting");
    expect(battle.stats.questions).toBe(cap - 1);
    expect(battle.stats.correct).toBe(0);
  });

  it("enough right answers calm it: the fog is gone, but no friend joins by itself", () => {
    const { battle, world } = make();
    let r = play(battle, true);
    for (let i = 0; i < 20 && !r.won; i++) r = play(battle, true);
    expect(r.won).toBe(true);
    expect(battle.phase).toBe("calm");
    expect(r.calm).toBe(true);
    expect(battle.hp).toBe(0);
    expect(world.creatures).toHaveLength(1);
    expect(world.seen.has("lunibble")).toBe(true);
    expect(world.caught.has("lunibble")).toBe(false);
    expect(battle.stats.questions).toBeLessThanOrEqual(QUIZ_CAP[battle.band]);
  });

  it("the partner grows with right answers, and the growth is saved each time", () => {
    const { battle, world, changes } = make({ partner: 5 });
    const level = world.creatures[0]!.level;
    for (let i = 0; i < 12 && battle.phase === "fighting"; i++) play(battle, true);
    expect(changes()).toBeGreaterThan(0);
    const c = world.creatures[0]!;
    expect(c.level > level || c.xp > 0).toBe(true);
  });

  it("a right answer also pays coins, a wrong one nothing, and coins are never taken", () => {
    const { battle, world } = make();
    const wrong = play(battle, false);
    expect(wrong.coins).toBe(0);
    expect(world.money).toBe(0);
    const right = play(battle, true);
    expect(right.coins).toBeGreaterThanOrEqual(1);
    expect(world.money).toBe(right.coins);
    play(battle, false);
    expect(world.money).toBe(right.coins);
  });

  it("a master's test has twice the health, and winning it gives no creature: the badge is the prize", () => {
    const plain = make({ wild: 12 });
    const master = make({ wild: 12, master: true });
    expect(master.battle.maxHp).toBe(2 * plain.battle.maxHp);
    let r = play(master.battle, true);
    for (let i = 0; i < 40 && !r.won; i++) r = play(master.battle, true);
    expect(r.won).toBe(true);
    expect(r.calm).toBe(false);
    expect(master.battle.phase).toBe("won");
    expect(master.world.creatures).toHaveLength(1);
  });

  it("is only seen, not caught, when the child goes on their way", () => {
    const { battle, world } = make();
    play(battle, true);
    battle.run();
    expect(battle.phase).toBe("ran");
    expect(world.seen.has("lunibble")).toBe(true);
    expect(world.caught.has("lunibble")).toBe(false);
    expect(world.creatures).toHaveLength(1);
  });

  it("writes its start, each answer and its end to the log, in one line each", () => {
    const { battle, lines } = make();
    battle.start("classic_route_1");
    play(battle, true);
    battle.run();
    expect(lines.filter((l) => l.startsWith("BATTLE"))).toEqual([
      "BATTLE start monster=lunibble level=6 map=classic_route_1",
      expect.stringMatching(/^BATTLE result n=1 ok=1 /),
      "BATTLE end result=ran questions=1 correct=1 ms=1500",
    ]);
  });

  it("a stronger partner finishes sooner; a much stronger wild creature takes more answers", () => {
    expect(damageFor(10, 1.5)).toBeGreaterThan(damageFor(5, 1.5));
    expect(damageFor(5, 2)).toBeGreaterThan(damageFor(5, 1.5));
    expect(hpFor(12)).toBeGreaterThan(hpFor(6));
    const answersToWin = (partner: number, wild: number) => {
      const { battle } = make({ partner, wild });
      let n = 0;
      while (battle.phase === "fighting" && n < 50) {
        play(battle, true);
        n++;
      }
      return n;
    };
    expect(answersToWin(10, 6)).toBeLessThanOrEqual(answersToWin(5, 6));
    expect(answersToWin(5, 14)).toBeGreaterThanOrEqual(answersToWin(5, 6));
  });

  it("Friends: swapping the partner changes who answers and what the questions are about, and costs nothing", () => {
    const world = new WorldState();
    addCreature(world, "heliobud", 6);
    addCreature(world, "lunibble", 6);
    const { battle, lines } = make({ world, species: "heliobud" });
    const before = battle.next()!.question!.subject;
    expect(battle.swapPartner("c2")).toBe(true);
    expect(battle.partner.species).toBe("lunibble");
    expect(world.creatures.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(battle.next()!.question!.subject).toBe(subjects.subjectFor(monsters["lunibble"]!.types, null, "lunibble"));
    expect(typeof before).toBe("string");
    expect(battle.swapPartner("c2")).toBe(false);
    expect(lines.some((l) => l.startsWith("PARTNER "))).toBe(true);
    expect(battle.hp).toBe(battle.maxHp);
  });

  it("no partner (an old save): the battle cannot start", () => {
    const world = new WorldState();
    expect(() => make({ world })).toThrow(/partner/);
  });
});

describe("the log line for a battle result", () => {
  it("one line for each answer, with ids and numbers only", () => {
    const { battle, lines } = make();
    play(battle, true);
    play(battle, false);
    const results = lines.filter((l) => l.startsWith("BATTLE result"));
    expect(results).toHaveLength(2);
    expect(results[0]).toMatch(/^BATTLE result n=1 ok=1 damage=\d+ hp=\d+ max=\d+ ms=\d+ monster=lunibble partner=heliobud$/);
    expect(results[1]).toMatch(/^BATTLE result n=2 ok=0 damage=0 hp=\d+ max=\d+ ms=\d+ monster=lunibble partner=heliobud$/);
  });

  it("the numbers are the turn's: the damage taken and the fog left", () => {
    const { battle, lines } = make();
    const turn = play(battle, true);
    const line = lines.find((l) => l.startsWith("BATTLE result"))!;
    expect(line).toContain(`damage=${turn.damage}`);
    expect(line).toContain(`hp=${battle.hp} max=${battle.maxHp}`);
  });

  it("holds no name: only ids (species) and numbers", () => {
    const { battle, lines } = make();
    battle.partner.name = "יוסי";
    play(battle, true);
    const line = lines.find((l) => l.startsWith("BATTLE result"))!;
    expect(line).not.toContain("יוסי");
    expect(line).toMatch(/^[\x20-\x7e]+$/);
  });
});

describe("the beat menu", () => {
  it("a Move asks nothing, takes a third of a right answer, and counts no question", () => {
    const { battle } = make();
    const hp = battle.hp;
    const r = battle.pick("move")!;
    expect(r.beat).toBe("move");
    expect(r.damage).toBeGreaterThan(0);
    expect(r.damage).toBeLessThan(damageFor(6, 1.5));
    expect(battle.hp).toBe(hp - r.damage);
    expect(battle.stats.questions).toBe(0);
    expect(battle.phase).toBe("fighting");
  });

  it("free beats stop at half the fog: Move and the friend never calm a creature", () => {
    const { battle } = make();
    for (let i = 0; i < 30; i++) battle.pick(i % 3 === 2 ? "assist" : "move");
    expect(battle.hp).toBeGreaterThanOrEqual(Math.ceil(battle.maxHp / 2));
    expect(battle.phase).toBe("fighting");
    expect(battle.pick("move")).not.toBeNull();
    expect(battle.pick("move")!.damage).toBe(0);
  });

  it("the friend's assist is limited in a battle", () => {
    const { battle } = make();
    expect(battle.assistsLeft).toBe(2);
    expect(battle.pick("assist")).not.toBeNull();
    expect(battle.pick("assist")).not.toBeNull();
    expect(battle.pick("assist")).toBeNull();
    expect(battle.legal().assist).toBe(false);
    expect(battle.pick("move")).not.toBeNull();
  });

  it("never two question beats in a row: a Power-up after an answered question waits for a free beat", () => {
    const { battle } = make();
    expect(battle.pick("power")).not.toBeNull();
    play(battle, true);
    expect(battle.legal().power).toBe(false);
    expect(battle.pick("power")).toBeNull();
    battle.pick("move");
    expect(battle.legal().power).toBe(true);
    expect(battle.pick("power")).not.toBeNull();
  });

  it("a wrong answer is a question beat too: the next beat is free", () => {
    const { battle } = make();
    play(battle, false);
    expect(battle.pick("power")).toBeNull();
    expect(battle.pick("assist")).not.toBeNull();
    expect(battle.pick("power")).not.toBeNull();
  });

  it("a calm creature takes no more beats", () => {
    const { battle } = make();
    for (let i = 0; i < 12 && battle.phase === "fighting"; i++) {
      play(battle, true);
      battle.pick("move");
    }
    expect(battle.phase).toBe("calm");
    expect(battle.pick("move")).toBeNull();
    expect(battle.pick("power")).toBeNull();
  });

  it("a free beat saves the child and the rating nothing: no answer is logged", () => {
    const { battle, world } = make();
    battle.pick("move");
    expect(battle.stats.questions).toBe(0);
    expect(world.money).toBe(0);
  });
});

describe("the charge meter and Special", () => {
  /** Charges the meter of a 6-year-old (2 pips): two right Power-ups with a free beat between. */
  function charged() {
    const m = make({ age: 6, partner: 3, wild: 8 });
    play(m.battle, true);
    m.battle.pick("move");
    play(m.battle, true);
    return m;
  }

  it("the meter's size follows the age: 2 pips for a 6-year-old, 3 for an 9-year-old", () => {
    expect(make({ age: 6 }).battle.meterSize).toBe(2);
    expect(make({ age: 9 }).battle.meterSize).toBe(3);
    expect(make({ age: 13 }).battle.meterSize).toBe(3);
  });

  it("a right Power-up answer charges a pip; a wrong one neither fills nor empties it", () => {
    const { battle } = make({ age: 9 });
    play(battle, true);
    expect(battle.meter).toBe(1);
    battle.pick("move");
    play(battle, false);
    expect(battle.meter).toBe(1);
  });

  it("free beats do not charge it", () => {
    const { battle } = make({ age: 9 });
    battle.pick("move");
    battle.pick("assist");
    expect(battle.meter).toBe(0);
  });

  it("a full meter swaps Move for Special, on a free beat only", () => {
    const { battle } = charged();
    expect(battle.meter).toBe(battle.meterSize);
    expect(battle.legal()).toMatchObject({ special: false, move: true, power: false });
    battle.pick("assist");
    expect(battle.legal()).toMatchObject({ special: true, move: false, power: true });
    expect(battle.pick("move")).toBeNull();
  });

  it("Special spends the meter and starts a burst of three questions", () => {
    const { battle } = charged();
    battle.pick("assist");
    expect(battle.pick("special")).not.toBeNull();
    expect(battle.meter).toBe(0);
    expect(battle.burst?.medals).toEqual([null, null, null]);
  });

  it("each right answer of the burst lands a hit and fills a medal; the burst's answers do not charge", () => {
    const { battle } = charged();
    battle.pick("assist");
    battle.pick("special");
    const hp = battle.hp;
    const t1 = play(battle, true);
    expect(t1.damage).toBeGreaterThan(0);
    expect(t1.burst).toMatchObject({ medals: [true, null, null], combo: 1, over: false });
    expect(battle.hp).toBe(hp - t1.damage);
    expect(battle.meter).toBe(0);
    expect(battle.burst).not.toBeNull();
  });

  it("three right answers in a row finish the burst and take the fog it began with", () => {
    const { battle } = charged();
    battle.pick("assist");
    battle.pick("special");
    const start = battle.hp;
    let last = play(battle, true);
    last = play(battle, true);
    last = play(battle, true);
    expect(last.burst).toMatchObject({ medals: [true, true, true], combo: 3, over: true });
    expect(battle.burst).toBeNull();
    expect(battle.hp).toBe(Math.max(0, start - 3 * Math.ceil(start / 3)));
    expect(battle.phase).toBe("calm");
  });

  it("a wrong answer in a burst just ends the combo: no damage, nothing lost, the fog stays, no more burst questions", () => {
    const { battle, world } = charged();
    battle.pick("assist");
    battle.pick("special");
    play(battle, true);
    const hp = battle.hp;
    const money = world.money;
    const t = play(battle, false);
    expect(t.burst).toMatchObject({ medals: [true, false, null], combo: 1, over: true });
    expect(t).toMatchObject({ damage: 0, correct: false });
    expect(battle.hp).toBe(hp);
    expect(world.money).toBe(money);
    expect(battle.burst).toBeNull();
    expect(battle.phase).toBe("fighting");
    // after a burst the next beat is a free one
    expect(battle.legal().power).toBe(false);
    expect(battle.legal().move).toBe(true);
  });

  it("each question of the burst is rated by the engine on its own, like any other answer", () => {
    const { battle } = charged();
    battle.pick("assist");
    battle.pick("special");
    const before = battle.stats.questions;
    play(battle, true);
    play(battle, true);
    expect(battle.stats.questions).toBe(before + 2);
  });

  it("the burst is not offered without a full meter", () => {
    const { battle } = make({ age: 6 });
    expect(battle.pick("special")).toBeNull();
    play(battle, true);
    battle.pick("move");
    expect(battle.pick("special")).toBeNull();
  });
});

describe("the cap on questions, by age", () => {
  const ages = [
    [6, 5],
    [9, 7],
    [12, 8],
  ] as const;

  it.each(ages)("a %s-year-old: at the cap of %s questions, right or wrong, the creature calms by itself", (age, cap) => {
    const { battle } = make({ age, wild: 14, partner: 2 });
    let last = play(battle, false);
    for (let i = 1; i < cap; i++) {
      expect(battle.phase).toBe("fighting");
      expect(last.capped).toBe(false);
      last = play(battle, false);
    }
    expect(battle.stats.questions).toBe(cap);
    expect(last).toMatchObject({ capped: true, won: true, calm: true, correct: false, damage: 0 });
    expect(battle.phase).toBe("calm");
    expect(battle.hp).toBe(0);
  });

  it("the cap counts the wrong answers too, and the child is never punished: no coins lost, no partner changed", () => {
    const { battle, world } = make({ age: 6 });
    const before = JSON.stringify(world.creatures);
    for (let i = 0; i < 5; i++) play(battle, false);
    expect(battle.phase).toBe("calm");
    expect(world.money).toBe(0);
    expect(JSON.stringify(world.creatures)).toBe(before);
  });

  it("an earlier win is not a cap", () => {
    const { battle } = make({ age: 12, wild: 2, partner: 12 });
    let last = play(battle, true);
    for (let i = 0; i < 8 && !last.won; i++) last = play(battle, true);
    expect(last.won).toBe(true);
    expect(last.capped).toBe(false);
  });

  it("the target in right answers is enough once the free beats took their half (so the child is not asked more than the target)", () => {
    for (const [age] of ages) {
      const { battle } = make({ age, wild: 8, partner: 8 });
      let guard = 0;
      while (battle.hp > Math.ceil(battle.maxHp / 2) && guard++ < 40) battle.pick("move");
      let rights = 0;
      while (battle.phase === "fighting" && guard++ < 80) {
        play(battle, true);
        rights++;
        if (battle.phase === "fighting") battle.pick("move");
      }
      expect(rights).toBeLessThanOrEqual(battle.target);
      expect(battle.stats.questions).toBe(rights);
    }
  });

  it("a master's test has a bigger cap and the same fog rule", () => {
    const plain = make({ age: 9, wild: 12 });
    const master = make({ age: 9, wild: 12, master: true });
    expect(master.battle.budget.limit).toBeGreaterThan(plain.battle.budget.limit);
    let last = play(master.battle, false);
    for (let i = 0; i < 30 && !last.won; i++) last = play(master.battle, false);
    expect(last.capped).toBe(true);
    expect(master.battle.phase).toBe("won");
  });
});

describe("speed counts for nothing in a battle", () => {
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
    });
    const s = battle.next()!;
    answerRight(s);
    return { battle, engine, skill: s.question!.skill_id, world, quality: s.outcome!.quality };
  }

  it("a fast right answer and a slow one take the same fog and give the same growth", () => {
    const fast = timed(300);
    const slow = timed(90_000);
    expect(fast.battle.last!.damage).toBe(slow.battle.last!.damage);
    expect(fast.world.creatures[0]!.xp).toBe(slow.world.creatures[0]!.xp);
  });

  it("and move the rating the same: the Elo speed bonus is off", () => {
    const fast = timed(300);
    const slow = timed(90_000);
    expect(fast.engine.learner.skills.get(fast.skill)!.theta).toBeCloseTo(slow.engine.learner.skills.get(slow.skill)!.theta, 10);
  });

  it("the time is still logged for the parents' dashboard", () => {
    const fast = timed(300);
    expect(fast.engine.learner.log.at(-1)?.elapsed).toBeGreaterThan(0);
  });
});
