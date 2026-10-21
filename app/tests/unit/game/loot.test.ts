import { describe, expect, it } from "vitest";
import { countOf, economy } from "../../../src/core/game/items";
import { claimDailyGift, dayNumber, EGG_ITEM, grant, HINT_ITEM, loot, pickPrize } from "../../../src/core/game/loot";
import { WorldState } from "../../../src/core/world/worldState";
import { gameJson } from "./helpers";

const eco = economy(gameJson("economy.json"));
const table = loot(gameJson("loot.json"));

describe("the loot table", () => {
  it("reads the shipped table: a daily gift, and the chests with their prizes and a consolation", () => {
    expect(table.dailyGift.length).toBeGreaterThan(2);
    const chest = table.chests["home_daily"]!;
    expect(chest.repeat).toBe("daily");
    expect(chest.prizes.length).toBeGreaterThan(2);
    expect(chest.consolation.coins + chest.consolation.n).toBeGreaterThan(0);
  });

  it("every prize is coins or an item the economy has; a hint is the feather and an egg is the egg item", () => {
    const all = [...table.dailyGift, ...Object.values(table.chests).flatMap((c) => [...c.prizes, c.consolation])];
    for (const p of all) {
      if (p.item) expect(eco.items[p.item], p.item).toBeDefined();
      else expect(p.coins).toBeGreaterThan(0);
    }
    expect(eco.items[HINT_ITEM]).toBeDefined();
    expect(eco.items[EGG_ITEM]).toBeDefined();
  });

  it("reads a document of the four prize kinds, and leaves out what it cannot read", () => {
    const t = loot({
      daily_gift: [{ coins: 5 }, { item: "berry", n: 2 }, { hint: 1 }, { egg: 1 }, { coins: -3 }, { item: 4 }, "x", {}],
      chests: { a: { repeat: "once", prizes: [{ coins: 10 }], consolation: { coins: 1 } }, b: { repeat: "weekly", prizes: [{ coins: 1 }], consolation: { coins: 1 } }, c: { repeat: "daily", prizes: [], consolation: { coins: 1 } } },
    });
    expect(t.dailyGift).toEqual([
      { coins: 5, item: null, n: 0 },
      { coins: 0, item: "berry", n: 2 },
      { coins: 0, item: HINT_ITEM, n: 1 },
      { coins: 0, item: EGG_ITEM, n: 1 },
    ]);
    expect(Object.keys(t.chests)).toEqual(["a"]);
    expect(loot(null)).toEqual({ dailyGift: [], chests: {} });
  });
});

describe("giving a prize", () => {
  it("coins go to the wallet, an item to the Bag", () => {
    const w = new WorldState();
    expect(grant(w, eco, { coins: 30, item: null, n: 0 })).toEqual({ coins: 30, item: null, n: 0 });
    expect(w.money).toBe(30);
    grant(w, eco, { coins: 0, item: "berry", n: 2 });
    expect(countOf(w, "berry")).toBe(2);
  });

  it("an item whose stack is full is given as a few coins instead: nobody gets nothing", () => {
    const w = new WorldState();
    w.items.set("berry", 99);
    const got = grant(w, eco, { coins: 0, item: "berry", n: 1 });
    expect(got.item).toBeNull();
    expect(got.coins).toBeGreaterThan(0);
    expect(w.money).toBe(got.coins);
    expect(countOf(w, "berry")).toBe(99);
  });

  it("an unknown item is coins too", () => {
    const w = new WorldState();
    expect(grant(w, eco, { coins: 0, item: "ghost", n: 1 }).coins).toBeGreaterThan(0);
  });
});

describe("the day's number and the rotation", () => {
  it("counts days from the date, the same for the same day and one more for the next", () => {
    expect(dayNumber("2026-10-21")).toBe(dayNumber("2026-10-21"));
    expect(dayNumber("2026-10-22")).toBe(dayNumber("2026-10-21") + 1);
    expect(dayNumber("2026-03-01")).toBe(dayNumber("2026-02-28") + 1);
    expect(Number.isFinite(dayNumber("garbage"))).toBe(true);
  });

  it("walks a list round and round, by the number", () => {
    const list = [1, 2, 3].map((n) => ({ coins: n, item: null, n: 0 }));
    expect([0, 1, 2, 3, 4].map((i) => pickPrize(list, i).coins)).toEqual([1, 2, 3, 1, 2]);
    expect(pickPrize([], 3).coins).toBeGreaterThan(0);
  });
});

describe("the Rest Center's daily gift", () => {
  it("is one a day for each child: given once, then 'tomorrow'", () => {
    const w = new WorldState();
    const first = claimDailyGift(w, eco, table, "2026-10-21");
    expect(first.claimed).toBe(true);
    const second = claimDailyGift(w, eco, table, "2026-10-21");
    expect(second.claimed).toBe(false);
    // the next day it is there again, and the prize is the next of the list
    const next = claimDailyGift(w, eco, table, "2026-10-22");
    expect(next.claimed).toBe(true);
    expect(next.prize).not.toEqual(first.prize);
  });

  it("is only given once however many times the child asks; wallet and Bag change once", () => {
    const w = new WorldState();
    for (let i = 0; i < 5; i++) claimDailyGift(w, eco, table, "2026-10-21");
    const items = [...w.items.values()].reduce((a, b) => a + b, 0);
    expect(w.money + items).toBeGreaterThan(0);
    expect(w.money <= 25 && items <= 2).toBe(true);
  });

  it("nothing is taken for having had it, and a table with no gifts gives none", () => {
    const w = new WorldState();
    expect(claimDailyGift(w, eco, { dailyGift: [], chests: {} }, "2026-10-21").claimed).toBe(false);
    expect(w.money).toBe(0);
  });

  it("a gift made by another phone's day (the local date) is checked by the local date only", () => {
    const w = new WorldState();
    w.variables.set("nagmon_daily_rest_gift", "2026-10-20:1");
    expect(claimDailyGift(w, eco, table, "2026-10-21").claimed).toBe(true);
    w.variables.set("nagmon_daily_rest_gift", "2026-10-21:1");
    expect(claimDailyGift(w, eco, table, "2026-10-21").claimed).toBe(false);
  });
});
