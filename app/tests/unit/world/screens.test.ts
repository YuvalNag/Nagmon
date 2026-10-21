import { describe, expect, it } from "vitest";
import { ACTIONS, EventRunner, type EventHost } from "../../../src/core/world/events";
import type { WorldEvent } from "../../../src/core/world/mapData";
import { WorldState } from "../../../src/core/world/worldState";

const ev = (id: number, actions: [string, ...string[]][], talk?: string): WorldEvent => ({
  id,
  name: `e${id}`,
  actions: actions.map(([type, ...args]) => ({ type, args })),
  // a create event runs once: it holds only while its person is not there
  conditions: actions[0]![0] === "create_npc" ? [{ operator: "not", type: "char_exists", args: [actions[0]![1]!] }] : [],
  behaviors: talk ? [{ type: "talk", args: [talk] }] : [],
});

function host(extra: Partial<EventHost> = {}) {
  const log: string[] = [];
  const h: EventHost = {
    say: async (id) => void log.push(`say ${id}`),
    quiz: async () => {},
    changed: () => void log.push("saved"),
    warn: (m) => void log.push(`warn ${m}`),
    screen: async (kind, arg) => void log.push(`screen ${kind} ${arg}`),
    ...extra,
  };
  return { h, log };
}

describe("open_shop and open_rest", () => {
  it("are actions of the interpreter", () => {
    expect(ACTIONS.has("open_shop")).toBe(true);
    expect(ACTIONS.has("open_rest")).toBe(true);
  });

  it("a talk says the greeting, then opens the shop screen and waits until it is closed", async () => {
    const { h, log } = host({
      screen: async (kind, arg) => {
        log.push(`open ${kind} ${arg}`);
        await new Promise((r) => setTimeout(r, 5));
        log.push("closed");
      },
    });
    const events = [ev(1, [["create_npc", "keeper", "2", "5"]]), ev(2, [["translated_dialog", "hello"], ["open_shop", "hearthrock"], ["translated_dialog", "bye"]], "keeper")];
    const runner = new EventRunner(events, new WorldState(), h, { grade: 2, today: () => "2026-10-20" });
    await runner.start();
    expect(runner.talkable("keeper")).toBe(true);
    await runner.talk("keeper");
    expect(log).toEqual(["say hello", "open shop hearthrock", "closed", "say bye"]);
  });

  it("open_rest opens the Rest Center screen", async () => {
    const { h, log } = host();
    const runner = new EventRunner([ev(1, [["create_npc", "nurse", "1", "1"]]), ev(2, [["open_rest"]], "nurse")], new WorldState(), h, { grade: 2, today: () => "2026-10-20" });
    await runner.start();
    await runner.talk("nurse");
    expect(log).toContain("screen rest ");
  });

  it("a host with no such screen stops the event and says so, the game goes on", async () => {
    const { h, log } = host();
    delete h.screen;
    const runner = new EventRunner([ev(1, [["create_npc", "keeper", "1", "1"]]), ev(2, [["open_shop"], ["set_variable", "after:1"]], "keeper")], new WorldState(), h, { grade: 2, today: () => "2026-10-20" });
    await runner.start();
    await runner.talk("keeper");
    expect(log.join()).toMatch(/stopped at open_shop/);
  });

  it("saves the world before the screen opens (a kill in the shop loses nothing)", async () => {
    const { h, log } = host();
    const state = new WorldState();
    const runner = new EventRunner([ev(1, [["create_npc", "keeper", "1", "1"]]), ev(2, [["set_variable", "met:1"], ["open_shop"]], "keeper")], state, h, { grade: 2, today: () => "2026-10-20" });
    await runner.start();
    await runner.talk("keeper");
    expect(log.indexOf("saved")).toBeLessThan(log.indexOf("screen shop "));
  });
});
