import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Play } from "../../../src/app/play";
import type { BattleData } from "../../../src/core/data/battleTypes";
import { addCreature } from "../../../src/core/game/collection";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { countOf, economy, give } from "../../../src/core/game/items";
import { monsterTable } from "../../../src/core/game/monsters";
import { WorldState } from "../../../src/core/world/worldState";
import { BagView, type BagBattle } from "../../../src/ui/BagView";
import { Evolution } from "../../../src/ui/lazy";
import { battleData, gameJson } from "../game/helpers";

let bdata: BattleData;
beforeAll(async () => {
  bdata = await battleData();
  await Evolution.preload();
});
beforeEach(() => localStorage.setItem("nagmon.battle.timescale", "0.02"));
afterEach(() => {
  cleanup();
  localStorage.removeItem("nagmon.battle.timescale");
});

function setup(items: Record<string, number>, battle?: BagBattle, team: [string, number][] = [["heliobud", 4]]) {
  const world = new WorldState();
  for (const [sp, level] of team) addCreature(world, sp, level);
  const eco = economy(gameJson("economy.json"));
  for (const [id, n] of Object.entries(items)) give(world, eco, id, n);
  world.variables.set("nagmon_kit", "yes");
  const lines: string[] = [];
  const monsters = monsterTable(gameJson("db/monsters.json"));
  const subjectOf = (sp: string) => bdata.species[sp]?.subject ?? "math";
  const play = {
    world,
    economy: eco,
    monsters,
    battle: bdata,
    subjectOf,
    evolveCtx: () => ({ monsters, battle: bdata, rules: bdata.rules.evolution, stars: () => 0, lessons: [], zone: null, subjectOf }),
    evolveNow(this: Play, ...a: Parameters<Play["evolveNow"]>) {
      return Play.prototype.evolveNow.apply(this, a);
    },
    field: new FieldLog({ info: (m) => lines.push(m) }),
    text: (id: string) => id,
    subjects: { title: (s: string) => s },
    profile: { settings: {} },
    saveWorld: vi.fn(async () => {}),
  } as unknown as Play;
  const r = render(<BagView play={play} {...(battle ? { battle } : {})} onClose={() => {}} />);
  const q = (id: string) => r.container.querySelector<HTMLButtonElement>(`[data-id=${id}]`);
  const press = async (id: string) => act(async () => q(id)!.click());
  return { world, lines, q, press, text: () => r.container.textContent ?? "", container: r.container };
}

describe("the Bag", () => {
  it("has three tabs; each shows only what the child has, with counts", () => {
    const m = setup({ magic_net: 3, berry: 2 });
    expect(m.q("bag_tab_nets")).not.toBeNull();
    expect(m.q("bag_tab_snacks")).not.toBeNull();
    expect(m.q("bag_tab_tools")).not.toBeNull();
    expect(m.q("bag_item_magic_net")!.textContent).toContain("x3");
    expect(m.q("bag_item_berry")).toBeNull();
  });

  it("an empty tab shows a friendly shelf, not a blank", async () => {
    const m = setup({ magic_net: 1 });
    await m.press("bag_tab_tools");
    expect(m.q("bag_empty")).not.toBeNull();
    expect(m.q("bag_use")).toBeNull();
  });

  it("selecting an item shows its name and one line, and nothing is used by looking", async () => {
    const m = setup({ berry: 2, biscuit: 1 });
    await m.press("bag_tab_snacks");
    await m.press("bag_item_biscuit");
    expect(m.q("bag_name")!.textContent).toBe("עוגייה");
    expect(m.text()).toContain("שני לבבות");
    expect(countOf(m.world, "biscuit")).toBe(1);
  });

  it("outside a battle a snack goes to a friend we choose: hearts, a count less, saved and logged without names", async () => {
    const m = setup({ biscuit: 1 });
    await m.press("bag_tab_snacks");
    await m.press("bag_use");
    await m.press("bag_who_c1");
    expect(m.world.creatures[0]!.hearts).toBe(2);
    expect(countOf(m.world, "biscuit")).toBe(0);
    expect(m.q("bag_said")).not.toBeNull();
    expect(m.lines).toEqual(["ITEM use item=biscuit where=bag ok=1"]);
  });

  it("a net outside a battle, and a helper anywhere, cannot be used here, and say why", async () => {
    const m = setup({ magic_net: 1, clover: 1 });
    expect(m.q("bag_use")!.disabled).toBe(true);
    expect(m.q("bag_why")!.textContent).toContain("קרב");
    await m.press("bag_tab_tools");
    expect(m.q("bag_use")!.disabled).toBe(true);
    expect(m.q("bag_why")!.textContent).toContain("שאלה");
  });

  it("in a battle a net, a card or a treat goes to the Befriend tray (at any time); the rest cannot be used there", async () => {
    const onTool = vi.fn();
    const fighting = setup({ magic_net: 1, berry: 1, silver_net: 1 }, { canBefriend: true, onTool });
    await fighting.press("bag_use");
    expect(onTool).toHaveBeenCalledWith("magic_net");
    expect(countOf(fighting.world, "magic_net")).toBe(1);
    await fighting.press("bag_tab_snacks");
    expect(fighting.q("bag_use")!.disabled).toBe(false);
    await fighting.press("bag_use");
    expect(onTool).toHaveBeenLastCalledWith("berry");
    cleanup();
    // a master's test cannot be befriended: the Bag says so
    const master = setup({ magic_net: 1 }, { canBefriend: false, onTool });
    expect(master.q("bag_use")!.disabled).toBe(true);
    cleanup();
    const tonic = setup({ growth_tonic: 1 }, { canBefriend: true, onTool });
    await tonic.press("bag_tab_snacks");
    expect(tonic.q("bag_use")!.disabled).toBe(true);
  });
});

describe("medicine (only the Wake Berry and the Sunrise Berry wake a friend that fell asleep)", () => {
  it("outside a battle it wakes the friend you pick, and only sleeping friends are offered", async () => {
    const m = setup({ wake_berry: 2 });
    m.world.creatures.push({ id: "c2", species: "lunibble", level: 3, xp: 0, fainted: true });
    await m.press("bag_tab_snacks");
    await m.press("bag_item_wake_berry");
    expect(m.q("bag_why")).toBeNull();
    await m.press("bag_use");
    expect(m.q("bag_who_c1")).toBeNull();
    await m.press("bag_who_c2");
    expect(m.world.creatures[1]!.fainted).toBeUndefined();
    expect(countOf(m.world, "wake_berry")).toBe(1);
    expect(m.q("bag_said")!.textContent).toContain("התעורר");
    expect(m.lines).toEqual(["ITEM use item=wake_berry where=bag ok=1"]);
  });

  it("with nobody asleep it says so and cannot be used", async () => {
    const m = setup({ wake_berry: 1 });
    await m.press("bag_tab_snacks");
    expect(m.q("bag_use")!.disabled).toBe(true);
    expect(m.q("bag_why")!.textContent).toContain("אף חבר");
    expect(countOf(m.world, "wake_berry")).toBe(1);
  });

  it("a heal (Dew Drop) is for a battle: outside one it says so, and it does not wake anyone", async () => {
    const m = setup({ dew_drop: 1 });
    m.world.creatures[0]!.fainted = true;
    await m.press("bag_tab_snacks");
    expect(m.q("bag_use")!.disabled).toBe(true);
    expect(m.q("bag_why")!.textContent).toContain("בזמן קרב");
    expect(m.world.creatures[0]!.fainted).toBe(true);
  });

  it("in a battle the battle says who it can be used on, and takes it from there", async () => {
    const onMedicine = vi.fn(() => true);
    const m = setup({ wake_berry: 1 }, { canBefriend: true, onTool: () => {}, onMedicine, targets: () => ["c2"] });
    m.world.creatures.push({ id: "c2", species: "lunibble", level: 3, xp: 0, fainted: true });
    m.world.creatures.push({ id: "c9", species: "terrabub", level: 3, xp: 0, fainted: true });
    await m.press("bag_tab_snacks");
    await m.press("bag_use");
    // c9 is asleep in the Meadow: not a target of this fight
    expect(m.q("bag_who_c9")).toBeNull();
    await m.press("bag_who_c2");
    expect(onMedicine).toHaveBeenCalledWith("wake_berry", "c2");
    // the battle itself uses it up and wakes the friend; the view does not
    expect(countOf(m.world, "wake_berry")).toBe(1);
  });
});

describe("Evolution Cards in the Bag (BATTLE_V3 7.2)", () => {
  const TEAM: [string, number][] = [["heliobud", 9], ["lunibble", 9], ["heliolynx", 9]];

  it("are in the Tools tab with their count and one line; looking uses nothing", async () => {
    const m = setup({ zone_card_sun: 2 }, undefined, TEAM);
    await m.press("bag_tab_tools");
    await m.press("bag_item_zone_card_sun");
    expect(m.q("bag_name")!.textContent).toBe("כרטיס התפתחות השמש");
    expect(m.q("bag_item_zone_card_sun")!.textContent).toContain("x2");
    expect(countOf(m.world, "zone_card_sun")).toBe(2);
  });

  it("outside a battle 'use' asks who: only the friends the card works on are offered (a stage 0 of that zone, from level 9)", async () => {
    const m = setup({ zone_card_sun: 1 }, undefined, TEAM);
    await m.press("bag_tab_tools");
    expect(m.q("bag_use")!.disabled).toBe(false);
    await m.press("bag_use");
    expect([...m.container.querySelectorAll("[data-id^=bag_who_]")].map((e) => e.getAttribute("data-id"))).toEqual(["bag_who_c1"]);
  });

  it("the friend evolves at once (the species changes, the card is used up, saved, one log line of ids, no Shimmer), the scene plays, and the Bag is back after it", async () => {
    const m = setup({ zone_card_sun: 1, berry: 1 }, undefined, TEAM);
    await m.press("bag_tab_tools");
    await m.press("bag_use");
    await m.press("bag_who_c1");
    expect(m.world.creatures[0]!.species).toBe("heliolynx");
    expect(m.world.creatures[0]!.shimmer).toBeUndefined();
    expect(countOf(m.world, "zone_card_sun")).toBe(0);
    expect(m.lines.filter((l) => l.startsWith("EVOLVE "))).toEqual(["EVOLVE from=heliobud to=heliolynx how=card level=9"]);
    expect(m.container.querySelector("[data-screen=evolution]")).not.toBeNull();
    for (let i = 0; i < 100 && m.container.querySelector("[data-screen=evolution]"); i++) await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(m.container.querySelector("[data-screen=bag]")).not.toBeNull();
    expect(m.q("bag_item_zone_card_sun")).toBeNull();
  });

  it("with no friend it works on, it says so and cannot be used (nothing is used by trying)", async () => {
    const m = setup({ zone_card_sun: 1 }, undefined, [["heliobud", 8]]);
    await m.press("bag_tab_tools");
    expect(m.q("bag_use")!.disabled).toBe(true);
    expect(m.q("bag_why")!.textContent).toContain("אין עכשיו חבר");
    expect(countOf(m.world, "zone_card_sun")).toBe(1);
  });

  it("in a battle it cannot be used: evolution is never in the middle of a fight", async () => {
    const m = setup({ zone_card_sun: 1 }, { canBefriend: true, onTool: () => {} }, TEAM);
    await m.press("bag_tab_tools");
    expect(m.q("bag_use")!.disabled).toBe(true);
    expect(m.q("bag_why")!.textContent).toContain("מחוץ לקרב");
  });
});
