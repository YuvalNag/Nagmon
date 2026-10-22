import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Play } from "../../../src/app/play";
import type { BattleData } from "../../../src/core/data/battleTypes";
import { addCreature } from "../../../src/core/game/collection";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { economy } from "../../../src/core/game/items";
import { monsterTable } from "../../../src/core/game/monsters";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { WorldState } from "../../../src/core/world/worldState";
import { FriendsView } from "../../../src/ui/FriendsView";
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

const monsters = monsterTable(gameJson("db/monsters.json"));
const subjects = SubjectMap.fromDoc(gameJson("content/subjects.json"));

interface Setup {
  /** What the partner has: Know-how, hearts, stars, the lesson. */
  c1?: { level?: number; knowHow?: number; hearts?: number; keepSmall?: boolean; shimmer?: boolean };
  stars?: number;
  lesson?: boolean;
  team?: string[];
}

function setup(o: Setup = {}) {
  const world = new WorldState();
  for (const sp of o.team ?? ["heliobud", "lunibble"]) addCreature(world, sp, 12);
  Object.assign(world.creatures[0]!, { level: 12, knowHow: 0, hearts: 0, ...o.c1 });
  if (o.lesson) world.lessons.done.push("solar_system");
  const lines: string[] = [];
  const subjectOf = (sp: string) => bdata.species[sp]?.subject ?? "math";
  const play = {
    world,
    monsters,
    subjects,
    battle: bdata,
    economy: economy(gameJson("economy.json")),
    subjectOf,
    evolveCtx: () => ({ monsters, battle: bdata, rules: bdata.rules.evolution, stars: () => o.stars ?? 0, lessons: world.lessons.done, zone: null, subjectOf }),
    evolveNow(this: Play, ...a: Parameters<Play["evolveNow"]>) {
      return Play.prototype.evolveNow.apply(this, a);
    },
    field: new FieldLog({ info: (m) => lines.push(m) }),
    text: (id: string) => id,
    profile: { settings: {} },
    saveWorld: vi.fn(async () => {}),
  } as unknown as Play;
  const r = render(<FriendsView play={play} onClose={() => {}} />);
  const q = (id: string) => r.container.querySelector<HTMLElement>(`[data-id=${id}]`);
  const press = async (id: string) => act(async () => q(id)!.click());
  const rows = () => [...r.container.querySelectorAll<HTMLElement>("[data-gate]")].map((e) => [e.dataset["gate"], e.dataset["met"], e.textContent]);
  return { world, play, lines, q, press, rows, container: r.container };
}

describe("the checklist of the evolution gates (7.1)", () => {
  it("shows each gate as a tick or a ring with 'have of need', and in which subject to practise", () => {
    const m = setup({ c1: { knowHow: 31, hearts: 2 }, stars: 1 });
    expect(m.rows()).toEqual([
      ["level", "true", expect.stringContaining("רמה 12 מתוך 12")],
      ["know_how", "false", expect.stringContaining("31 מתוך 40")],
      ["stars", "false", expect.stringContaining("1 מתוך 2")],
      ["hearts", "true", expect.stringContaining("2 מתוך 2")],
      ["lesson", "false", expect.stringContaining("שיעור")],
    ]);
    // the subject is named where practising helps (Math is heliobud's)
    expect(m.q("friend_gates")!.textContent).toContain("חשבון");
    // not ready: no Evolve button, and no gold ring
    expect(m.q("friend_evolve")).toBeNull();
    expect(m.container.querySelector("[data-ready=true]")).toBeNull();
  });

  it("with every gate met the card gets a gold ring and the Evolve button shows; a friend with no next form says so", () => {
    const m = setup({ c1: { knowHow: 40, hearts: 2 }, stars: 2, lesson: true });
    expect(m.q("friend_evolve")).not.toBeNull();
    expect(m.container.querySelector("[data-id=friend_c1][data-ready=true]")).not.toBeNull();
    expect(m.container.querySelector("[data-id=friend_c2][data-ready=true]")).toBeNull();
    cleanup();
    const top = setup({ team: ["heliarch"] });
    expect(top.q("friend_gates")!.textContent).toContain("אין לו צורה גדולה יותר");
    expect(top.q("friend_evolve")).toBeNull();
  });

  it("Evolve changes the species, gives the Shimmer, plays the scene and comes back to the screen (the card's picture is the new one)", async () => {
    const m = setup({ c1: { knowHow: 40, hearts: 2 }, stars: 2, lesson: true });
    await m.press("friend_evolve");
    expect(m.world.creatures[0]!.species).toBe("heliolynx");
    expect(m.world.creatures[0]!.shimmer).toBe(true);
    expect(m.lines.filter((l) => l.startsWith("EVOLVE "))).toEqual(["EVOLVE from=heliobud to=heliolynx how=learning level=12"]);
    expect(m.container.querySelector("[data-screen=evolution]")).not.toBeNull();
    for (let i = 0; i < 100 && m.container.querySelector("[data-screen=evolution]"); i++) await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(m.container.querySelector("[data-screen=friends]")).not.toBeNull();
    expect(m.q("friend_shimmer")).not.toBeNull();
    expect(m.q("friend_evolve")).toBeNull();
  });

  it("'Keep small' is a ribbon on the friend: it stops the prompt, shows as pressed and comes off again; the checklist still says ready", async () => {
    const m = setup({ c1: { knowHow: 40, hearts: 2 }, stars: 2, lesson: true });
    expect(m.q("friend_keep_small")!.getAttribute("aria-pressed")).toBe("false");
    await m.press("friend_keep_small");
    expect(m.world.creatures[0]!.keepSmall).toBe(true);
    expect(m.q("friend_keep_small")!.getAttribute("aria-pressed")).toBe("true");
    expect(m.q("friend_keep_small")!.textContent).toContain("קטן וחמוד");
    expect(m.q("friend_evolve")).not.toBeNull();
    expect(m.play.saveWorld).toHaveBeenCalled();
    await m.press("friend_keep_small");
    expect(m.world.creatures[0]!.keepSmall).toBeUndefined();
  });

  it("a friend that evolved by learning shines in its subject's colour (the Shimmer); one that did not, does not", () => {
    const m = setup({ c1: { shimmer: true } });
    expect(m.container.querySelector("[data-id=friend_c1][data-shimmer=true]")).not.toBeNull();
    expect(m.container.querySelector("[data-id=friend_c2][data-shimmer=true]")).toBeNull();
    expect(m.q("friend_shimmer")!.textContent).toContain("זוהר");
  });
});
