import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Play } from "../../../src/app/play";
import { addCreature } from "../../../src/core/game/collection";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { countOf, economy, give } from "../../../src/core/game/items";
import { monsterTable } from "../../../src/core/game/monsters";
import { WorldState } from "../../../src/core/world/worldState";
import { BagView, type BagBattle } from "../../../src/ui/BagView";
import { gameJson } from "../game/helpers";

afterEach(cleanup);

function setup(items: Record<string, number>, battle?: BagBattle) {
  const world = new WorldState();
  addCreature(world, "agnite", 4);
  const eco = economy(gameJson("economy.json"));
  for (const [id, n] of Object.entries(items)) give(world, eco, id, n);
  world.variables.set("nagmon_kit", "yes");
  const lines: string[] = [];
  const play = {
    world,
    economy: eco,
    monsters: monsterTable(gameJson("db/monsters.json")),
    field: new FieldLog({ info: (m) => lines.push(m) }),
    text: (id: string) => id,
    saveWorld: vi.fn(async () => {}),
  } as unknown as Play;
  const r = render(<BagView play={play} {...(battle ? { battle } : {})} onClose={() => {}} />);
  const q = (id: string) => r.container.querySelector<HTMLButtonElement>(`[data-id=${id}]`);
  const press = async (id: string) => act(async () => q(id)!.click());
  return { world, lines, q, press, text: () => r.container.textContent ?? "" };
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
    expect(m.q("bag_why")!.textContent).toContain("רגוע");
    await m.press("bag_tab_tools");
    expect(m.q("bag_use")!.disabled).toBe(true);
    expect(m.q("bag_why")!.textContent).toContain("שאלה");
  });

  it("in a battle only a net works, and only when the creature is calm", async () => {
    const onNet = vi.fn();
    const fighting = setup({ magic_net: 1, berry: 1 }, { calm: false, onNet });
    expect(fighting.q("bag_use")!.disabled).toBe(true);
    await fighting.press("bag_tab_snacks");
    expect(fighting.q("bag_use")!.disabled).toBe(true);
    cleanup();
    const calm = setup({ magic_net: 1 }, { calm: true, onNet });
    await calm.press("bag_use");
    expect(onNet).toHaveBeenCalledWith("magic_net");
    expect(countOf(calm.world, "magic_net")).toBe(1);
  });
});
