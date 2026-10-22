import { describe, expect, it } from "vitest";
import { addPoints, emptyRecord, levelFor, MAX_RECORD_BYTES, parseRecord, remember, setFlag, type NpcRecord } from "../../../src/core/world/memory";
import { DEFAULT_LEVELS } from "../../../src/core/world/npcs";
import { WorldState } from "../../../src/core/world/worldState";

const LEVELS = DEFAULT_LEVELS;

describe("friendship", () => {
  it("is level 0 to 3 by the points, at 0, 4, 10 and 20", () => {
    expect([0, 3, 4, 9, 10, 19, 20, 500].map((p) => levelFor(p, LEVELS))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("never decreases: no negative or odd number takes a point or a level away", () => {
    const r = emptyRecord();
    addPoints(r, 12, LEVELS);
    expect([r.pts, r.lvl]).toEqual([12, 2]);
    for (const bad of [-5, 0, NaN, Infinity, -Infinity, 1.7]) addPoints(r, bad, LEVELS);
    expect(r.pts).toBeGreaterThanOrEqual(12);
    expect(r.lvl).toBe(2);
    // a level stays even if the levels in the data later move up
    addPoints(r, 1, [0, 40, 80, 120]);
    expect(r.lvl).toBe(2);
  });
});

describe("the anti-repeat ring", () => {
  it("keeps the last 8 line ids, newest last, each once", () => {
    const r = emptyRecord();
    for (let i = 0; i < 12; i++) remember(r, `a.gf.${i}`);
    expect(r.recent).toEqual(["a.gf.4", "a.gf.5", "a.gf.6", "a.gf.7", "a.gf.8", "a.gf.9", "a.gf.10", "a.gf.11"]);
    remember(r, "a.gf.5");
    expect(r.recent.filter((x) => x === "a.gf.5")).toHaveLength(1);
    expect(r.recent.at(-1)).toBe("a.gf.5");
    expect(r.recent).toHaveLength(8);
  });
});

describe("flags", () => {
  it("only the person's own list, at most 12, once each", () => {
    const r = emptyRecord();
    const allowed = Array.from({ length: 20 }, (_, i) => `f${i}`);
    setFlag(r, "nope", allowed);
    expect(r.flags).toEqual([]);
    for (const f of allowed) setFlag(r, f, allowed);
    setFlag(r, "f3", allowed);
    expect(r.flags).toHaveLength(12);
    expect(new Set(r.flags).size).toBe(12);
  });
});

describe("the saved record", () => {
  const full: NpcRecord = {
    pts: 7,
    lvl: 1,
    met: 5,
    last: "2026-10-22",
    gift_day: "2026-10-21",
    td: 2,
    tn: 1,
    flags: ["asked_weather", "helped_wallet", "likes_berry_seen", "asked_town"],
    recent: ["rina.greet_again.007", "rina.idle.012", "rina.greet_first.003", "rina.farewell.004", "rina.t-weather.002", "rina.idle.002", "rina.idle.005", "rina.greet_again.011"],
    quests: { q_tea_chain: 2 },
  };

  it("is about 250 bytes, and its worst case stays under the cap", () => {
    const size = JSON.stringify(full).length;
    expect(size).toBeLessThan(MAX_RECORD_BYTES);
    expect(size).toBeLessThan(450);
    // the worst a record can be made: every field full of the longest ids
    const worst = parseRecord({
      pts: 99999,
      lvl: 3,
      met: 99999,
      last: "2026-10-22",
      gift_day: "2026-10-22",
      td: 99,
      tn: 99,
      flags: Array.from({ length: 12 }, (_, i) => `a_long_flag_name_${i}_xxxxxxxxxxxx`),
      recent: Array.from({ length: 8 }, (_, i) => `${"x".repeat(26)}.${i}`),
      quests: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`q_chain_${i}_xxxxxxxxxxxx`, 3])),
    })!;
    expect(JSON.stringify(worst).length).toBeLessThanOrEqual(MAX_RECORD_BYTES);
    // what was dropped to fit is the oldest flags and the quests, never the ring
    expect(worst.recent).toHaveLength(8);
  });

  it("reads back what it wrote", () => {
    expect(parseRecord(JSON.parse(JSON.stringify(full)))).toEqual(full);
  });

  it("holds no free text: only short ids, numbers and dates survive a read", () => {
    const r = parseRecord({
      pts: 3,
      lvl: 0,
      met: 1,
      last: "yesterday I told Dana about my family",
      gift_day: 7,
      flags: ["ok_flag", "this is a whole sentence with spaces", "x".repeat(200), 5],
      recent: ["ok.id.1", "שלום זה טקסט חופשי", "a b"],
      quests: { fine: 2, "free text here": 1, q: "no" },
      name: "Noa",
      note: "the child said hello",
    })!;
    expect(r.last).toBeNull();
    expect(r.gift_day).toBeUndefined();
    expect(r.flags).toEqual(["ok_flag"]);
    expect(r.recent).toEqual(["ok.id.1"]);
    expect(r.quests).toEqual({ fine: 2 });
    expect(Object.keys(r)).not.toContain("name");
    expect(JSON.stringify(r)).not.toMatch(/Noa|hello|family/);
  });

  it("is dropped when it is not an object, and numbers that are not numbers are zero", () => {
    for (const bad of [null, 3, "x", [], undefined]) expect(parseRecord(bad)).toBeNull();
    const r = parseRecord({ pts: "9", lvl: -2, met: 1.5 })!;
    expect([r.pts, r.lvl, r.met]).toEqual([0, 0, 1]);
  });
});

describe("in the world's save", () => {
  it("v1 saves load, migrate to 2 and keep coins, items, creatures and variables as they were", () => {
    const old = {
      schema_version: 1,
      money: 35,
      variables: { a: "1", nagmon_daily_cashier: "2026-10-22:2" },
      items: { berry: 3, magic_net: 2 },
      creatures: [{ id: "c1", species: "heliobud", level: 7, xp: 4, hearts: 2, name: "Pipi" }],
      seen: ["heliobud"],
      caught: ["heliobud"],
    };
    const before = JSON.stringify(old);
    const w = WorldState.fromDict(JSON.parse(before));
    expect(w.npcs.size).toBe(0);
    const out = w.toDict() as unknown as Record<string, unknown>;
    expect(out["schema_version"]).toBe(2);
    expect(out).not.toHaveProperty("npcs");
    // each kept thing is the same bytes (the keys of the file may sit in another order)
    for (const k of ["money", "variables", "items", "creatures", "seen", "caught"] as const) {
      expect(JSON.stringify(out[k])).toBe(JSON.stringify(old[k]));
    }
    expect(Object.keys(out).sort()).toEqual([...Object.keys(old)].sort());
  });

  it("keeps the people's records, and the seed, and cleans anything that is not an id", () => {
    const w = new WorldState();
    w.npcs.set("nagmon_granny", { ...emptyRecord(), pts: 5, lvl: 1, met: 2, last: "2026-10-22", recent: ["rina.gf.1"] });
    w.npcSeed = 123456;
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict())));
    expect(back.npcs.get("nagmon_granny")?.pts).toBe(5);
    expect(back.npcSeed).toBe(123456);
    const dirty = WorldState.fromDict({ money: 0, npcs: { good: { pts: 1 }, "has space": { pts: 1 }, junk: 4 }, npc_seed: "abc" });
    expect([...dirty.npcs.keys()]).toEqual(["good"]);
    expect(dirty.npcSeed).toBeNull();
  });

  it("holds no child's name or free text in the saved people (grep)", () => {
    const w = new WorldState();
    const r = emptyRecord();
    remember(r, "danny.gf.003");
    setFlag(r, "asked_weather", ["asked_weather"]);
    w.npcs.set("nagmon_route1_trainer", r);
    const text = JSON.stringify(w.toDict());
    expect(text).not.toMatch(/[֐-׿]/);
  });
});
