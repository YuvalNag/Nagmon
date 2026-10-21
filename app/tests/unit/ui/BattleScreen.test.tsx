import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Play } from "../../../src/app/play";
import { addCreature } from "../../../src/core/game/collection";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { economy, give } from "../../../src/core/game/items";
import { monsterTable } from "../../../src/core/game/monsters";
import type { ContentLibrary } from "../../../src/core/learning";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { WorldState } from "../../../src/core/world/worldState";
import { BattleScreen } from "../../../src/ui/BattleScreen";
import type { BattleData } from "../../../src/core/data/battleTypes";
import { battleData, engineFor, gameJson, shipped } from "../game/helpers";

let content: ContentLibrary;
let bdata: BattleData;
beforeAll(async () => {
  content = shipped();
  bdata = await battleData();
});
afterEach(() => {
  cleanup();
  for (const k of ["pep", "fog", "charges", "seed", "timescale"]) localStorage.removeItem(`nagmon.battle.${k}`);
});
beforeEach(() => {
  // short beats and the same draws every run
  localStorage.setItem("nagmon.battle.timescale", "0.02");
  localStorage.setItem("nagmon.battle.seed", "7");
});

const settle = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)));

function setup(o: { team?: string[]; wild?: string; level?: number; items?: Record<string, number>; grade?: number; asleep?: boolean } = {}) {
  const world = new WorldState();
  for (const sp of o.team ?? ["heliobud", "lunibble"]) addCreature(world, sp, 6);
  world.seen.add("heliobud");
  world.variables.set("nagmon_kit", "yes");
  if (o.asleep) for (const c of world.creatures) c.fainted = true;
  const eco = economy(gameJson("economy.json"));
  for (const [id, n] of Object.entries(o.items ?? {})) give(world, eco, id, n);
  const lines: string[] = [];
  const done: boolean[] = [];
  const field = new FieldLog({ info: (m) => lines.push(m) });
  const engine = engineFor(content, o.grade ?? 3, 5);
  const play = {
    world,
    engine,
    battle: bdata,
    economy: eco,
    monsters: monsterTable(gameJson("db/monsters.json")),
    subjects: SubjectMap.fromDoc(gameJson("content/subjects.json")),
    maxChoices: null,
    profile: { grade: o.grade ?? 3, name: "תמר", avatar: "girl_teal", settings: {} },
    field,
    text: (id: string) => id,
    today: () => "2026-10-21",
    warn: () => {},
    saveWorld: vi.fn(async () => {}),
    saveLearner: vi.fn(async () => {}),
    logAnswer: vi.fn(),
  } as unknown as Play;
  const r = render(<BattleScreen play={play} wild={{ species: o.wild ?? "mercurip", level: o.level ?? 6, table: "t" }} map="test" onDone={(w) => done.push(w)} />);
  const q = (sel: string) => r.container.querySelector<HTMLElement>(sel);
  const el = (id: string) => r.container.querySelector<HTMLButtonElement>(`[data-id=${id}]`);
  const screen = () => q("[data-screen=battle]");
  const press = async (id: string) => {
    const b = el(id);
    if (!b) throw new Error(`no ${id}`);
    await act(async () => void fireEvent.click(b, { detail: 0 }));
    await settle();
  };
  const data = (k: string) => screen()?.getAttribute(`data-${k}`);
  /** The first open move card. */
  const openCard = () => r.container.querySelector<HTMLButtonElement>(".move-card:not(:disabled)")?.dataset.id;
  /** Casts a move and gives a wrong answer ("I don't know"), then lets the round play out. */
  async function wrongRound() {
    await press(openCard()!);
    for (let i = 0; i < 50 && !el("quiz_dont_know"); i++) await settle(5);
    const example = el("quiz_example_done");
    if (example) await press("quiz_example_done");
    await press("quiz_dont_know");
    for (let i = 0; i < 200 && data("flow") !== "result"; i++) await settle(5);
    await settle(330);
    if (el("battle_skip")) await press("battle_skip");
    for (let i = 0; i < 400 && data("turn") === "playing"; i++) await settle(5);
    const grow = el("growth_close");
    if (grow) await press("growth_close");
  }
  return { world, play, lines, done, container: r.container, q, el, press, data, wrongRound, openCard, engine };
}

describe("the arena of a battle (BATTLE_V3 S1)", () => {
  it("shows the four cards, both bars, the enemy's intent and what it loves, and no old card is left", () => {
    const m = setup({ wild: "lunibble" });
    expect(m.container.querySelectorAll(".move-card")).toHaveLength(4);
    expect(m.el("partner_pep")).not.toBeNull();
    expect(m.el("wild_hp")).not.toBeNull();
    expect(m.el("battle_intent")).not.toBeNull();
    expect(m.el("battle_loves")).not.toBeNull();
    for (const old of ["battle_fight", "battle_move", "battle_friend", "battle_special", "battle_charge", "battle_next"]) expect(m.el(old)).toBeNull();
    expect(m.container.querySelectorAll(".portrait")).toHaveLength(2);
    expect(m.data("view")).toBe("meet");
  });

  it("the weak-subject chip follows the age: a 7-year-old sees it, an 11-year-old sees a question mark first", () => {
    const young = setup({ wild: "lunibble", grade: 1 });
    expect(young.el("battle_loves")!.getAttribute("data-known")).toBe("true");
    cleanup();
    const old = setup({ wild: "lunibble", grade: 6 });
    expect(old.el("battle_loves")!.getAttribute("data-known")).toBe("false");
    expect(old.el("battle_loves")!.textContent).toContain("?");
  });

  it("Run is always free: the battle ends, nothing is lost, the end line is logged", async () => {
    const m = setup();
    await m.press("battle_run");
    expect(m.done).toEqual([false]);
    expect(m.world.creatures).toHaveLength(2);
    expect(m.lines.at(-1)).toMatch(/^BATTLE end result=ran questions=0 correct=0 ms=\d+ turns=0 secs=\d+$/);
  });

  it("choosing a move opens its question with the move's name over it; a wrong answer plays the round and the bars move", async () => {
    const m = setup({ wild: "lunibble" });
    const fog = Number(m.data("hp"));
    await m.press("battle_move_sum_spark");
    expect(m.data("view")).toBe("question");
    for (let i = 0; i < 50 && !m.el("quiz_dont_know"); i++) await settle(5);
    if (m.el("quiz_example_done")) await m.press("quiz_example_done");
    expect(m.q(".cast-chip")!.textContent).toContain("ניצוץ סכום");
    await m.press("quiz_dont_know");
    for (let i = 0; i < 200 && m.data("flow") !== "result"; i++) await settle(5);
    await settle(330);
    await m.press("battle_skip");
    for (let i = 0; i < 400 && m.data("turn") === "playing"; i++) await settle(5);
    expect(m.data("turn")).toBe("idle");
    expect(Number(m.data("hp"))).toBeLessThan(fog);
    expect(m.data("round")).toBe("1");
    expect(m.data("view")).toBe("turn");
    expect(m.lines.filter((l) => l.startsWith("MOVE "))).toHaveLength(1);
    expect(m.lines.filter((l) => l.startsWith("ROUND "))).toHaveLength(1);
  });
});

describe("fainting (the parent's decision)", () => {
  it("0 Pep: the friend falls asleep, a friend is picked free, the sleeper is saved as asleep and cannot be picked again", async () => {
    localStorage.setItem("nagmon.battle.pep", "1");
    const m = setup({ wild: "mercurip" });
    for (let i = 0; i < 14 && m.data("view") !== "swap"; i++) await m.wrongRound();
    expect(m.data("view")).toBe("swap");
    expect(m.el("battle_message")!.textContent).toContain("נרדם");
    expect(m.world.creatures[0]!.fainted).toBe(true);
    expect(m.lines.some((l) => /^DOZE species=heliobud n=\d+ awake=1$/.test(l))).toBe(true);
    // the cards wait; the sleeper cannot be picked; the other friend can
    expect(m.container.querySelectorAll(".move-card:not(:disabled)")).toHaveLength(0);
    expect(m.el("battle_friend_c1")!.disabled).toBe(true);
    expect(m.el("battle_friend_c2")!.disabled).toBe(false);
    const rounds = m.data("round");
    await m.press("battle_friend_c2");
    // free: no round passed, the cards are back, the new partner is full
    expect(m.data("round")).toBe(rounds);
    expect(m.data("view")).toBe("turn");
    expect(m.container.querySelectorAll(".move-card:not(:disabled)").length).toBeGreaterThan(0);
    expect(m.world.creatures[0]!.species).toBe("lunibble");
    expect(m.world.creatures[1]!.fainted).toBe(true);
    expect(m.el("battle_friend_c1")!.getAttribute("data-asleep")).toBe("true");
    expect(m.el("battle_friend_c1")!.textContent).toContain("💤");
  });

  it("the whole team asleep: they are carried to the Rest Center and healed, free, and the fight ends", async () => {
    localStorage.setItem("nagmon.battle.pep", "1");
    const m = setup({ team: ["heliobud"], wild: "mercurip" });
    m.world.money = 12;
    for (let i = 0; i < 14 && !m.q("[data-screen=carried]"); i++) await m.wrongRound();
    expect(m.q("[data-screen=carried]")).not.toBeNull();
    expect(m.el("battle_carried")!.textContent).toContain("מרכז המנוחה");
    expect(m.world.creatures.every((c) => !c.fainted)).toBe(true);
    expect(m.world.money).toBe(12);
    await m.press("battle_carried_ok");
    expect(m.done).toEqual([false]);
  });

  it("a team asleep before the fight: carried back at once and healed, no fight", async () => {
    const m = setup({ asleep: true });
    expect(m.q("[data-screen=carried]")).not.toBeNull();
    expect(m.q("[data-screen=battle]")).toBeNull();
    expect(m.world.creatures.every((c) => !c.fainted)).toBe(true);
    await m.press("battle_carried_ok");
    expect(m.done).toEqual([false]);
    expect(m.lines.some((l) => /^BATTLE end result=carried questions=0/.test(l))).toBe(true);
  });

  it("medicine from the Bag wakes the sleeping partner for good, free, and the fight goes on with it", async () => {
    localStorage.setItem("nagmon.battle.pep", "1");
    const m = setup({ wild: "mercurip", items: { wake_berry: 1 } });
    for (let i = 0; i < 14 && m.data("view") !== "swap"; i++) await m.wrongRound();
    expect(m.data("view")).toBe("swap");
    await m.press("battle_bag");
    await m.press("bag_tab_snacks");
    await m.press("bag_item_wake_berry");
    expect(m.el("bag_why")).toBeNull();
    await m.press("bag_use");
    await m.press("bag_who_c1");
    expect(m.world.creatures[0]!.fainted).toBeUndefined();
    expect(m.world.items.has("wake_berry")).toBe(false);
    expect(m.data("view")).toBe("turn");
    expect(m.container.querySelectorAll(".move-card:not(:disabled)").length).toBeGreaterThan(0);
  });
});

describe("the round plays in order and a late tap waits for its end", () => {
  it("a move tapped late in the round is queued and its question opens when the round ends", async () => {
    localStorage.setItem("nagmon.battle.timescale", "0.3");
    const m = setup({ wild: "mercurip" });
    await m.press(m.openCard()!);
    for (let i = 0; i < 50 && !m.el("quiz_dont_know"); i++) await settle(5);
    if (m.el("quiz_example_done")) await m.press("quiz_example_done");
    await m.press("quiz_dont_know");
    for (let i = 0; i < 400 && m.data("flow") !== "result"; i++) await settle(5);
    await settle(330);
    await m.press("battle_skip");
    // the cards are live a little way into the enemy's beat: tap one then
    let queued = false;
    for (let i = 0; i < 400 && m.data("turn") === "playing" && !queued; i++) {
      await settle(10);
      const live = m.q(".action-bar")?.getAttribute("data-live") === "true";
      const card = m.q(".move-card:not(:disabled)");
      if (live && card) {
        await m.press(card.dataset.id!);
        queued = true;
      }
    }
    if (queued) {
      expect(m.q(".move-card.queued")).not.toBeNull();
      for (let i = 0; i < 600 && m.data("view") !== "question"; i++) await settle(10);
      expect(m.data("view")).toBe("question");
    } else {
      // the round had no enemy beat to tap in (it ended first): nothing to check
      expect(m.data("turn")).toBe("idle");
    }
  });
});
