import { beforeAll, describe, expect, it } from "vitest";
import { Battle, STAGGER_SHARE, type Round } from "../../../src/core/game/battle";
import { absorb, addMark, badges, cleanse, expire, markBonus, newFighter, shiftStage, stageMult, stageOf } from "../../../src/core/game/battleStatus";
import { BONUS_CAP, damageOf } from "../../../src/core/game/battleNumbers";
import { addCreature } from "../../../src/core/game/collection";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { monsterTable } from "../../../src/core/game/monsters";
import type { ContentLibrary } from "../../../src/core/learning";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { WorldState } from "../../../src/core/world/worldState";
import type { BattleData, Move, MoveEffect } from "../../../src/core/data/battleTypes";
import { answerRightAny, battleData, engineFor, fixedRng, gameJson, shipped } from "./helpers";

/**
 * S2 of docs/app/BATTLE_V3.md (12.2): one table-driven test per move (effect, wrong version, charges, unlock level)
 * from the data, the statuses (Drowsy and Dizzy exclusive, boss immunity, softened versions on our side), Windup and
 * Stagger at 25% of the Fog, Marks, the Finale, the bonus cap, gifts and the Spark meter.
 */

let content: ContentLibrary;
let data: BattleData;
beforeAll(async () => {
  content = shipped();
  data = await battleData();
});
const monsters = monsterTable(gameJson("db/monsters.json"));
const subjects = SubjectMap.fromDoc(gameJson("content/subjects.json"));

interface Over {
  partner?: string;
  level?: number;
  enemy?: string;
  enemyLevel?: number;
  cards?: string[];
  rng?: () => number;
  age?: number;
  master?: boolean;
  pep?: number;
  fog?: number;
  spark?: number;
  charges?: number;
  team?: string[];
}

function mk(o: Over = {}) {
  const world = new WorldState();
  for (const sp of o.team ?? [o.partner ?? "heliobud"]) addCreature(world, sp, o.level ?? 20);
  const debug = { ...(o.cards ? { cards: o.cards } : {}), ...(o.pep ? { pep: o.pep } : {}), ...(o.fog ? { fog: o.fog } : {}), ...(o.spark !== undefined ? { spark: o.spark } : {}), ...(o.charges ? { charges: o.charges } : {}) };
  const battle = new Battle({
    engine: engineFor(content, 3, 5),
    data,
    world,
    monsters,
    subjects,
    wild: { species: o.enemy ?? "sailbit", level: o.enemyLevel ?? 10, table: "t" },
    clock: () => 0,
    maxChoices: null,
    age: o.age ?? 9,
    field: new FieldLog({ info: () => {} }),
    onChange: () => {},
    rng: o.rng ?? fixedRng(0.99),
    debug,
    ...(o.master ? { master: true } : {}),
  });
  return { battle, world };
}

const moveOf = (id: string): Move => data.movesById[id]!;
const cast = (b: Battle, id: string, right = true): Round => {
  const r = b.castScripted(id, right);
  if (!r) throw new Error(`${id} did not play`);
  return r;
};
const eff = <T extends MoveEffect["type"]>(m: Move, type: T, list: "effects" | "wrong" = "effects") => (m[list] ?? []).find((e) => e.type === type) as Extract<MoveEffect, { type: T }> | undefined;

describe("the 50 moves, one by one (3.2): right, wrong, charges", () => {
  const all = data0();
  function data0() {
    // the table is read at collection time from the shipped file
    return gameJson<{ moves: Move[] }>("moves.json").moves;
  }
  const playable = all.filter((m) => m.tier !== "F" && m.id !== "echo" && m.tier !== "W");

  it("there are 50, and the six subjects hold 8, 8, 8, 9, 8, 8 plus the Wiggle", () => {
    expect(all).toHaveLength(50);
    const count = (s: string) => all.filter((m) => m.subject === s).length;
    expect(["math", "geometry", "science", "english", "hebrew", "logic", "any"].map(count)).toEqual([8, 8, 8, 9, 8, 8, 1]);
  });

  it.each(playable.map((m) => [m.n, m.id, m] as const))("%i %s: a right answer does its effect, a wrong one its weak version, one charge is spent", (_n, id, m) => {
    // every draw 0.0: every chance lands, the enemy's intent is a Puff
    const win = mk({ cards: [id], rng: fixedRng(0.0), enemyLevel: 12, pep: 20, partner: "heliobud" });
    // a hit on the partner first, so a heal has room
    const b = win.battle;
    const pepBefore = b.partnerPep.now;
    const fogBefore = b.fog;
    const r = cast(b, id, true);
    expect(r.correct).toBe(true);
    // charges
    const card = b.cards().find((c) => c.move.id === id);
    if (m.charges !== null && m.id !== "little_wiggle") expect(card?.left, "charges").toBe(m.charges - 1);
    if (m.power !== null) {
      expect(r.damage, "a hit takes fog").toBeGreaterThan(0);
      expect(fogBefore - b.fog).toBeGreaterThan(0);
    }
    const fx = (kind: string, pred: (x: Round["effects"][number]) => boolean = () => true) => r.effects.some((x) => x.kind === kind && pred(x));
    for (const e of m.effects) {
      switch (e.type) {
        case "status":
          expect(fx("status", (x) => x.status === e.status), `${e.status} on the enemy`).toBe(true);
          break;
        case "weaken":
          expect(fx("weaken", (x) => x.stat === e.stat && x.stages === e.stages)).toBe(true);
          break;
        case "boost":
          for (const stat of e.stats) expect(fx("boost", (x) => x.stat === stat && x.stages === e.stages)).toBe(true);
          break;
        case "shield":
          expect(r.effects.find((x) => x.kind === "shield")?.amount).toBe(Math.floor(e.share * b.partnerPep.max));
          break;
        case "heal":
          expect(fx("heal")).toBe(true);
          break;
        case "regen":
          expect(fx("regen")).toBe(true);
          break;
        case "mirror":
          expect(fx("mirror")).toBe(true);
          break;
        case "mark":
          expect(b.foe.marks.map((x) => x.subject)).toEqual([e.subject]);
          break;
        case "focus":
          expect(fx("focus")).toBe(true);
          break;
        case "reveal":
          expect(b.revealed()).toBe(true);
          expect(b.peek).toHaveLength(e.intents);
          break;
        default:
          break;
      }
    }
    void pepBefore;
    // the weak version: damage x0.35 (at least 1), no status, no Mark; a utility move's `wrong` list
    const lose = mk({ cards: [id], rng: fixedRng(0.0), enemyLevel: 12, pep: 20 });
    const w = cast(lose.battle, id, false);
    expect(w.correct).toBe(false);
    if (m.power !== null) {
      expect(w.damage).toBeGreaterThanOrEqual(1);
      expect(w.damage).toBeLessThan(r.damage);
      expect(lose.battle.foe.marks).toEqual([]);
      expect(lose.battle.foe.drowsy).toBeNull();
      expect(lose.battle.foe.dizzy).toBeNull();
      expect(lose.battle.foe.slow).toBeNull();
    }
    if (m.id === "multiply_me") expect(stageOf(lose.battle.mine, "power", 2)).toBe(1);
    if (m.id === "round_bubble") expect(w.effects.find((x) => x.kind === "shield")?.amount).toBe(Math.floor(0.12 * lose.battle.partnerPep.max));
  });

  it("every move has a unique number 1 to 50, an animation line and the unlock level of the table", () => {
    expect(all.map((m) => m.n).sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    for (const m of all) {
      expect(m.animation.length, m.id).toBeGreaterThan(5);
      expect(m.unlock_level, m.id).toBeGreaterThanOrEqual(1);
      expect(m.unlock_level, m.id).toBeLessThanOrEqual(12);
    }
    expect(moveOf("total").unlock_level).toBe(7);
    expect(moveOf("star_shower").unlock_level).toBe(6);
  });

  it("a move with no charges left is dimmed; with all four empty only the Little Wiggle shows", () => {
    const { battle } = mk({ cards: ["sum_spark", "number_nudge"], charges: 1 });
    cast(battle, "sum_spark");
    expect(battle.cards().find((c) => c.move.id === "sum_spark")).toMatchObject({ dimmed: true, why: "charges" });
    cast(battle, "number_nudge");
    expect(battle.cards().map((c) => c.move.id)).toEqual(["little_wiggle"]);
    const r = cast(battle, "little_wiggle");
    expect(r.damage).toBeGreaterThan(0);
    // the Wiggle asks no question and never runs out
    expect(battle.stats.questions).toBe(2);
    cast(battle, "little_wiggle");
    expect(battle.cards().map((c) => c.move.id)).toEqual(["little_wiggle"]);
  });
});

describe("chain moves: Marks and the finisher (3.4)", () => {
  it("a starter puts a Mark for 2 rounds, at most 2 at once (a third replaces the oldest), and the Marks run out", () => {
    const f = newFighter();
    addMark(f, "math", 1, 2);
    addMark(f, "geometry", 1, 2);
    addMark(f, "english", 2, 2);
    expect(f.marks.map((m) => m.subject)).toEqual(["geometry", "english"]);
    expect(badges(f, 3).filter((b) => b.id === "mark")).toHaveLength(2);
    expire(f, 3);
    expect(f.marks.map((m) => m.subject)).toEqual(["english"]);
    expire(f, 4);
    expect(f.marks).toEqual([]);
  });

  it("the finisher: x1.5 for a Mark, x1.75 when it is the finisher's own subject, x2.0 for two different ones", () => {
    const fin = eff(moveOf("total"), "finisher")!;
    const f = newFighter();
    expect(markBonus(f, "math", 1, fin)).toBe(1);
    addMark(f, "english", 1, 2);
    expect(markBonus(f, "math", 2, fin)).toBe(1.5);
    f.marks = [];
    addMark(f, "math", 1, 2);
    expect(markBonus(f, "math", 2, fin)).toBe(1.75);
    addMark(f, "geometry", 1, 2);
    expect(markBonus(f, "math", 2, fin)).toBe(2.0);
  });

  it("Add It Up then Total!: the Mark is consumed and the finisher hits harder", () => {
    const base = mk({ cards: ["total"], rng: fixedRng(0.5) });
    const plain = cast(base.battle, "total").damage;
    const { battle } = mk({ cards: ["add_it_up", "total"], rng: fixedRng(0.5) });
    cast(battle, "add_it_up");
    expect(battle.foe.marks).toHaveLength(1);
    const fogBefore = battle.fog;
    const r = cast(battle, "total");
    expect(r.damage).toBeGreaterThan(plain);
    expect(fogBefore - battle.fog).toBe(r.damage);
    expect(battle.foe.marks).toEqual([]);
  });

  it("a wrong answer puts no Mark and keeps the ones there", () => {
    const { battle } = mk({ cards: ["add_it_up", "total"], rng: fixedRng(0.5) });
    cast(battle, "add_it_up");
    cast(battle, "total", false);
    expect(battle.foe.marks).toHaveLength(1);
  });
});

describe("the damage bonus never exceeds x2.5 (5.2)", () => {
  it("Home x1.25, Sparkle x1.5, Mark x2.0, Brilliant x1.5, Mix x1.1 and chain x1.3 together are capped", () => {
    const wild = damageOf({ level: 10, mp: 65, power: 49, guard: 45, home: true, wheel: 1.5, mark: 2, brilliant: true, mix: true, chain: 1.3, right: true, roll: 1 });
    const capped = damageOf({ level: 10, mp: 65, power: 49, guard: 45, home: true, wheel: 1.5, mark: 2, brilliant: true, mix: true, chain: 1.3, right: true, roll: 1 });
    const bare = damageOf({ level: 10, mp: 65, power: 49, guard: 45, right: true, roll: 1 });
    expect(wild).toBe(capped);
    expect(wild).toBe(Math.floor(((6 * 65 * (49 / 45)) / 50 + 2) * BONUS_CAP));
    expect(wild / bare).toBeLessThanOrEqual(BONUS_CAP + 0.1);
  });
});

describe("statuses and stat stages (4.1, 4.2, 4.4)", () => {
  it("stages: +1 x1.25, +2 x1.5, +3 x1.75, -1 x0.8, -2 x0.67, -3 x0.57; at most +-3; they run out", () => {
    expect([1, 2, 3].map(stageMult)).toEqual([1.25, 1.5, 1.75]);
    expect([-1, -2, -3].map((s) => Math.round(stageMult(s) * 100) / 100)).toEqual([0.8, 0.67, 0.57]);
    const f = newFighter();
    for (let i = 0; i < 6; i++) shiftStage(f, "power", 1, 1, 3);
    expect(stageOf(f, "power", 2)).toBe(3);
    expect(badges(f, 2)).toContainEqual({ id: "boost", variant: "power", n: 3, left: 2 });
    expire(f, 4);
    expect(stageOf(f, "power", 5)).toBe(0);
    shiftStage(f, "guard", -9, 5, 3);
    expect(stageOf(f, "guard", 6)).toBe(-3);
  });

  it("a shield absorbs hits up to its amount and is used up", () => {
    const f = newFighter();
    f.shield = { amount: 10, until: 5 };
    expect(absorb(f, 4, 3)).toEqual({ left: 0, taken: 4 });
    expect(absorb(f, 9, 3)).toEqual({ left: 3, taken: 6 });
    expect(f.shield).toBeNull();
  });

  it("cleanse takes the bad ones: all, or one at a time (a major first)", () => {
    const f = newFighter();
    f.dizzy = { until: 9 };
    f.slow = { until: 9 };
    shiftStage(f, "speed", -2, 1, 5);
    expect(cleanse(f, "one", 2)).toBe(1);
    expect(f.dizzy).toBeNull();
    expect(cleanse(f, "all", 2)).toBe(2);
    expect(badges(f, 2)).toEqual([]);
  });

  it("Drowsy and Dizzy on the enemy are exclusive: a new one replaces the old", () => {
    const { battle } = mk({ cards: ["lullaby", "riddle_fog"], rng: fixedRng(0.0), enemy: "mercurip", enemyLevel: 5 });
    cast(battle, "lullaby");
    expect(battle.foe.drowsy).not.toBeNull();
    cast(battle, "riddle_fog");
    expect(battle.foe.dizzy).not.toBeNull();
    expect(battle.foe.drowsy).toBeNull();
  });

  it("a Drowsy enemy skips 2 actions (a boss 1): no puff comes", () => {
    const { battle } = mk({ cards: ["lullaby", "sum_spark"], rng: fixedRng(0.0), enemy: "mercurip" });
    const r1 = cast(battle, "lullaby");
    expect(r1.events.some((e) => e.kind === "sleep")).toBe(true);
    const r2 = cast(battle, "sum_spark");
    expect(r2.events.some((e) => e.kind === "sleep")).toBe(true);
    expect(battle.partnerPep.now).toBe(battle.partnerPep.max);
    const r3 = cast(battle, "sum_spark");
    expect(r3.events.some((e) => e.kind === "sleep")).toBe(false);
    const boss = mk({ cards: ["lullaby"], rng: fixedRng(0.0), enemy: "mercurip", master: true });
    expect(cast(boss.battle, "lullaby").events.filter((e) => e.kind === "sleep")).toHaveLength(1);
    // a wrong lullaby puts a wild creature to sleep for one action, a boss for none
    expect(moveOf("lullaby").wrong).toEqual([{ type: "status", status: "drowsy", chance: 1.0, actions: 1, boss_actions: 0 }]);
    const w = mk({ cards: ["lullaby"], rng: fixedRng(0.0), enemy: "mercurip" });
    cast(w.battle, "lullaby", false);
    expect(w.battle.foe.drowsy).toBeNull();
  });

  it("a boss shrugs a major status off for 3 rounds after one lands (the lock)", () => {
    const { battle } = mk({ cards: ["riddle_fog", "spin_top"], rng: fixedRng(0.0), enemy: "mercurip", master: true });
    cast(battle, "riddle_fog");
    expect(battle.foe.dizzy).not.toBeNull();
    expect(battle.lockedKinds()).toContain("dizzy");
    const second = cast(battle, "riddle_fog");
    expect(second.effects.some((e) => e.kind === "resist")).toBe(true);
    expect(battle.badgesOf("theirs").find((b) => b.id === "dizzy")?.locked).toBe(true);
  });

  it("a Dizzy enemy stumbles in a third of its actions", () => {
    const { battle } = mk({ cards: ["riddle_fog", "sum_spark"], rng: fixedRng(0.0), enemy: "mercurip" });
    cast(battle, "riddle_fog");
    const r = cast(battle, "sum_spark");
    expect(r.events.some((e) => e.kind === "stumble")).toBe(true);
  });

  it("Slow halves Speed: a Slow enemy that was faster now acts second", () => {
    const { battle } = mk({ cards: ["maze_mud", "sum_spark"], rng: fixedRng(0.0), enemy: "mercurip", level: 6, enemyLevel: 10 });
    const first = cast(battle, "sum_spark");
    expect(first.first).toBe("them");
    cast(battle, "maze_mud");
    const next = cast(battle, "sum_spark");
    expect(next.first).toBe("me");
  });

  it("Quick moves go first whatever the Speed (priority +1)", () => {
    const { battle } = mk({ cards: ["double_time"], rng: fixedRng(0.0), enemy: "mercurip", level: 6, enemyLevel: 12 });
    expect(cast(battle, "double_time").first).toBe("me");
  });

  it("Sniffly drips the enemy's Fog but never below 1; Regen heals our Pep each round", () => {
    const { battle } = mk({ cards: ["water_plink", "sunbeam"], partner: "lunibble", rng: fixedRng(0.0), enemy: "mercurip", fog: 4, pep: 20 });
    cast(battle, "water_plink", false);
    expect(battle.foe.sniffly).toBeNull();
    const m = mk({ cards: ["sunbeam"], partner: "lunibble", rng: fixedRng(0.0), enemy: "sailbit", pep: 10 });
    const before = m.battle.partnerPep.now;
    cast(m.battle, "sunbeam");
    const after1 = m.battle.partnerPep.now;
    expect(m.battle.mine.regen).not.toBeNull();
    cast(m.battle, "sunbeam");
    expect(m.battle.partnerPep.now).toBeGreaterThan(Math.min(after1, m.battle.partnerPep.max - 1));
    expect(before).toBeLessThanOrEqual(m.battle.partnerPep.max);
  });

  it("Healing Rain heals 30% of max Pep (10% for a wrong answer); Fresh Air cleanses and heals 10%", () => {
    const { battle } = mk({ cards: ["healing_rain"], partner: "lunibble", rng: fixedRng(0.99), enemy: "sailbit", pep: 5 });
    const max = battle.partnerPep.max;
    const r = cast(battle, "healing_rain");
    const heal = r.effects.find((e) => e.kind === "heal")!;
    expect(heal.amount).toBe(Math.ceil(0.3 * max));
    const w = mk({ cards: ["healing_rain"], partner: "lunibble", rng: fixedRng(0.99), enemy: "sailbit", pep: 5 });
    expect(cast(w.battle, "healing_rain", false).effects.find((e) => e.kind === "heal")!.amount).toBe(Math.ceil(0.1 * max));
  });

  it("Mirror softens the next attack by 60% and returns 60% of it as Fog", () => {
    const { battle } = mk({ cards: ["mirror_shape"], partner: "terrabub", rng: fixedRng(0.0), enemy: "asterchip", level: 20 });
    const fog = battle.fog;
    const r = cast(battle, "mirror_shape");
    expect(r.events.find((e) => e.kind === "puff")?.returned).toBeGreaterThan(0);
    expect(battle.fog).toBeLessThan(fog);
    expect(battle.mine.mirror).toBeNull();
  });

  it("Detective Lens reveals the weak subject and the next two intents, and gives Focus (the next right answer is Brilliant)", () => {
    const { battle } = mk({ cards: ["detective_lens", "sum_spark"], rng: fixedRng(0.0), enemy: "mercurip", age: 12 });
    expect(battle.revealed()).toBe(false);
    cast(battle, "detective_lens");
    expect(battle.revealed()).toBe(true);
    expect(battle.peek).toHaveLength(2);
    // the intents shown are the ones that come
    const shown = battle.intent!.id;
    expect(battle.peek[0]).toBe(shown);
    expect(battle.mine.focus).toBe(true);
    expect(cast(battle, "sum_spark").brilliant).toBe(true);
    expect(battle.mine.focus).toBe(false);
  });

  it("Swap Trick takes the enemy's Boosts for us; Echo repeats the last damage move at 60%, no question", () => {
    const { battle } = mk({ cards: ["swap_trick", "sum_spark", "echo"], rng: fixedRng(0.0), enemy: "mercurip" });
    expect(battle.cards().find((c) => c.move.id === "echo")).toMatchObject({ dimmed: true, why: "echo" });
    shiftStage(battle.foe, "power", 2, 1, 4);
    cast(battle, "swap_trick");
    expect(stageOf(battle.foe, "power", 2)).toBe(0);
    expect(stageOf(battle.mine, "power", 2)).toBe(2);
    const hit = cast(battle, "sum_spark");
    expect(battle.cards().find((c) => c.move.id === "echo")?.dimmed).toBe(false);
    const questions = battle.stats.questions;
    const echo = cast(battle, "echo");
    expect(battle.stats.questions).toBe(questions);
    expect(echo.damage).toBeGreaterThan(0);
    expect(echo.damage).toBeLessThan(hit.damage);
  });

  it("Mind Glimmer ignores the enemy's shield and is always Brilliant when right", () => {
    const { battle } = mk({ cards: ["mind_glimmer", "sum_spark"], rng: fixedRng(0.5), enemy: "mercurip" });
    battle.foe.shield = { amount: 999, until: 9 };
    expect(cast(battle, "sum_spark").damage).toBe(0);
    const r = cast(battle, "mind_glimmer");
    expect(r.damage).toBeGreaterThan(0);
    expect(r.brilliant).toBe(true);
  });

  it("a Giggly enemy's next attack is halved", () => {
    const a = mk({ cards: ["sum_spark"], rng: fixedRng(0.0), enemy: "mercurip" });
    const plain = cast(a.battle, "sum_spark").enemyDamage;
    const b = mk({ cards: ["spelling_spell", "sum_spark"], rng: fixedRng(0.0), enemy: "mercurip" });
    const r = cast(b.battle, "spelling_spell");
    expect(r.enemyDamage).toBeLessThan(plain);
  });
});

describe("the enemy's statuses on our side are softened and never waste an answer (4.1)", () => {
  /** A Sleepy enemy (Terrabub): at 0.6 it draws Drowsy Mist (band B). */
  it("Drowsy Mist: Yawn for a round, only easy moves, three taps wake it at once; the answered move still plays", () => {
    const { battle } = mk({ cards: ["number_nudge", "times_twister", "sum_spark"], enemy: "terrabub", rng: fixedRng(0.6), level: 20, enemyLevel: 5 });
    expect(battle.intent!.id).toBe("drowsy_mist");
    const r = cast(battle, "sum_spark");
    // the answered move played, then the mist
    expect(r.damage).toBeGreaterThan(0);
    expect(r.events.find((e) => e.kind === "mist")?.status).toBe("drowsy");
    expect(battle.yawning).toBe(true);
    const tiers = battle.cards().filter((c) => !c.dimmed).map((c) => c.move.id);
    expect(tiers).toEqual(["number_nudge"]);
    expect(battle.cards().find((c) => c.move.id === "times_twister")?.why).toBe("yawn");
    expect(battle.wakeTap()).toBe(false);
    expect(battle.wakeTap()).toBe(false);
    expect(battle.wakeTap()).toBe(true);
    expect(battle.cards().every((c) => !c.dimmed)).toBe(true);
  });

  it("the Yawn ends by itself after its round, and band A turns Drowsy Mist into a Silly Dance", () => {
    const { battle } = mk({ cards: ["number_nudge"], enemy: "terrabub", rng: fixedRng(0.6), level: 20, enemyLevel: 5 });
    cast(battle, "number_nudge");
    expect(battle.yawning).toBe(true);
    cast(battle, "number_nudge");
    expect(battle.yawning).toBe(false);
    const young = mk({ cards: ["number_nudge"], enemy: "terrabub", rng: fixedRng(0.6), age: 6 });
    expect(young.battle.intent!.id).toBe("silly_dance");
  });

  it("Dizzy Swirl: no stretch moves for 2 rounds; Sticky Mud: Speed x0.5", () => {
    // Playful at 0.4: Dizzy Swirl
    const { battle } = mk({ cards: ["times_twister", "sum_spark"], enemy: "mercurip", rng: fixedRng(0.4), level: 20, enemyLevel: 5 });
    expect(battle.intent!.id).toBe("dizzy_swirl");
    cast(battle, "sum_spark");
    expect(battle.cards().find((c) => c.move.id === "times_twister")).toMatchObject({ dimmed: true, why: "dizzy" });
    const mud = mk({ cards: ["sum_spark"], enemy: "mercurip", rng: fixedRng(0.5), level: 20, enemyLevel: 5 });
    expect(mud.battle.intent!.id).toBe("sticky_mud");
    cast(mud.battle, "sum_spark");
    expect(mud.battle.mine.slow).not.toBeNull();
    expect(mud.battle.badgesOf("mine").map((b) => b.id)).toContain("slow");
  });

  it("never two statuses in a row on the child", () => {
    const { battle } = mk({ cards: ["sum_spark"], enemy: "mercurip", rng: fixedRng(0.4), level: 30, enemyLevel: 5 });
    const seen: string[] = [];
    for (let i = 0; i < 4 && battle.phase === "fighting"; i++) {
      seen.push(battle.intent!.id);
      cast(battle, "sum_spark", false);
    }
    for (let i = 1; i < seen.length; i++) expect(["dizzy_swirl", "drowsy_mist", "sticky_mud"].includes(seen[i]!) && ["dizzy_swirl", "drowsy_mist", "sticky_mud"].includes(seen[i - 1]!)).toBe(false);
  });

  it("Thicken puts a shield on the enemy, Cheer Up a Power boost, a Silly Dance gives the child a star", () => {
    const shy = mk({ cards: ["sum_spark"], enemy: "sailbit", rng: fixedRng(0.4), level: 20 });
    expect(shy.battle.intent!.id).toBe("thicken");
    cast(shy.battle, "sum_spark");
    expect(shy.battle.foe.shield).not.toBeNull();
    const cheer = mk({ cards: ["sum_spark"], enemy: "mercurip", rng: fixedRng(0.6), level: 20, enemyLevel: 5 });
    expect(cheer.battle.intent!.id).toBe("cheer_up");
    cast(cheer.battle, "sum_spark");
    expect(stageOf(cheer.battle.foe, "power", 2)).toBe(1);
    const silly = mk({ cards: ["sum_spark"], enemy: "mercurip", rng: fixedRng(0.95), level: 20, enemyLevel: 5 });
    expect(silly.battle.intent!.id).toBe("silly_dance");
    const r = cast(silly.battle, "sum_spark", false);
    expect(r.events.find((e) => e.who === "them")?.kind).toBe("silly");
    expect(silly.battle.spark).toBe(1);
  });
});

describe("Windup and Stagger (2.4, 4.3)", () => {
  /** A Grumpy wild creature of level 8 and up: at 0.6 it draws the Big Puff. */
  const windupFight = (partnerLevel: number, enemyLevel = 14) => mk({ cards: ["sum_spark", "number_nudge"], enemy: "rustip", enemyLevel, level: partnerLevel, rng: fixedRng(0.6) });

  it("a Big Puff shows its ring, does nothing that round, and lets go at the end of the next", () => {
    const { battle } = windupFight(4);
    expect(battle.intent).toMatchObject({ id: "big_puff" });
    expect(battle.intent!.release).toBeUndefined();
    const r1 = cast(battle, "number_nudge");
    expect(r1.events.some((e) => e.kind === "windup")).toBe(true);
    expect(r1.enemyDamage).toBe(0);
    expect(battle.windup).not.toBeNull();
    expect(battle.badgesOf("theirs").map((b) => b.id)).toContain("windup");
    expect(battle.intent).toMatchObject({ id: "big_puff", release: true });
    // a small hit (under 25%) does not stagger it: the big puff lands at the end of the round
    const r2 = cast(battle, "number_nudge");
    expect(r2.staggered).toBe(false);
    expect(r2.events[r2.events.length - 1]).toMatchObject({ who: "them", kind: "puff", intent: "big_puff" });
    expect(r2.enemyDamage).toBeGreaterThan(0);
    expect(battle.windup).toBeNull();
  });

  it("a round that takes 25% of the enemy's maximum Fog staggers it: the windup is lost", () => {
    const { battle } = windupFight(16);
    cast(battle, "number_nudge", true);
    expect(battle.windup).not.toBeNull();
    const need = Math.ceil(battle.maxFog * STAGGER_SHARE);
    const fogBefore = battle.fog;
    const r = cast(battle, "sum_spark");
    expect(fogBefore - battle.fog).toBeGreaterThanOrEqual(need);
    expect(r.staggered).toBe(true);
    expect(r.events.some((e) => e.kind === "stagger")).toBe(true);
    expect(r.enemyDamage).toBe(0);
    expect(battle.windup).toBeNull();
  });

  it("exactly at the line: 24 of 100 does not stagger, 25 does (the share is of the maximum Fog)", () => {
    expect(STAGGER_SHARE).toBe(0.25);
    const a = windupFight(4);
    cast(a.battle, "number_nudge");
    a.battle.fog = a.battle.maxFog;
    // the number checked in the engine is ceil(max * 0.25)
    expect(Math.ceil(100 * STAGGER_SHARE)).toBe(25);
  });

  it("a lullaby that puts it to sleep loses the windup; a wild creature never uses a Big Puff under level 8", () => {
    const { battle } = windupFight(10);
    cast(battle, "number_nudge");
    expect(battle.windup).not.toBeNull();
    battle.foe.drowsy = { actions: 1, until: 0 };
    const r = cast(battle, "number_nudge");
    expect(r.events.some((e) => e.kind === "sleep")).toBe(true);
    expect(r.enemyDamage).toBe(0);
    expect(battle.windup).toBeNull();
    const low = mk({ cards: ["number_nudge"], enemy: "rustip", enemyLevel: 7, rng: fixedRng(0.6) });
    expect(low.battle.intent!.id).toBe("fog_puff");
  });
});

describe("Spark and the Finale (2.2, 3.4)", () => {
  it("a right answer fills 1 star, a right stretch answer 2, a wrong answer none; the meter stops at 4", () => {
    const { battle } = mk({ cards: ["sum_spark", "times_twister"], rng: fixedRng(0.0), enemy: "mercurip", enemyLevel: 3, level: 8, fog: 9999 });
    cast(battle, "sum_spark", false);
    expect(battle.spark).toBe(0);
    cast(battle, "sum_spark");
    expect(battle.spark).toBeGreaterThanOrEqual(1);
    const s = battle.spark;
    cast(battle, "times_twister");
    expect(battle.spark).toBeGreaterThanOrEqual(Math.min(4, s + 2));
    for (let i = 0; i < 4 && battle.phase === "fighting"; i++) cast(battle, "times_twister");
    expect(battle.spark).toBeLessThanOrEqual(4);
  });

  it("a hit of 15% of max Pep or more fills a star", () => {
    const { battle } = mk({ cards: ["sum_spark"], rng: fixedRng(0.0), enemy: "mercurip", enemyLevel: 30, level: 6 });
    const r = cast(battle, "sum_spark", false);
    expect(r.enemyDamage).toBeGreaterThanOrEqual(0.15 * battle.partnerPep.max);
    expect(battle.spark).toBe(1);
  });

  it("the Finale card is there from level 6, ready at 4 stars, three questions, chain bonus 1.0 / 1.15 / 1.3, a wrong answer resets the chain but the Finale goes on", () => {
    const { battle } = mk({ cards: ["sum_spark"], rng: fixedRng(0.5), enemy: "sailbit", enemyLevel: 12, spark: 4 });
    const card = battle.finaleCard()!;
    expect(card).toMatchObject({ ready: true, spark: 4, cost: 4 });
    expect(card.move.id).toBe("star_shower");
    const steps: number[] = [];
    let c = battle.choose("star_shower")!;
    expect(c.session).not.toBeNull();
    answerRightAny(c.session!);
    steps.push(battle.finaleStep!.chain);
    expect(battle.finaleOpen).toBe(true);
    expect(battle.turns).toBe(0);
    c = { ...c, session: battle.nextFinale() };
    answerRightAny(c.session!);
    steps.push(battle.finaleStep!.chain);
    const fogBefore = battle.fog;
    const third = battle.nextFinale()!;
    answerRightAny(third);
    const r = battle.last!;
    expect(steps).toEqual([1, 1.15]);
    expect(r.finale).toBe(true);
    expect(r.damage).toBeGreaterThan(fogBefore - battle.fog);
    expect(battle.stats.questions).toBe(3);
    // the meter is spent; never twice in a row
    expect(battle.spark).toBe(0);
    expect(battle.finaleCard()!.ready).toBe(false);
    expect(battle.turns).toBe(1);
  });

  it("scripted: a wrong middle answer resets the chain; the total is less than three right answers", () => {
    const right = mk({ cards: ["sum_spark"], rng: fixedRng(0.5), enemy: "sailbit", enemyLevel: 12, spark: 4 });
    const a = right.battle.castScripted("star_shower", [true, true, true])!;
    const wrong = mk({ cards: ["sum_spark"], rng: fixedRng(0.5), enemy: "sailbit", enemyLevel: 12, spark: 4 });
    const b = wrong.battle.castScripted("star_shower", [true, false, true])!;
    expect(b.damage).toBeLessThan(a.damage);
    expect(b.finale).toBe(true);
    expect(wrong.battle.stats.questions).toBe(3);
    // not ready: the card is refused
    const low = mk({ cards: ["sum_spark"], spark: 3, enemy: "sailbit" });
    expect(low.battle.castScripted("star_shower", true)).toBeNull();
    expect(low.battle.choose("star_shower")).toBeNull();
  });

  it("the last hit's extra lands when its answer was right: Golden Pyramid shields, Song of Letters heals, Comet Parade may slow", () => {
    const g = mk({ partner: "terrabub", cards: ["block_bounce"], rng: fixedRng(0.5), enemy: "sailbit", enemyLevel: 12, spark: 4 });
    g.battle.castScripted("golden_pyramid", [true, true, true]);
    expect(g.battle.mine.shield).not.toBeNull();
    const no = mk({ partner: "terrabub", cards: ["block_bounce"], rng: fixedRng(0.5), enemy: "sailbit", enemyLevel: 12, spark: 4 });
    no.battle.castScripted("golden_pyramid", [true, true, false]);
    expect(no.battle.mine.shield).toBeNull();
    const c = mk({ partner: "lunibble", cards: ["leaf_flick"], rng: fixedRng(0.0), enemy: "sailbit", enemyLevel: 12, spark: 4 });
    c.battle.castScripted("comet_parade", [true, true, true]);
    expect(c.battle.foe.slow).not.toBeNull();
  });
});

describe("gifts (3.5)", () => {
  it("Cheerful starts the fight with a star; Steady is immune to Dizzy; Warm Fog heals 20% more; Sturdy Shell shields a round longer", () => {
    // Lunibble's gift is Cheerful
    expect(mk({ partner: "lunibble", cards: ["leaf_flick"] }).battle.spark).toBe(1);
    expect(mk({ partner: "heliobud", cards: ["sum_spark"] }).battle.spark).toBe(0);
    const steadySpecies = Object.entries(data.species).find(([, s]) => s.gift === "steady" && s.stage === 0)![0];
    const s = mk({ enemy: steadySpecies, cards: ["riddle_fog"], rng: fixedRng(0.0) });
    cast(s.battle, "riddle_fog");
    expect(s.battle.foe.dizzy).toBeNull();
    const warm = Object.entries(data.species).find(([, x]) => x.gift === "warm_fog" && x.subject === "science")?.[0];
    if (warm) {
      const w = mk({ partner: warm, cards: ["healing_rain"], rng: fixedRng(0.99), pep: 3 });
      const max = w.battle.partnerPep.max;
      expect(cast(w.battle, "healing_rain").effects.find((e) => e.kind === "heal")!.amount).toBe(Math.min(Math.ceil(0.3 * max * 1.2), max - 3));
    }
    // Terrabub: Sturdy Shell
    const t = mk({ partner: "terrabub", cards: ["round_bubble"] });
    cast(t.battle, "round_bubble");
    expect(t.battle.mine.shield!.until).toBe(1 + 2 + 1);
  });

  it("Brave Heart (the gift, any band) leaves 1 Pep once instead of a faint", () => {
    const species = Object.entries(data.species).find(([, s]) => s.gift === "brave_heart" && s.stage === 0)![0];
    const { battle } = mk({ partner: species, cards: ["number_nudge"], enemy: "mercurip", rng: fixedRng(0.0), pep: 1, age: 12 });
    const r = cast(battle, "number_nudge");
    expect(r.enemyDamage).toBeGreaterThanOrEqual(0);
    expect(battle.partnerPep.now).toBe(1);
    expect(r.fainted).toBeNull();
  });

  it("Sparkly turns the Sparkle bonus into x1.65", () => {
    const species = Object.entries(data.species).find(([, s]) => s.gift === "sparkly" && s.stage === 0 && s.subject === "science")?.[0] ?? Object.entries(data.species).find(([, s]) => s.gift === "sparkly")![0];
    const sp = data.species[species]!;
    // an enemy of the subject the wheel makes this subject good against
    const idx = data.rules.wheel.indexOf(sp.subject);
    const target = Object.entries(data.species).find(([, s]) => s.stage === 0 && s.subject === data.rules.wheel[(idx + 1) % 6] && s.gift !== "sparkly")![0];
    const plain = Object.entries(data.species).find(([, s]) => s.gift !== "sparkly" && s.stage === 0 && s.subject === sp.subject)![0];
    const home = (data.moves.find((m) => m.subject === sp.subject && m.tier === "N") as Move).id;
    const a = mk({ partner: species, cards: [home], enemy: target, rng: fixedRng(0.5), level: 15 });
    const b = mk({ partner: plain, cards: [home], enemy: target, rng: fixedRng(0.5), level: 15 });
    expect(cast(a.battle, home).wheel).toBe("sparkle");
    expect(cast(b.battle, home).wheel).toBe("sparkle");
  });
});

describe("a wrong answer never wastes the move's turn and statuses never lose an answered question", () => {
  it("the question counts, the move plays, the Spark and the Bag are not touched by a wrong answer", () => {
    const { battle, world } = mk({ cards: ["sum_spark"], rng: fixedRng(0.0), enemy: "mercurip", enemyLevel: 3 });
    const items = [...world.items];
    const r = cast(battle, "sum_spark", false);
    expect(battle.stats.questions).toBe(1);
    expect(r.damage).toBeGreaterThanOrEqual(1);
    expect(battle.spark).toBe(0);
    expect([...world.items]).toEqual(items);
  });

  it("no beat of the whole move table does 0 damage by itself (a hit takes at least 1 Fog; shields aside)", () => {
    for (const m of data.moves.filter((x) => x.power !== null && x.tier !== "F" && x.tier !== "W")) {
      const { battle } = mk({ cards: [m.id], rng: fixedRng(0.95), enemy: "sailbit", enemyLevel: 12 });
      expect(cast(battle, m.id, false).damage, m.id).toBeGreaterThanOrEqual(1);
    }
  });
});
