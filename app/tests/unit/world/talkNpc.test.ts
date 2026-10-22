import { describe, expect, it } from "vitest";
import type { Chip, Spoken } from "../../../src/core/world/director";
import { conditionHolds, EventRunner, type EventHost, type People, unknownActions } from "../../../src/core/world/events";
import type { WorldEvent } from "../../../src/core/world/mapData";
import { WorldState } from "../../../src/core/world/worldState";

let id = 0;
const ev = (name: string, actions: [string, ...string[]][], conditions: [string, string, ...string[]][] = [], talk?: string): WorldEvent => ({
  id: ++id,
  name,
  conditions: conditions.map(([operator, type, ...args]) => ({ operator: operator as "is" | "not", type, args })),
  actions: actions.map(([type, ...args]) => ({ type, args })),
  behaviors: talk ? [{ type: "talk", args: [talk] }] : [],
});

/** A host that records what the child saw, in order. */
function host(taps: (string | null)[] = []) {
  const shown: string[] = [];
  const h: EventHost = {
    say: async (msgid, _speaker, lead) => void shown.push(`say ${msgid}${lead?.length ? ` [lead: ${lead.join(" / ")}]` : ""}`),
    line: async (text) => void shown.push(`line ${text}`),
    quiz: async (topic, _context, answered) => {
      shown.push(`quiz ${topic}`);
      answered("correct");
    },
    changed: () => void shown.push("saved"),
    topics: async (slug, chips) => {
      shown.push(`chips ${slug}: ${chips.map((c) => c.id).join(",")}`);
      return taps.shift() ?? null;
    },
    fact: async (f) => void shown.push(`fact ${f.text}`),
    screen: async (kind) => void shown.push(`screen ${kind}`),
    warn: (m) => void shown.push(`warn ${m}`),
  };
  return { h, shown };
}

/** A person of the world with a fixed way of talking. */
function people(over: Partial<People> = {}): People & { log: string[] } {
  const log: string[] = [];
  const spoken = (s: string, text: string, extra: Partial<Spoken> = {}): Spoken => ({ id: `${s}.x`, intent: "x", text, speaker: s, source: "pool", ...extra });
  return {
    log,
    defined: (s) => s === "avi" || s === "rina",
    greet: async (s) => (log.push(`greet ${s}`), spoken(s, "שלום!")),
    chips: (s) => (s === "rina" ? ([{ id: "tea", label: "תה", icon: "2615", unlock: 0 }, { id: "fact", label: "עובדה", icon: "2b50", unlock: 0 }] as Chip[]) : []),
    topic: async (s, t) => (log.push(`topic ${s} ${t}`), spoken(s, `על ${t}`, t === "fact" ? { fact: "water_cycle" } : {})),
    farewell: async (s) => (log.push(`farewell ${s}`), spoken(s, "להתראות")),
    level: () => 0,
    flags: () => [],
    placed: () => [{ slug: "avi" }, { slug: "rina" }],
    ...over,
  };
}

const opts = (p?: People) => ({ grade: 2, today: () => "2026-10-22", hour: () => 9, people: p, objects: { economy: { items: {} } as never, loot: { dailyGift: [], chests: {} }, facts: { water_cycle: { emoji: "1f4a7", text: "מים" } }, pools: () => [], zone: "z" } });

describe("placing the people", () => {
  it("place_npcs makes the resolver's people exist, once, with no warning from the auto event", async () => {
    const { h, shown } = host();
    const p = people();
    const r = new EventRunner([ev("Place", [["place_npcs"]], [["not", "npcs_placed"]])], new WorldState(), h, opts(p));
    expect(unknownActions(r.events[0]!)).toEqual([]);
    await r.start();
    expect([...r.characters].sort()).toEqual(["avi", "rina"]);
    expect(shown.filter((x) => x.startsWith("warn"))).toEqual([]);
  });

  it("the new conditions: npcs_placed, npc_here, phase_is, weekday_is, friendship_at_least, npc_flag", () => {
    const ctx = {
      variables: new Map<string, string>(),
      characters: new Set(["avi"]),
      grade: 1,
      today: "2026-10-22",
      placed: true,
      phase: "morning",
      weekday: 4,
      friendship: (s: string) => (s === "avi" ? 2 : 0),
      npcFlags: (s: string) => (s === "avi" ? ["helped"] : []),
    };
    const c = (type: string, args: string[], operator: "is" | "not" = "is") => ({ type, args, operator });
    expect(conditionHolds(c("npcs_placed", []), ctx)).toBe(true);
    expect(conditionHolds(c("npcs_placed", []), { ...ctx, placed: false })).toBe(false);
    expect(conditionHolds(c("npc_here", ["avi"]), ctx)).toBe(true);
    expect(conditionHolds(c("npc_here", ["rina"]), ctx)).toBe(false);
    expect(conditionHolds(c("phase_is", ["morning"]), ctx)).toBe(true);
    expect(conditionHolds(c("phase_is", ["morning:afternoon"]), { ...ctx, phase: "afternoon" })).toBe(true);
    expect(conditionHolds(c("phase_is", ["evening"]), ctx)).toBe(false);
    expect(conditionHolds(c("weekday_is", ["4"]), ctx)).toBe(true);
    expect(conditionHolds(c("weekday_is", ["thu"]), ctx)).toBe(true);
    expect(conditionHolds(c("weekday_is", ["sat:sun"]), ctx)).toBe(false);
    expect(conditionHolds(c("friendship_at_least", ["avi", "2"]), ctx)).toBe(true);
    expect(conditionHolds(c("friendship_at_least", ["avi", "3"]), ctx)).toBe(false);
    expect(conditionHolds(c("npc_flag", ["avi", "helped"]), ctx)).toBe(true);
    expect(conditionHolds(c("npc_flag", ["avi", "other"], "not"), ctx)).toBe(true);
    // without the world's people, they never hold
    expect(conditionHolds(c("friendship_at_least", ["avi", "1"]), { variables: new Map(), characters: new Set(), grade: 0, today: "x" })).toBe(false);
  });
});

describe("talking to a person of the world", () => {
  it("any person with a definition can be talked to, with no event of their own and no allow-list", async () => {
    const { h, shown } = host();
    const p = people();
    const r = new EventRunner([ev("Place", [["place_npcs"]], [["not", "npcs_placed"]])], new WorldState(), h, opts(p));
    await r.start();
    expect(r.talkable("rina")).toBe(true);
    expect(r.talkable("nobody")).toBe(false);
    expect(await r.talk("rina")).toBe(true);
    expect(shown).toContain("line rina: שלום!");
    expect(await r.talk("nobody")).toBe(false);
  });

  it("a person who is not on the map now cannot be talked to", async () => {
    const { h } = host();
    const r = new EventRunner([], new WorldState(), h, opts(people()));
    await r.start();
    expect(r.talkable("avi")).toBe(false);
    expect(await r.talk("avi")).toBe(false);
  });

  it("the greeting leads the first dialog of the talk (one box), and the old events go on as before", async () => {
    const { h, shown } = host();
    const events = [
      ev("Place", [["place_npcs"]], [["not", "npcs_placed"]]),
      ev("Avi hello", [["translated_dialog", "hello_msg", "avi"], ["ask_quiz", "math", "q"]], [], "avi"),
      ev("Avi good", [["modify_money", "player", "20"], ["translated_dialog", "good_msg", "avi"]], [["is", "one_of", "q", "correct:super"]]),
    ];
    const s = new WorldState();
    const r = new EventRunner(events, s, h, opts(people()));
    await r.start();
    await r.talk("avi");
    // the greeting is a page of the same dialog as the hello, not a box of its own
    expect(shown.filter((x) => x.startsWith("say") || x.startsWith("line") || x.startsWith("quiz"))).toEqual(["say hello_msg [lead: avi: שלום!]", "quiz math", "say good_msg"]);
    expect(s.money).toBe(20);
  });

  it("with no dialog in the events, the greeting comes before the question, the shop and the tutor", async () => {
    for (const action of [["ask_quiz", "math", "q"], ["open_shop"], ["open_tutor", "all"]] as [string, ...string[]][]) {
      const { h, shown } = host();
      h.openTutor = async () => void shown.push("tutor");
      const r = new EventRunner([ev("Place", [["place_npcs"]], [["not", "npcs_placed"]]), ev("Talk", [action], [], "avi")], new WorldState(), h, opts(people()));
      await r.start();
      await r.talk("avi");
      const at = shown.findIndex((x) => x === "line avi: שלום!");
      const then = shown.findIndex((x) => /^(quiz|screen|tutor)/.test(x));
      expect(at, action[0]).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(then);
    }
  });

  it("a person with no definition talks as before (the legacy events only), and one with neither says nothing", async () => {
    const { h, shown } = host();
    const r = new EventRunner([ev("Create", [["create_npc", "chest"]], [["not", "char_exists", "chest"]]), ev("Chest", [["translated_dialog", "open"]], [], "chest")], new WorldState(), h, opts(people()));
    await r.start();
    expect(await r.talk("chest")).toBe(true);
    expect(shown).toEqual(["say open"]);
  });

  it("the talk is saved: the memory the greeting wrote reaches the world's save", async () => {
    const { h, shown } = host();
    const r = new EventRunner([ev("Place", [["place_npcs"]], [["not", "npcs_placed"]])], new WorldState(), h, opts(people()));
    await r.start();
    shown.length = 0;
    await r.talk("rina");
    expect(shown).toContain("saved");
  });

  it("the old allow-list still works when one is given (tests), and without one everyone can be talked to", async () => {
    const { h } = host();
    const events = [ev("Place", [["place_npcs"]], [["not", "npcs_placed"]])];
    const r = new EventRunner(events, new WorldState(), h, { ...opts(people()), talkTo: new Set(["avi"]) });
    await r.start();
    expect(r.talkable("avi")).toBe(true);
    expect(r.talkable("rina")).toBe(false);
  });
});

describe("asking a person about a topic (the chips)", () => {
  async function started(taps: (string | null)[], p = people()) {
    const rec = host(taps);
    const r = new EventRunner([ev("Place", [["place_npcs"]], [["not", "npcs_placed"]])], new WorldState(), rec.h, opts(p));
    await r.start();
    rec.shown.length = 0;
    return { r, p, ...rec };
  }

  it("is offered only when the person has a topic open", async () => {
    const { r } = await started([]);
    expect(r.askable("rina")).toBe(true);
    expect(r.askable("avi")).toBe(false);
    expect(r.askable("nobody")).toBe(false);
  });

  it("shows the chips, answers the one tapped, shows them again, and says goodbye when the child is done", async () => {
    const { r, shown, p } = await started(["tea", null]);
    expect(await r.ask("rina")).toBe(true);
    expect(shown.filter((x) => !x.startsWith("saved"))).toEqual(["chips rina: tea,fact", "line rina: על tea", "chips rina: tea,fact", "line rina: להתראות"]);
    expect(p.log).toEqual(["topic rina tea", "farewell rina"]);
  });

  it("no goodbye when nothing was asked, and a fact topic shows the fact verbatim", async () => {
    const none = await started([null]);
    await none.r.ask("rina");
    expect(none.p.log).toEqual([]);
    const fact = await started(["fact", null]);
    await fact.r.ask("rina");
    expect(fact.shown).toContain("fact מים");
  });

  it("holds the map while it runs, and what changed is saved", async () => {
    const { r, shown } = await started(["tea", null]);
    const done = r.ask("rina");
    expect(r.busy).toBe(true);
    await done;
    expect(r.busy).toBe(false);
    expect(shown).toContain("saved");
  });
});
