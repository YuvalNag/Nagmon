import { describe, expect, it } from "vitest";
import { repairSave } from "../../../src/core/game/saveRepair";
import { monsterTable } from "../../../src/core/game/monsters";
import { WorldState } from "../../../src/core/world/worldState";
import { gameJson } from "./helpers";

const monsters = monsterTable(gameJson("db/monsters.json"));

function world(species: string[]): WorldState {
  const w = WorldState.fromDict({
    money: 5,
    variables: { nagmon_intro_done: "yes" },
    creatures: species.map((s, i) => ({ id: `c${i + 1}`, species: s, level: 7 + i, xp: 2, hearts: 3, name: "דובי" })),
    seen: [...species, "heliobud"],
    caught: [...species],
  });
  return w;
}

describe("repairing an old save", () => {
  it("leaves a save of valid creatures alone", () => {
    const w = world(["heliobud", "lunibble"]);
    const r = repairSave(w, monsters);
    expect(r).toEqual({ replaced: [], dropped: [], starter: null });
    expect(w.creatures.map((c) => c.species)).toEqual(["heliobud", "lunibble"]);
  });

  it("swaps an unknown species for the base creature of the same family, keeping level, name and friendship", () => {
    const w = world(["heliolynxx", "lunibble"]);
    const r = repairSave(w, monsters);
    expect(r.replaced).toEqual([["heliolynxx", "heliobud"]]);
    expect(w.creatures[0]).toMatchObject({ id: "c1", species: "heliobud", level: 7, xp: 2, hearts: 3, name: "דובי" });
  });

  it("drops what cannot be mapped, from the party, the box and the seen and caught lists", () => {
    const w = world(["flaskling", "lunibble", "a", "b", "c", "flaskling"]);
    const r = repairSave(w, monsters);
    expect(r.dropped.sort()).toEqual(["a", "b", "c", "flaskling", "flaskling"]);
    expect(w.creatures.map((c) => c.species)).toEqual(["lunibble"]);
    expect([...w.seen].every((s) => monsters[s])).toBe(true);
    expect([...w.caught].every((s) => monsters[s])).toBe(true);
  });

  it("gives a default starter when the party would be empty and the intro was done", () => {
    const w = world(["flaskling"]);
    const r = repairSave(w, monsters);
    expect(r.starter).toBeTruthy();
    expect(w.creatures).toHaveLength(1);
    const m = monsters[w.creatures[0]!.species]!;
    expect([m.stage, m.hasSprite, m.evolutions.length > 0]).toEqual(["basic", true, true]);
    expect(w.creatures[0]!.level).toBeGreaterThanOrEqual(7);
    expect(w.variables.get("nagmon_starter")).toBe(w.creatures[0]!.species);
  });

  it("a child who has not met the owl yet has no creatures and gets none", () => {
    const w = new WorldState();
    expect(repairSave(w, monsters)).toEqual({ replaced: [], dropped: [], starter: null });
    expect(w.creatures).toEqual([]);
  });
});
