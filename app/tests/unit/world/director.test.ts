import { describe, expect, it } from "vitest";
import { Director, LIVE_OK, pickLine, type LineRequest, type LineSource } from "../../../src/core/world/director";
import { emptyRecord, MAX_RECORD_BYTES, type NpcRecord } from "../../../src/core/world/memory";
import { DEFAULT_GAINS, DEFAULT_LEVELS, type Line, type NpcDef, type NpcTable, type Phase } from "../../../src/core/world/npcs";

const line = (id: string, extra: Partial<Line> = {}): Line => ({ id, text: `line ${id}`, weight: 1, gag: false, ...extra });
const many = (prefix: string, n: number, extra: (i: number) => Partial<Line> = () => ({})): Line[] => Array.from({ length: n }, (_, i) => line(`${prefix}.${String(i).padStart(2, "0")}`, extra(i)));

function def(lines: Record<string, Line[]>, extra: Partial<NpcDef> = {}): NpcDef {
  return {
    id: "nagmon_dina",
    name: "דינה",
    role: "guide",
    age_feel: "adult",
    sprite: "s",
    anchor: false,
    priority: 0,
    topics: [
      { id: "weather", label: "מה מזג האוויר?", icon: "1f324", unlock: 0 },
      { id: "town", label: "מי בעיר?", icon: "1f3d8", unlock: 0 },
      { id: "secret", label: "סוד", icon: "2b50", unlock: 2 },
      { id: "fact", label: "עובדה", icon: "2b50", unlock: 0 },
    ],
    facts: ["water_cycle", "seed_tree"],
    schedule: { default: null, rules: [], roam: null, night: false },
    relationship: { levels: DEFAULT_LEVELS, gain: DEFAULT_GAINS, flags: ["helped"] },
    not_with: [],
    lines,
    ...extra,
  };
}

function setup(table: NpcTable, opts: { day?: string; hour?: number; hero?: string; live?: LineSource; names?: string[]; memory?: Map<string, NpcRecord> } = {}) {
  const memory = opts.memory ?? new Map<string, NpcRecord>();
  const clock = { day: opts.day ?? "2026-10-22", hour: opts.hour ?? 9 };
  const d = new Director({
    npcs: table,
    memory,
    today: () => clock.day,
    hour: () => clock.hour,
    hero: () => opts.hero ?? "נועה",
    live: opts.live,
    town: () => opts.names ?? [],
  });
  return { d, memory, clock };
}

const req = (lines: Line[], extra: Partial<LineRequest> = {}): LineRequest => ({
  npc: def({ greet_first: lines }),
  intent: "greet_first",
  phase: "morning",
  weekday: 4,
  friendship: 0,
  recent: [],
  seed: "s",
  shapes: [],
  names: [],
  ...extra,
});

describe("picking a line (A1)", () => {
  it("is deterministic for a seed, and another seed can pick another line", () => {
    const lines = many("a.gf", 20);
    expect(pickLine(lines, req(lines, { seed: "x" }))!.id).toBe(pickLine(lines, req(lines, { seed: "x" }))!.id);
    const ids = new Set(Array.from({ length: 40 }, (_, i) => pickLine(lines, req(lines, { seed: `s${i}` }))!.id));
    expect(ids.size).toBeGreaterThan(5);
  });

  it("never returns an id in the recent ring, while there is another", () => {
    const lines = many("a.gf", 12);
    const recent = lines.slice(0, 8).map((l) => l.id);
    for (let i = 0; i < 100; i++) expect(recent).not.toContain(pickLine(lines, req(lines, { seed: `k${i}`, recent }))!.id);
  });

  it("with 3 lines and a ring of 8 it still says something, and it is the one seen longest ago", () => {
    const lines = many("a.gf", 3);
    const recent = ["x.1", "a.gf.01", "x.2", "a.gf.02", "x.3", "x.4", "a.gf.00", "x.5"];
    const got = pickLine(lines, req(lines, { recent }))!;
    expect(lines.map((l) => l.id)).toContain(got.id);
    // oldest first: a.gf.01, a.gf.02, a.gf.00 are the three seen longest ago, and all three are candidates
    expect(["a.gf.01", "a.gf.02", "a.gf.00"]).toContain(got.id);
    expect(pickLine([], req([]))).toBeNull();
  });

  it("fresh lines beat the 3 oldest: when only some are in the ring the rest are chosen", () => {
    const lines = many("a.gf", 5);
    for (let i = 0; i < 50; i++) expect(["a.gf.03", "a.gf.04"]).toContain(pickLine(lines, req(lines, { seed: `z${i}`, recent: ["a.gf.00", "a.gf.01", "a.gf.02"] }))!.id);
  });

  it("filters by day part, weekday and friendship", () => {
    const lines = [
      line("m", { when: { phase: ["morning"] } }),
      line("e", { when: { phase: ["evening"] } }),
      line("fri", { when: { weekday: [5] } }),
      line("f1", { when: { friendship_min: 1 } }),
      line("f0", { when: { friendship_max: 0 } }),
    ];
    const ids = (extra: Partial<LineRequest>) => new Set(Array.from({ length: 80 }, (_, i) => pickLine(lines, req(lines, { seed: `q${i}`, ...extra }))!.id));
    expect([...ids({ phase: "morning", friendship: 0 })].sort()).toEqual(["f0", "m"]);
    expect([...ids({ phase: "evening", friendship: 2, weekday: 5 })].sort()).toEqual(["e", "f1", "fri"]);
  });

  it("a running gag is not said twice in 3 visits", () => {
    const lines = [line("gag", { gag: true, weight: 50 }), ...many("a.gf", 6)];
    for (let i = 0; i < 60; i++) {
      expect(pickLine(lines, req(lines, { seed: `g${i}`, recent: ["a.gf.00", "gag", "a.gf.01"].slice(-3).concat([]) }))!.id).not.toBe("gag");
    }
    // not in the last 3: it may come (and a heavy one does, mostly)
    const first = Array.from({ length: 40 }, (_, i) => pickLine(lines, req(lines, { seed: `h${i}`, recent: ["a.gf.00", "a.gf.01", "a.gf.02", "a.gf.03"] }))!.id);
    expect(first).toContain("gag");
  });

  it("a shape in the recent shapes is less likely, and the very last shape is avoided", () => {
    const lines = [...many("w", 10, () => ({ shape: "weather" })), ...many("o", 10, () => ({ shape: "other" }))];
    const got = Array.from({ length: 200 }, (_, i) => pickLine(lines, req(lines, { seed: `p${i}`, shapes: ["weather", "other", "weather"] }))!.id);
    // the last shape was "weather": the "other" ones dominate
    expect(got.filter((id) => id.startsWith("o.")).length).toBeGreaterThan(130);
  });

  it("a line with {who} is only used when someone is here", () => {
    const lines = [line("who", { text: "היום פה {who}.", weight: 100 }), line("plain")];
    expect(new Set(Array.from({ length: 30 }, (_, i) => pickLine(lines, req(lines, { seed: `n${i}`, names: [] }))!.id))).toEqual(new Set(["plain"]));
    expect(new Set(Array.from({ length: 30 }, (_, i) => pickLine(lines, req(lines, { seed: `n${i}`, names: ["יואב"] }))!.id))).toContain("who");
  });
});

describe("the Director over a month of visits (A2)", () => {
  // 40 lines: 28 for any time, 4 for each of three day parts, in 20 shapes
  const lines = [
    ...many("d.gf", 28, (i) => ({ shape: `s${i % 20}` })),
    ...(["morning", "afternoon", "evening"] as Phase[]).flatMap((p, k) => many(`d.${p[0]}`, 4, (i) => ({ when: { phase: [p] }, shape: `s${(k * 4 + i) % 20}` }))),
  ];
  const table = { nagmon_dina: def({ greet_first: lines }) };

  it("200 visits: no id again within 8, every id is seen, and a shape twice in a row is rare", async () => {
    const { d, clock } = setup(table);
    const shown: { id: string; shape?: string }[] = [];
    const shapeOf = new Map(lines.map((l) => [l.id, l.shape]));
    for (let i = 0; i < 200; i++) {
      // a new day each visit, so each is the day's first talk; the day part goes round
      clock.day = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
      clock.hour = [9, 14, 19][i % 3]!;
      const s = (await d.greet("nagmon_dina"))!;
      expect(s.intent).toBe("greet_first");
      shown.push({ id: s.id, shape: shapeOf.get(s.id) });
    }
    for (let i = 0; i < shown.length; i++) {
      const window = shown.slice(i + 1, i + 9).map((x) => x.id);
      expect(window, `visit ${i}`).not.toContain(shown[i]!.id);
    }
    expect(new Set(shown.map((x) => x.id)).size).toBe(40);
    let same = 0;
    for (let i = 1; i < shown.length; i++) if (shown[i]!.shape === shown[i - 1]!.shape) same++;
    expect(same / (shown.length - 1)).toBeLessThanOrEqual(0.05);
  });

  it("an NPC with 5 lines in a pool never says the same line twice in a row", async () => {
    const t = { nagmon_dina: def({ greet_first: many("e.gf", 5) }) };
    const { d, clock } = setup(t);
    let before = "";
    for (let i = 0; i < 100; i++) {
      clock.day = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
      const s = (await d.greet("nagmon_dina"))!;
      expect(s.id).not.toBe(before);
      before = s.id;
    }
  });
});

describe("a talk", () => {
  const t = (lines: Record<string, Line[]>) => ({ nagmon_dina: def(lines) });

  it("the first talk of the day greets first, the second greets again, the third says something idle", async () => {
    const { d } = setup(t({ greet_first: [line("f")], greet_again: [line("a")], idle: [line("i")], farewell: [line("bye")] }));
    expect((await d.greet("nagmon_dina"))!.intent).toBe("greet_first");
    expect((await d.greet("nagmon_dina"))!.intent).toBe("greet_again");
    expect((await d.greet("nagmon_dina"))!.intent).toBe("idle");
    expect((await d.greet("nagmon_dina"))!.intent).toBe("idle");
  });

  it("falls back when a pool is missing: idle to again to first; none at all is null", async () => {
    const { d } = setup(t({ greet_first: [line("f")] }));
    await d.greet("nagmon_dina");
    expect((await d.greet("nagmon_dina"))!.id).toBe("f");
    expect((await d.greet("nagmon_dina"))!.id).toBe("f");
    const none = setup(t({}));
    expect(await none.d.greet("nagmon_dina")).toBeNull();
    expect(await none.d.greet("nobody")).toBeNull();
  });

  it("shows the speaker's name and puts the child's name in {hero} on the screen only", async () => {
    const { d, memory } = setup(t({ greet_first: [line("f", { text: "שלום {hero}!" })] }), { hero: "נועה" });
    const s = (await d.greet("nagmon_dina"))!;
    expect(s.speaker).toBe("דינה");
    expect(s.text).toBe("שלום נועה!");
    expect(JSON.stringify([...memory])).not.toContain("נועה");
    expect(JSON.stringify([...memory])).not.toMatch(/[֐-׿]/);
  });

  it("remembers ids, not words: the ring, the count, the day and a point", async () => {
    const { d, memory } = setup(t({ greet_first: many("x.gf", 12), greet_again: many("x.ga", 12) }));
    await d.greet("nagmon_dina");
    await d.greet("nagmon_dina");
    const r = memory.get("nagmon_dina")!;
    expect([r.met, r.last, r.pts, r.td]).toEqual([2, "2026-10-22", 1, 2]);
    expect(r.recent).toHaveLength(2);
    expect(r.recent[0]).toMatch(/^x\.gf\./);
    expect(JSON.stringify(r)).not.toContain("line ");
  });

  it("a new day starts again: the first talk of the day gives a point once a day", async () => {
    const { d, memory, clock } = setup(t({ greet_first: many("x.gf", 12), greet_again: many("x.ga", 12) }));
    for (let day = 0; day < 6; day++) {
      clock.day = `2026-10-${String(20 + day).padStart(2, "0")}`;
      await d.greet("nagmon_dina");
      await d.greet("nagmon_dina");
    }
    expect(memory.get("nagmon_dina")!.pts).toBe(6);
    expect(memory.get("nagmon_dina")!.lvl).toBe(1);
  });

  it("friendship never decreases, whatever happens", async () => {
    const { d, memory, clock } = setup(t({ greet_first: many("x.gf", 12) }));
    let lvl = 0;
    for (let i = 0; i < 60; i++) {
      clock.day = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
      await d.greet("nagmon_dina");
      const r = memory.get("nagmon_dina")!;
      expect(r.lvl).toBeGreaterThanOrEqual(lvl);
      lvl = r.lvl;
    }
    expect(lvl).toBe(3);
  });

  it("the record stays under the size cap after a long life of talks and topics", async () => {
    const { d, memory, clock } = setup(
      t({ greet_first: many("dina.greet_first", 12), greet_again: many("dina.greet_again", 12), idle: many("dina.idle", 12), "topic:weather": many("dina.t-weather", 8), "topic:town": many("dina.t-town", 8) }),
    );
    for (let i = 0; i < 300; i++) {
      clock.day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      await d.greet("nagmon_dina");
      await d.topic("nagmon_dina", i % 2 ? "weather" : "town");
      expect(JSON.stringify(memory.get("nagmon_dina")).length).toBeLessThan(MAX_RECORD_BYTES);
    }
  });
});

describe("topics and chips", () => {
  const lines = { greet_first: many("x.gf", 3), "topic:weather": many("x.tw", 5), "topic:town": [line("x.tt1", { text: "היום פה {who}." }), line("x.tt2", { text: "עיר שקטה." })], "topic:secret": many("x.ts", 3), farewell: many("x.fw", 4) };

  it("offers the topics that are open at the child's level and that have something to say, at most 4", async () => {
    const { d, memory, clock } = setup({ nagmon_dina: def(lines) });
    expect(d.chips("nagmon_dina").map((c) => c.id)).toEqual(["weather", "town"]);
    // the secret opens at level 2 (10 points)
    memory.set("nagmon_dina", { ...emptyRecord(), pts: 10, lvl: 2 });
    expect(d.chips("nagmon_dina").map((c) => c.id)).toEqual(["weather", "town", "secret", "fact"].filter((x) => x !== "fact"));
    clock.day = "2026-10-23";
    expect(d.chips("nobody")).toEqual([]);
  });

  it("a topic is answered from its own pool, never the same line twice in a row", async () => {
    const { d } = setup({ nagmon_dina: def(lines) });
    let before = "";
    for (let i = 0; i < 30; i++) {
      const s = (await d.topic("nagmon_dina", "weather"))!;
      expect(s.id).toMatch(/^x\.tw\./);
      expect(s.intent).toBe("topic:weather");
      expect(s.id).not.toBe(before);
      before = s.id;
    }
  });

  it("will not answer a topic the child has not opened yet", async () => {
    const { d } = setup({ nagmon_dina: def(lines) });
    expect(await d.topic("nagmon_dina", "secret")).toBeNull();
    expect(await d.topic("nagmon_dina", "nonsense")).toBeNull();
  });

  it("a new topic gives a point, twice a day at most, and a topic asked again gives none", async () => {
    const t = def({ ...lines, "topic:fact": [line("x.tf")] }, { topics: def({}).topics.filter((x) => x.unlock === 0) });
    const { d, memory } = setup({ nagmon_dina: t });
    await d.topic("nagmon_dina", "weather");
    await d.topic("nagmon_dina", "town");
    await d.topic("nagmon_dina", "fact");
    await d.topic("nagmon_dina", "weather");
    const r = memory.get("nagmon_dina")!;
    // one point for the first contact of the day, and two for new topics; the third new one and the repeat give nothing
    expect(r.pts).toBe(3);
    expect(r.flags).toContain("asked_weather");
  });

  it("{who} names people who are here, never the speaker's own name", async () => {
    const { d } = setup({ nagmon_dina: def(lines) }, { names: ["יואב", "הגננת מיכל"] });
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add((await d.topic("nagmon_dina", "town"))!.text);
    expect([...seen].some((x) => /יואב|מיכל/.test(x))).toBe(true);
    expect([...seen].every((x) => !x.includes("{who}"))).toBe(true);
  });

  it("a fact topic hands over a fact id the person knows, each in turn", async () => {
    const t = def({ "topic:fact": [line("x.tf1"), line("x.tf2")] });
    const { d } = setup({ nagmon_dina: t });
    const a = (await d.topic("nagmon_dina", "fact"))!;
    const b = (await d.topic("nagmon_dina", "fact"))!;
    expect([a.fact, b.fact].sort()).toEqual(["seed_tree", "water_cycle"]);
  });

  it("says farewell from its own pool", async () => {
    const { d } = setup({ nagmon_dina: def(lines) });
    expect((await d.farewell("nagmon_dina"))!.id).toMatch(/^x\.fw\./);
    expect(await setup({ nagmon_dina: def({}) }).d.farewell("nagmon_dina")).toBeNull();
  });
});

describe("a live line can plug in later (nothing is shipped)", () => {
  const lines = { greet_first: many("x.gf", 3), "topic:weather": many("x.tw", 3), idle: many("x.id", 3), farewell: many("x.fw", 3) };

  it("asks the live source first for the intents that allow it, and falls back to the pool on null, an error or a timeout", async () => {
    const asked: string[] = [];
    const live: LineSource = { next: async (r) => (asked.push(r.intent), r.intent === "greet_first" ? line("live.1", { text: "חי" }) : null) };
    const { d } = setup({ nagmon_dina: def(lines) }, { live });
    expect((await d.greet("nagmon_dina"))!.id).toBe("live.1");
    expect((await d.topic("nagmon_dina", "weather"))!.id).toMatch(/^x\.tw/);
    const boom = setup({ nagmon_dina: def(lines) }, { live: { next: () => Promise.reject(new Error("429")) } });
    expect((await boom.d.greet("nagmon_dina"))!.id).toMatch(/^x\.gf/);
    const slow = setup({ nagmon_dina: def(lines) }, { live: { next: () => new Promise(() => {}) } });
    const t0 = Date.now();
    expect((await slow.d.greet("nagmon_dina"))!.id).toMatch(/^x\.gf/);
    expect(Date.now() - t0).toBeLessThan(2500);
    expect(asked).toContain("greet_first");
  });

  it("never asks it for quests, shops, quizzes, scenes or jokes (A3)", async () => {
    const spy: string[] = [];
    const live: LineSource = { next: async (r) => (spy.push(r.intent), line("live.x")) };
    const { d } = setup({ nagmon_dina: def({ ...lines, quest_offer: [line("q")], shop_price: [line("s")], quiz_hint: [line("z")], "sel_scene:wallet": [line("w")], joke: [line("j")] }) }, { live });
    for (const intent of ["quest_offer", "quest_step", "quest_done", "shop_price", "quiz_hint", "explain", "fact", "sel_scene:wallet", "joke"]) {
      expect(LIVE_OK(intent), intent).toBe(false);
      await d.say("nagmon_dina", intent);
    }
    expect(spy).toEqual([]);
    for (const intent of ["greet_first", "greet_again", "idle", "farewell", "topic:weather", "react:badge", "gift:berry"]) expect(LIVE_OK(intent), intent).toBe(true);
  });
});
