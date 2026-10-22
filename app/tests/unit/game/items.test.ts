import { describe, expect, it } from "vitest";
import { addCreature } from "../../../src/core/game/collection";
import { boostLeft, claimSpareNet, countOf, economy, feed, give, giveStarterKit, itemsInTab, spendBoost, take } from "../../../src/core/game/items";
import { WorldState } from "../../../src/core/world/worldState";
import { itemText } from "../../../src/i18n";
import { gameJson } from "./helpers";

const eco = economy(gameJson("economy.json"));

describe("the economy table", () => {
  it("is the shipped one: forty-six items the Bag loads (the Star Net and the eleven Friendship Cards joined in S3, the thirteen Evolution Cards in S4), three tabs, every item priced and in a tab", () => {
    expect(Object.keys(eco.items)).toHaveLength(46);
    expect(eco.tabs).toHaveLength(3);
    for (const i of Object.values(eco.items)) {
      expect(eco.tabs).toContain(i.tab);
      expect(i.price).toBeGreaterThanOrEqual(0);
    }
    expect(eco.items["magic_net"]!.price).toBe(30);
    expect(eco.items["silver_net"]!.sealLess).toBe(1);
  });

  it("every item has its own name and one line in Hebrew", () => {
    for (const id of eco.order) {
      for (const part of ["name", "desc"] as const) {
        expect(itemText(id, part), `${id} ${part}`).not.toBe(id);
        expect(itemText(id, part)).toMatch(/[֐-׿]/);
      }
    }
  });

  it("reads nothing readable as an empty shop, not a crash", () => {
    expect(Object.keys(economy(null).items)).toEqual([]);
    expect(Object.keys(economy({ items: [{ id: 3 }, "x"] }).items)).toEqual([]);
  });
});

describe("the Bag's counts", () => {
  it("give adds, take uses one, and nothing goes below zero or above the stack", () => {
    const w = new WorldState();
    expect(give(w, eco, "berry", 3)).toBe(3);
    expect(countOf(w, "berry")).toBe(3);
    expect(take(w, "berry")).toBe(true);
    expect(countOf(w, "berry")).toBe(2);
    expect(take(w, "berry", 5)).toBe(false);
    expect(countOf(w, "berry")).toBe(2);
    expect(give(w, eco, "berry", 500)).toBe(eco.stack - 2);
    expect(countOf(w, "berry")).toBe(eco.stack);
    expect(give(w, eco, "ghost", 1)).toBe(0);
  });

  it("a count of zero is not kept, and the Bag is saved and read back", () => {
    const w = new WorldState();
    give(w, eco, "clover", 1);
    take(w, "clover");
    expect(w.toDict().items).toBeUndefined();
    give(w, eco, "clover", 2);
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict())));
    expect(countOf(back, "clover")).toBe(2);
    expect(WorldState.fromDict({ items: { x: -3, y: "a", z: 2 } }).items.size).toBe(1);
  });

  it("each tab lists only what the child has, in the table's order", () => {
    const w = new WorldState();
    expect(itemsInTab(w, eco, "nets")).toEqual([]);
    give(w, eco, "silver_net", 1);
    give(w, eco, "magic_net", 2);
    expect(itemsInTab(w, eco, "nets").map((i) => i.id)).toEqual(["magic_net", "silver_net"]);
    expect(itemsInTab(w, eco, "snacks")).toEqual([]);
  });
});

describe("the first nets and the owl's spare net", () => {
  it("the starter kit comes once", () => {
    const w = new WorldState();
    expect(giveStarterKit(w, eco)).toBe(true);
    expect(countOf(w, "magic_net")).toBe(3);
    take(w, "magic_net", 3);
    expect(giveStarterKit(w, eco)).toBe(false);
    expect(countOf(w, "magic_net")).toBe(0);
  });

  it("with no net at all the owl gives one, once a day; with a net, nothing", () => {
    const w = new WorldState();
    expect(claimSpareNet(w, eco, "2026-10-20")?.id).toBe("magic_net");
    expect(countOf(w, "magic_net")).toBe(1);
    take(w, "magic_net");
    expect(claimSpareNet(w, eco, "2026-10-20")).toBeNull();
    expect(claimSpareNet(w, eco, "2026-10-21")?.id).toBe("magic_net");
    expect(claimSpareNet(w, eco, "2026-10-22")).toBeNull();
  });
});

describe("snacks and tonics outside a battle", () => {
  function friend() {
    const w = new WorldState();
    const c = addCreature(w, "heliobud", 4);
    return { w, c };
  }

  it("a snack gives hearts and growth, and is used up", () => {
    const { w, c } = friend();
    give(w, eco, "biscuit", 1);
    const r = feed(w, eco, c.id, "biscuit");
    expect(r.ok).toBe(true);
    expect(w.creatures[0]!.hearts).toBe(2);
    expect(w.creatures[0]!.xp).toBe(2);
    expect(countOf(w, "biscuit")).toBe(0);
  });

  it("hearts stop at five and never go down; the growth still counts", () => {
    const { w, c } = friend();
    give(w, eco, "pie", 4);
    for (let i = 0; i < 4; i++) feed(w, eco, c.id, "pie");
    expect(w.creatures[0]!.hearts).toBe(5);
    expect(w.creatures[0]!.level).toBeGreaterThan(4);
  });

  it("an item that is not in the Bag, or not a snack, is refused and nothing changes", () => {
    const { w, c } = friend();
    expect(feed(w, eco, c.id, "berry").ok).toBe(false);
    give(w, eco, "clover", 1);
    expect(feed(w, eco, c.id, "clover").ok).toBe(false);
    expect(feed(w, eco, "nobody", "clover").ok).toBe(false);
    expect(countOf(w, "clover")).toBe(1);
  });

  it("the growth tonic doubles the next five right answers, and is not wasted twice", () => {
    const { w, c } = friend();
    give(w, eco, "growth_tonic", 2);
    expect(feed(w, eco, c.id, "growth_tonic").ok).toBe(true);
    expect(boostLeft(w)).toBe(5);
    expect(feed(w, eco, c.id, "growth_tonic").ok).toBe(false);
    expect(countOf(w, "growth_tonic")).toBe(1);
    expect([1, 2, 3, 4, 5, 6].map(() => spendBoost(w))).toEqual([2, 2, 2, 2, 2, 1]);
    expect(boostLeft(w)).toBe(0);
  });
});
