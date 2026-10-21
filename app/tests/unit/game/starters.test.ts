import { describe, expect, it } from "vitest";
import { monsterTable } from "../../../src/core/game/monsters";
import { pickStarters, starterLevel } from "../../../src/core/game/starters";
import { SubjectMap } from "../../../src/core/learning/quiz_flow";
import { gameJson } from "./helpers";

const monsters = monsterTable(gameJson("db/monsters.json"));
const subjects = SubjectMap.fromDoc(gameJson("content/subjects.json"));
const ALL = { math: 3, english: 3, science: 3, geometry: 3, logic: 3, hebrew: 2 };

describe("the three starters", () => {
  it("are always three, different creatures, each able to grow and with a picture", () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = pickStarters({ monsters, subjects, levels: ALL, chapterSubject: "science", seed });
      expect(s).toHaveLength(3);
      expect(new Set(s.map((x) => x.species)).size).toBe(3);
      for (const x of s) {
        expect(monsters[x.species]).toMatchObject({ stage: "basic", hasSprite: true });
        expect(monsters[x.species]!.evolutions.length).toBeGreaterThan(0);
      }
    }
  });

  it("are of different subjects, so the child chooses what to practise", () => {
    const s = pickStarters({ monsters, subjects, levels: ALL, chapterSubject: null, seed: 1 });
    expect(new Set(s.map((x) => x.subject)).size).toBe(3);
  });

  it("one is of the chapter's subject when there is one, and one of the child's strongest", () => {
    const levels = { ...ALL, geometry: 6 };
    const s = pickStarters({ monsters, subjects, levels, chapterSubject: "geometry", seed: 2 });
    expect(s.some((x) => x.reason === "chapter" && x.subject === "geometry")).toBe(true);
    const s2 = pickStarters({ monsters, subjects, levels: { ...ALL, math: 6 }, chapterSubject: "logic", seed: 2 });
    expect(s2.find((x) => x.reason === "strong")!.subject).toBe("math");
  });

  it("whatever the answers were: all wrong still gives three to choose from", () => {
    const s = pickStarters({ monsters, subjects, levels: { math: 0, english: 0, science: 0, geometry: 0, logic: 0, hebrew: 0 }, chapterSubject: "science", seed: 3 });
    expect(s).toHaveLength(3);
  });

  it("the same seed, the same three; another seed may differ", () => {
    const a = pickStarters({ monsters, subjects, levels: ALL, chapterSubject: "science", seed: 5 });
    expect(pickStarters({ monsters, subjects, levels: ALL, chapterSubject: "science", seed: 5 })).toEqual(a);
  });

  it("starts at a level that follows the subject's level", () => {
    // a small first friend: grades 0 to 2 start at 2, grade 9 at 5, never above 6
    expect([0, 1, 2].map(starterLevel)).toEqual([2, 2, 2]);
    expect(starterLevel(4)).toBe(3);
    expect(starterLevel(9)).toBe(5);
    expect(starterLevel(30)).toBe(6);
  });
});
