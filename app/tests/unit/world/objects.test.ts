import { describe, expect, it } from "vitest";
import { EGG_NEED } from "../../../src/core/game/eggs";
import { countOf, economy, give } from "../../../src/core/game/items";
import { EGG_ITEM, loot, type Prize } from "../../../src/core/game/loot";
import { ACTIONS, EventRunner, type EventHost, type Found, type QuizWord, type WorldObjects } from "../../../src/core/world/events";
import type { WorldEvent } from "../../../src/core/world/mapData";
import { WorldState } from "../../../src/core/world/worldState";
import { gameJson } from "../game/helpers";

const eco = economy(gameJson("economy.json"));
const DAY = "2026-10-21";

const objects: WorldObjects = {
  economy: eco,
  loot: loot({
    daily_gift: [{ coins: 1 }],
    chests: {
      daily: { repeat: "daily", prizes: [{ coins: 30 }, { item: "berry", n: 2 }, { egg: 1 }], consolation: { coins: 5 } },
      once: { repeat: "once", prizes: [{ item: "clover", n: 1 }], consolation: { coins: 3 } },
    },
  }),
  facts: { owl_night: { emoji: "1f989", text: "ינשוף רואה בלילה.", subject: "science" } },
  pools: (table) => (table === "zone1" ? [{ species: "heliobud", level: 4 }] : []),
  zone: "zone1",
};

const ev = (id: number, actions: [string, ...string[]][], talk?: string): WorldEvent => ({
  id,
  name: `e${id}`,
  actions: actions.map(([type, ...args]) => ({ type, args })),
  conditions: actions[0]![0] === "create_npc" ? [{ operator: "not", type: "char_exists", args: [actions[0]![1]!] }] : [],
  behaviors: talk ? [{ type: "talk", args: [talk] }] : [],
});

interface Script {
  answers?: (QuizWord | "back")[];
  wrong?: ("again" | "gift" | "leave")[];
}

function setup(actions: [string, ...string[]][], state = new WorldState(), script: Script = {}, today = DAY, withObjects = true) {
  const log: string[] = [];
  const found: Found[] = [];
  const answers = [...(script.answers ?? [])];
  const wrong = [...(script.wrong ?? [])];
  const host: EventHost = {
    say: async (id) => void log.push(`say ${id}`),
    quiz: async (topic, context, answered) => {
      log.push(`quiz ${topic} ${context}`);
      const a = answers.shift() ?? "back";
      if (a !== "back") answered(a);
    },
    changed: () => void log.push("saved"),
    warn: (m) => void log.push(`warn ${m}`),
    found: async (f) => {
      log.push(`found ${f.how}`);
      found.push(f);
    },
    chestWrong: async () => {
      log.push("wrong?");
      return wrong.shift() ?? "gift";
    },
    fact: async (f) => void log.push(`fact ${f.emoji} ${f.text}`),
  };
  const events = [ev(1, [["create_npc", "thing", "1", "1"]]), ev(2, actions, "thing")];
  const runner = new EventRunner(events, state, host, { grade: 2, today: () => today, ...(withObjects ? { objects } : {}) });
  const run = async () => {
    await runner.start();
    await runner.talk("thing");
  };
  return { runner, state, log, found, run, host };
}

describe("the actions are known", () => {
  it("give_item, open_chest, place_egg and show_fact", () => {
    for (const a of ["give_item", "open_chest", "place_egg", "show_fact"]) expect(ACTIONS.has(a)).toBe(true);
  });
});

describe("give_item <id> <n>", () => {
  it("puts n of the item in the Bag and shows what was found", async () => {
    const t = setup([["give_item", "berry", "3"]]);
    await t.run();
    expect(countOf(t.state, "berry")).toBe(3);
    expect(t.found[0]).toMatchObject({ how: "item", prize: { item: "berry", n: 3 } });
  });

  it("n is 1 when it is not said", async () => {
    const t = setup([["give_item", "clover"]]);
    await t.run();
    expect(countOf(t.state, "clover")).toBe(1);
  });

  it("an unknown item or a bad number stops the event and says so; nothing is given", async () => {
    for (const args of [["ghost", "1"], ["berry", "0"], ["berry", "x"], []]) {
      const t = setup([["give_item", ...args], ["set_variable", "after:1"]]);
      await t.run();
      expect(t.state.items.size).toBe(0);
      expect(t.state.variables.has("after")).toBe(false);
      expect(t.log.join()).toMatch(/stopped at give_item/);
    }
  });

  it("a full stack is given as coins: nobody gets nothing", async () => {
    const w = new WorldState();
    give(w, eco, "berry", 99);
    const t = setup([["give_item", "berry", "2"]], w);
    await t.run();
    expect(countOf(w, "berry")).toBe(99);
    expect(w.money).toBeGreaterThan(0);
  });
});

describe("open_chest <id> <skill-or-subject>", () => {
  it("a right answer opens it: the first prize of the chest's list, saved before it is shown", async () => {
    const t = setup([["open_chest", "daily", "science"]], new WorldState(), { answers: ["correct"] });
    await t.run();
    expect(t.state.money).toBe(30);
    expect(t.log).toContain("quiz science chest");
    expect(t.log.indexOf("saved")).toBeLessThan(t.log.indexOf("found chest"));
    expect(t.found[0]).toMatchObject({ how: "chest", prize: { coins: 30 } });
  });

  it("'super' opens it too, and a skill id works as the topic", async () => {
    const t = setup([["open_chest", "daily", "math.money.coins"]], new WorldState(), { answers: ["super"] });
    await t.run();
    expect(t.log).toContain("quiz math.money.coins chest");
    expect(t.state.money).toBe(30);
  });

  it("a daily chest is closed for the rest of the day, and the next day gives the next prize of its list", async () => {
    const w = new WorldState();
    const first = setup([["open_chest", "daily", "science"]], w, { answers: ["correct"] }, DAY);
    await first.run();
    const again = setup([["open_chest", "daily", "science"]], w, { answers: ["correct"] }, DAY);
    await again.run();
    expect(again.log).toContain("say nagmon_world_chest_empty_daily");
    expect(again.log.some((l) => l.startsWith("quiz"))).toBe(false);
    expect(w.money).toBe(30);
    const tomorrow = setup([["open_chest", "daily", "science"]], w, { answers: ["correct"] }, "2026-10-22");
    await tomorrow.run();
    expect(countOf(w, "berry")).toBe(2);
    const third = setup([["open_chest", "daily", "science"]], w, { answers: ["correct"] }, "2026-10-23");
    await third.run();
    expect(countOf(w, EGG_ITEM)).toBe(1);
    const fourth = setup([["open_chest", "daily", "science"]], w, { answers: ["correct"] }, "2026-10-24");
    await fourth.run();
    expect(w.money).toBe(60);
  });

  it("a chest that opens once stays open for ever: the question is not asked again", async () => {
    const w = new WorldState();
    await setup([["open_chest", "once", "math"]], w, { answers: ["correct"] }, DAY).run();
    expect(countOf(w, "clover")).toBe(1);
    const later = setup([["open_chest", "once", "math"]], w, { answers: ["correct"] }, "2027-01-01");
    await later.run();
    expect(later.log).toContain("say nagmon_world_chest_empty_once");
    expect(later.log.some((l) => l.startsWith("quiz"))).toBe(false);
    expect(countOf(w, "clover")).toBe(1);
  });

  it("each chest is closed on its own: the day's other chest is still shut", async () => {
    const w = new WorldState();
    await setup([["open_chest", "daily", "science"]], w, { answers: ["correct"] }).run();
    const other = setup([["open_chest", "once", "math"]], w, { answers: ["correct"] });
    await other.run();
    expect(countOf(w, "clover")).toBe(1);
  });

  it("a wrong answer lets the child try again: the next right answer opens the real prize", async () => {
    const w = new WorldState();
    const t = setup([["open_chest", "daily", "science"]], w, { answers: ["wrong", "correct"], wrong: ["again"] });
    await t.run();
    expect(t.log.filter((l) => l.startsWith("quiz"))).toHaveLength(2);
    expect(w.money).toBe(30);
    expect(t.found[0]).toMatchObject({ how: "chest" });
  });

  it("'don't know' is a wrong answer too, kindly: try again as many times as the child likes", async () => {
    const w = new WorldState();
    const t = setup([["open_chest", "daily", "science"]], w, { answers: ["skip", "wrong", "wrong", "correct"], wrong: ["again", "again", "again"] });
    await t.run();
    expect(w.money).toBe(30);
  });

  it("or the child opens the small consolation gift: the chest closes for today, the list does not move on", async () => {
    const w = new WorldState();
    const t = setup([["open_chest", "daily", "science"]], w, { answers: ["wrong"], wrong: ["gift"] });
    await t.run();
    expect(w.money).toBe(5);
    expect(t.found[0]).toMatchObject({ how: "consolation", prize: { coins: 5 } });
    const same = setup([["open_chest", "daily", "science"]], w, { answers: ["correct"] });
    await same.run();
    expect(same.log).toContain("say nagmon_world_chest_empty_daily");
    // tomorrow it is the first prize again: a consolation day does not skip the egg or the berries
    await setup([["open_chest", "daily", "science"]], w, { answers: ["correct"] }, "2026-10-22").run();
    expect(w.money).toBe(35);
  });

  it("or the child leaves the chest as it is: nothing given, nothing used up, it can be tried again today", async () => {
    const w = new WorldState();
    const t = setup([["open_chest", "daily", "science"]], w, { answers: ["wrong"], wrong: ["leave"] });
    await t.run();
    expect(w.money).toBe(0);
    expect(t.found).toEqual([]);
    const later = setup([["open_chest", "daily", "science"]], w, { answers: ["correct"] });
    await later.run();
    expect(w.money).toBe(30);
  });

  it("a host that cannot ask 'again or gift' gives the gift: nobody is stuck", async () => {
    const w = new WorldState();
    const t = setup([["open_chest", "daily", "science"]], w, { answers: ["wrong"] });
    delete t.host.chestWrong;
    await t.run();
    expect(w.money).toBe(5);
  });

  it("a question closed with back opens nothing and costs nothing; the chest can be tried later", async () => {
    const w = new WorldState();
    const t = setup([["open_chest", "daily", "science"]], w, { answers: ["back"] });
    await t.run();
    expect(w.money).toBe(0);
    expect(t.found).toEqual([]);
    const later = setup([["open_chest", "daily", "science"]], w, { answers: ["correct"] });
    await later.run();
    expect(w.money).toBe(30);
  });

  it("an unknown chest or a missing topic stops the event and says so", async () => {
    for (const args of [["ghost", "math"], ["daily"], []]) {
      const t = setup([["open_chest", ...args], ["set_variable", "after:1"]], new WorldState(), { answers: ["correct"] });
      await t.run();
      expect(t.state.variables.has("after")).toBe(false);
      expect(t.log.join()).toMatch(/stopped at open_chest/);
    }
  });

  it("a prize that does not fit a full Bag is coins instead", async () => {
    const w = new WorldState();
    w.variables.set("nagmon_chest_daily_n", "1");
    give(w, eco, "berry", 99);
    const t = setup([["open_chest", "daily", "science"]], w, { answers: ["correct"] });
    await t.run();
    expect(countOf(w, "berry")).toBe(99);
    expect(w.money).toBeGreaterThan(0);
  });
});

describe("place_egg", () => {
  const egg = (n = 1) => {
    const w = new WorldState();
    give(w, eco, EGG_ITEM, n);
    return w;
  };

  it("warms an egg of the Bag in the map's zone, and says so", async () => {
    const w = egg();
    const t = setup([["place_egg"]], w);
    await t.run();
    expect(w.eggs).toEqual([{ id: "e1", table: "zone1", got: 0, need: EGG_NEED }]);
    expect(countOf(w, EGG_ITEM)).toBe(0);
    expect(t.log).toContain("say nagmon_world_egg_placed");
  });

  it("takes the zone from its argument when it has one", async () => {
    const w = egg();
    await setup([["place_egg", "other_zone"]], w).run();
    expect(w.eggs[0]!.table).toBe("other_zone");
  });

  it("with no egg it says so kindly; with the warmers full the egg stays in the Bag", async () => {
    const none = setup([["place_egg"]]);
    await none.run();
    expect(none.log).toContain("say nagmon_world_egg_none");
    const w = egg(3);
    await setup([["place_egg"]], w).run();
    await setup([["place_egg"]], w).run();
    const full = setup([["place_egg"]], w);
    await full.run();
    expect(full.log).toContain("say nagmon_world_egg_full");
    expect(countOf(w, EGG_ITEM)).toBe(1);
  });
});

describe("show_fact <id>", () => {
  it("shows the fact's picture and its one line", async () => {
    const t = setup([["show_fact", "owl_night"]]);
    await t.run();
    expect(t.log).toContain("fact 1f989 ינשוף רואה בלילה.");
  });

  it("an unknown fact stops the event and says so", async () => {
    const t = setup([["show_fact", "ghost"], ["set_variable", "after:1"]]);
    await t.run();
    expect(t.log.join()).toMatch(/stopped at show_fact/);
    expect(t.state.variables.has("after")).toBe(false);
  });
});

describe("a runner with no world objects", () => {
  it("stops these events and says so; the game goes on", async () => {
    const t = setup([["give_item", "berry", "1"]], new WorldState(), {}, DAY, false);
    await t.run();
    expect(t.log.join()).toMatch(/stopped at give_item/);
  });
});

describe("a chest's prize is a Prize", () => {
  it("is coins or an item, one of the two", async () => {
    const w = new WorldState();
    const t = setup([["open_chest", "daily", "science"]], w, { answers: ["correct"] });
    await t.run();
    const p: Prize = t.found[0]!.prize;
    expect(Boolean(p.item) !== Boolean(p.coins)).toBe(true);
  });
});
