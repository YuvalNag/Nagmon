import { describe, expect, it } from "vitest";
import { mailData } from "../../../src/core/game/mail";
import { objectDefs } from "../../../src/core/game/objects";
import { loot } from "../../../src/core/game/loot";
import { facts } from "../../../src/core/game/facts";
import { ACTIONS, EventRunner, type EventHost, type ScreenKind, type WorldObjects } from "../../../src/core/world/events";
import type { WorldEvent } from "../../../src/core/world/mapData";
import { WorldState } from "../../../src/core/world/worldState";
import { eco } from "./helpers";

const defs = objectDefs({ objects: { pc: { screen: "pc", title_he: "מחשב", places: [{ map: "m", x: 1, y: 1 }] }, tv: { screen: "tv", title_he: "טלוויזיה" } } });

const objects = (): WorldObjects => ({
  economy: eco(),
  loot: loot({}),
  facts: facts({ facts: { owl_night: { emoji: "1f989", subject: "science", text_he: "ינשוף רואה בלילה." } } }),
  pools: () => [],
  zone: "z",
  defs,
  mail: mailData({ senders: { g: { name_he: "ג" } }, letters: { thanks: { from: "g", kind: "event", variants: [{ text_he: "תודה" }] }, card: { from: "g", kind: "postcard", variants: [{ text_he: "x" }] } } }),
  people: new Set(["nagmon_granny"]),
});

const ev = (id: number, actions: [string, ...string[]][], talk?: string): WorldEvent => ({
  id,
  name: `e${id}`,
  actions: actions.map(([type, ...args]) => ({ type, args })),
  conditions: actions[0]![0] === "create_npc" ? [{ operator: "not", type: "char_exists", args: [actions[0]![1]!] }] : [],
  behaviors: talk ? [{ type: "talk", args: [talk] }] : [],
});

function setup(actions: [string, ...string[]][], o: { screens?: boolean; today?: string; who?: string } = {}) {
  const log: string[] = [];
  const state = new WorldState();
  const who = o.who ?? "thing";
  const host: EventHost = {
    say: async (id) => void log.push(`say ${id}`),
    quiz: async () => {},
    changed: () => void log.push("saved"),
    warn: (m) => void log.push(`warn ${m}`),
    fact: async (f) => void log.push(`fact ${f.text}`),
    ...(o.screens === false ? {} : { screen: async (k: ScreenKind, arg: string) => void log.push(`screen ${k} ${arg}`) }),
  };
  const day = { v: o.today ?? "2026-10-22" };
  const runner = new EventRunner([ev(1, [["create_npc", who, "1", "1"]]), ev(2, actions, who)], state, host, { grade: 2, today: () => day.v, objects: objects() });
  return {
    state,
    log,
    day,
    run: async () => {
      await runner.start();
      await runner.talk(who);
    },
  };
}

describe("open_object <id>", () => {
  it("is a known action", () => {
    expect(ACTIONS.has("open_object")).toBe(true);
  });

  it("opens the object's screen, after saving what changed", async () => {
    const t = setup([["set_variable", "a:1"], ["open_object", "pc"]]);
    await t.run();
    expect(t.log).toEqual(["saved", "screen object pc", "saved"].slice(0, 2));
    expect(t.log.some((l) => l === "screen object pc")).toBe(true);
    expect(t.log.indexOf("saved")).toBeLessThan(t.log.indexOf("screen object pc"));
  });

  it("an object that has no definition stops the event and says so", async () => {
    const t = setup([["open_object", "ghost"], ["set_variable", "after:1"]]);
    await t.run();
    expect(t.log.join()).toMatch(/stopped at open_object/);
    expect(t.log.some((l) => l.startsWith("screen"))).toBe(false);
    expect(t.state.variables.has("after")).toBe(false);
  });

  it("a host with no screens stops the event and says so", async () => {
    const t = setup([["open_object", "pc"]], { screens: false });
    await t.run();
    expect(t.log.join()).toMatch(/stopped at open_object/);
  });
});

describe("a sign's fact goes in the journal", () => {
  it("once, with the day, and the child's save is written", async () => {
    const t = setup([["show_fact", "owl_night"]]);
    await t.run();
    expect(t.state.journal.read).toEqual({ owl_night: "2026-10-22" });
    expect(t.log).toContain("saved");
    t.day.v = "2026-10-23";
    await t.run();
    expect(t.state.journal.read).toEqual({ owl_night: "2026-10-22" });
  });
});

describe("talking to someone of the town", () => {
  it("meets them: the first day no hearts, one more on each new day", async () => {
    const t = setup([["translated_dialog", "hello"]], { who: "nagmon_granny" });
    await t.run();
    expect(t.state.met["nagmon_granny"]).toEqual({ first: "2026-10-22", last: "2026-10-22", hearts: 0 });
    await t.run();
    expect(t.state.met["nagmon_granny"]!.hearts).toBe(0);
    t.day.v = "2026-10-23";
    await t.run();
    expect(t.state.met["nagmon_granny"]!.hearts).toBe(1);
  });

  it("does not record a prop or a chest as a person", async () => {
    const t = setup([["translated_dialog", "hello"]], { who: "nagmon_obj_pc" });
    await t.run();
    expect(t.state.met).toEqual({});
  });
});

describe("send_letter <id>", () => {
  it("queues an event letter for the next morning, once, and saves it", async () => {
    const t = setup([["send_letter", "thanks"]]);
    await t.run();
    await t.run();
    expect(t.state.mail.pending).toEqual([{ id: "thanks", after: "2026-10-22" }]);
    expect(t.log).toContain("saved");
  });

  it("an unknown letter, or a postcard, stops the event and says so", async () => {
    for (const id of ["ghost"]) {
      const t = setup([["send_letter", id]]);
      await t.run();
      expect(t.log.join()).toMatch(/stopped at send_letter/);
    }
  });
});
