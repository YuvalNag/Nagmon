import { describe, expect, it } from "vitest";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { encounterTables } from "../../../src/core/game/encounters";
import { give, countOf } from "../../../src/core/game/items";
import { monsterTable } from "../../../src/core/game/monsters";
import { BOX_SIZE, boxesOf, deposit, inBox, isFav, parsePc, sortedMeadow, storedItems, toggleFav, withdraw } from "../../../src/core/game/pcBox";
import { meadow, swapWithMeadow } from "../../../src/core/game/rest";
import { partyOf } from "../../../src/core/game/party";
import { WorldState } from "../../../src/core/world/worldState";
import { gameJson } from "../game/helpers";
import { eco, worldWith } from "./helpers";

const ctx = () => ({
  monsters: monsterTable(gameJson("db/monsters.json")),
  encounters: encounterTables(gameJson("db/encounters.json")),
  subjects: SubjectMap.fromDoc(gameJson("content/subjects.json")),
});

describe("the item box", () => {
  it("moves items from the Bag to the box and back; nothing is lost or made", () => {
    const w = worldWith();
    const e = eco();
    give(w, e, "berry", 30);
    expect(deposit(w, e, "berry", 10)).toBe(10);
    expect([countOf(w, "berry"), inBox(w, "berry")]).toEqual([20, 10]);
    expect(withdraw(w, e, "berry", 4)).toBe(4);
    expect([countOf(w, "berry"), inBox(w, "berry")]).toEqual([24, 6]);
    expect(withdraw(w, e, "berry", 99)).toBe(6);
    expect([countOf(w, "berry"), inBox(w, "berry")]).toEqual([30, 0]);
    expect(w.pc.box).toEqual({});
  });

  it("holds 99 more of every item the Bag caps at 99: 198 in all", () => {
    const w = worldWith();
    const e = eco();
    give(w, e, "berry", 99);
    expect(deposit(w, e, "berry", 99)).toBe(99);
    give(w, e, "berry", 99);
    expect([countOf(w, "berry"), inBox(w, "berry")]).toEqual([99, 99]);
    // the box is full: the Bag's own are kept
    expect(deposit(w, e, "berry", 5)).toBe(0);
    expect(countOf(w, "berry")).toBe(99);
    // the Bag is full: they stay in the box
    expect(withdraw(w, e, "berry", 5)).toBe(0);
    expect(inBox(w, "berry")).toBe(99);
  });

  it("refuses what it does not have, an unknown item or a count under one, and changes nothing", () => {
    const w = worldWith();
    const e = eco();
    expect(deposit(w, e, "berry", 1)).toBe(0);
    expect(deposit(w, e, "nonsense", 1)).toBe(0);
    expect(withdraw(w, e, "berry", 1)).toBe(0);
    give(w, e, "berry", 3);
    expect(deposit(w, e, "berry", 0)).toBe(0);
    expect(deposit(w, e, "berry", -2)).toBe(0);
    expect(countOf(w, "berry")).toBe(3);
  });

  it("lists what the Bag or the box holds, in the table's order, and keeps the box when saved", () => {
    const w = worldWith();
    const e = eco();
    give(w, e, "clover", 2);
    give(w, e, "berry", 5);
    deposit(w, e, "clover", 2);
    expect(storedItems(w, e)).toEqual(["berry", "clover"]);
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict())));
    expect(back.pc.box).toEqual({ clover: 2 });
    expect(back.items.get("berry")).toBe(5);
  });
});

describe("the friends' boxes", () => {
  it("swaps a friend of the party with one of the Meadow and nobody is lost", () => {
    const w = worldWith(10);
    const before = w.creatures.map((c) => c.id).sort();
    const inMeadow = meadow(w)[0]!.id;
    const partyOne = partyOf(w)[2]!.id;
    expect(swapWithMeadow(w, partyOne, inMeadow)).toBe(true);
    expect(partyOf(w).some((c) => c.id === inMeadow)).toBe(true);
    expect(meadow(w).some((c) => c.id === partyOne)).toBe(true);
    expect(w.creatures.map((c) => c.id).sort()).toEqual(before);
    expect(w.creatures).toHaveLength(10);
  });

  it("stars and un-stars a friend; an unknown friend cannot be starred", () => {
    const w = worldWith(6);
    expect(toggleFav(w, "c5")).toBe(true);
    expect(isFav(w, "c5")).toBe(true);
    expect(toggleFav(w, "c5")).toBe(true);
    expect(isFav(w, "c5")).toBe(false);
    expect(toggleFav(w, "zz")).toBe(false);
    expect(w.pc.fav).toEqual([]);
  });

  it("shows the newest friends first (a view: the order of the world does not change)", () => {
    const w = worldWith(9);
    const order = w.creatures.map((c) => c.id);
    expect(sortedMeadow(w, "newest", ctx()).map((c) => c.id)).toEqual(["c9", "c8", "c7", "c6", "c5"]);
    expect(w.creatures.map((c) => c.id)).toEqual(order);
  });

  it("sorts by subject and by zone, grouping the same kind, and puts the starred first in every sort", () => {
    const w = worldWith(10);
    const c = ctx();
    for (const mode of ["zone", "subject"] as const) {
      const list = sortedMeadow(w, mode, c);
      expect(list.map((x) => x.id).sort()).toEqual(meadow(w).map((x) => x.id).sort());
    }
    const subjects = sortedMeadow(w, "subject", c).map((x) => c.subjects.subjectFor(c.monsters[x.species]?.types ?? [], null, x.species));
    expect([...subjects].sort()).toEqual(subjects);
    toggleFav(w, "c9");
    for (const mode of ["zone", "subject", "newest"] as const) expect(sortedMeadow(w, mode, c)[0]!.id).toBe("c9");
  });

  it("puts the Meadow in boxes of eight, one box even when it is empty", () => {
    expect(boxesOf([])).toEqual([[]]);
    const ids = Array.from({ length: 19 }, (_, i) => i);
    expect(boxesOf(ids).map((b) => b.length)).toEqual([BOX_SIZE, BOX_SIZE, 3]);
  });

  it("nothing in the PC can release or delete a friend: there is no such function", async () => {
    const mod = await import("../../../src/core/game/pcBox");
    expect(Object.keys(mod).filter((k) => /release|delete|remove|sell/i.test(k))).toEqual([]);
  });

  it("reads an unreadable save as an empty one", () => {
    expect(parsePc(7)).toEqual({ box: {}, fav: [] });
    expect(parsePc({ box: { berry: -3, clover: 2.9, x: "y" }, fav: ["a", 4, "a"] })).toEqual({ box: { clover: 2 }, fav: ["a"] });
  });
});
