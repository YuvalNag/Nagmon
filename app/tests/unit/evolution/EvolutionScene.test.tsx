import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Play } from "../../../src/app/play";
import type { BattleData } from "../../../src/core/data/battleTypes";
import { creatureStats, speciesBattle } from "../../../src/core/game/battleSpecies";
import { addCreature } from "../../../src/core/game/collection";
import { FieldLog } from "../../../src/core/game/fieldLog";
import { monsterTable } from "../../../src/core/game/monsters";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { WorldState } from "../../../src/core/world/worldState";
import { EvolutionScene } from "../../../src/ui/evolution/EvolutionScene";
import { battleData, gameJson } from "../game/helpers";

let data: BattleData;
beforeAll(async () => {
  data = await battleData();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => vi.useFakeTimers());

const monsters = monsterTable(gameJson("db/monsters.json"));

function setup(o: { how?: "learning" | "card"; settings?: Record<string, unknown>; level?: number } = {}) {
  const world = new WorldState();
  const c = addCreature(world, "heliolynx", o.level ?? 12); // already evolved: the scene only shows it
  c.name = "דובי";
  const lines: string[] = [];
  const play = {
    world,
    battle: data,
    monsters,
    subjects: SubjectMap.fromDoc(gameJson("content/subjects.json")),
    profile: { grade: 3, settings: o.settings ?? {} },
    field: new FieldLog({ info: (m) => lines.push(m) }),
    text: (id: string) => id,
    subjectOf: (sp: string) => data.species[sp]?.subject ?? "math",
  } as unknown as Play;
  let done = 0;
  const r = render(<EvolutionScene play={play} creatureId={c.id} from="heliobud" to="heliolynx" how={o.how ?? "card"} onDone={() => void done++} />);
  const q = (id: string) => r.container.querySelector<HTMLElement>(`[data-id=${id}]`);
  const beat = () => r.container.querySelector("[data-screen=evolution]")!.getAttribute("data-beat");
  const mode = () => r.container.querySelector("[data-screen=evolution]")!.getAttribute("data-mode");
  /** Plays the sequence for `ms` at the clock's pace. */
  const run = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
  return { play, world, c, lines, r, q, beat, mode, run, done: () => done };
}

describe("the evolution scene (7.4): ten beats, then the name card, then the child is back", () => {
  it("starts at B0 in the long version and walks the beats in order, ending after 10.6 s (the tests' clock)", async () => {
    const m = setup();
    expect(m.mode()).toBe("long");
    expect(m.beat()).toBe("B0");
    const seen = [m.beat()];
    for (let i = 0; i < 106; i++) {
      await m.run(100);
      if (seen.at(-1) !== m.beat()) seen.push(m.beat());
    }
    expect(seen).toEqual(["B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9"]);
    expect(m.done()).toBe(1);
  });

  it("the name card says who grew into whom, and the numbers are the new creature's (Pep, Power, Guard, Speed)", async () => {
    const m = setup({ level: 12 });
    await m.run(7700);
    expect(m.beat()).toBe("B7");
    await m.run(1100);
    const card = m.q("evolve_card")!;
    expect(card.textContent).toContain("heliobud");
    expect(card.textContent).toContain("heliolynx");
    const after = creatureStats(speciesBattle(data, "heliolynx"), 12);
    const before = creatureStats(speciesBattle(data, "heliobud"), 12);
    expect(after.pep).toBeGreaterThan(before.pep);
    for (const k of ["pep", "power", "guard", "speed"] as const) expect(m.q(`evolve_stat_${k}`)!.getAttribute("data-value")).toBe(String(after[k]));
  });

  it("by learning it shows the Shimmer line; by a card it does not", async () => {
    const a = setup({ how: "learning" });
    await a.run(8200);
    expect(a.q("evolve_shimmer")).not.toBeNull();
    cleanup();
    const b = setup({ how: "card" });
    await b.run(8200);
    expect(b.q("evolve_shimmer")).toBeNull();
  });

  it("a tap before 1.4 s is ignored; after it the rest is fast (the name card still shows) and the scene ends well before 10.6 s", async () => {
    const m = setup();
    await m.run(900);
    await act(async () => m.q("evolve_skip")!.click());
    await m.run(100);
    expect(m.beat()).toBe("B1");
    await m.run(700); // 1.7 s in
    await act(async () => m.q("evolve_skip")!.click());
    const seen = new Set<string | null>();
    let at = 1700;
    while (!m.done() && at < 11000) {
      await m.run(100);
      at += 100;
      seen.add(m.beat());
    }
    expect(seen.has("B6") && seen.has("B7")).toBe(true);
    expect(at).toBeLessThan(7500);
    expect(m.done()).toBe(1);
  });

  it("'continue' ends it at once from the name card, once", async () => {
    const m = setup();
    await m.run(7800);
    await act(async () => m.q("evolve_done")!.click());
    expect(m.done()).toBe(1);
    await m.run(5000);
    expect(m.done()).toBe(1);
  });

  it("the parent's short version is about 6 s and drops the celebration", async () => {
    const m = setup({ settings: { effects: { evolution: "short" } } });
    expect(m.mode()).toBe("short");
    const seen = new Set<string | null>();
    for (let i = 0; i < 62; i++) {
      await m.run(100);
      seen.add(m.beat());
    }
    expect(m.done()).toBe(1);
    expect(seen.has("B8")).toBe(false);
  });

  it("calm effects (the parent's switch) play one crossfade, show no lights and still show the name card", async () => {
    const m = setup({ settings: { effects: { motion: "less" } } });
    expect(m.mode()).toBe("calm");
    expect(m.r.container.querySelectorAll(".evo-light").length).toBe(0);
    await m.run(2100);
    expect(m.beat()).toBe("B7");
    expect(m.q("evolve_card")).not.toBeNull();
    expect(m.r.container.querySelectorAll(".evo-light").length).toBe(0);
    await m.run(3000);
    expect(m.done()).toBe(1);
  });

  it("the species was changed before the scene (the caller), so leaving it early or never watching loses nothing", async () => {
    const m = setup();
    expect(m.world.creatures[0]!.species).toBe("heliolynx");
    cleanup();
    expect(m.world.creatures[0]!.species).toBe("heliolynx");
  });

  it("is a dialog with the growth as its name (for a screen reader) and a live card", async () => {
    const m = setup();
    const dlg = m.r.container.querySelector("[role=dialog]")!;
    expect(dlg.getAttribute("aria-label")).toContain("heliolynx");
    expect(m.q("evolve_card")!.getAttribute("aria-live")).toBe("polite");
  });

  it("is ids and numbers in the log, never a name", async () => {
    const m = setup();
    await m.run(200);
    expect(m.lines.join("\n")).not.toContain("דובי");
  });
});
