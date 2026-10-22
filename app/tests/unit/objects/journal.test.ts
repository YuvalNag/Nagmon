import { describe, expect, it } from "vitest";
import { facts } from "../../../src/core/game/facts";
import { booksReadToday, booksToday, bySubject, factStamps, parseJournal, progressTier, readBook, readFact, recallFor, recap, recentFacts } from "../../../src/core/game/journal";
import { WorldState } from "../../../src/core/world/worldState";
import { gameJson } from "../game/helpers";
import { days, worldWith } from "./helpers";

const all = facts(gameJson("facts.json"));
const ids = Object.keys(all).sort();

function recallsOf(w: WorldState, today: string) {
  return recap(w, all, today);
}

describe("the journal", () => {
  it("adds a fact once, with the day it was first read", () => {
    const w = worldWith();
    expect(readFact(w, "owl_night", "2026-10-20")).toBe(true);
    expect(readFact(w, "owl_night", "2026-10-22")).toBe(false);
    expect(w.journal.read["owl_night"]).toBe("2026-10-20");
  });

  it("lists what was read by subject, newest first, and gives a stamp for every ten facts", () => {
    const w = worldWith();
    readFact(w, "math_zero", "2026-10-01");
    readFact(w, "math_half", "2026-10-03");
    readFact(w, "en_cat", "2026-10-02");
    const by = bySubject(w, all);
    expect(by["math"]!.map((l) => l.id)).toEqual(["math_half", "math_zero"]);
    expect(by["english"]!.map((l) => l.id)).toEqual(["en_cat"]);
    expect(by["science"]).toEqual([]);
    expect(factStamps(w)).toBe(0);
    for (const id of ids.slice(0, 10)) readFact(w, id, "2026-10-04");
    expect(factStamps(w)).toBeGreaterThanOrEqual(1);
    for (const id of ids) readFact(w, id, "2026-10-05");
    expect(factStamps(w)).toBe(Math.floor(Object.keys(w.journal.read).length / 10));
  });

  it("leaves out a fact the base no longer has, without losing it from the save", () => {
    const w = worldWith();
    readFact(w, "gone", "2026-10-01");
    expect(Object.values(bySubject(w, all)).flat()).toEqual([]);
    expect(w.journal.read["gone"]).toBe("2026-10-01");
  });

  it("is saved with the world and read back the same", () => {
    const w = worldWith();
    readFact(w, "math_zero", "2026-10-01");
    readBook(w, "en_cat", "2026-10-02");
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict())));
    expect(back.journal).toEqual(w.journal);
    expect(parseJournal("junk")).toEqual(parseJournal(undefined));
  });
});

describe("the words of progress", () => {
  it("get warmer with practice and never say weak, low or a number", () => {
    expect(progressTier({ answered7d: 0, mastered: 0, factsRead: 0 })).toBe(0);
    expect(progressTier({ answered7d: 2, mastered: 0, factsRead: 0 })).toBe(1);
    expect(progressTier({ answered7d: 0, mastered: 0, factsRead: 1 })).toBe(1);
    expect(progressTier({ answered7d: 12, mastered: 0, factsRead: 0 })).toBe(2);
    expect(progressTier({ answered7d: 0, mastered: 1, factsRead: 0 })).toBe(2);
    expect(progressTier({ answered7d: 0, mastered: 3, factsRead: 0 })).toBe(3);
  });

  it("never goes down when the child does more", () => {
    let last = 0;
    for (let n = 0; n < 40; n++) {
      const tier = progressTier({ answered7d: n, mastered: Math.floor(n / 8), factsRead: Math.floor(n / 5) });
      expect(tier).toBeGreaterThanOrEqual(last);
      last = tier;
    }
  });
});

describe("the recap", () => {
  it("asks only about facts read in the last 7 days", () => {
    const w = worldWith();
    readFact(w, "math_zero", "2026-10-10"); // 12 days ago
    readFact(w, "en_cat", "2026-10-16"); // 6 days ago: the 7th day counts
    readFact(w, "geo_cube", "2026-10-22");
    expect(recentFacts(w, "2026-10-22")).toEqual(["geo_cube", "en_cat"]);
    const asked = recallsOf(w, "2026-10-22").map((r) => r.fact).sort();
    expect(asked).toEqual(["en_cat", "geo_cube"]);
  });

  it("asks up to three, each with three different lines of which one is the fact's own", () => {
    const w = worldWith();
    for (const id of ids.slice(0, 8)) readFact(w, id, "2026-10-22");
    const qs = recallsOf(w, "2026-10-22");
    expect(qs).toHaveLength(3);
    for (const q of qs) {
      expect(q.choices).toHaveLength(3);
      expect(new Set(q.choices).size).toBe(3);
      expect(q.choices).toContain(q.fact);
      const texts = q.choices.map((c) => all[c]!.text);
      expect(new Set(texts).size).toBe(3);
      // no other choice shows the same picture as the question
      for (const c of q.choices) if (c !== q.fact) expect(all[c]!.emoji).not.toBe(all[q.fact]!.emoji);
    }
  });

  it("asks nothing when nothing was read lately", () => {
    const w = worldWith();
    expect(recallsOf(w, "2026-10-22")).toEqual([]);
    readFact(w, "math_zero", "2026-09-01");
    expect(recallsOf(w, "2026-10-22")).toEqual([]);
  });

  it("is practice only: it does not touch the world, the coins or the saved state", () => {
    const w = worldWith();
    for (const id of ids.slice(0, 5)) readFact(w, id, "2026-10-22");
    const before = JSON.stringify(w.toDict());
    recallsOf(w, "2026-10-22");
    recallFor("math_zero", all, "x");
    expect(JSON.stringify(w.toDict())).toBe(before);
  });

  it("is the same on the same day", () => {
    const w = worldWith();
    for (const id of ids.slice(0, 5)) readFact(w, id, "2026-10-22");
    expect(recallsOf(w, "2026-10-22")).toEqual(recallsOf(w, "2026-10-22"));
  });
});

describe("the bookshelf", () => {
  it("has three books out each day, from three different subjects, the same all day", () => {
    for (const d of days("2026-10-01", 30)) {
      const b = booksToday(all, d);
      expect(b).toHaveLength(3);
      expect(new Set(b.map((id) => all[id]!.subject)).size).toBe(3);
      expect(booksToday(all, d)).toEqual(b);
    }
    expect(booksToday(all, "2026-10-01")).not.toEqual(booksToday(all, "2026-10-02"));
  });

  it("three different books in a day give one stamp; the same book twice does not count twice", () => {
    const w = worldWith();
    const b = booksToday(all, "2026-10-22");
    expect(readBook(w, b[0]!, "2026-10-22").stamp).toBe(false);
    expect(readBook(w, b[0]!, "2026-10-22").stamp).toBe(false);
    expect(booksReadToday(w, "2026-10-22")).toBe(1);
    expect(readBook(w, b[1]!, "2026-10-22").stamp).toBe(false);
    const third = readBook(w, b[2]!, "2026-10-22");
    expect(third.stamp).toBe(true);
    expect(w.journal.stamps).toBe(1);
  });

  it("gives the stamp once a day, even for a fourth book", () => {
    const w = worldWith();
    for (const id of ids.slice(0, 3)) readBook(w, id, "2026-10-22");
    expect(readBook(w, ids[3]!, "2026-10-22").stamp).toBe(false);
    expect(w.journal.stamps).toBe(1);
    for (const id of ids.slice(0, 3)) readBook(w, id, "2026-10-23");
    expect(w.journal.stamps).toBe(2);
  });

  it("ten stamps give a bookmark charm and 20 coins, once", () => {
    const w = worldWith();
    let coins = 0;
    let marks = 0;
    for (const [n, d] of days("2026-01-01", 12).entries()) {
      for (const id of ids.slice(n, n + 3)) {
        const r = readBook(w, id, d);
        coins += r.coins;
        marks += r.bookmark ? 1 : 0;
      }
    }
    expect(w.journal.stamps).toBe(12);
    expect(marks).toBe(1);
    expect(coins).toBe(20);
    expect(w.money).toBe(20);
    expect(w.journal.bookmarks).toBe(1);
  });

  it("reading a book adds its fact to the journal", () => {
    const w = worldWith();
    const r = readBook(w, "en_cat", "2026-10-22");
    expect(r.isNew).toBe(true);
    expect(w.journal.read["en_cat"]).toBe("2026-10-22");
    expect(readBook(w, "en_cat", "2026-10-23").isNew).toBe(false);
  });
});
