import { describe, expect, it } from "vitest";
import { addCreature } from "../../../src/core/game/collection";
import { partyOf } from "../../../src/core/game/party";
import { meadow, swapWithMeadow } from "../../../src/core/game/rest";
import { WorldState } from "../../../src/core/world/worldState";

function world(n: number) {
  const w = new WorldState();
  for (let i = 0; i < n; i++) addCreature(w, "heliobud", 3 + i);
  return w;
}

describe("swapping a friend of the party with one from the Meadow", () => {
  it("swaps their places; the same friends, the same levels, nobody lost", () => {
    const w = world(6);
    const before = w.creatures.map((c) => c.id);
    expect(partyOf(w).map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(meadow(w).map((c) => c.id)).toEqual(["c5", "c6"]);
    expect(swapWithMeadow(w, "c2", "c5")).toBe(true);
    expect(partyOf(w).map((c) => c.id)).toEqual(["c1", "c5", "c3", "c4"]);
    expect(meadow(w).map((c) => c.id)).toEqual(["c2", "c6"]);
    expect([...w.creatures.map((c) => c.id)].sort()).toEqual([...before].sort());
  });

  it("the partner (the first) can be swapped out too: the Meadow's friend becomes the partner", () => {
    const w = world(5);
    expect(swapWithMeadow(w, "c1", "c5")).toBe(true);
    expect(w.creatures[0]!.id).toBe("c5");
  });

  it("refuses two of the party, two of the Meadow, or an unknown friend, and changes nothing", () => {
    const w = world(6);
    const ids = () => w.creatures.map((c) => c.id).join();
    const before = ids();
    expect(swapWithMeadow(w, "c1", "c2")).toBe(false);
    expect(swapWithMeadow(w, "c5", "c6")).toBe(false);
    expect(swapWithMeadow(w, "c1", "zz")).toBe(false);
    expect(swapWithMeadow(w, "zz", "c5")).toBe(false);
    expect(ids()).toBe(before);
  });

  it("takes either order: the Meadow's friend first, then the party's", () => {
    const w = world(5);
    expect(swapWithMeadow(w, "c5", "c3")).toBe(true);
    expect(partyOf(w).map((c) => c.id)).toEqual(["c1", "c2", "c5", "c4"]);
  });

  it("with up to four friends there is no Meadow to swap with", () => {
    const w = world(3);
    expect(meadow(w)).toEqual([]);
    expect(swapWithMeadow(w, "c1", "c2")).toBe(false);
  });
});
