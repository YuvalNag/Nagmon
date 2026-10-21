import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Play } from "../../../src/app/play";
import { addCreature } from "../../../src/core/game/collection";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { countOf, economy } from "../../../src/core/game/items";
import { loot } from "../../../src/core/game/loot";
import { monsterTable } from "../../../src/core/game/monsters";
import { WorldState } from "../../../src/core/world/worldState";
import { RestScreen } from "../../../src/ui/RestScreen";
import { gameJson } from "../game/helpers";

afterEach(cleanup);

function setup(o: { friends?: number; today?: string; vars?: Record<string, string> } = {}) {
  const world = new WorldState();
  const species = ["heliobud", "lunibble", "terrabub", "rustip", "ringlet", "meteet"];
  for (let i = 0; i < (o.friends ?? 6); i++) addCreature(world, species[i % species.length]!, 3 + i);
  if (world.creatures[1]) world.creatures[1].hearts = 3;
  for (const [k, v] of Object.entries(o.vars ?? {})) world.variables.set(k, v);
  const lines: string[] = [];
  const play = {
    world,
    economy: economy(gameJson("economy.json")),
    loot: loot(gameJson("loot.json")),
    monsters: monsterTable(gameJson("db/monsters.json")),
    subjects: { title: (s: string) => s, subjectFor: () => "math" },
    profile: { grade: 2, name: "נועה", settings: {} },
    field: new FieldLog({ info: (m) => lines.push(m) }),
    text: (id: string) => id,
    today: () => today.v,
    saveWorld: vi.fn(async () => {}),
  } as unknown as Play;
  const today = { v: o.today ?? "2026-10-21" };
  const changed = vi.fn();
  const r = render(<RestScreen play={play} onClose={() => {}} onChanged={changed} />);
  const q = (id: string) => r.container.querySelector<HTMLElement>(`[data-id=${id}]`);
  const press = async (id: string) => {
    const el = q(id);
    if (!el) throw new Error(`no ${id}`);
    await act(async () => (el as HTMLButtonElement).click());
  };
  return { world, play, lines, q, press, changed, today, container: r.container, text: () => r.container.textContent ?? "" };
}

const ids = (w: WorldState) => w.creatures.map((c) => c.id).join();

describe("the Rest Center", () => {
  it("shows the party of four resting and cheerful, with their hearts, and the friends of the Meadow", () => {
    const m = setup();
    for (const id of ["c1", "c2", "c3", "c4"]) {
      expect(m.q(`rest_friend_${id}`)).not.toBeNull();
      expect(m.q(`rest_friend_${id}`)!.dataset["mood"]).toBe("cheerful");
    }
    expect(m.q("rest_friend_c5")).toBeNull();
    expect(m.q("rest_meadow_c5")).not.toBeNull();
    expect(m.q("rest_meadow_c6")).not.toBeNull();
    expect(m.q("rest_friend_c2")!.textContent).toContain("❤️❤️❤️🤍🤍");
  });

  it("has no sickness: no hit points, no healing button, nothing to cure", () => {
    const m = setup();
    expect(m.text()).not.toMatch(/HP|חולה|ריפוי|תרופה/);
  });

  it("with no friends yet it says so kindly, and the gift is still there", () => {
    const m = setup({ friends: 0 });
    expect(m.q("rest_none")).not.toBeNull();
    expect(m.q("rest_gift")).not.toBeNull();
  });

  it("tapping a friend makes a heart pop, and changes nothing in the save", async () => {
    const m = setup();
    await m.press("rest_friend_c1");
    expect(m.container.querySelector(".heart-pop")).not.toBeNull();
    expect(m.play.saveWorld).not.toHaveBeenCalled();
    expect(m.world.creatures[0]!.hearts ?? 0).toBe(0);
  });
});

describe("swapping the party and the Meadow", () => {
  it("one of the party and one of the Meadow swap places; saved, logged, nobody lost", async () => {
    const m = setup();
    await m.press("rest_friend_c2");
    expect(m.q("rest_friend_c2")!.getAttribute("aria-pressed")).toBe("true");
    await m.press("rest_meadow_c5");
    expect(ids(m.world)).toBe("c1,c5,c3,c4,c2,c6");
    expect(m.play.saveWorld).toHaveBeenCalled();
    expect(m.changed).toHaveBeenCalled();
    expect(m.q("rest_friend_c5")).not.toBeNull();
    expect(m.q("rest_meadow_c2")).not.toBeNull();
    expect(m.q("rest_said")).not.toBeNull();
    expect(m.lines.some((l) => l.startsWith("REST swap"))).toBe(true);
  });

  it("works from the Meadow side first", async () => {
    const m = setup();
    await m.press("rest_meadow_c6");
    await m.press("rest_friend_c3");
    expect(ids(m.world)).toBe("c1,c2,c6,c4,c5,c3");
  });

  it("two of the same group only change the choice", async () => {
    const m = setup();
    await m.press("rest_friend_c2");
    await m.press("rest_friend_c3");
    expect(ids(m.world)).toBe("c1,c2,c3,c4,c5,c6");
    expect(m.q("rest_friend_c3")!.getAttribute("aria-pressed")).toBe("true");
    expect(m.q("rest_friend_c2")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("a friend of the party can become the partner (the first)", async () => {
    const m = setup();
    expect((m.q("rest_partner") as HTMLButtonElement).disabled).toBe(true);
    await m.press("rest_friend_c3");
    await m.press("rest_partner");
    expect(m.world.creatures[0]!.id).toBe("c3");
    expect(m.lines.some((l) => l.startsWith("PARTNER"))).toBe(true);
  });
});

describe("the daily gift", () => {
  it("is given once: coins or an item in the Bag, saved and logged with ids and numbers only", async () => {
    const m = setup();
    const before = m.world.money;
    await m.press("rest_gift");
    expect(m.q("rest_gift_card")).not.toBeNull();
    const items = [...m.world.items.values()].reduce((a, b) => a + b, 0);
    expect(m.world.money - before + items).toBeGreaterThan(0);
    expect(m.play.saveWorld).toHaveBeenCalled();
    const line = m.lines.find((l) => l.startsWith("GIFT"))!;
    expect(line).toMatch(/where=rest/);
    expect(line).not.toMatch(/נועה/);
    await m.press("rest_gift_ok");
    expect((m.q("rest_gift") as HTMLButtonElement).disabled).toBe(true);
    expect(m.text()).toContain("מחר תהיה עוד אחת");
  });

  it("a child who had it today finds it taken, and nothing more is given", async () => {
    const m = setup({ vars: { nagmon_daily_rest_gift: "2026-10-21:1" } });
    expect((m.q("rest_gift") as HTMLButtonElement).disabled).toBe(true);
    expect(m.world.money).toBe(0);
  });

  it("is there again on the next local day", async () => {
    const m = setup({ vars: { nagmon_daily_rest_gift: "2026-10-20:1" } });
    expect((m.q("rest_gift") as HTMLButtonElement).disabled).toBe(false);
    await m.press("rest_gift");
    expect(m.world.money + countOf(m.world, "berry") + countOf(m.world, "biscuit") + countOf(m.world, "hint_feather")).toBeGreaterThan(0);
  });
});
