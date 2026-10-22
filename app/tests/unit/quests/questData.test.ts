import { describe, expect, it } from "vitest";
import { noQuests, parseQuests, questData, questsAreEmpty, weakSubjects } from "../../../src/core/game/quests";
import { WorldState } from "../../../src/core/world/worldState";
import { ACTIONS } from "../../../src/core/world/events";
import { gameJson } from "../game/helpers";
import { data } from "./helpers";

describe("the shipped quests", () => {
  const d = data();

  it("reads 12 quests from many people, each with its steps and a reward", () => {
    expect(Object.keys(d.quests)).toHaveLength(12);
    expect(new Set(Object.values(d.quests).map((q) => q.giver)).size).toBeGreaterThanOrEqual(9);
    for (const q of Object.values(d.quests)) {
      expect(q.steps.length, q.id).toBeGreaterThan(0);
      expect(q.title, q.id).toBeTruthy();
      expect(q.offer.lines.length, q.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses only the actions the event interpreter already has: no new engine action", () => {
    for (const q of Object.values(d.quests))
      for (const s of q.steps)
        for (const line of [...s.enter, ...s.done]) expect(ACTIONS.has(line.split(" ")[0]!), `${q.id}: ${line}`).toBe(true);
  });

  it("takes every number from the data: the rules are read, not written in the code", () => {
    expect(d.rules).toMatchObject({ activeMax: 3, hintAfter: 2, lesserAfter: 3, lesserCoinsPct: 50, repeatFreePerWeek: 3, repeatCoinsPct: 60 });
    const raw = gameJson<{ rules: Record<string, unknown> }>("quests.json");
    const changed = questData({ ...raw, rules: { ...raw.rules, hint_after: 1, lesser_after: 4, lesser_coins_pct: 25, repeat_coins_pct: 10 } });
    expect(changed.rules).toMatchObject({ hintAfter: 1, lesserAfter: 4, lesserCoinsPct: 25, repeatCoinsPct: 10 });
  });

  it("has no score and no failing in the words a child reads", () => {
    const text = JSON.stringify(gameJson("quests.json"));
    for (const w of ["ניקוד", "נקודות", "ציון", "נכשל", "כישלון"]) expect(text).not.toContain(w);
  });

  it("leaves out a quest that cannot be read, and a build with none is a game with none", () => {
    expect(Object.keys(questData({ quests: { a: { giver: "x" }, b: null } }).quests)).toEqual([]);
    expect(Object.keys(questData(undefined).quests)).toEqual([]);
  });

  it("keeps no family detail: only the made-up people of the town", () => {
    const text = JSON.stringify(gameJson("quests.json"));
    expect(text).not.toMatch(/תמר|@|https?:/);
  });
});

describe("what a child's save keeps", () => {
  it("a world with no quests is the file it always was", () => {
    const w = WorldState.fromDict({ schema_version: 2, money: 3, variables: {} });
    expect(w.toDict()).not.toHaveProperty("quests");
    expect(questsAreEmpty(w.quests)).toBe(true);
  });

  it("round trips ids, days and counters and nothing else", () => {
    const q = noQuests();
    q.active["q_kitten_home"] = { step: 1, day: "2026-10-22", stepDay: "2026-10-22", wrong: 2, ent: 1 };
    q.done["q_wallet"] = { day: "2026-10-21", n: 1 };
    q.week = { w: 2900, n: 2 };
    q.log.push({ day: "2026-10-22", quest: "q_baker_double", type: "problem", giver: "nagmon_baker", variant: "v2" });
    q.vhist["q_baker_double"] = ["v2"];
    q.taken.push("q_baker_double@2026-10-22:v2");
    q.declined["q_kitten_home"] = "2026-10-22";
    const w = new WorldState();
    w.quests = q;
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict())));
    expect(back.quests).toEqual(q);
    // ids and numbers only: no name and no sentence anywhere in the saved quests
    expect(JSON.stringify(w.toDict().quests)).toMatch(/^[\x20-\x7e]*$/);
  });

  it("drops damaged entries and keeps the rest", () => {
    const q = parseQuests({
      active: { good: { step: 1, day: "2026-10-22" }, "bad id!": { step: 1, day: "2026-10-22" }, nodate: { step: 1, day: "x" } },
      done: { a: { day: "2026-01-01", n: "many" }, b: { day: "no" } },
      board: { day: "2026-10-22", cards: [{ id: "q@2026-10-22", quest: "q", slot: "easy" }, { id: "x", quest: "q", slot: "huge" }] },
      log: [{ day: "2026-10-22", quest: "q", type: "t", giver: "g" }, { quest: "q" }],
      week: { w: "x", n: -4 },
    });
    expect(Object.keys(q.active)).toEqual(["good"]);
    expect(q.done["a"]).toEqual({ day: "2026-01-01", n: 1 });
    expect(q.done["b"]).toBeUndefined();
    expect(q.board?.cards).toHaveLength(1);
    expect(q.log).toHaveLength(1);
    expect(q.week).toEqual({ w: 0, n: 0 });
  });
});

describe("the weakest subjects (local, never sent)", () => {
  it("are the two with the lowest share right, among subjects with enough answers", () => {
    const log = [
      ...Array.from({ length: 4 }, (_, i) => ({ subject: "math", correct: i < 1 })),
      ...Array.from({ length: 4 }, (_, i) => ({ subject: "english", correct: i < 2 })),
      ...Array.from({ length: 4 }, () => ({ subject: "science", correct: true })),
      { subject: "logic", correct: false },
    ];
    expect(weakSubjects(log)).toEqual(["math", "english"]);
    expect(weakSubjects([])).toEqual([]);
  });
});
