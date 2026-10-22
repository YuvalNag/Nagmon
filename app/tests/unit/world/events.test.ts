import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conditionHolds, EventRunner, type EventHost, type People, type QuizWord, unknownActions } from "../../../src/core/world/events";
import { readMap, type TiledMap, type WorldEvent } from "../../../src/core/world/mapData";
import { WorldState } from "../../../src/core/world/worldState";

const city = readMap(
  "classic_hearthrock_city",
  JSON.parse(readFileSync("public/game/maps/classic_hearthrock_city.json", "utf8")) as TiledMap,
);

/** A host that records what the child saw and answers the quizzes as told. */
function host(answers: (QuizWord | "back")[] = []) {
  const said: string[] = [];
  const quizzes: { topic: string; context: string }[] = [];
  let saves = 0;
  const warnings: string[] = [];
  const h: EventHost = {
    say: async (msgid) => void said.push(msgid),
    quiz: async (topic, context, answered) => {
      quizzes.push({ topic, context });
      const a = answers.shift() ?? "back";
      if (a !== "back") answered(a);
    },
    changed: () => void saves++,
    warn: (m) => void warnings.push(m),
  };
  return { h, said, quizzes, warnings, saves: () => saves };
}

const DAY = "2026-10-20";

/** The resolver's answer and nothing else: these people exist on the map, with no words of their own (the old scripts alone talk). */
function placedOnly(slugs: string[]): People {
  return {
    defined: () => false,
    greet: async () => null,
    chips: () => [],
    topic: async () => null,
    farewell: async () => null,
    level: () => 0,
    flags: () => [],
    placed: () => slugs.map((slug) => ({ slug })),
  };
}

const TOWN_NOW = ["nagmon_owl", "nagmon_cashier", "nagmon_tourist", "nagmon_gardener", "nagmon_kid", "nagmon_granny"];

async function cityRunner(grade: number, answers: (QuizWord | "back")[] = [], state = new WorldState(), today = () => DAY, placed = ["nagmon_cashier"]) {
  const rec = host(answers);
  const runner = new EventRunner(city.events, state, rec.h, { grade, today, talkTo: new Set(["nagmon_cashier"]), people: placedOnly(placed) });
  await runner.start();
  return { runner, state, ...rec };
}

describe("the conditions", () => {
  const ctx = (vars: Record<string, string> = {}, extra: Partial<{ grade: number; chars: string[]; today: string }> = {}) => ({
    variables: new Map(Object.entries(vars)),
    characters: new Set(extra.chars ?? []),
    grade: extra.grade ?? 0,
    today: extra.today ?? DAY,
  });
  const c = (type: string, args: string[], operator: "is" | "not" = "is") => ({ type, args, operator });

  it("variable_set with and without a value, and its 'not'", () => {
    expect(conditionHolds(c("variable_set", ["a"]), ctx({ a: "x" }))).toBe(true);
    expect(conditionHolds(c("variable_set", ["a:x"]), ctx({ a: "x" }))).toBe(true);
    expect(conditionHolds(c("variable_set", ["a:y"]), ctx({ a: "x" }))).toBe(false);
    expect(conditionHolds(c("variable_set", ["a"], "not"), ctx())).toBe(true);
  });

  it("one_of: the variable is one of the values", () => {
    const cond = c("one_of", ["q", "correct:super:skip"]);
    expect(["correct", "super", "skip"].map((v) => conditionHolds(cond, ctx({ q: v })))).toEqual([true, true, true]);
    expect(conditionHolds(cond, ctx({ q: "wrong" }))).toBe(false);
    expect(conditionHolds(cond, ctx())).toBe(false);
  });

  it("profile_grade_at_least", () => {
    expect(conditionHolds(c("profile_grade_at_least", ["2"]), ctx({}, { grade: 2 }))).toBe(true);
    expect(conditionHolds(c("profile_grade_at_least", ["2"]), ctx({}, { grade: 1 }))).toBe(false);
    expect(conditionHolds(c("profile_grade_at_least", ["1"], "not"), ctx({}, { grade: 0 }))).toBe(true);
  });

  it("nagmon_daily_below counts today only, and a new day starts again", () => {
    const below = c("nagmon_daily_below", ["cashier", "3"]);
    expect(conditionHolds(below, ctx({ nagmon_daily_cashier: `${DAY}:2` }))).toBe(true);
    expect(conditionHolds(below, ctx({ nagmon_daily_cashier: `${DAY}:3` }))).toBe(false);
    expect(conditionHolds(below, ctx({ nagmon_daily_cashier: "2026-10-19:3" }))).toBe(true);
    expect(conditionHolds(below, ctx({ nagmon_daily_cashier: "garbage" }))).toBe(true);
  });

  it("a kind it does not know never holds, not even with 'not'", () => {
    expect(conditionHolds(c("char_at", ["player"]), ctx())).toBe(false);
    expect(conditionHolds(c("music_playing", ["x"], "not"), ctx())).toBe(false);
  });
});

describe("Hearthrock's scripts in M4", () => {
  it("has the resolver's people exist (place_npcs) and the map's own props, and nothing else runs", async () => {
    const { runner, said, quizzes, state } = await cityRunner(2, [], new WorldState(), () => DAY, TOWN_NOW);
    expect([...runner.characters].sort()).toEqual([...TOWN_NOW, ...city.npcs.map((n) => n.slug)].sort());
    expect(said).toEqual([]);
    expect(quizzes).toEqual([]);
    // the new game's start (nagmon_apply_profile) waits for M5: no owl intro
    expect(state.variables.size).toBe(0);
    expect(runner.waiting()).toEqual(expect.arrayContaining(["Nagmon Start", "Owl Gifts", "Wallet Found"]));
  });

  it("lets the player talk only to who a test limits it to (the build has no allow-list)", async () => {
    const { runner } = await cityRunner(2);
    expect(runner.talkable("nagmon_cashier")).toBe(true);
    for (const slug of ["nagmon_owl", "nagmon_tourist", "nagmon_gardener", "nagmon_kid", "nagmon_granny", "nobody"]) {
      expect(runner.talkable(slug), slug).toBe(false);
    }
  });

  it.each([
    [0, "math"],
    [1, "math.money.coins"],
    [2, "math.money.change_20"],
    [9, "math.money.change_20"],
  ])("the cashier asks a child in grade %i about %s, in the shop", async (grade, topic) => {
    const { runner, said, quizzes } = await cityRunner(grade, ["back"]);
    expect(await runner.talk("nagmon_cashier")).toBe(true);
    expect(said).toEqual(["nagmon_world_cashier_hello"]);
    expect(quizzes).toEqual([{ topic, context: "shop" }]);
  });

  it("a right answer gives 20 coins, counts the day's prize and thanks the child", async () => {
    const { runner, said, state, saves } = await cityRunner(2, ["correct"]);
    await runner.talk("nagmon_cashier");
    expect(said).toEqual(["nagmon_world_cashier_hello", "nagmon_world_cashier_good"]);
    expect(state.money).toBe(20);
    expect(state.variables.get("nagmon_daily_cashier")).toBe(`${DAY}:1`);
    // the quiz's variable is gone: the next talk starts afresh
    expect(state.variables.has("nagmon_cashier_q")).toBe(false);
    // saved at the answer, and again with the reward's steps together
    expect(saves()).toBe(2);
    expect(runner.busy).toBe(false);
  });

  it("saves a reward's steps together: never a cleared answer without its coins", async () => {
    const snapshots: string[] = [];
    const state = new WorldState();
    const h: EventHost = {
      say: async () => {},
      quiz: async (_t, _c, answered) => answered("correct"),
      changed: () => void snapshots.push(JSON.stringify(state.toDict())),
    };
    const runner = new EventRunner(city.events, state, h, { grade: 2, today: () => DAY });
    await runner.start();
    await runner.talk("nagmon_cashier");
    const saved = snapshots.map((s) => JSON.parse(s) as { money: number; variables: Record<string, string> });
    expect(saved.map((s) => [s.money, s.variables["nagmon_cashier_q"] ?? null, s.variables["nagmon_daily_cashier"] ?? null])).toEqual([
      [0, "correct", null],
      [20, null, `${DAY}:1`],
    ]);
  });

  it("'super' counts as right too", async () => {
    const { runner, state } = await cityRunner(4, ["super"]);
    await runner.talk("nagmon_cashier");
    expect(state.money).toBe(20);
  });

  it("a wrong answer or 'don't know' gets a gentle word and no coins", async () => {
    const { runner, said, state } = await cityRunner(2, ["wrong"]);
    await runner.talk("nagmon_cashier");
    expect(said).toEqual(["nagmon_world_cashier_hello", "nagmon_world_cashier_wrong"]);
    expect(state.money).toBe(0);
    expect(state.variables.has("nagmon_daily_cashier")).toBe(false);
  });

  it("a quiz closed with back gives nothing and says nothing more", async () => {
    const { runner, said, state } = await cityRunner(2, ["back"]);
    await runner.talk("nagmon_cashier");
    expect(said).toEqual(["nagmon_world_cashier_hello"]);
    expect(state.money).toBe(0);
    expect(state.variables.size).toBe(0);
  });

  it("the third prize of the day works, the fourth is praise only, and tomorrow pays again", async () => {
    let today = DAY;
    const { runner, said, state } = await cityRunner(2, ["correct", "correct", "correct", "correct", "correct"], new WorldState(), () => today);
    for (let i = 0; i < 3; i++) await runner.talk("nagmon_cashier");
    expect(state.money).toBe(60);
    expect(said.filter((m) => m === "nagmon_world_cashier_good")).toHaveLength(3);
    said.length = 0;
    await runner.talk("nagmon_cashier");
    expect(state.money).toBe(60);
    expect(said).toEqual(["nagmon_world_cashier_hello", "nagmon_world_cashier_free"]);
    // coins are never taken away, and the counter starts again the next day
    today = "2026-10-21";
    said.length = 0;
    await runner.talk("nagmon_cashier");
    expect(state.money).toBe(80);
    expect(said).toEqual(["nagmon_world_cashier_hello", "nagmon_world_cashier_good"]);
    expect(state.variables.get("nagmon_daily_cashier")).toBe("2026-10-21:1");
  });

  it("an answer saved before the app was killed is rewarded when the map opens again", async () => {
    // answered, then the process died before the feedback closed
    const saved = WorldState.fromDict({ schema_version: 1, money: 20, variables: { nagmon_cashier_q: "correct", nagmon_daily_cashier: `${DAY}:1` } });
    const { said, state } = await cityRunner(2, [], saved);
    expect(said).toEqual(["nagmon_world_cashier_good"]);
    expect(state.money).toBe(40);
    expect(state.variables.get("nagmon_daily_cashier")).toBe(`${DAY}:2`);
  });

  it("does not start a second talk while one runs", async () => {
    let release!: () => void;
    const h: EventHost = {
      say: () => new Promise<void>((r) => (release = r)),
      quiz: async () => {},
      changed: () => {},
    };
    const runner = new EventRunner(city.events, new WorldState(), h, { grade: 2, today: () => DAY, people: placedOnly(["nagmon_cashier"]) });
    await runner.start();
    const first = runner.talk("nagmon_cashier");
    expect(runner.busy).toBe(true);
    expect(runner.talkable("nagmon_cashier")).toBe(false);
    expect(await runner.talk("nagmon_cashier")).toBe(false);
    release();
    await first;
    expect(runner.busy).toBe(false);
  });
});

describe("the interpreter's rules", () => {
  const ev = (id: number, actions: [string, ...string[]][], conditions: [string, string, ...string[]][] = [], talk?: string): WorldEvent => ({
    id,
    name: `e${id}`,
    actions: actions.map(([type, ...args]) => ({ type, args })),
    conditions: conditions.map(([operator, type, ...args]) => ({ operator: operator as "is" | "not", type, args })),
    behaviors: talk ? [{ type: "talk", args: [talk] }] : [],
  });

  it("runs an event with an unknown action not at all, not half of it", async () => {
    const e = ev(1, [["set_variable", "a:1"], ["add_item", "potion", "1"]]);
    expect(unknownActions(e)).toEqual(["add_item"]);
    const { h } = host();
    const state = new WorldState();
    const runner = new EventRunner([e], state, h, { grade: 0, today: () => DAY });
    await runner.start();
    expect(state.variables.size).toBe(0);
    expect(runner.waiting()).toEqual(["e1"]);
  });

  it("chains events through variables, in the map's order", async () => {
    const events = [
      ev(1, [["set_variable", "step:2"]], [["is", "variable_set", "step:1"]]),
      ev(2, [["translated_dialog", "two"], ["set_variable", "step:3"]], [["is", "variable_set", "step:2"]]),
      ev(3, [["set_variable", "step:1"]], [["not", "variable_set", "step"]]),
    ];
    const { h, said } = host();
    const state = new WorldState();
    await new EventRunner(events, state, h, { grade: 0, today: () => DAY }).start();
    expect(said).toEqual(["two"]);
    expect(state.variables.get("step")).toBe("3");
  });

  it("runs an event that still holds after it ran only once, and says so", async () => {
    const { h, said, warnings } = host();
    await new EventRunner([ev(1, [["translated_dialog", "again"]])], new WorldState(), h, { grade: 0, today: () => DAY }).start();
    expect(said).toEqual(["again"]);
    expect(warnings.join()).toMatch(/still holds/);
  });

  it("never takes coins away below zero", async () => {
    const { h } = host();
    const state = WorldState.fromDict({ money: 10 });
    await new EventRunner([ev(1, [["modify_money", "player", "-30"]], [["not", "variable_set", "x"]])], state, h, { grade: 0, today: () => DAY }).start();
    expect(state.money).toBe(0);
  });

  it("a step that fails ends its event, not the game", async () => {
    const { h, warnings } = host();
    const state = new WorldState();
    const events = [ev(1, [["modify_money", "rival", "5"], ["set_variable", "after:1"]]), ev(2, [["set_variable", "other:1"]])];
    await new EventRunner(events, state, h, { grade: 0, today: () => DAY }).start();
    expect(state.variables.has("after")).toBe(false);
    expect(state.variables.get("other")).toBe("1");
    expect(warnings.join()).toMatch(/stopped at modify_money/);
  });

  it("talks only to someone who exists on the map", async () => {
    const { h } = host();
    const runner = new EventRunner([ev(1, [["translated_dialog", "hi"]], [], "ghost")], new WorldState(), h, { grade: 0, today: () => DAY });
    await runner.start();
    expect(runner.talkable("ghost")).toBe(false);
    expect(await runner.talk("ghost")).toBe(false);
  });
});

describe("the world's saved state", () => {
  it("round-trips, and a damaged file starts afresh without made-up coins", () => {
    const w = new WorldState();
    w.addMoney(35);
    w.variables.set("b", "2");
    w.variables.set("a", "1");
    expect(w.toDict()).toEqual({ schema_version: 2, money: 35, variables: { a: "1", b: "2" } });
    expect(WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict()))).toDict()).toEqual(w.toDict());
    for (const bad of [null, [], "x", { money: -5 }, { money: "100" }, { money: Number.NaN, variables: [1] }]) {
      expect(WorldState.fromDict(bad).money).toBe(0);
    }
  });
});

describe("open_tutor", () => {
  const lab = readMap("nagmon_lab", JSON.parse(readFileSync("public/game/maps/nagmon_lab.json", "utf8")) as TiledMap);

  it("is an action the interpreter runs, so talking to the lab's tutor is not left waiting", () => {
    const ev = lab.events.find((e) => e.actions.some((a) => a.type === "open_tutor"));
    expect(ev).toBeDefined();
    expect(unknownActions(ev!)).toEqual([]);
  });

  it("greets, opens the tutor's lessons for the institute, and the map waits until it closes", async () => {
    const said: string[] = [];
    const opened: string[] = [];
    let close: () => void = () => {};
    const h: EventHost = {
      say: async (msgid) => void said.push(msgid),
      quiz: async () => {},
      changed: () => {},
      openTutor: (institute) => {
        opened.push(institute);
        return new Promise<void>((r) => (close = r));
      },
    };
    const runner = new EventRunner(lab.events, new WorldState(), h, { grade: 3, today: () => DAY });
    await runner.start();
    expect(runner.talkable("nagmon_house_tutor")).toBe(true);
    const talk = runner.talk("nagmon_house_tutor");
    await Promise.resolve();
    await Promise.resolve();
    expect(said).toEqual(["nagmon_world_lab_tutor"]);
    expect(opened).toEqual(["all"]);
    expect(runner.busy).toBe(true);
    close();
    await talk;
    expect(runner.busy).toBe(false);
  });

  it("a host with no tutor screen only logs it; the rest of the game goes on", async () => {
    const warnings: string[] = [];
    const h: EventHost = { say: async () => {}, quiz: async () => {}, changed: () => {}, warn: (m) => void warnings.push(m) };
    const runner = new EventRunner(lab.events, new WorldState(), h, { grade: 3, today: () => DAY });
    await runner.start();
    await runner.talk("nagmon_house_tutor");
    expect(warnings.join()).toContain("open_tutor");
  });
});
