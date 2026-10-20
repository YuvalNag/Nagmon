import { beforeAll, describe, expect, it } from "vitest";
import { addCreature } from "../../../src/core/game/collection";
import { Battle, damageFor, hpFor, MAX_CREATURES } from "../../../src/core/game/battle";
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

function make(over: { partner?: number; wild?: number; species?: string; world?: WorldState } = {}) {
  const world = over.world ?? new WorldState();
  if (!over.world) addCreature(world, "agnite", over.partner ?? 6);
  const lines: string[] = [];
  let changes = 0;
  const t = { now: 0 };
  const battle = new Battle({
    engine: engineFor(content, 3, 5),
    world,
    monsters,
    subjects,
    wild: { species: over.species ?? "kroki", level: over.wild ?? 6, table: "test" },
    clock: () => (t.now += 1500),
    maxChoices: null,
    field: new FieldLog({ info: (m) => lines.push(m) }),
    onChange: () => changes++,
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
    const { battle } = make({ species: "kroki" });
    const s = battle.next()!;
    expect(subjects.subjectFor(monsters["kroki"]!.types, null, "kroki")).toBe("science");
    expect(s.question!.subject).toBe("science");
  });

  it("a right answer attacks: it takes health, by the partner's level and how well it was answered", () => {
    const { battle } = make();
    const hp = battle.hp;
    expect(hp).toBe(hpFor(6));
    const r = play(battle, true);
    expect(r.correct).toBe(true);
    expect(r.damage).toBeGreaterThanOrEqual(damageFor(6, 1.5));
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

  it("any number of wrong answers never ends it: only a win, or the child going on their way", () => {
    const { battle } = make();
    for (let i = 0; i < 12; i++) expect(play(battle, false).won).toBe(false);
    expect(battle.phase).toBe("fighting");
    expect(battle.stats.questions).toBe(12);
    expect(battle.stats.correct).toBe(0);
  });

  it("enough right answers win it, and the wild creature joins the child's creatures", () => {
    const { battle, world } = make();
    let r = play(battle, true);
    for (let i = 0; i < 20 && !r.won; i++) r = play(battle, true);
    expect(r.won).toBe(true);
    expect(battle.phase).toBe("won");
    expect(battle.hp).toBe(0);
    expect(r.caught?.species).toBe("kroki");
    expect(world.creatures.map((c) => c.species)).toEqual(["agnite", "kroki"]);
    expect(world.caught.has("kroki")).toBe(true);
    expect(battle.stats.questions).toBeLessThanOrEqual(8);
  });

  it("the partner grows with right answers, and the growth is saved each time", () => {
    const { battle, world, changes } = make({ partner: 5 });
    const level = world.creatures[0]!.level;
    for (let i = 0; i < 12 && battle.phase === "fighting"; i++) play(battle, true);
    expect(changes()).toBeGreaterThan(0);
    const c = world.creatures[0]!;
    expect(c.level > level || c.xp > 0).toBe(true);
  });

  it("is only seen, not caught, when the child goes on their way", () => {
    const { battle, world } = make();
    play(battle, true);
    battle.run();
    expect(battle.phase).toBe("ran");
    expect(world.seen.has("kroki")).toBe(true);
    expect(world.caught.has("kroki")).toBe(false);
    expect(world.creatures).toHaveLength(1);
  });

  it("writes its start and end to the log, in one line each", () => {
    const { battle, lines } = make();
    battle.start("classic_route_1");
    play(battle, true);
    battle.run();
    expect(lines.filter((l) => l.startsWith("BATTLE"))).toEqual([
      "BATTLE start monster=kroki level=6 map=classic_route_1",
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

  it("with too many creatures the new friend is seen and caught but not added", () => {
    const world = new WorldState();
    for (let i = 0; i < MAX_CREATURES; i++) addCreature(world, "agnite", 5);
    const { battle } = make({ world });
    let r = play(battle, true);
    for (let i = 0; i < 20 && !r.won; i++) r = play(battle, true);
    expect(r.won).toBe(true);
    expect(r.caught).toBeNull();
    expect(world.creatures).toHaveLength(MAX_CREATURES);
    expect(world.caught.has("kroki")).toBe(true);
  });

  it("no partner (an old save): the battle cannot start", () => {
    const world = new WorldState();
    expect(() => make({ world })).toThrow(/partner/);
  });
});
