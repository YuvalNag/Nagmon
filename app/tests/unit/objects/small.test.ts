import { describe, expect, it } from "vitest";
import { accept, boardData, isAccepted, parseBoard, staticPostings } from "../../../src/core/game/board";
import { choicesFor, eat, fridgeData, fridgeOpened } from "../../../src/core/game/fridge";
import { meet, metPeople, parseMet } from "../../../src/core/game/people";
import { creatureOfDay, HEADLINES, staticNews, tvData } from "../../../src/core/game/tv";
import { monsterTable } from "../../../src/core/game/monsters";
import { WorldState } from "../../../src/core/world/worldState";
import { gameJson } from "../game/helpers";
import { dayOfWeek } from "../../../src/core/game/dayPick";
import { days, worldWith } from "./helpers";

describe("people met", () => {
  it("meeting someone saves a slug and a day; a new day grows a heart, up to three", () => {
    const w = worldWith();
    expect(meet(w, "nagmon_granny", "2026-10-22")).toBe(true);
    expect(w.met["nagmon_granny"]).toEqual({ first: "2026-10-22", last: "2026-10-22", hearts: 0 });
    expect(meet(w, "nagmon_granny", "2026-10-22")).toBe(false);
    for (const d of days("2026-10-23", 6)) meet(w, "nagmon_granny", d);
    expect(w.met["nagmon_granny"]!.hearts).toBe(3);
    expect(w.met["nagmon_granny"]!.first).toBe("2026-10-22");
  });

  it("lists the people of the directory that were met, in the directory's order", () => {
    const w = worldWith();
    const dir = [
      { slug: "a", name: "א", offers: "", emoji: "1" },
      { slug: "b", name: "ב", offers: "", emoji: "1" },
      { slug: "c", name: "ג", offers: "", emoji: "1" },
    ];
    meet(w, "c", "2026-10-22");
    meet(w, "a", "2026-10-22");
    expect(metPeople(w, dir).map((m) => m.person.slug)).toEqual(["a", "c"]);
  });

  it("keeps only a slug, days and hearts: no name and no free text, and bad data is dropped", () => {
    const w = worldWith();
    meet(w, "nagmon_granny", "2026-10-22");
    const text = JSON.stringify(w.toDict());
    expect(text).toBe(JSON.stringify(WorldState.fromDict(JSON.parse(text)).toDict()));
    expect(parseMet({ "bad slug!": { first: "2026-10-22" }, ok: { first: "x" }, fine: { first: "2026-10-22", hearts: 9, tastes: { cake: "loved", pie: "meh" } } })).toEqual({
      fine: { first: "2026-10-22", last: "2026-10-22", hearts: 3, tastes: { cake: "loved" } },
    });
  });
});

describe("the fridge", () => {
  const data = fridgeData({
    snacks: ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, emoji: "1f353", name_he: id })),
  });

  it("offers three snacks, different from each other, that change from day to day", () => {
    const a = choicesFor(data, "2026-10-22");
    expect(a).toHaveLength(3);
    expect(new Set(a.map((s) => s.id)).size).toBe(3);
    expect(choicesFor(data, "2026-10-22")).toEqual(a);
    const sets = new Set(days("2026-10-01", 20).map((d) => choicesFor(data, d).map((s) => s.id).join()));
    expect(sets.size).toBeGreaterThan(3);
  });

  it("gives the partner a heart once a day; the second tap says tomorrow and changes nothing", () => {
    const w = worldWith(2);
    const pick = choicesFor(data, "2026-10-22")[0]!.id;
    const r = eat(w, data, pick, "2026-10-22");
    expect(r).toMatchObject({ ok: true, hearts: 1, gained: true });
    expect(w.creatures[0]!.hearts).toBe(1);
    expect(w.creatures[1]!.hearts ?? 0).toBe(0);
    expect(fridgeOpened(w, "2026-10-22")).toBe(true);
    const again = eat(w, data, choicesFor(data, "2026-10-22")[1]!.id, "2026-10-22");
    expect(again).toEqual({ ok: false, reason: "tomorrow" });
    expect(w.creatures[0]!.hearts).toBe(1);
    // and tomorrow it is there again
    expect(eat(w, data, choicesFor(data, "2026-10-23")[0]!.id, "2026-10-23")).toMatchObject({ ok: true, hearts: 2 });
  });

  it("a friend with five hearts is just as happy, with no more hearts than five", () => {
    const w = worldWith(1);
    w.creatures[0]!.hearts = 5;
    const r = eat(w, data, choicesFor(data, "2026-10-22")[0]!.id, "2026-10-22");
    expect(r).toMatchObject({ ok: true, hearts: 5, gained: false });
  });

  it("with no friend yet it does not spend the day; a snack that is not on offer is refused", () => {
    const w = worldWith(0);
    expect(eat(w, data, choicesFor(data, "2026-10-22")[0]!.id, "2026-10-22")).toEqual({ ok: false, reason: "nofriend" });
    expect(fridgeOpened(w, "2026-10-22")).toBe(false);
    const v = worldWith(1);
    expect(eat(v, data, "zzz", "2026-10-22")).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("the TV", () => {
  const data = tvData({ news: ["א", "ב", "ג", "ד", "ה"], creatures: { heliobud: "עובדה על הליובוד", nosuchcreature: "x", lunibble: " " } });
  const monsters = monsterTable(gameJson("db/monsters.json"));

  it("shows three different headlines, the same all day, other ones another day", () => {
    const news = staticNews(data);
    const a = news("2026-10-22");
    expect(a).toHaveLength(HEADLINES);
    expect(new Set(a).size).toBe(3);
    expect(news("2026-10-22")).toEqual(a);
    expect(new Set(days("2026-10-01", 10).map((d) => news(d).join())).size).toBeGreaterThan(3);
  });

  it("picks a creature of the day that has a picture and a line; none when no species can be shown", () => {
    const c = creatureOfDay(data, monsters, "2026-10-22");
    expect(c).toEqual({ species: "heliobud", fact: "עובדה על הליובוד" });
    expect(creatureOfDay(tvData({ creatures: {} }), monsters, "2026-10-22")).toBeNull();
    expect(creatureOfDay(tvData({ creatures: { nosuchcreature: "x" } }), monsters, "2026-10-22")).toBeNull();
  });
});

describe("the notice board", () => {
  const pool = [
    ...["a", "b", "c"].map((g, i) => ({ id: `e${i}`, slot: "easy", giver_he: g, goal_he: `easy ${i}` })),
    ...["d", "e", "f"].map((g, i) => ({ id: `n${i}`, slot: "normal", giver_he: g, goal_he: `normal ${i}` })),
    ...["a", "g", "h"].map((g, i) => ({ id: `l${i}`, slot: "learning", giver_he: g, goal_he: `learn ${i}` })),
    ...["w"].map((g, i) => ({ id: `w${i}`, slot: "weekly", giver_he: g, goal_he: `weekly ${i}` })),
    { id: "bad", slot: "huge", giver_he: "x", goal_he: "x" },
    { id: "empty", slot: "easy", giver_he: "x", goal_he: "" },
  ];
  const source = staticPostings(boardData({ postings: pool }));

  it("leaves out a posting with no goal or a slot it does not know", () => {
    expect(boardData({ postings: pool }).pool.map((p) => p.id)).not.toContain("bad");
    expect(boardData({ postings: pool }).pool.map((p) => p.id)).not.toContain("empty");
  });

  it("posts three a day, one of each slot, never two from the same giver", () => {
    for (const d of days("2026-10-01", 60).filter((x) => dayOfWeek(x) !== 0)) {
      const p = source.postings(d);
      expect(p.map((x) => x.slot)).toEqual(["easy", "normal", "learning"]);
      expect(new Set(p.map((x) => x.giver)).size).toBe(3);
      expect(source.postings(d)).toEqual(p);
    }
  });

  it("adds the weekly card on Sundays only", () => {
    for (const d of days("2026-10-18", 14)) {
      const weekly = source.postings(d).filter((x) => x.slot === "weekly");
      expect(weekly.length, d).toBe(dayOfWeek(d) === 0 ? 1 : 0);
    }
  });

  it("accepting is free and kept for good; the same card is not taken twice", () => {
    const w = worldWith();
    expect(accept(w, "e1", "2026-10-22")).toBe(true);
    expect(accept(w, "e1", "2026-10-30")).toBe(false);
    expect(isAccepted(w, "e1")).toBe(true);
    expect(w.board.accepted).toEqual({ e1: "2026-10-22" });
    expect(w.money).toBe(0);
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict())));
    expect(back.board).toEqual(w.board);
    expect(parseBoard({ accepted: { x: "2026-01-01", y: 3 } }).accepted).toEqual({ x: "2026-01-01" });
  });
});

describe("saving", () => {
  it("a world with none of the object saves is the file it always was, byte for byte", () => {
    const old = { schema_version: 1, money: 7, variables: { a: "b" }, creatures: [{ id: "c1", species: "heliobud", level: 3, xp: 0 }] };
    const w = WorldState.fromDict(old);
    // written as the current schema version, and nothing else added
    expect(JSON.stringify(w.toDict())).toBe(JSON.stringify({ ...old, schema_version: 2 }));
  });
});
