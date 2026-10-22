import { beforeAll, describe, expect, it } from "vitest";
import type { BattleData } from "../../../src/core/data/battleTypes";
import { addCreature, MAX_LEVEL } from "../../../src/core/game/collection";
import {
  addKnowHow,
  cardCheck,
  checkGates,
  type EvolveCtx,
  evolve,
  evolveWithCard,
  findCard,
  forms,
  gateRows,
  nextForm,
  qualifying,
  readyToEvolve,
  setKeepSmall,
  tutorGift,
} from "../../../src/core/game/evolution";
import { countOf, economy, give } from "../../../src/core/game/items";
import { monsterTable } from "../../../src/core/game/monsters";
import { WorldState } from "../../../src/core/world/worldState";
import { battleData, fixedRng, gameJson } from "./helpers";

const eco = economy(gameJson("economy.json"));
const monsters = monsterTable(gameJson("db/monsters.json"));
let data: BattleData;
beforeAll(async () => {
  data = await battleData();
});

/** The child's learning as the checks see it: stars by subject, lessons done, the zone they stand in. */
const ctxWith = (o: { stars?: Record<string, number>; lessons?: string[]; zone?: string | null } = {}): EvolveCtx => ({
  monsters,
  battle: data,
  rules: data.rules.evolution,
  stars: (s) => o.stars?.[s] ?? 0,
  lessons: o.lessons ?? [],
  zone: o.zone ?? null,
  subjectOf: (sp) => data.species[sp]?.subject ?? "math",
});

/** A creature with every gate of its first evolution met (heliobud, Sun, Math; the lesson gate is "solar_system"). */
function ready() {
  const w = new WorldState();
  const c = addCreature(w, "heliobud", 12);
  c.knowHow = 40;
  c.hearts = 2;
  w.lessons.done.push("solar_system");
  return { w, c, ctx: ctxWith({ stars: { math: 2 }, lessons: ["solar_system"] }) };
}

describe("the gates of evolution (7.1): level, Know-how, stars, hearts, and a lesson where the data says", () => {
  it("heliobud's next form is heliolynx, with the data's numbers (12 / 40 / 2 / 2 and the Sun lesson)", () => {
    const f = nextForm("heliobud", ctxWith())!;
    expect(f.to).toBe("heliolynx");
    expect([f.stage, f.level, f.knowHow, f.stars, f.hearts, f.lesson, f.place]).toEqual([0, 12, 40, 2, 2, "solar_system", null]);
    const g = nextForm("heliolynx", ctxWith())!;
    expect([g.to, g.stage, g.level, g.knowHow, g.stars, g.hearts, g.lesson, g.place]).toEqual(["heliarch", 1, 24, 120, 6, 4, null, "sun"]);
    expect(nextForm("heliarch", ctxWith())).toBeNull();
  });

  it("every gate met and the creature is ready; the checklist shows each as 'have of need'", () => {
    const { c, ctx } = ready();
    const check = checkGates(c, ctx)!;
    expect(check.ready).toBe(true);
    expect(check.rows.map((r) => [r.id, r.have, r.need, r.met])).toEqual([
      ["level", 12, 12, true],
      ["know_how", 40, 40, true],
      ["stars", 2, 2, true],
      ["hearts", 2, 2, true],
      ["lesson", 1, 1, true],
    ]);
  });

  it("truth table: one gate short and it is not ready, whichever it is", () => {
    const cases: [string, (c: ReturnType<typeof ready>) => void][] = [
      ["level", (r) => (r.c.level = 11)],
      ["know_how", (r) => (r.c.knowHow = 39)],
      ["stars", (r) => (r.ctx.stars = () => 1)],
      ["hearts", (r) => (r.c.hearts = 1)],
      ["lesson", (r) => (r.ctx.lessons = [])],
    ];
    for (const [gate, breakIt] of cases) {
      const r = ready();
      breakIt(r);
      const check = checkGates(r.c, r.ctx)!;
      expect(check.ready, gate).toBe(false);
      expect(check.rows.filter((x) => !x.met).map((x) => x.id), gate).toEqual([gate]);
    }
  });

  it("stars are those of the creature's own subject (the child's learning, read through a fake learner)", () => {
    const { c } = ready();
    const asked: string[] = [];
    const ctx = { ...ctxWith(), stars: (s: string) => (asked.push(s), s === "math" ? 5 : 0) };
    expect(checkGates(c, ctx)!.rows.find((r) => r.id === "stars")).toMatchObject({ have: 5, met: true, subject: "math" });
    expect(asked).toEqual(["math"]);
  });

  it("the second stage asks the place: the child must stand in the creature's home zone (a gate that only stage 1 has)", () => {
    const w = new WorldState();
    const c = addCreature(w, "heliolynx", 24);
    c.knowHow = 120;
    c.hearts = 4;
    const there = checkGates(c, ctxWith({ stars: { math: 6 }, zone: "sun" }))!;
    expect(there.rows.map((r) => r.id)).toEqual(["level", "know_how", "stars", "hearts", "place"]);
    expect(there.ready).toBe(true);
    const away = checkGates(c, ctxWith({ stars: { math: 6 }, zone: "moon" }))!;
    expect(away.ready).toBe(false);
    expect(away.rows.find((r) => r.id === "place")).toMatchObject({ met: false });
  });

  it("a species with no battle data uses the rules' gates for its stage (no lesson, no place)", () => {
    const plain = { ...ctxWith(), battle: null, rules: data.rules.evolution };
    const mon = Object.values(monsters).find((m) => m.hasSprite && m.evolutions[0] && monsters[m.evolutions[0].monster_slug]?.hasSprite && !data.species[m.slug]);
    if (!mon) return; // every species with a picture has battle data in the shipped game
    const f = nextForm(mon.slug, plain)!;
    expect([f.level, f.knowHow, f.lesson, f.place]).toEqual([12, 40, null, null]);
  });

  it("a form without a picture is never the next one", () => {
    const ghost = {
      ...ctxWith(),
      battle: null,
      monsters: { a: { slug: "a", types: [], stage: "basic", evolutions: [{ at_level: 5, monster_slug: "b" }], hasSprite: true, sprites: null }, b: { slug: "b", types: [], stage: "stage1", evolutions: [], hasSprite: false, sprites: null } },
    } satisfies EvolveCtx;
    expect(nextForm("a", ghost)).toBeNull();
  });

  it("every species of the data that evolves has gates that the checklist can show", () => {
    for (const [slug, sp] of Object.entries(data.species)) {
      const f = nextForm(slug, ctxWith());
      expect(f === null, slug).toBe(sp.evolve === null || !monsters[sp.evolve.to]?.hasSprite);
    }
    expect(forms(ctxWith()).length).toBeGreaterThan(30);
  });

  it("gateRows tells in which subject to practise (the stars row carries the subject)", () => {
    const { c, ctx } = ready();
    expect(gateRows(c, nextForm("heliobud", ctx)!, ctx).find((r) => r.id === "stars")!.subject).toBe("math");
  });
});

describe("Know-how (5.4): +1 for every right answer in the creature's home subject while it is the partner", () => {
  it("counts up from nothing, never below zero, and is saved with the creature", () => {
    const w = new WorldState();
    const c = addCreature(w, "heliobud", 5);
    expect(c.knowHow ?? 0).toBe(0);
    addKnowHow(c, 1);
    addKnowHow(c, 2);
    expect(c.knowHow).toBe(3);
    addKnowHow(c, -9);
    expect(c.knowHow).toBe(0);
    addKnowHow(c, 3);
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict())));
    expect(back.creatures[0]!.knowHow).toBe(3);
  });

  it("an old save has none; Keep small and the Shimmer are saved too", () => {
    const back = WorldState.fromDict({ creatures: [{ id: "c1", species: "heliobud", level: 4, xp: 0 }, { id: "c2", species: "terrabub", level: 4, xp: 0, knowHow: 7, keepSmall: true, shimmer: true }] });
    expect(back.creatures[0]!.knowHow).toBeUndefined();
    expect(back.creatures[1]).toMatchObject({ knowHow: 7, keepSmall: true, shimmer: true });
  });
});

describe("evolving, by learning or with a card", () => {
  it("changes the species only: level, growth points, Know-how, hearts and the name stay; the Book gets the new form", () => {
    const { w, c, ctx } = ready();
    c.xp = 5;
    c.name = "Dodo";
    const r = evolve(w, c.id, nextForm("heliobud", ctx)!.to, "learning")!;
    expect([r.before, r.after]).toEqual(["heliobud", "heliolynx"]);
    expect(c).toMatchObject({ species: "heliolynx", level: 12, xp: 5, knowHow: 40, hearts: 2, name: "Dodo" });
    expect(w.caught.has("heliolynx") && w.seen.has("heliolynx")).toBe(true);
    expect(w.caught.has("heliobud")).toBe(true);
  });

  it("by learning gives the Shimmer; by a card gives none", () => {
    const a = ready();
    evolve(a.w, a.c.id, "heliolynx", "learning");
    expect(a.c.shimmer).toBe(true);
    const b = ready();
    evolve(b.w, b.c.id, "heliolynx", "card");
    expect(b.c.shimmer).toBeUndefined();
  });

  it("an unknown friend is refused and nothing changes", () => {
    const { w } = ready();
    expect(evolve(w, "nope", "heliolynx", "card")).toBeNull();
  });

  it("the Keep small ribbon stops the prompt and comes off any time; ready friends are listed without it", () => {
    const { w, c, ctx } = ready();
    expect(readyToEvolve(w, ctx).map((x) => x.id)).toEqual([c.id]);
    setKeepSmall(c, true);
    expect(readyToEvolve(w, ctx)).toEqual([]);
    // the checklist still says ready: only the prompt is quiet
    expect(checkGates(c, ctx)!.ready).toBe(true);
    setKeepSmall(c, false);
    expect(readyToEvolve(w, ctx).map((x) => x.id)).toEqual([c.id]);
  });

  it("only the first four (the party) are asked; the Meadow waits", () => {
    const { w, ctx } = ready();
    for (let i = 0; i < 4; i++) addCreature(w, "terrabub", 1);
    const late = addCreature(w, "heliobud", 12);
    late.knowHow = 40;
    late.hearts = 2;
    expect(readyToEvolve(w, ctx).map((c) => c.id)).not.toContain(late.id);
  });

  it("levels never go down: a creature already past the gate level keeps its level (no migration needed)", () => {
    const w = new WorldState();
    const c = addCreature(w, "heliobud", 30);
    evolve(w, c.id, "heliolynx", "card");
    expect(c.level).toBe(30);
    expect(MAX_LEVEL).toBeGreaterThanOrEqual(30);
  });
});

describe("Evolution Cards (7.2): they skip the learning gates but not the level, and they are used up", () => {
  it("the shipped cards: 5 zone cards at 120, 6 subject cards at 200, the Bright Card at 450, the Rainbow Card not sold", () => {
    const cards = Object.values(eco.items).filter((i) => i.kind === "evolution_card");
    expect(cards).toHaveLength(13);
    expect(cards.filter((i) => i.card === "zone").map((i) => i.price)).toEqual([120, 120, 120, 120, 120]);
    expect(cards.filter((i) => i.card === "subject").map((i) => i.price)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(eco.items["bright_card"]).toMatchObject({ price: 450, fromStage: 1, forSale: true });
    expect(eco.items["rainbow_card"]).toMatchObject({ forSale: false, fromStage: "any", minLevel: 8 });
  });

  it("works from the gate level minus 3: level 8 no, 9 yes for stage 1; 20 no, 21 yes for stage 2", () => {
    const w = new WorldState();
    const ctx = ctxWith();
    const a = addCreature(w, "heliobud", 8);
    expect(cardCheck(eco.items["zone_card_sun"]!, a, ctx)).toMatchObject({ ok: false, why: "level" });
    a.level = 9;
    expect(cardCheck(eco.items["zone_card_sun"]!, a, ctx).ok).toBe(true);
    const b = addCreature(w, "heliolynx", 20);
    expect(cardCheck(eco.items["bright_card"]!, b, ctx)).toMatchObject({ ok: false, why: "level" });
    b.level = 21;
    expect(cardCheck(eco.items["bright_card"]!, b, ctx).ok).toBe(true);
  });

  it("a card needs none of Know-how, stars, hearts or the lesson", () => {
    const w = new WorldState();
    const c = addCreature(w, "heliobud", 9);
    expect(c.knowHow ?? 0).toBe(0);
    expect(checkGates(c, ctxWith())!.ready).toBe(false);
    expect(cardCheck(eco.items["zone_card_sun"]!, c, ctxWith()).ok).toBe(true);
  });

  it("a Zone Card is for a stage 0 friend native to that zone; a Subject Card for a stage 0 friend of that subject from any zone; a Bright Card for stage 1", () => {
    const w = new WorldState();
    const sun = addCreature(w, "heliobud", 12); // Sun, Math
    const moon = addCreature(w, "lunibble", 12); // Moon, Science
    const stage1 = addCreature(w, "heliolynx", 24);
    const ctx = ctxWith();
    expect(cardCheck(eco.items["zone_card_sun"]!, sun, ctx).ok).toBe(true);
    expect(cardCheck(eco.items["zone_card_sun"]!, moon, ctx)).toMatchObject({ ok: false, why: "zone" });
    expect(cardCheck(eco.items["zone_card_sun"]!, stage1, ctx)).toMatchObject({ ok: false, why: "stage" });
    expect(cardCheck(eco.items["subject_card_math"]!, sun, ctx).ok).toBe(true);
    expect(cardCheck(eco.items["subject_card_science"]!, moon, ctx).ok).toBe(true);
    expect(cardCheck(eco.items["subject_card_science"]!, sun, ctx)).toMatchObject({ ok: false, why: "subject" });
    expect(cardCheck(eco.items["bright_card"]!, sun, ctx)).toMatchObject({ ok: false, why: "stage" });
    expect(cardCheck(eco.items["bright_card"]!, stage1, ctx).ok).toBe(true);
    // no further form, no card
    const top = addCreature(w, "heliarch", 30);
    expect(cardCheck(eco.items["bright_card"]!, top, ctx)).toMatchObject({ ok: false, why: "none" });
  });

  it("the Rainbow Card: any friend with a next form, one stage, from level 8", () => {
    const w = new WorldState();
    const ctx = ctxWith();
    const low = addCreature(w, "heliobud", 7);
    const s1 = addCreature(w, "heliolynx", 8);
    expect(cardCheck(eco.items["rainbow_card"]!, low, ctx)).toMatchObject({ ok: false, why: "level" });
    expect(cardCheck(eco.items["rainbow_card"]!, s1, ctx).ok).toBe(true);
    low.level = 8;
    expect(cardCheck(eco.items["rainbow_card"]!, low, ctx).ok).toBe(true);
  });

  it("only the friends that qualify glow when a card is chosen", () => {
    const w = new WorldState();
    const sun = addCreature(w, "heliobud", 9);
    addCreature(w, "lunibble", 9);
    addCreature(w, "heliobud", 5);
    expect(qualifying(w, eco.items["zone_card_sun"]!, ctxWith()).map((c) => c.id)).toEqual([sun.id]);
  });

  it("using a card evolves the friend, uses the card up, and gives no Shimmer; refused with none in the Bag or a friend that does not qualify", () => {
    const w = new WorldState();
    const c = addCreature(w, "heliobud", 9);
    const ctx = ctxWith();
    expect(evolveWithCard(w, eco, ctx, "zone_card_sun", c.id)).toBeNull();
    give(w, eco, "zone_card_sun", 2);
    const r = evolveWithCard(w, eco, ctx, "zone_card_sun", c.id)!;
    expect([r.before, r.after, c.species, c.shimmer]).toEqual(["heliobud", "heliolynx", "heliolynx", undefined]);
    expect(countOf(w, "zone_card_sun")).toBe(1);
    // now stage 1: the same card no longer fits and is not used up
    expect(evolveWithCard(w, eco, ctx, "zone_card_sun", c.id)).toBeNull();
    expect(countOf(w, "zone_card_sun")).toBe(1);
    expect(evolveWithCard(w, eco, ctx, "heliobud", c.id)).toBeNull();
  });

  it("evolution is never done by the growth of a level: giving points past the gate level changes no species", () => {
    // (collection.test.ts holds the growth side; here the rule is that readiness is a question, not an event)
    const { w, c, ctx } = ready();
    c.level = 20;
    expect(c.species).toBe("heliobud");
    expect(readyToEvolve(w, ctx)).toHaveLength(1);
  });
});

describe("finding cards (7.2), the chances are the rules' own", () => {
  const rules = () => data.rules.evolution;

  it("after a calmed wild creature: a stage 0 partner can find its zone card (3%) or its subject card (2%), one at most", () => {
    const w = new WorldState();
    const c = addCreature(w, "heliobud", 5);
    expect(findCard(eco, rules(), monsters, data, c, fixedRng(0.0))).toBe("zone_card_sun");
    expect(findCard(eco, rules(), monsters, data, c, fixedRng(0.029))).toBe("zone_card_sun");
    expect(findCard(eco, rules(), monsters, data, c, fixedRng(0.03))).toBe("subject_card_math");
    expect(findCard(eco, rules(), monsters, data, c, fixedRng(0.049))).toBe("subject_card_math");
    expect(findCard(eco, rules(), monsters, data, c, fixedRng(0.05))).toBeNull();
    expect(findCard(eco, rules(), monsters, data, c, fixedRng(0.99))).toBeNull();
  });

  it("a stage 1 partner can find a Bright Card (1%); a creature with nothing to grow into finds nothing", () => {
    const w = new WorldState();
    const s1 = addCreature(w, "heliolynx", 20);
    expect(findCard(eco, rules(), monsters, data, s1, fixedRng(0.009))).toBe("bright_card");
    expect(findCard(eco, rules(), monsters, data, s1, fixedRng(0.01))).toBeNull();
    const top = addCreature(w, "heliarch", 30);
    expect(findCard(eco, rules(), monsters, data, top, fixedRng(0))).toBeNull();
  });

  it("the chances come from the data: a changed rule changes the find", () => {
    const w = new WorldState();
    const c = addCreature(w, "heliobud", 5);
    const loud = { ...rules(), find: { ...rules().find, wild_win: { zone: 0, subject: 0.5, bright: 0 } } };
    expect(findCard(eco, loud, monsters, data, c, fixedRng(0.4))).toBe("subject_card_math");
    expect(findCard(eco, loud, monsters, data, c, fixedRng(0.6))).toBeNull();
  });

  it("the tutor gives the subject's card on every 4th lesson passed for the first time in that subject", () => {
    const w = new WorldState();
    const skills = { a: "science.a", b: "science.b", c: "science.c", d: "science.d", e: "math.e" };
    const subjectOfLesson = (id: string) => skills[id as keyof typeof skills]!.split(".")[0]!;
    w.lessons.done = ["a", "b", "e"];
    expect(tutorGift(eco, rules(), w.lessons.done, "c", subjectOfLesson)).toBeNull();
    w.lessons.done = ["a", "b", "c", "e"];
    expect(tutorGift(eco, rules(), w.lessons.done, "c", subjectOfLesson)).toBeNull();
    w.lessons.done = ["a", "b", "c", "d", "e"];
    expect(tutorGift(eco, rules(), w.lessons.done, "d", subjectOfLesson)).toBe("subject_card_science");
    // a subject with no card in the table gives nothing, never a crash
    expect(tutorGift(eco, { ...rules(), find: { ...rules().find, tutor_every: 1 } }, ["e"], "e", () => "art")).toBeNull();
  });
});
