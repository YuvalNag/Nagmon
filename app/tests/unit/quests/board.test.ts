import { describe, expect, it } from "vitest";
import { boardFor, cardId, parseCardId, slotsOf } from "../../../src/core/game/boardGen";
import { isEligible, noQuests, type QuestSave, weekCount } from "../../../src/core/game/quests";
import { dayOfWeek } from "../../../src/core/game/dayPick";
import { addDays } from "../../../src/core/world/rand";
import { accept } from "../../../src/core/game/board";
import { WorldState } from "../../../src/core/world/worldState";
import { data, rig } from "./helpers";
import type { QuestData } from "../../../src/core/game/quests";

const d = data();

/** A child who finishes some of what is posted: every day the first card that is a pool or weekly quest is done. */
function simulate(days: number, opts: { grade?: number; seed?: number; weak?: string[]; finish?: boolean } = {}) {
  const save: QuestSave = noQuests();
  let day = "2026-10-01";
  const out: { day: string; cards: ReturnType<typeof boardFor> }[] = [];
  for (let i = 0; i < days; i++) {
    const cards = boardFor(d, save, { today: day, grade: opts.grade ?? 2, seed: opts.seed ?? 7, weak: opts.weak ?? [] });
    out.push({ day, cards: cards.map((c) => ({ ...c })) });
    if (opts.finish !== false) {
      // the child takes and finishes every card of the day (once-only quests are then gone for good)
      for (const c of cards) {
        const q = d.quests[c.quest]!;
        save.done[q.id] = { day, n: (save.done[q.id]?.n ?? 0) + 1 };
      }
    }
    day = addDays(day, 1);
  }
  return { save, days: out };
}

describe("the board's card ids", () => {
  it("round trip a quest, a day and a variant", () => {
    expect(cardId("q_baker_double", "2026-10-22", "v3")).toBe("q_baker_double@2026-10-22:v3");
    expect(parseCardId("q_baker_double@2026-10-22:v3")).toEqual({ quest: "q_baker_double", day: "2026-10-22", variant: "v3" });
    expect(parseCardId("q_wallet@2026-10-22")).toEqual({ quest: "q_wallet", day: "2026-10-22" });
    expect(parseCardId("board_easy_book")).toBeNull();
  });
});

describe("the board generator: 100 simulated days", () => {
  const sim = simulate(100);
  const all = sim.days.flatMap((x) => x.cards.map((c) => ({ day: x.day, ...c, def: d.quests[c.quest]! })));

  it("posts something every day of the first days even for a child who finishes everything at once, at most one card of each slot (two easy once the board is mended) and the weekly card on Sundays only", () => {
    for (const day of sim.days.slice(0, 5)) expect(day.cards.length, day.day).toBeGreaterThan(0);
    for (const day of sim.days) {
      for (const slot of ["normal", "learning", "weekly"] as const) expect(day.cards.filter((c) => c.slot === slot).length, `${day.day} ${slot}`).toBeLessThanOrEqual(1);
      if (dayOfWeek(day.day) !== 0) expect(day.cards.some((c) => c.slot === "weekly")).toBe(false);
      // a card is for a quest that names that slot on the board
      for (const c of day.cards) expect(d.quests[c.quest]!.board?.slot).toBe(c.slot);
    }
  });

  it("never posts the same type twice in a day", () => {
    for (const day of sim.days) {
      const types = day.cards.map((c) => d.quests[c.quest]!.type);
      expect(new Set(types).size, day.day).toBe(types.length);
    }
  });

  it("never posts the same giver twice in a day, and never in two consecutive postings", () => {
    const seq = all.map((c) => c.def.giver);
    for (let i = 1; i < seq.length; i++) expect(seq[i], `posting ${i}`).not.toBe(seq[i - 1]);
    for (const day of sim.days) {
      const givers = day.cards.map((c) => d.quests[c.quest]!.giver);
      expect(new Set(givers).size, day.day).toBe(givers.length);
    }
  });

  it("keeps a giver to at most giver_week_max postings a week", () => {
    const byWeek = new Map<string, number>();
    for (const c of all) {
      const key = `${Math.floor((Date.parse(c.day) / 86_400_000 + 4) / 7)}|${c.def.giver}`;
      byWeek.set(key, (byWeek.get(key) ?? 0) + 1);
    }
    for (const [k, n] of byWeek) expect(n, k).toBeLessThanOrEqual(d.rules.board.giverWeekMax);
  });

  it("never posts a variant inside its cooldown (the last variant_cooldown postings of its quest)", () => {
    const cool = d.rules.board.variantCooldown;
    for (const q of Object.values(d.quests).filter((x) => x.variants.length)) {
      const mine = all.filter((c) => c.quest === q.id).map((c) => c.variant);
      expect(mine.length).toBeGreaterThan(0);
      for (let i = 0; i < mine.length; i++) for (let j = Math.max(0, i - cool); j < i; j++) expect(mine[i], `${q.id} posting ${i} against ${j}`).not.toBe(mine[j]);
    }
  });

  it("never posts a once-only quest after it was finished", () => {
    const first = new Map<string, string>();
    for (const c of all) {
      if (d.quests[c.quest]!.repeat.kind !== "once") continue;
      if (first.has(c.quest)) throw new Error(`${c.quest} came again on ${c.day}, after ${first.get(c.quest)}`);
      first.set(c.quest, c.day);
    }
  });

  it("makes the same board for the same day however often it is asked, and another for another seed", () => {
    const save = noQuests();
    const a = boardFor(d, save, { today: "2026-10-22", grade: 2, seed: 1 });
    expect(boardFor(d, save, { today: "2026-10-22", grade: 2, seed: 1 })).toEqual(a);
    // asked again after the history moved on, the day's saved cards still stand
    expect(boardFor(d, save, { today: "2026-10-22", grade: 2, seed: 99 })).toEqual(a);
    const days = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) days.add(boardFor(d, noQuests(), { today: "2026-10-23", grade: 2, seed }).map((c) => c.id).join());
    expect(days.size).toBeGreaterThan(1);
  });

  it("decides by the day and the seed alone (no clock): a fresh run gives the same 100 days", () => {
    expect(simulate(30).days).toEqual(sim.days.slice(0, 30));
  });
});

describe("what the board needs of the quests", () => {
  it("every quest that is on the board has a slot, a goal and a giver of its own kind", () => {
    const onBoard = Object.values(d.quests).filter((q) => q.board);
    expect(onBoard.length).toBeGreaterThanOrEqual(8);
    for (const slot of ["easy", "normal", "learning"] as const) expect(new Set(onBoard.filter((q) => q.board!.slot === slot).map((q) => q.giver)).size, slot).toBeGreaterThanOrEqual(2);
    expect(onBoard.some((q) => q.board!.slot === "weekly")).toBe(true);
  });

  it("a quest mended-board unlocks a 4th card", () => {
    const save = noQuests();
    expect(slotsOf(d, save, "2026-10-22")).toEqual(["easy", "normal", "learning"]);
    save.done["q_board_fix"] = { day: "2026-10-20", n: 1 };
    expect(slotsOf(d, save, "2026-10-22")).toEqual(["easy", "easy", "normal", "learning"]);
    expect(slotsOf(d, save, "2026-10-25")).toContain("weekly");
  });

});

/** A pool of made-up quests (clones of one), so a rule can be seen where the real pool is small. */
function synth(spec: { slot: "easy" | "normal" | "learning" | "weekly"; subject: string }[]): QuestData {
  const base = d.quests["q_clock_set"]!;
  const quests: QuestData["quests"] = {};
  spec.forEach((x, i) => {
    quests[`s${i}`] = { ...base, id: `s${i}`, giver: `giver${i}`, type: `type${i}`, subject: x.subject, board: { slot: x.slot, goal: `goal ${i}` }, repeat: { kind: "daily", cooldownDays: 0, variantCooldown: 0 }, variants: [] };
  });
  return { rules: d.rules, quests };
}

describe("rules a small pool cannot show", () => {
  it("holds a giver out of the last giver_gap postings when the pool allows it", () => {
    const spec = (["easy", "normal", "learning"] as const).flatMap((slot) => Array.from({ length: 5 }, () => ({ slot, subject: "math" })));
    const big = synth(spec);
    const save = noQuests();
    const seq: string[] = [];
    let day = "2026-10-01";
    for (let i = 0; i < 100; i++) {
      for (const c of boardFor(big, save, { today: day, grade: 2, seed: 5 })) seq.push(big.quests[c.quest]!.giver);
      day = addDays(day, 1);
    }
    const gap = big.rules.board.giverGap;
    expect(seq.length).toBeGreaterThan(250);
    for (let i = 0; i < seq.length; i++) for (let j = Math.max(0, i - gap); j < i; j++) expect(seq[i], `posting ${i} against ${j}`).not.toBe(seq[j]);
  });

  it("sends at least weak_pct of the learning cards to the weak subject: more than chance when the subject is rare", () => {
    const pool = synth([{ slot: "learning", subject: "math" }, { slot: "learning", subject: "math" }, { slot: "learning", subject: "english" }]);
    const share = (weak: string[]) => {
      let hit = 0;
      for (let seed = 1; seed <= 3000; seed++) {
        const c = boardFor(pool, noQuests(), { today: "2026-10-22", grade: 2, seed, weak }).find((x) => x.slot === "learning");
        if (pool.quests[c!.quest]!.subject === "english") hit += 1;
      }
      return hit / 3000;
    };
    const none = share([]);
    const weak = share(["english"]);
    // a third by chance; weak_pct (40%) when the child's weak subject is english; never less
    expect(none).toBeGreaterThan(0.3);
    expect(none).toBeLessThan(0.37);
    expect(weak).toBeGreaterThan(0.37);
    expect(weak).toBeLessThan(0.44);
    // and the weak subject is never starved when it is the common one
    const math = (() => {
      let hit = 0;
      for (let seed = 1; seed <= 3000; seed++) {
        const c = boardFor(pool, noQuests(), { today: "2026-10-22", grade: 2, seed, weak: ["math"] }).find((x) => x.slot === "learning");
        if (pool.quests[c!.quest]!.subject === "math") hit += 1;
      }
      return hit / 3000;
    })();
    expect(math).toBeGreaterThan(0.6);
  });
});

describe("accepting a card at the board", () => {
  it("is free and kept: the quest engine turns the accepted card into a quest card of the journal", () => {
    const r = rig();
    const [first] = r.engine.postings();
    expect(first).toBeDefined();
    expect(accept(r.world, first!.id, r.day.v)).toBe(true);
    expect(r.world.money).toBe(0);
    const started = r.engine.syncBoard();
    expect(started.map((q) => q.id)).toEqual([first!.quest]);
    expect(r.engine.journal().map((c) => c.id)).toEqual([first!.quest]);
    // the same card is not taken twice
    expect(r.engine.syncBoard()).toEqual([]);
    expect(accept(r.world, first!.id, r.day.v)).toBe(false);
    // it survives a restart
    const back = rig({ world: WorldState.fromDict(JSON.parse(JSON.stringify(r.world.toDict()))) });
    expect(back.engine.journal().map((c) => c.id)).toEqual([first!.quest]);
  });

  it("keeps the card when the journal has no room, and starts it when there is", () => {
    const r = rig();
    for (const id of ["q_kitten_home", "q_wallet", "q_mint_run"]) r.engine.start(d.quests[id]!);
    const [card] = r.engine.postings().filter((p) => !["q_kitten_home", "q_wallet", "q_mint_run"].includes(p.quest!));
    accept(r.world, card!.id, r.day.v);
    expect(r.engine.syncBoard()).toEqual([]);
    expect(r.engine.journal()).toHaveLength(3);
    delete r.world.quests.active["q_mint_run"];
    expect(r.engine.syncBoard().map((q) => q.id)).toEqual([card!.quest]);
  });

  it("the repeat rules: weekly once a week, daily once a day, a pool after its cooldown, once never again", () => {
    const ctx = (today: string) => ({ today, grade: 2 });
    const save = noQuests();
    save.done["q_clock_set"] = { day: "2026-10-21", n: 1 }; // weekly, a Wednesday
    save.done["q_mail_round"] = { day: "2026-10-21", n: 1 }; // daily
    save.done["q_tom_swap"] = { day: "2026-10-21", n: 1 }; // pool, 3 days
    save.done["q_wallet"] = { day: "2026-01-01", n: 1 }; // once
    expect(isEligible(d.quests["q_clock_set"]!, save, ctx("2026-10-22"))).toBe(false);
    expect(isEligible(d.quests["q_clock_set"]!, save, ctx("2026-10-25"))).toBe(true); // the next Sunday
    expect(isEligible(d.quests["q_mail_round"]!, save, ctx("2026-10-21"))).toBe(false);
    expect(isEligible(d.quests["q_mail_round"]!, save, ctx("2026-10-22"))).toBe(true);
    expect(isEligible(d.quests["q_tom_swap"]!, save, ctx("2026-10-23"))).toBe(false);
    expect(isEligible(d.quests["q_tom_swap"]!, save, ctx("2026-10-24"))).toBe(true);
    expect(isEligible(d.quests["q_wallet"]!, save, ctx("2030-01-01"))).toBe(false);
    expect(weekCount(save, "2026-10-22")).toBe(0);
  });
});
