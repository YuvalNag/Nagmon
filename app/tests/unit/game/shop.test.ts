import { describe, expect, it } from "vitest";
import { economy, countOf } from "../../../src/core/game/items";
import {
  affordable,
  bandOf,
  buy,
  countSteps,
  discountOf,
  moneyMastered,
  Payment,
  payPlan,
  recordPay,
  SHELVES,
  shelfItems,
  type Band,
} from "../../../src/core/game/shop";
import { WorldState } from "../../../src/core/world/worldState";
import { gameJson } from "./helpers";

const eco = economy(gameJson("economy.json"));

describe("the shelves", () => {
  it("are four, and each item is on one: nets, snacks, tonics and the medicine for a friend who fell asleep, helpers", () => {
    expect(SHELVES).toEqual(["nets", "snacks", "helpers", "medicine"]);
    const ids = (s: (typeof SHELVES)[number]) => shelfItems(eco, s).map((i) => i.id);
    expect(ids("nets")).toEqual(["magic_net", "silver_net"]);
    expect(ids("snacks")).toEqual(["berry", "biscuit", "pie", "growth_tonic", "fresh_mint", "energy_berry"]);
    expect(ids("helpers")).toEqual(["hint_feather", "clover", "owl_pass"]);
    // the medicine shelf: heals, and the two berries that wake a friend who fell asleep (the parent: waking is medicine or the nurse)
    expect(ids("medicine")).toEqual(["dew_drop", "spring_tonic", "sunny_syrup", "wake_berry", "sunrise_berry"]);
  });

  it("sell nothing that is free (the key items are found, not bought) and show at most six", () => {
    const all = SHELVES.flatMap((s) => shelfItems(eco, s));
    expect(all.every((i) => i.price > 0)).toBe(true);
    for (const s of SHELVES) expect(shelfItems(eco, s).length).toBeLessThanOrEqual(6);
  });

  it("prices come from the economy table", () => {
    expect(eco.items["magic_net"]!.price).toBe(30);
    expect(shelfItems(eco, "nets")[0]!.price).toBe(30);
  });
});

describe("the age bands", () => {
  it("A is grades 0 and 1, B 2 to 4, C from 5", () => {
    expect([0, 1, 2, 4, 5, 9].map(bandOf)).toEqual(["A", "A", "B", "B", "C", "C"]);
  });
});

describe("the pay plan", () => {
  it("A counts up to ten with stacks of 1 and 5; a stack is worth more when the price is big", () => {
    const p = payPlan(10, "A");
    expect([p.unit, p.target]).toEqual([1, 10]);
    expect(p.denominations).toEqual([1, 5]);
    expect([payPlan(15, "A").unit, payPlan(15, "A").target]).toEqual([5, 3]);
    expect([payPlan(25, "A").unit, payPlan(25, "A").target]).toEqual([5, 5]);
    expect([payPlan(90, "A").unit, payPlan(90, "A").target]).toEqual([10, 9]);
    for (const s of SHELVES) for (const i of shelfItems(eco, s)) {
      const q = payPlan(i.price, "A");
      expect(q.target).toBeLessThanOrEqual(10);
      expect(q.target * q.unit).toBe(i.price);
    }
  });

  it("B makes the exact price from coins and bills", () => {
    const p = payPlan(30, "B");
    expect(p.unit).toBe(1);
    expect(p.target).toBe(30);
    expect(p.denominations).toEqual([1, 2, 5, 10, 20, 50]);
    expect(p.tag).toBeNull();
  });

  it("C pays the day's 10% off, with the old price and the tag shown", () => {
    const p = payPlan(30, "C");
    expect(p.target).toBe(27);
    expect(p.tag).toEqual({ percent: 10, was: 30, now: 27 });
    expect(payPlan(15, "C").target).toBe(14);
  });

  it("the discount is a tenth, rounded down, so the price is never more than listed", () => {
    expect([10, 15, 25, 30, 60, 90].map(discountOf)).toEqual([1, 1, 2, 3, 6, 9]);
  });
});

describe("a payment", () => {
  const A = payPlan(15, "A");
  const B = payPlan(30, "B");

  it("adds coins and takes one away", () => {
    const p = new Payment(B);
    p.add(10);
    p.add(20);
    expect(p.sum).toBe(30);
    p.removeAt(0);
    expect(p.pile).toEqual([20]);
    p.clear();
    expect(p.pile).toEqual([]);
  });

  it("refuses a coin the plan does not have", () => {
    const p = new Payment(A);
    expect(p.add(2)).toBe(false);
    expect(p.pile).toEqual([]);
  });

  it("judges: exact, a bit more (short), a bit less (over)", () => {
    const p = new Payment(B);
    p.add(20);
    expect(p.check()).toEqual({ kind: "short", sum: 20 });
    p.add(10);
    p.add(5);
    expect(p.check()).toEqual({ kind: "over", sum: 35 });
    p.removeAt(2);
    expect(p.check()).toEqual({ kind: "exact", sum: 30 });
  });

  it("counts the tries that were wrong; the right one is not a try", () => {
    const p = new Payment(B);
    p.add(5);
    p.check();
    expect(p.wrong).toBe(1);
    expect(p.helpDue).toBe(false);
    p.check();
    expect(p.wrong).toBe(2);
    expect(p.helpDue).toBe(true);
  });

  it("after two tries the shopkeeper counts with the child: the right pile, no discount", () => {
    const p = new Payment(B);
    p.add(1);
    p.check();
    p.check();
    p.help();
    expect(p.sum).toBe(30);
    expect(p.helped).toBe(true);
    expect(p.check().kind).toBe("exact");
    expect(p.firstTry).toBe(false);
  });

  it("the help makes any price with the plan's own coins, largest first", () => {
    for (const band of ["A", "B", "C"] as Band[]) {
      for (const id of eco.order) {
        const i = eco.items[id]!;
        if (i.price === 0) continue;
        const p = new Payment(payPlan(i.price, band));
        p.help();
        expect(p.sum).toBe(p.plan.target);
        expect(p.pile.every((v) => p.plan.denominations.includes(v))).toBe(true);
      }
    }
  });

  it("an exact pile on the first go is a first try", () => {
    const p = new Payment(B);
    p.add(20);
    p.add(10);
    expect(p.check().kind).toBe("exact");
    expect(p.firstTry).toBe(true);
    expect(p.helped).toBe(false);
  });
});

describe("counting aloud", () => {
  it("is the running total of the pile, one coin at a time, in the plan's units", () => {
    expect(countSteps([20, 5, 1])).toEqual([20, 25, 26]);
    expect(countSteps([5, 1, 1])).toEqual([5, 6, 7]);
    expect(countSteps([])).toEqual([]);
  });
});

describe("buying", () => {
  const world = (money: number) => {
    const w = new WorldState();
    w.money = money;
    return w;
  };
  const berry = eco.items["berry"]!;
  const net = eco.items["magic_net"]!;

  it("an exact pile in A or B, unhelped, gives the tenth back; the net costs 27", () => {
    const w = world(100);
    const r = buy(w, eco, net.id, { band: "B", exact: true, helped: false, quick: false });
    expect(r).toMatchObject({ ok: true, charged: 27, back: 3 });
    expect(w.money).toBe(73);
    expect(countOf(w, "magic_net")).toBe(1);
  });

  it("a counted-with-the-shopkeeper payment, or a quick buy, pays the list price (never extra)", () => {
    const w = world(100);
    expect(buy(w, eco, net.id, { band: "B", exact: true, helped: true, quick: false })).toMatchObject({ ok: true, charged: 30, back: 0 });
    expect(buy(w, eco, net.id, { band: "A", exact: true, helped: false, quick: true })).toMatchObject({ charged: 30 });
    expect(w.money).toBe(40);
  });

  it("C pays the tag price, with or without help", () => {
    const w = world(100);
    expect(buy(w, eco, net.id, { band: "C", exact: true, helped: true, quick: false }).charged).toBe(27);
    expect(buy(w, eco, net.id, { band: "C", exact: true, helped: false, quick: true }).charged).toBe(27);
  });

  it("never charges more than the price, whatever the band or the way", () => {
    for (const band of ["A", "B", "C"] as Band[])
      for (const exact of [true, false])
        for (const helped of [true, false])
          for (const quick of [true, false]) {
            const w = world(1000);
            const r = buy(w, eco, net.id, { band, exact, helped, quick });
            expect(r.ok).toBe(true);
            expect(r.charged).toBeLessThanOrEqual(net.price);
            expect(1000 - w.money).toBe(r.charged);
          }
  });

  it("a child without the coins buys nothing and loses nothing", () => {
    const w = world(10);
    expect(affordable(w, net, "B")).toBe(false);
    const r = buy(w, eco, net.id, { band: "B", exact: true, helped: false, quick: false });
    expect(r).toMatchObject({ ok: false, reason: "coins" });
    expect(w.money).toBe(10);
    expect(countOf(w, "magic_net")).toBe(0);
    expect(affordable(world(30), net, "B")).toBe(true);
    expect(affordable(world(27), net, "C")).toBe(true);
  });

  it("a full stack buys nothing and charges nothing", () => {
    const w = world(500);
    w.items.set("berry", 99);
    const r = buy(w, eco, berry.id, { band: "B", exact: true, helped: false, quick: false });
    expect(r).toMatchObject({ ok: false, reason: "full" });
    expect(w.money).toBe(500);
  });

  it("an item that is not for sale is refused", () => {
    const w = world(500);
    expect(buy(w, eco, "badge_case", { band: "B", exact: true, helped: false, quick: false })).toMatchObject({ ok: false, reason: "unknown" });
    expect(buy(w, eco, "nothing", { band: "B", exact: true, helped: false, quick: false })).toMatchObject({ ok: false, reason: "unknown" });
  });
});

describe("the money skill and the quick buy", () => {
  it("is mastered when the engine says so for the band's skill", () => {
    const w = new WorldState();
    expect(moneyMastered(new Map(), "A", w.variables)).toBe(false);
    expect(moneyMastered(new Map([["math.money.coins", 1]]), "A", w.variables)).toBe(true);
    expect(moneyMastered(new Map([["math.money.coins", 1]]), "B", w.variables)).toBe(false);
    expect(moneyMastered(new Map([["math.money.change_20", 1]]), "B", w.variables)).toBe(true);
    expect(moneyMastered(new Map([["math.money.change", 1]]), "C", w.variables)).toBe(true);
  });

  it("or by five exact payments in a row, first try; a helped one starts the run again", () => {
    const w = new WorldState();
    for (let i = 0; i < 4; i++) recordPay(w.variables, true);
    expect(moneyMastered(new Map(), "B", w.variables)).toBe(false);
    recordPay(w.variables, true);
    expect(moneyMastered(new Map(), "B", w.variables)).toBe(true);
    recordPay(w.variables, false);
    expect(moneyMastered(new Map(), "B", w.variables)).toBe(false);
  });
});
