import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Play } from "../../../src/app/play";
import { addCreature } from "../../../src/core/game/collection";
import { economy } from "../../../src/core/game/items";
import { monsterTable } from "../../../src/core/game/monsters";
import { WorldState } from "../../../src/core/world/worldState";
import { FriendsView } from "../../../src/ui/FriendsView";
import { ChestWrongCard, FactCard, FoundCard } from "../../../src/ui/WorldCards";
import { EggRing } from "../../../src/ui/WorldArt";
import { gameJson } from "../game/helpers";

afterEach(cleanup);
const eco = economy(gameJson("economy.json"));

const view = (r: ReturnType<typeof render>) => {
  const q = (id: string) => r.container.querySelector<HTMLElement>(`[data-id=${id}]`);
  const press = async (id: string) => act(async () => q(id)!.click());
  return { q, press, text: () => r.container.textContent ?? "" };
};

describe("the found card", () => {
  it("says what a chest gave: coins", async () => {
    const onClose = vi.fn();
    const v = view(render(<FoundCard found={{ how: "chest", prize: { coins: 30, item: null, n: 0 } }} economy={eco} onClose={onClose} />));
    expect(v.text()).toContain("פתחת את הארגז");
    expect(v.text()).toContain("30 מטבעות");
    await v.press("found_ok");
    expect(onClose).toHaveBeenCalled();
  });

  it("an item with its count, the egg with its picture, the consolation as a small gift", () => {
    const berry = view(render(<FoundCard found={{ how: "chest", prize: { coins: 0, item: "berry", n: 2 } }} economy={eco} onClose={() => {}} />));
    expect(berry.text()).toContain("תות, כמות: 2");
    cleanup();
    const egg = render(<FoundCard found={{ how: "chest", prize: { coins: 0, item: "mystery_egg", n: 1 } }} economy={eco} onClose={() => {}} />);
    expect(egg.container.querySelector(".egg-art")).not.toBeNull();
    cleanup();
    const small = view(render(<FoundCard found={{ how: "consolation", prize: { coins: 5, item: null, n: 0 } }} economy={eco} onClose={() => {}} />));
    expect(small.text()).toContain("מתנה קטנה");
  });

  it("an item given on the spot shows no chest", () => {
    const r = render(<FoundCard found={{ how: "item", prize: { coins: 0, item: "clover", n: 1 } }} economy={eco} onClose={() => {}} />);
    expect(r.container.querySelector(".chest-art")).toBeNull();
    expect(r.container.textContent).toContain("קיבלת: תלתן");
  });
});

describe("the wrong-answer card at a chest", () => {
  it("is kind, and offers 'try again' and 'a small gift'", async () => {
    const chosen: string[] = [];
    const v = view(render(<ChestWrongCard onChoose={(c) => chosen.push(c)} />));
    expect(v.text()).toContain("לא נורא");
    await v.press("chest_again");
    await v.press("chest_gift");
    expect(chosen).toEqual(["again", "gift"]);
  });
});

describe("a sign's fact", () => {
  it("shows a picture of the emoji set and the one line", async () => {
    const onClose = vi.fn();
    const r = render(<FactCard fact={{ emoji: "1f989", text: "ינשוף רואה בלילה." }} onClose={onClose} />);
    const v = view(r);
    expect(v.q("fact_pic")!.getAttribute("src")).toBe("game/emoji/1f989.svg");
    expect(v.text()).toContain("ינשוף רואה בלילה.");
    await v.press("fact_ok");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("the egg's progress ring", () => {
  it("fills as right answers warm the egg", () => {
    const share = (got: number, need: number) => {
      const r = render(<EggRing got={got} need={need} />);
      const el = r.container.querySelector("[data-share]")!.getAttribute("data-share");
      cleanup();
      return el;
    };
    expect([share(0, 10), share(5, 10), share(10, 10), share(15, 10)]).toEqual(["0.00", "0.50", "1.00", "1.00"]);
  });

  it("is on the Friends screen, one ring for each egg, with its words", () => {
    const world = new WorldState();
    addCreature(world, "heliobud", 4);
    world.eggs.push({ id: "e1", table: "nagmon_route1", got: 3, need: 10 }, { id: "e2", table: "nagmon_route1", got: 7, need: 10 });
    const play = {
      world,
      monsters: monsterTable(gameJson("db/monsters.json")),
      subjects: { title: (s: string) => s, subjectFor: () => "math" },
      field: { note: () => {} },
      // a build without battle data: no evolution to ask about
      evolveCtx: () => null,
      text: (id: string) => id,
      saveWorld: vi.fn(async () => {}),
    } as unknown as Play;
    const r = render(<FriendsView play={play} onClose={() => {}} />);
    const rings = r.container.querySelectorAll("[data-id=friends_eggs] [role=progressbar]");
    expect([...rings].map((x) => x.getAttribute("aria-valuenow"))).toEqual(["3", "7"]);
    expect(r.container.textContent).toContain("ביצה: 3 מתוך 10 תשובות נכונות");
  });

  it("is not there when there is no egg", () => {
    const world = new WorldState();
    addCreature(world, "heliobud", 4);
    const play = { world, monsters: monsterTable(gameJson("db/monsters.json")), subjects: { title: (s: string) => s, subjectFor: () => "math" }, field: { note: () => {} }, evolveCtx: () => null, text: (id: string) => id, saveWorld: vi.fn(async () => {}) } as unknown as Play;
    const r = render(<FriendsView play={play} onClose={() => {}} />);
    expect(r.container.querySelector("[data-id=friends_eggs]")).toBeNull();
  });
});
