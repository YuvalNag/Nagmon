import { describe, expect, it } from "vitest";
import {
  addCharges,
  awardFor,
  learnedSkills,
  lessonRewards,
  loadLessons,
  noLessonSave,
  notesFor,
  parseLesson,
  useNote,
} from "../../../src/core/game/lessons";
import { defaultsForGrade } from "../../../src/core/family/gradeDefaults";
import { WorldState } from "../../../src/core/world/worldState";

const moonDoc = {
  id: "moon",
  skill: "science.space.moon",
  institute: "station",
  title_he: "הירח",
  cards: [{ emoji: "1f319", he: "למה הירח משנה צורה?", en: "Why?" }, { emoji: "2600", he: "השמש מאירה אותו.", highlight: "השמש" }],
  notes: { emoji: "1f311", he: "הירח מקיף את כדור הארץ.", en: "It circles Earth." },
  practice: { bank: "sci.space.013" },
};
const moon = parseLesson(moonDoc)!;

describe("parseLesson", () => {
  it("reads a lesson file", () => {
    expect(moon.skill).toBe("science.space.moon");
    expect(moon.cards).toHaveLength(2);
    expect(moon.cards[1]?.highlight).toBe("השמש");
    expect(moon.note?.text).toContain("הירח");
    expect(moon.practice).toEqual({ kind: "bank", id: "sci.space.013" });
  });
  it("is not a lesson without a skill or with fewer than two cards", () => {
    expect(parseLesson({ ...moonDoc, skill: undefined })).toBeNull();
    expect(parseLesson({ ...moonDoc, cards: [moonDoc.cards[0]] })).toBeNull();
    expect(parseLesson("x")).toBeNull();
  });
  it("keeps at most four cards and drops a highlight that is not in the text", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ he: `כרטיס ${i}`, highlight: "zzz" }));
    const l = parseLesson({ ...moonDoc, cards: many })!;
    expect(l.cards).toHaveLength(4);
    expect(l.cards[0]?.highlight).toBeNull();
  });
  it("takes an inline practice only with exactly one right answer", () => {
    const inline = (a: boolean, b: boolean) => ({ inline: { prompt_he: "?", choices: [{ he: "א", correct: a }, { he: "ב", correct: b }] } });
    expect(parseLesson({ ...moonDoc, practice: inline(true, false) })?.practice?.kind).toBe("inline");
    expect(parseLesson({ ...moonDoc, practice: inline(true, true) })?.practice).toBeNull();
    expect(parseLesson({ ...moonDoc, practice: inline(false, false) })?.practice).toBeNull();
  });
  it("uses the file name when the file has no id", () => {
    expect(parseLesson({ ...moonDoc, id: undefined }, "moon")?.id).toBe("moon");
  });
});

describe("loadLessons", () => {
  it("skips missing and broken files, and works with none", async () => {
    const files: Record<string, unknown> = { "lessons/moon.json": moonDoc, "lessons/bad.json": { skill: "x" } };
    const fetchJson = async (p: string) => {
      if (!(p in files)) throw new Error("404");
      return files[p];
    };
    expect((await loadLessons(fetchJson, ["moon", "bad", "gone"])).map((l) => l.id)).toEqual(["moon"]);
    expect(await loadLessons(async () => { throw new Error("404"); })).toEqual([]);
  });
});

describe("notesFor", () => {
  it("gives the note only after the lesson is passed", () => {
    const s = noLessonSave();
    expect(notesFor([moon], s, "science.space.moon")).toBeNull();
    const done = awardFor("moon", s, "2026-10-20").state;
    expect(notesFor([moon], done, "science.space.moon")?.text).toBe("הירח מקיף את כדור הארץ.");
    expect(notesFor([moon], done, "science.space.stars")).toBeNull();
    expect(learnedSkills([moon], done)).toEqual(["science.space.moon"]);
  });
  it("gives nothing for a lesson without a note", () => {
    const bare = parseLesson({ ...moonDoc, notes: undefined })!;
    expect(notesFor([bare], { ...noLessonSave(), done: ["moon"] }, bare.skill)).toBeNull();
  });
});

describe("awardFor", () => {
  it("pays 40 coins once, on the first pass", () => {
    const a = awardFor("moon", noLessonSave(), "2026-10-20");
    expect(a).toMatchObject({ coins: 40, first: true });
    expect(a.state.done).toEqual(["moon"]);
    expect(a.state.repeatDay).toBeNull();
  });
  it("pays 10 for a repeat, once a day", () => {
    const first = awardFor("moon", noLessonSave(), "2026-10-20").state;
    const r1 = awardFor("moon", first, "2026-10-20");
    expect(r1).toMatchObject({ coins: 10, first: false });
    expect(r1.state.repeatDay).toBe("2026-10-20");
    expect(awardFor("moon", r1.state, "2026-10-20").coins).toBe(0);
    // another lesson's repeat the same day pays nothing either
    const both = awardFor("stars", r1.state, "2026-10-20").state;
    expect(awardFor("stars", both, "2026-10-20").coins).toBe(0);
    expect(awardFor("moon", r1.state, "2026-10-21").coins).toBe(10);
  });
  it("uses the parent's amounts and does not change the old state", () => {
    const s = noLessonSave();
    const a = awardFor("moon", s, "d", { firstPass: 5, repeat: 2 });
    expect(a.coins).toBe(5);
    expect(s.done).toEqual([]);
  });
});

describe("lessonRewards", () => {
  it("defaults, reads the child's settings, and ignores bad values", () => {
    expect(lessonRewards({})).toEqual({ firstPass: 40, repeat: 10 });
    expect(lessonRewards(null)).toEqual({ firstPass: 40, repeat: 10 });
    expect(lessonRewards(defaultsForGrade(3).settings)).toEqual({ firstPass: 40, repeat: 10 });
    expect(lessonRewards({ lessons: { first_pass_coins: 60, repeat_coins: 0 } })).toEqual({ firstPass: 60, repeat: 0 });
    expect(lessonRewards({ lessons: { first_pass_coins: -5, repeat_coins: "x" } })).toEqual({ firstPass: 0, repeat: 10 });
  });
});

describe("useNote", () => {
  it("is free once per battle, then costs a charge, then is refused", () => {
    const s = addCharges(noLessonSave(), 1);
    const a = useNote(s, false);
    expect(a).toMatchObject({ ok: true, free: true });
    expect(a.state.charges).toBe(1);
    const b = useNote(a.state, true);
    expect(b).toMatchObject({ ok: true, free: false });
    expect(b.state.charges).toBe(0);
    const c = useNote(b.state, true);
    expect(c.ok).toBe(false);
    expect(c.state.charges).toBe(0);
  });
});

describe("world state", () => {
  it("keeps the lessons save, and an old file without it loads and saves as before", () => {
    const old = WorldState.fromDict({ schema_version: 1, money: 5, variables: {} });
    expect(old.lessons).toEqual(noLessonSave());
    expect(old.toDict()).not.toHaveProperty("lessons");
    const w = new WorldState();
    w.lessons = { done: ["moon"], repeatDay: "2026-10-20", charges: 2 };
    const back = WorldState.fromDict(JSON.parse(JSON.stringify(w.toDict())));
    expect(back.lessons).toEqual({ done: ["moon"], repeatDay: "2026-10-20", charges: 2 });
  });
  it("reads a damaged lessons field as nothing learned", () => {
    const w = WorldState.fromDict({ lessons: { done: ["a", "a", 3], charges: -4, repeatDay: 7 } });
    expect(w.lessons).toEqual({ done: ["a"], repeatDay: null, charges: 0 });
  });
});
