/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { learnerFor, loadLibrary, maxChoicesFor, openPlay, type FetchJson } from "../../../src/app/play";
import { defaultsForGrade } from "../../../src/core/family/gradeDefaults";
import { addCreature, needFor } from "../../../src/core/game/collection";
import { give } from "../../../src/core/game/items";
import { ProfileStore, type Profile } from "../../../src/core/family/profiles";
import { QuizSession } from "../../../src/core/world/quiz";
import { MemoryFileStore, pendingWrites } from "../../../src/platform/storage";

/** The game's data as the app fetches it, from the build's files. */
const fetchJson: FetchJson = async (path) => JSON.parse(readFileSync(`public/game/${path}`, "utf8"));

async function child(grade = 2) {
  const fs = new MemoryFileStore();
  const profiles = new ProfileStore(fs);
  const d = defaultsForGrade(grade);
  // a made-up name
  const profile = await profiles.create({ name: "תמר", avatar: "girl_teal", grade, settings: d.settings });
  return { fs, profiles, profile };
}

describe("the child's learner", () => {
  const profile = (grade: number, settings: Profile["settings"] = {}, birthYear: number | null = null) =>
    ({ grade, settings, birthYear }) as Profile;

  it("takes the profile's grade, age and learning settings over what was saved", () => {
    const l = learnerFor(profile(3, { learning: { timer: false } }), { schema_version: 1, grade: 1, age: 7 }, new Date(2026, 9, 20));
    expect([l.grade, l.age, l.timerOn]).toEqual([3, 9, false]);
  });

  it("the parent's start grade is where a subject begins, over what the placement found; the subjects switches reach the engine", () => {
    const saved = { schema_version: 1, grade: 3, age: 9, subject_grade: { math: 1, english: 2 } };
    const l = learnerFor(profile(3, { learning: { start_grade: { math: 5 }, subjects: ["math", "logic"] } }), saved, new Date(2026, 9, 20));
    expect([l.gradeIn("math"), l.gradeIn("english"), l.gradeIn("logic")]).toEqual([5, 2, 3]);
    expect(l.enabledSubjects).toEqual(["math", "logic"]);
  });

  it("only the youngest are held to a few choices", () => {
    expect(maxChoicesFor(profile(0, defaultsForGrade(0).settings))).toBe(3);
    expect(maxChoicesFor(profile(1, defaultsForGrade(1).settings))).toBe(3);
    expect(maxChoicesFor(profile(2, defaultsForGrade(2).settings))).toBeNull();
    expect(maxChoicesFor(profile(1))).toBeNull();
  });
});

/** Presses a number's keys one at a time, as the pad takes them. */
function typeOut(s: QuizSession, text: string): void {
  for (const ch of text) s.press(ch);
}

describe("a child's play", () => {
  it("loads the content once per run", async () => {
    expect(await loadLibrary(fetchJson)).toBe(await loadLibrary(fetchJson));
  });

  it("starts with no coins, and a seed gives the same question each time", async () => {
    const a = await child();
    const p1 = await openPlay({ ...a, fetchJson, seed: 7 });
    const p2 = await openPlay({ ...a, fetchJson, seed: 7 });
    expect(p1.world.money).toBe(0);
    const q = (p: typeof p1) => p.engine.nextQuestion({ skill_id: "math.money.change_20", context: "shop" }).item_id;
    expect(q(p1)).toBe(q(p2));
  });

  it("saves the learner after an answer and the world after a change, and opens them again", async () => {
    const a = await child();
    const play = await openPlay({ ...a, fetchJson, seed: 1 });
    const q = play.engine.nextQuestion({ skill_id: "math.money.change_20", context: "shop" });
    play.engine.submit(q, q.answer as string, { elapsed_s: 3, context: "shop" });
    // nothing awaited: the background flush must find the saves
    void play.saveLearner();
    play.world.addMoney(20);
    play.world.variables.set("nagmon_daily_cashier", `${play.today()}:1`);
    void play.saveWorld();
    await pendingWrites(a.fs);
    const again = await openPlay({ ...a, fetchJson });
    expect(again.engine.learner.answers_total).toBe(1);
    expect(again.world.money).toBe(20);
    expect(again.world.variables.get("nagmon_daily_cashier")).toBe(`${play.today()}:1`);
  });

  it("a failed save is logged and the game goes on", async () => {
    const a = await child();
    const errors: string[] = [];
    const play = await openPlay({ ...a, fetchJson, log: { info: () => {}, warning: () => {}, error: (m) => errors.push(m) } });
    await a.profiles.delete(a.profile.id);
    await expect(play.saveWorld()).resolves.toBeUndefined();
    expect(errors).toEqual(["Could not save the world"]);
  });

  it("a friend whose species the game no longer has gets a plain name, not its id (an old save)", async () => {
    const a = await child();
    const warnings: string[] = [];
    const play = await openPlay({ ...a, fetchJson, log: { info: () => {}, warning: (m) => warnings.push(m), error: () => {} } });
    play.world.creatures.push({ id: "c9", species: "flaskling", level: 9, xp: 0 });
    expect(play.text("flaskling")).toBe("חבר");
    expect(play.text("flaskling")).toBe("חבר");
    expect(warnings).toEqual(["Unknown species flaskling: no picture, no name"]);
  });

  it("puts the child's name into the texts, and shows a missing text's id", async () => {
    const a = await child();
    const warnings: string[] = [];
    const play = await openPlay({ ...a, fetchJson, log: { info: () => {}, warning: (m) => warnings.push(m), error: () => {} } });
    expect(play.text("nagmon_world_granny_hello")).toContain("תמר");
    expect(play.text("nagmon_world_cashier_good")).toContain("20 מטבעות");
    expect(play.text("no_such_text")).toBe("no_such_text");
    expect(warnings).toEqual(["No text for no_such_text"]);
  });

  it("uses the phone's local day for the daily prizes", async () => {
    const a = await child();
    const play = await openPlay({ ...a, fetchJson, now: () => new Date(2026, 9, 20, 23, 59) });
    expect(play.today()).toBe("2026-10-20");
  });

  it("logs an answered question as one line with no name", async () => {
    const a = await child();
    const lines: string[] = [];
    const play = await openPlay({ ...a, fetchJson, seed: 3, log: { info: (m) => lines.push(m), warning: () => {}, error: () => {} } });
    let t = 1000;
    const session = new QuizSession(play.engine, { topic: "math.money.change_20", context: "shop", maxChoices: null }, () => (t += 2500), () => {});
    if (session.phase === "example") session.exampleDone();
    session.choose(session.question!.answer as string) || (typeOut(session, String(session.question!.answer)), session.check());
    play.logAnswer(session, "shop");
    const q = lines.find((l) => l.startsWith("Q "))!;
    expect(q).toMatch(/^Q subject=math skill=math\.money\.change_20 grade=\d+ theta=-?\d+\.\d\d ok=[01] ms=\d+ ctx=shop$/);
    expect(q).not.toContain("תמר");
  });

  it("a right answer anywhere warms the eggs, and a wrong one does not; the hatch is saved and waits to be told", async () => {
    const a = await child();
    const lines: string[] = [];
    const play = await openPlay({ ...a, fetchJson, seed: 3, log: { info: (m) => lines.push(m), warning: () => {}, error: () => {} } });
    play.world.eggs.push({ id: "e1", table: "nagmon_route1", got: 8, need: 10 });
    expect(play.pools("nagmon_route1").length).toBeGreaterThan(3);
    expect(play.pools("nowhere")).toEqual([]);
    const answer = (right: boolean, context: string) => {
      let t = 1000;
      const s = new QuizSession(play.engine, { topic: "math.money.change_20", context, maxChoices: null }, () => (t += 2500), () => {});
      if (s.phase === "example") s.exampleDone();
      if (right) s.choose(s.question!.answer as string) || (typeOut(s, String(s.question!.answer)), s.check());
      else s.dontKnow();
      play.logAnswer(s, context);
    };
    answer(false, "battle");
    expect(play.world.eggs[0]!.got).toBe(8);
    answer(true, "battle");
    expect(play.world.eggs[0]!.got).toBe(9);
    expect(play.hatched).toEqual([]);
    answer(true, "chest");
    expect(play.world.eggs).toEqual([]);
    expect(play.hatched).toHaveLength(1);
    expect(play.world.creatures).toHaveLength(1);
    expect(lines.some((l) => /^HATCH egg=e1 species=\w+ level=\d+$/.test(l))).toBe(true);
    await play.idle();
    const saved = (await a.profiles.loadWorldDict(a.profile.id)) as { creatures?: unknown[]; eggs?: unknown[] };
    expect(saved.creatures).toHaveLength(1);
    expect(saved.eggs).toBeUndefined();
  });
});

describe("growth and evolution in play (S4)", () => {
  const rightAnswer = (play: Awaited<ReturnType<typeof openPlay>>, topic: string, context: string) => {
    let t = 1000;
    const s = new QuizSession(play.engine, { topic, context, maxChoices: null }, () => (t += 2500), () => {});
    if (s.phase === "example") s.exampleDone();
    s.choose(s.question!.answer as string) || (typeOut(s, String(s.question!.answer)), s.check());
    play.logAnswer(s, context);
  };

  it("a right answer in the partner's home subject outside a battle is one Know-how; another subject and a battle's own answer are none (the battle counts its own)", async () => {
    const a = await child();
    const play = await openPlay({ ...a, fetchJson, seed: 3 });
    addCreature(play.world, "heliobud", 5); // Math
    rightAnswer(play, "math.money.change_20", "shop");
    expect(play.world.creatures[0]!.knowHow).toBe(1);
    rightAnswer(play, "math.money.change_20", "battle");
    expect(play.world.creatures[0]!.knowHow).toBe(1);
    rightAnswer(play, "geometry.shapes.identify", "chest");
    expect(play.world.creatures[0]!.knowHow).toBe(1);
  });

  it("the evolution check reads the child's stars, lessons and place; the curve is the data's", async () => {
    const a = await child();
    const play = await openPlay({ ...a, fetchJson });
    const ctx = play.evolveCtx()!;
    expect(ctx.stars("math")).toBe(0);
    play.engine.learner.stars.set("math", 3);
    expect(ctx.stars("math")).toBe(3);
    expect(ctx.zone).toBeNull();
    play.world.trips.at = "solar/sun";
    play.world.lessons.done.push("moon");
    const ctx2 = play.evolveCtx()!;
    expect([ctx2.zone, ctx2.lessons]).toEqual(["sun", ["moon"]]);
    expect(ctx2.subjectOf("heliobud")).toBe("math");
    expect(needFor(10)).toBe(16);
  });
});

describe("evolving (S4): the one way the screens do it", () => {
  async function ready() {
    const a = await child();
    const lines: string[] = [];
    const play = await openPlay({ ...a, fetchJson, seed: 3, log: { info: (m) => lines.push(m), warning: () => {}, error: () => {} } });
    const c = addCreature(play.world, "heliobud", 12);
    c.name = "דובי";
    return { a, play, c, lines };
  }

  it("by learning needs every gate: refused (nothing changes) until Know-how, stars, hearts and the lesson are there, then the species changes, with the Shimmer, saved, one log line of ids", async () => {
    const { a, play, c, lines } = await ready();
    expect(play.evolveNow(c.id, "learning")).toBeNull();
    expect(c.species).toBe("heliobud");
    c.knowHow = 40;
    c.hearts = 2;
    play.engine.learner.stars.set("math", 2);
    play.world.lessons.done.push("solar_system");
    const r = play.evolveNow(c.id, "learning")!;
    expect([r.before, r.after, c.species, c.shimmer]).toEqual(["heliobud", "heliolynx", "heliolynx", true]);
    expect(lines.filter((l) => l.startsWith("EVOLVE "))).toEqual(["EVOLVE from=heliobud to=heliolynx how=learning level=12"]);
    expect(lines.join("\n")).not.toContain("דובי");
    await play.idle();
    const saved = (await a.profiles.loadWorldDict(a.profile.id)) as { creatures: { species: string }[] };
    expect(saved.creatures[0]!.species).toBe("heliolynx");
  });

  it("by a card skips the gates but not the level, uses the card up, and gives no Shimmer", async () => {
    const { play, c } = await ready();
    give(play.world, play.economy, "zone_card_sun", 1);
    c.level = 8;
    expect(play.evolveNow(c.id, "card", "zone_card_sun")).toBeNull();
    expect(play.world.items.get("zone_card_sun")).toBe(1);
    c.level = 9;
    expect(play.evolveNow(c.id, "card", "zone_card_sun")).not.toBeNull();
    expect([c.species, c.shimmer, play.world.items.get("zone_card_sun")]).toEqual(["heliolynx", undefined, undefined]);
  });
});

describe("an old save", () => {
  it("opens with its unknown creatures replaced or dropped, and logs ids only", async () => {
    const a = await child();
    await a.profiles.saveWorldDict(a.profile.id, {
      schema_version: 1,
      money: 3,
      variables: { nagmon_intro_done: "yes" },
      creatures: [{ id: "c1", species: "flaskling", level: 9, xp: 0, name: "דובי" }],
    });
    const lines: string[] = [];
    const warnings: string[] = [];
    const play = await openPlay({ ...a, fetchJson, log: { info: (m) => lines.push(m), warning: (m) => warnings.push(m), error: () => {} } });
    expect(play.world.creatures).toHaveLength(1);
    expect(play.monsters[play.world.creatures[0]!.species]).toBeTruthy();
    expect(play.world.money).toBe(3);
    const repair = lines.find((l) => l.startsWith("Old save repaired"));
    expect(repair).toContain("flaskling");
    expect(repair).not.toContain("דובי");
    expect(warnings).toEqual([]);
  });
});
