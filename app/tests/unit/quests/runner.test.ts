import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QuestEngine } from "../../../src/core/game/questFlow";
import { accept } from "../../../src/core/game/board";
import { readMap, type TiledMap, type WorldEvent } from "../../../src/core/world/mapData";
import { npcTable } from "../../../src/core/world/npcs";
import { resolve } from "../../../src/core/world/resolver";
import { EventRunner, type EventHost, type People, QUEST_ACTIONS } from "../../../src/core/world/events";
import { WorldState } from "../../../src/core/world/worldState";
import { pinOf, pinText } from "../../../src/core/game/questWhere";
import { Director } from "../../../src/core/world/director";
import { gameJson } from "../game/helpers";
import { data, eco } from "./helpers";

const d = data();
const npcs = npcTable(gameJson("npcs.json"));

const ev = (name: string, actions: [string, ...string[]][], conditions: [string, string, ...string[]][] = []): WorldEvent => ({
  id: Math.floor(Math.random() * 1e9),
  name,
  conditions: conditions.map(([operator, type, ...args]) => ({ operator: operator as "is" | "not", type, args })),
  actions: actions.map(([type, ...args]) => ({ type, args })),
  behaviors: [],
});

function scene(opts: { picks?: (string | null)[]; answers?: string[]; world?: WorldState } = {}) {
  const world = opts.world ?? new WorldState();
  const shown: string[] = [];
  const picks = [...(opts.picks ?? [])];
  const answers = [...(opts.answers ?? [])];
  const host: EventHost = {
    say: async () => void shown.push("say"),
    line: async (t) => void shown.push(`line ${t}`),
    quiz: async (topic, _c, answered) => {
      shown.push(`quiz ${topic}`);
      answered((answers.shift() ?? "correct") as "correct");
    },
    choose: async (_prompt, speaker, options) => {
      shown.push(`choose ${speaker}: ${options.map((o) => o.id).join(",")}`);
      return picks.length ? (picks.shift() ?? null) : (options[0]?.id ?? null);
    },
    found: async (f) => void shown.push(`found ${f.prize.coins || `${f.prize.item}x${f.prize.n}`}`),
    changed: () => void shown.push("saved"),
    warn: (m) => void shown.push(`warn ${m}`),
  };
  const befriended: string[] = [];
  const engine = new QuestEngine({ data: d, world, economy: eco(), today: () => "2026-10-22", grade: () => 2, name: (s) => npcs[s]?.name ?? "", befriend: (s) => befriended.push(s), seed: () => 7 });
  const people: People = {
    defined: (s) => s in npcs,
    greet: async (s) => ({ id: "x", intent: "greet_first", text: "שלום!", speaker: npcs[s]?.name ?? s, source: "pool" }),
    chips: () => [],
    topic: async () => null,
    farewell: async () => null,
    level: () => 0,
    flags: () => [],
    placed: () => [...Object.keys(npcs).map((slug) => ({ slug }))],
  };
  const runner = new EventRunner(
    [ev("Place", [["place_npcs"]], [["not", "npcs_placed"]]), ev("Wallet", [["create_npc", "nagmon_wallet", "12", "7"]]), ev("Kitten", [["create_npc", "nagmon_kitten", "21", "16"]])],
    world,
    host,
    { grade: 2, today: () => "2026-10-22", hour: () => 10, people, quests: engine, objects: { economy: eco(), loot: { dailyGift: [], chests: {} }, facts: {}, pools: () => [], zone: "z" } },
  );
  return { runner, world, engine, shown, befriended };
}

describe("a quest through the event runner (the real talk of the map)", () => {
  it("talking to Yoav offers the kitten quest after his greeting; gladly starts it and runs the actions of the interpreter", async () => {
    const s = scene({ picks: ["yes"] });
    await s.runner.start();
    expect(s.runner.talkable("nagmon_kid")).toBe(true);
    expect(await s.runner.talk("nagmon_kid")).toBe(true);
    // the greeting leads, then the offer card, then his first words
    const i = s.shown.findIndex((x) => x.startsWith("line נגמון") || x.startsWith("line יואב"));
    expect(i).toBeGreaterThanOrEqual(0);
    expect(s.shown.some((x) => x.startsWith("choose יואב"))).toBe(true);
    expect(s.world.variables.get("nagmon_kitten")).toBe("asked");
    expect(s.engine.journal()).toHaveLength(1);
    // every change was handed to the host to save
    expect(s.shown).toContain("saved");
  });

  it("a prop with no definition (the kitten on Route 1) is talkable only while a quest waits there", async () => {
    const s = scene({ picks: ["yes"] });
    await s.runner.start();
    expect(s.runner.talkable("nagmon_kitten")).toBe(false);
    expect(await s.runner.talk("nagmon_kitten")).toBe(false);
    await s.runner.talk("nagmon_kid");
    expect(s.runner.talkable("nagmon_kitten")).toBe(true);
    expect(await s.runner.talk("nagmon_kitten")).toBe(true);
    expect(s.world.variables.get("nagmon_kitten")).toBe("found");
    expect(s.runner.talkable("nagmon_kitten")).toBe(false);
  });

  it("an answered question goes through the host's quiz, with the quest's subject", async () => {
    const s = scene({ answers: ["wrong", "correct"] });
    await s.runner.start();
    s.engine.start(d.quests["q_baker_double"]!);
    await s.runner.talk("nagmon_baker");
    expect(s.shown.filter((x) => x === "quiz math")).toHaveLength(2);
    expect(s.world.money).toBe(25);
    expect(s.shown).toContain("found 25");
  });

  it("a card accepted at the board becomes a quest when the map opens (the contract with W2)", async () => {
    const world = new WorldState();
    const first = scene({ world });
    const [card] = first.engine.postings();
    accept(world, card!.id, "2026-10-22");
    const s = scene({ world });
    await s.runner.start();
    expect(s.engine.journal().map((c) => c.id)).toEqual([card!.quest]);
  });

  it("a quest may run only the interpreter's own few actions: money is the reward's, never a step's", () => {
    expect([...QUEST_ACTIONS].sort()).toEqual(["clear_variable", "give_item", "send_letter", "set_variable"]);
  });

  it("a person with no quest and no event is the same as before (nothing extra said)", async () => {
    const s = scene();
    await s.runner.start();
    await s.runner.talk("nagmon_cashier");
    expect(s.shown.some((x) => x.startsWith("choose"))).toBe(false);
    expect(s.shown.some((x) => x.startsWith("quiz"))).toBe(false);
  });

  it("a quest friendship is the person's own quest_done points", () => {
    const memory = new Map();
    const dir = new Director({ npcs, memory, today: () => "2026-10-22", hour: () => 10, hero: () => "x" });
    dir.questDone("nagmon_kid");
    dir.questDone("nobody");
    expect(memory.get("nagmon_kid").pts).toBe(npcs["nagmon_kid"]!.relationship.gain.quest_done);
    expect(memory.has("nobody")).toBe(false);
  });
});

describe('"Show me": the pin is the resolver\'s current spot', () => {
  const city = readMap("classic_hearthrock_city", JSON.parse(readFileSync("public/game/maps/classic_hearthrock_city.json", "utf8")) as TiledMap);
  const base = {
    npcs,
    rules: d.rules,
    seed: 4242,
    flags: (f: string) => f === "nagmon_intro_done",
    friendship: () => 0,
  };

  it("equals the spot the resolver puts the person on, for every person of the quests, every day part", () => {
    for (const phase of ["morning", "afternoon", "evening"] as const) {
      for (const day of ["2026-10-22", "2026-10-23", "2026-10-24"]) {
        const placed = resolve({ map: "classic_hearthrock_city", placement: city.placement!, npcs, day, phase, seed: base.seed, flags: base.flags, friendship: base.friendship });
        for (const slug of new Set(Object.values(d.quests).flatMap((q) => q.steps.map((s) => s.npc)).filter((s) => npcs[s]))) {
          const pin = pinOf(slug, { ...base, day, phase });
          const at = placed.find((p) => p.slug === slug);
          // a person the resolver put on this map stands where the pin says; one the map had no room for is not on it
          if (at) expect(pin, `${slug} ${day} ${phase}`).toEqual({ map: "classic_hearthrock_city", spot: at.spot });
          if (!pin) expect(at, `${slug} ${day} ${phase}`).toBeUndefined();
        }
      }
    }
  });

  it("says where in Hebrew, 'away' at night when a shop is closed, and finds a prop on its map", () => {
    const cashier = pinOf("nagmon_cashier", { ...base, day: "2026-10-22", phase: "morning" });
    expect(cashier).toEqual({ map: "classic_hearthrock_city", spot: "cashier_post" });
    expect(pinText(cashier, d.rules)).toBe("בעיר, ליד הקופה");
    const night = pinOf("nagmon_granny", { ...base, day: "2026-10-22", phase: "evening" });
    expect(night).toBeNull();
    expect(pinText(night, d.rules)).toBe(d.rules.places.away);
    expect(pinOf("nagmon_kitten", { ...base, day: "2026-10-22", phase: "morning" })).toEqual({ map: "classic_route_1", spot: null });
    expect(pinText({ map: "classic_route_1", spot: null }, d.rules)).toBe("בשביל 1");
    expect(pinOf("nagmon_nobody", { ...base, day: "2026-10-22", phase: "morning" })).toBeNull();
  });

  it("every spot and map the people stand at has a name for a child", () => {
    for (const def of Object.values(npcs)) {
      const places = [def.schedule.default, def.schedule.roam, ...def.schedule.rules.map((r) => r.at)].filter(Boolean) as { map: string; spot?: string; spots?: string[] }[];
      for (const p of places) {
        expect(d.rules.places.maps[p.map], `${def.id} ${p.map}`).toBeTruthy();
        for (const spot of [p.spot, ...(p.spots ?? [])].filter(Boolean) as string[]) expect(d.rules.places.spots[spot], `${def.id} ${spot}`).toBeTruthy();
      }
    }
  });
});
