import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Play } from "../../../src/app/play";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { countOf, economy } from "../../../src/core/game/items";
import { WorldState } from "../../../src/core/world/worldState";
import { ShopScreen } from "../../../src/ui/ShopScreen";
import { gameJson } from "../game/helpers";

afterEach(cleanup);

function setup(o: { grade?: number; money?: number; mastered?: string[]; settings?: Record<string, unknown>; vars?: Record<string, string>; items?: Record<string, number> } = {}) {
  const world = new WorldState();
  world.money = o.money ?? 100;
  for (const [k, v] of Object.entries(o.vars ?? {})) world.variables.set(k, v);
  for (const [k, v] of Object.entries(o.items ?? {})) world.items.set(k, v);
  const lines: string[] = [];
  const play = {
    world,
    economy: economy(gameJson("economy.json")),
    profile: { grade: o.grade ?? 3, name: "נועה", settings: o.settings ?? {} },
    engine: { learner: { mastered: new Map((o.mastered ?? []).map((s) => [s, 1])) } },
    field: new FieldLog({ info: (m) => lines.push(m) }),
    text: (id: string) => id,
    saveWorld: vi.fn(async () => {}),
  } as unknown as Play;
  const changed = vi.fn();
  const r = render(<ShopScreen play={play} stepMs={0} onClose={() => {}} onChanged={changed} />);
  const q = (id: string) => r.container.querySelector<HTMLElement>(`[data-id=${id}]`);
  const press = async (id: string) => {
    const el = q(id);
    if (!el) throw new Error(`no ${id}`);
    await act(async () => (el as HTMLButtonElement).click());
  };
  const pressAll = async (ids: string[]) => {
    for (const id of ids) await press(id);
  };
  return { world, lines, q, press, pressAll, changed, text: () => r.container.textContent ?? "" };
}

describe("the shop", () => {
  it("has three shelves; each shows its items with the table's prices and at most six", async () => {
    const m = setup();
    expect(["nets", "snacks", "helpers"].map((s) => m.q(`shop_shelf_${s}`) !== null)).toEqual([true, true, true]);
    expect(m.q("shop_item_magic_net")!.textContent).toContain("30");
    expect(m.q("shop_item_silver_net")!.textContent).toContain("90");
    expect(m.q("shop_item_berry")).toBeNull();
    await m.press("shop_shelf_snacks");
    expect(m.q("shop_item_berry")!.textContent).toContain("10");
    expect(m.q("shop_item_growth_tonic")).not.toBeNull();
    await m.press("shop_shelf_helpers");
    expect(m.q("shop_item_clover")!.textContent).toContain("20");
    expect(m.q("shop_grid")!.querySelectorAll("button").length).toBeLessThanOrEqual(6);
  });

  it("looking buys nothing; the chosen item shows its name and price", async () => {
    const m = setup();
    await m.press("shop_item_silver_net");
    expect(m.q("shop_name")!.textContent).toBe("רשת כסף");
    expect(m.q("shop_price")!.dataset["price"]).toBe("90");
    expect(m.world.money).toBe(100);
    expect(m.world.items.size).toBe(0);
  });

  it("shows how many the child has, in the card", async () => {
    const m = setup({ items: { magic_net: 3 } });
    expect(m.q("shop_item_magic_net")!.textContent).toContain("x3");
  });
});

describe("the pay step, B (grades 2-4): exact change from coins and bills", () => {
  it("pays the exact price with the bills the child chose, gets a tenth back, and the Bag has the item", async () => {
    const m = setup({ grade: 3, money: 100 });
    await m.press("shop_buy");
    expect(m.q("pay")!.dataset["band"]).toBe("B");
    await m.pressAll(["pay_coin_20", "pay_coin_10", "pay_go"]);
    expect(m.q("shop_bought")).not.toBeNull();
    expect(m.world.money).toBe(73);
    expect(countOf(m.world, "magic_net")).toBe(1);
    expect(m.q("shop_back")!.dataset["back"]).toBe("3");
    expect(m.lines).toContain("BUY what=magic_net price=27 coins_left=73");
    expect(m.changed).toHaveBeenCalled();
  });

  it("an amount that is a bit short says 'a bit more', takes nothing, and the child tries again", async () => {
    const m = setup({ grade: 3, money: 100 });
    await m.press("shop_buy");
    await m.pressAll(["pay_coin_20", "pay_go"]);
    expect(m.q("pay")!.dataset["say"]).toBe("more");
    expect(m.text()).toContain("עוד קצת");
    expect(m.world.money).toBe(100);
    await m.pressAll(["pay_coin_10", "pay_go"]);
    expect(m.q("shop_bought")).not.toBeNull();
    // right after a wrong try: still exact and unhelped, so still the tenth back
    expect(m.world.money).toBe(73);
  });

  it("an amount that is too much says 'a bit less' and takes nothing", async () => {
    const m = setup({ grade: 3, money: 100 });
    await m.press("shop_buy");
    await m.pressAll(["pay_coin_50", "pay_go"]);
    expect(m.q("pay")!.dataset["say"]).toBe("less");
    expect(m.text()).toContain("קצת פחות");
    expect(m.world.money).toBe(100);
    expect(m.world.items.size).toBe(0);
    await m.pressAll(["pay_pile_0", "pay_coin_20", "pay_coin_10", "pay_go"]);
    expect(m.world.money).toBe(73);
  });

  it("after two wrong tries the shopkeeper counts with the child; the price is the list price, never more", async () => {
    const m = setup({ grade: 3, money: 100 });
    await m.press("shop_buy");
    await m.pressAll(["pay_coin_1", "pay_go"]);
    await m.pressAll(["pay_coin_1", "pay_go"]);
    expect(m.q("pay")!.dataset["say"]).toBe("helped");
    expect(m.q("pay_tray")!.querySelectorAll("button").length).toBeGreaterThan(0);
    await m.press("pay_go");
    expect(m.q("shop_bought")).not.toBeNull();
    expect(m.world.money).toBe(70);
    expect(m.q("shop_back")).toBeNull();
    expect(m.lines.find((l) => l.startsWith("PAY "))).toContain("helped=1");
  });

  it("back from the pay step takes nothing", async () => {
    const m = setup({ grade: 3, money: 100 });
    await m.press("shop_buy");
    await m.pressAll(["pay_coin_20", "pay_cancel"]);
    expect(m.q("shop_grid")).not.toBeNull();
    expect(m.world.money).toBe(100);
    expect(m.world.items.size).toBe(0);
  });

  it("a coin in the tray comes out when tapped, and 'clear' empties it", async () => {
    const m = setup({ grade: 3 });
    await m.press("shop_buy");
    await m.pressAll(["pay_coin_20", "pay_coin_5"]);
    expect(m.q("pay_tray")!.querySelectorAll("button").length).toBe(2);
    await m.press("pay_pile_0");
    expect(m.q("pay_tray")!.querySelectorAll("button").length).toBe(1);
    await m.press("pay_clear");
    expect(m.q("pay_tray")!.querySelectorAll("button").length).toBe(0);
  });
});

describe("the pay step, A (gan and grade 1): counting up to ten", () => {
  it("offers stacks of 1 and 5, shows the price as that many stacks, and pays the price exactly", async () => {
    const m = setup({ grade: 0, money: 100 });
    await m.press("shop_shelf_helpers");
    await m.press("shop_item_hint_feather");
    await m.press("shop_buy");
    const pay = m.q("pay")!;
    expect(pay.dataset["band"]).toBe("A");
    // 15 coins: three stacks of 5
    expect(m.q("pay_target")!.querySelectorAll("svg").length).toBe(3);
    expect(m.q("pay_coin_1")).not.toBeNull();
    expect(m.q("pay_coin_5")).not.toBeNull();
    expect(m.q("pay_coin_10")).toBeNull();
    await m.pressAll(["pay_coin_1", "pay_coin_1", "pay_go"]);
    expect(m.q("pay")!.dataset["say"]).toBe("more");
    await m.pressAll(["pay_coin_1", "pay_go"]);
    expect(m.q("shop_bought")).not.toBeNull();
    // exact on the second go, with nobody's help: 15 less a tenth (1) is 14
    expect(m.world.money).toBe(86);
    expect(countOf(m.world, "hint_feather")).toBe(1);
  });
});

describe("the pay step, C (grade 5 and up): the day's 10% off", () => {
  it("shows the tag and the unit price, and the price to pay is the tagged one", async () => {
    const m = setup({ grade: 6, money: 100 });
    await m.press("shop_buy");
    expect(m.q("pay_tag")!.textContent).toContain("10%");
    expect(m.q("pay_tag")!.textContent).toContain("30");
    await m.pressAll(["pay_coin_20", "pay_coin_5", "pay_coin_2", "pay_go"]);
    expect(m.q("shop_bought")).not.toBeNull();
    expect(m.world.money).toBe(73);
    expect(m.lines).toContain("BUY what=magic_net price=27 coins_left=73");
  });
});

describe("a child with too few coins", () => {
  it("cannot press Buy, is told what is missing, and loses nothing", async () => {
    const m = setup({ grade: 3, money: 20 });
    const buy = m.q("shop_buy") as HTMLButtonElement;
    expect(buy.disabled).toBe(true);
    expect(m.q("shop_why")!.textContent).toContain("10");
    expect(m.world.money).toBe(20);
  });
});

describe("the quick buy", () => {
  it("does not show before the money skill is mastered", () => {
    expect(setup().q("shop_quick")).toBeNull();
  });

  it("shows when the band's money skill is mastered, buys at once, no pay step, the list price", async () => {
    const m = setup({ grade: 3, mastered: ["math.money.change_20"] });
    await m.press("shop_quick");
    expect(m.q("shop_bought")).not.toBeNull();
    expect(m.world.money).toBe(70);
    expect(m.lines.find((l) => l.startsWith("PAY "))).toContain("quick=1");
  });

  it("shows after five exact first tries in a row", () => {
    expect(setup({ vars: { nagmon_pay_run: "5" } }).q("shop_quick")).not.toBeNull();
  });

  it("is gone when the parents turned it off", () => {
    expect(setup({ grade: 3, mastered: ["math.money.change_20"], settings: { shop: { quick_buy: false } } }).q("shop_quick")).toBeNull();
  });
});

describe("what the log keeps", () => {
  it("ids and numbers only, no names", async () => {
    const m = setup({ grade: 3 });
    await m.pressAll(["shop_buy", "pay_coin_20", "pay_coin_10", "pay_go"]);
    for (const l of m.lines) expect(l).not.toMatch(/נועה/);
    expect(m.lines.some((l) => l.startsWith("BUY "))).toBe(true);
  });
});
