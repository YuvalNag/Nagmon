import { describe, expect, it } from "vitest";
import { EGG_NEED, MAX_EGGS, placeEgg, warmEggs } from "../../../src/core/game/eggs";
import { countOf, economy, give } from "../../../src/core/game/items";
import { EGG_ITEM } from "../../../src/core/game/loot";
import { addCreature } from "../../../src/core/game/collection";
import { WorldState } from "../../../src/core/world/worldState";
import { gameJson } from "./helpers";

const eco = economy(gameJson("economy.json"));
const pool = (table: string) => (table === "meadow" ? [{ species: "heliobud", level: 3 }, { species: "lunibble", level: 4 }, { species: "terrabub", level: 5 }] : []);

function withEggs(n: number) {
  const w = new WorldState();
  give(w, eco, EGG_ITEM, n);
  return w;
}

describe("placing an egg", () => {
  it("takes the egg from the Bag and starts warming it, for the zone it was placed in", () => {
    const w = withEggs(2);
    const r = placeEgg(w, eco, "meadow");
    expect(r).toEqual({ ok: true });
    expect(countOf(w, EGG_ITEM)).toBe(1);
    expect(w.eggs).toEqual([{ id: "e1", table: "meadow", got: 0, need: EGG_NEED }]);
  });

  it("without an egg in the Bag there is nothing to place", () => {
    const w = new WorldState();
    expect(placeEgg(w, eco, "meadow")).toEqual({ ok: false, reason: "none" });
    expect(w.eggs).toEqual([]);
  });

  it("only a few eggs warm at a time; the extra one stays in the Bag, nothing lost", () => {
    const w = withEggs(MAX_EGGS + 1);
    for (let i = 0; i < MAX_EGGS; i++) expect(placeEgg(w, eco, "meadow").ok).toBe(true);
    expect(placeEgg(w, eco, "meadow")).toEqual({ ok: false, reason: "full" });
    expect(countOf(w, EGG_ITEM)).toBe(1);
  });

  it("each egg has its own id, even after one hatched", () => {
    const w = withEggs(3);
    placeEgg(w, eco, "meadow");
    for (let i = 0; i < EGG_NEED; i++) warmEggs(w, pool);
    placeEgg(w, eco, "meadow");
    placeEgg(w, eco, "meadow");
    expect(w.eggs.map((e) => e.id)).toEqual(["e2", "e3"]);
  });
});

describe("warming with right answers", () => {
  it("one right answer warms every egg one step, anywhere; nothing hatches before its time", () => {
    const w = withEggs(2);
    placeEgg(w, eco, "meadow");
    placeEgg(w, eco, "meadow");
    for (let i = 0; i < EGG_NEED - 1; i++) expect(warmEggs(w, pool)).toEqual([]);
    expect(w.eggs.map((e) => e.got)).toEqual([EGG_NEED - 1, EGG_NEED - 1]);
    expect(w.creatures).toEqual([]);
  });

  it("after N right answers it hatches into a creature of the zone's pool, which is seen and caught", () => {
    const w = withEggs(1);
    placeEgg(w, eco, "meadow");
    let hatched: ReturnType<typeof warmEggs> = [];
    for (let i = 0; i < EGG_NEED; i++) hatched = warmEggs(w, pool);
    expect(hatched).toHaveLength(1);
    const sp = hatched[0]!.species;
    expect(["heliobud", "lunibble", "terrabub"]).toContain(sp);
    expect(w.creatures.map((c) => c.species)).toEqual([sp]);
    expect(w.caught.has(sp)).toBe(true);
    expect(w.seen.has(sp)).toBe(true);
    expect(w.eggs).toEqual([]);
  });

  it("prefers a friend the child does not have yet, so a hatch is a new friend", () => {
    for (const mine of ["heliobud", "lunibble"]) {
      const w = withEggs(1);
      addCreature(w, mine, 3);
      placeEgg(w, eco, "meadow");
      for (let i = 0; i < EGG_NEED; i++) warmEggs(w, pool);
      expect(w.creatures.at(-1)!.species).not.toBe(mine);
    }
  });

  it("is the same species for the same egg and the same Bag, not a dice roll", () => {
    const run = () => {
      const w = withEggs(1);
      placeEgg(w, eco, "meadow");
      for (let i = 0; i < EGG_NEED; i++) warmEggs(w, pool);
      return w.creatures[0]!.species;
    };
    expect(run()).toBe(run());
  });

  it("an egg of a zone with no creatures keeps warming, and nothing is lost", () => {
    const w = withEggs(1);
    placeEgg(w, eco, "nowhere");
    for (let i = 0; i < EGG_NEED + 3; i++) expect(warmEggs(w, pool)).toEqual([]);
    expect(w.eggs).toHaveLength(1);
    expect(w.eggs[0]!.got).toBe(EGG_NEED);
  });

  it("a hatched friend joins the party, or waits in the Meadow when the party is full", () => {
    const w = withEggs(1);
    for (let i = 0; i < 4; i++) addCreature(w, "rustip", 3);
    placeEgg(w, eco, "meadow");
    for (let i = 0; i < EGG_NEED; i++) warmEggs(w, pool);
    expect(w.creatures).toHaveLength(5);
  });
});

describe("the save", () => {
  it("round-trips the eggs, and an old save with none loads and writes the file it always was", () => {
    const w = withEggs(1);
    placeEgg(w, eco, "meadow");
    warmEggs(w, pool);
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict())));
    expect(back.eggs).toEqual(w.eggs);
    const old = WorldState.fromDict({ schema_version: 1, money: 5, variables: {} });
    expect(old.eggs).toEqual([]);
    expect(old.toDict()).toEqual({ schema_version: 1, money: 5, variables: {} });
  });

  it("reads damaged eggs leniently: bad ones are left out", () => {
    const w = WorldState.fromDict({ eggs: [{ id: "e1", table: "meadow", got: 2, need: 10 }, { id: "", table: "x" }, { id: "e2", table: "m", got: -1, need: 0 }, "x", null] });
    expect(w.eggs).toEqual([{ id: "e1", table: "meadow", got: 2, need: 10 }, { id: "e2", table: "m", got: 0, need: EGG_NEED }]);
  });
});
