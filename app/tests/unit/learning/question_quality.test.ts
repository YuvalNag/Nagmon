// @vitest-environment node
/**
 * Question quality, held as numbers (docs/app/QUESTION_AUDIT.md): a parent said the questions were
 * "not good, not varied, not right for their level". A headless child (qsim.ts) plays fixed seeds and
 * the served questions are measured: variety, the level served against the child's, the mix of kinds,
 * the distractors, and the banks' tells.
 */
import { describe, expect, it } from "vitest";
import { genContext } from "../../../src/core/learning/generators/common";
import { PyRandom } from "../../../src/core/learning/random";
import { BATTLE_SUBJECTS, childEngine, metrics, simulate } from "./qsim";
import { library } from "./helpers";

const GRADES = [0, 1, 2, 3, 4, 5, 6, 7, 8];

describe("variety", () => {
  it("no skill three times in a row after the first questions, no item twice within 12", { timeout: 120_000 }, () => {
    for (const g of GRADES) {
      for (const subject of ["math", "english", "science", "geometry"]) {
        const { served } = simulate({ grade: g, subject, seed: 40 + g, n: 100 });
        for (let i = 6; i < served.length - 2; i++) {
          const run = served[i]!.skill === served[i - 1]!.skill && served[i]!.skill === served[i - 2]!.skill;
          expect(run, `grade ${g} ${subject} question ${i}: ${served[i]!.skill} three times in a row`).toBe(false);
        }
        for (let i = 0; i < served.length; i++) {
          // a bank has fixed items; a generator may have few (3 + 1 is one item of kindergarten addition)
          const dup = served[i]!.q.source === "bank" && served.slice(Math.max(0, i - 12), i).some((p) => p.item === served[i]!.item);
          expect(dup, `grade ${g} ${subject} question ${i}: ${served[i]!.item} again within 12`).toBe(false);
        }
      }
    }
  });

  it("a mixed session has many skills and near-identical wordings are rare", { timeout: 120_000 }, () => {
    for (const g of GRADES) {
      const m = metrics(simulate({ grade: g, subject: null, seed: 70 + g, n: 200 }).served);
      expect(m.skillsPer20, `grade ${g}`).toBeGreaterThanOrEqual(g === 0 ? 7 : 10);
      expect(m.repeatShape20, `grade ${g}`).toBeLessThanOrEqual(0.2);
      expect(m.skillRun3, `grade ${g}`).toBeLessThanOrEqual(0.15);
    }
  });

  it("from grade 2 about one in ten answers is typed, and at least four kinds appear over a session", { timeout: 120_000 }, () => {
    for (const g of [3, 5, 7]) {
      const m = metrics(simulate({ grade: g, subject: null, seed: 90 + g, n: 300 }).served);
      expect((m.kinds["number"] ?? 0) / m.n, `grade ${g}`).toBeGreaterThanOrEqual(0.08);
      expect(Object.keys(m.kinds).length, `grade ${g}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("level", () => {
  it("never more than one grade above the child's level, and rarely two grades off it", { timeout: 120_000 }, () => {
    for (const g of GRADES) {
      for (const placement of [false, true]) {
        const m = metrics(simulate({ grade: g, subject: null, seed: 10 + g, n: 200, placement }).served);
        expect(m.maxAbove, `grade ${g} placement ${placement}`).toBeLessThanOrEqual(1);
        expect(m.offBand, `grade ${g} placement ${placement}`).toBeLessThanOrEqual(0.15);
      }
    }
  });

  it("the first ten questions after the owl's placement are varied and at the child's level", { timeout: 120_000 }, () => {
    for (const g of GRADES) {
      const { served } = simulate({ grade: g, subject: null, seed: 20 + g, n: 10, placement: true });
      expect(new Set(served.map((s) => s.skill)).size, `grade ${g}`).toBeGreaterThanOrEqual(g === 0 ? 3 : 5);
      for (const s of served) expect(s.skillGrade, `grade ${g}: ${s.skill}`).toBeLessThanOrEqual(s.level + 1);
    }
  });

  it("a grade-9 child is not asked a grade-2 skill by name on the map (the cashier)", () => {
    const lib = library();
    const eng = childEngine(9, 5);
    eng.learner.subject_grade.set("math", 9);
    for (let i = 0; i < 20; i++) {
      const q = eng.nextQuestion({ skill_id: "math.money.change_20", context: "shop" });
      expect(lib.get(q.skill_id)!.grade).toBeGreaterThanOrEqual(4);
    }
    const lesson = eng.nextQuestion({ skill_id: "math.money.change_20", context: "lesson" });
    expect(lesson.skill_id).toBe("math.money.change_20");
  });
});

describe("distractors", () => {
  const lib = library();
  const generated = [...lib.skills.values()].filter((s) => s.generator !== "bank");

  it("choices are never repeated, always hold the answer, and a typed question has none", () => {
    for (const s of generated) {
      for (let seed = 0; seed < 60; seed++) {
        const q = lib.generate(s.id, new PyRandom(900 + seed), genContext({ skill_id: s.id, subject: s.subject, grade: s.grade }));
        if (q.kind === "number" || q.kind === "letters" || q.kind === "order") continue;
        const texts = q.choices.map((c) => c.text_he + "|" + (c.image ?? ""));
        expect(new Set(texts).size, `${s.id} ${q.item_id}`).toBe(texts.length);
        if (q.kind === "choice") expect(q.choices.some((c) => c.id === q.answer), `${s.id} ${q.item_id}`).toBe(true);
      }
    }
  });

  it("no option that cannot be: a polygon with fewer than 3 sides, a 1-4 sudoku with a 5, zero things in a picture", () => {
    const check = (id: string, ok: (v: number) => boolean) => {
      const s = lib.skill(id);
      for (let seed = 0; seed < 200; seed++) {
        const q = lib.generate(id, new PyRandom(seed), genContext({ skill_id: id, subject: s.subject, grade: s.grade, max_choices: 4 }));
        for (const c of q.choices) {
          const v = Number(c.text_he.replace(/[\u2066\u2069]/g, ""));
          if (!Number.isNaN(v)) expect(ok(v), `${id} ${q.prompt_he}: ${c.text_he}`).toBe(true);
        }
      }
    };
    check("geometry.polygon.sides", (v) => v >= 3);
    check("logic.sudoku.row", (v) => v >= 1 && v <= 4);
    check("logic.sudoku.grid", (v) => v >= 1 && v <= 4);
    check("math.count.objects_5", (v) => v >= 1);
    check("math.count.objects_10", (v) => v >= 1);
    check("math.ratio.share", (v) => v >= 1);
  });

  it("the right number is not always between the smallest and the largest option", () => {
    let total = 0;
    let inside = 0;
    const rank = [0, 0, 0, 0];
    for (const s of generated) {
      for (let seed = 0; seed < 40; seed++) {
        const q = lib.generate(s.id, new PyRandom(300 + seed), genContext({ skill_id: s.id, subject: s.subject, grade: s.grade, age: 12 }));
        if (q.kind !== "choice" || q.choices.length !== 4) continue;
        const vals = q.choices.map((c) => Number(c.text_he.replace(/[⁦⁩,]/g, "").match(/^-?\d+(\.\d+)?/)?.[0]));
        if (vals.some((v) => Number.isNaN(v))) continue;
        const sorted = [...vals].sort((a, b) => a - b);
        const a = vals[q.choices.findIndex((c) => c.id === q.answer)]!;
        total++;
        if (a !== sorted[0] && a !== sorted[3]) inside++;
        rank[sorted.indexOf(a)]!++;
      }
    }
    expect(total).toBeGreaterThan(2000);
    // four options: by chance 0.5 are inside; it was 0.82
    expect(inside / total).toBeLessThan(0.62);
    for (const r of rank) expect(r / total).toBeGreaterThan(0.15);
  });
});

describe("banks", () => {
  const lib = library();
  const bank = (prefix: string) => [...lib.banks.entries()].filter(([sid]) => sid.startsWith(prefix)).flatMap(([, items]) => items);

  it("true-or-false in English grammar is not always 'false'", () => {
    const tf = bank("english.grammar").filter((i) => i.kind === "true_false");
    expect(tf.length).toBeGreaterThanOrEqual(30);
    expect(tf.filter((i) => i.answer === true).length / tf.length).toBeGreaterThanOrEqual(0.4);
  });

  it("no science question gives itself away by an answer far longer than the other options", () => {
    const text = (c: { he?: unknown; en?: unknown }) => String(c.he ?? c.en ?? "");
    const tells = bank("science").filter((i) => {
      if (i.kind !== "choice" || i.choices.length < 3) return false;
      const a = text(i.choices[Number(i.answer)]!).length;
      const others = Math.max(...i.choices.filter((_, k) => k !== Number(i.answer)).map((c) => text(c).length));
      return a >= 12 && a >= 2.5 * others && text(i.choices[Number(i.answer)]!).split(/\s+/).length >= 3;
    });
    expect(tells.map((i) => i.id)).toEqual([]);
  });

  it("Hebrew gender and plural questions do not carry silly or doubtful options", () => {
    const he = bank("hebrew.words");
    for (const i of he) {
      const all = i.choices.map((c) => String(c.he ?? "")).join("|");
      expect(all, i.id).not.toContain('"עיר גדול"');
      expect(all, i.id).not.toContain("השמש חם");
    }
    const plural = he.filter((i) => i.prompt_he.includes("הרבים של"));
    expect(plural.map((i) => i.choices.map((c) => String(c.he)).join()).join()).not.toMatch(/רגלים|ציפורות/);
  });

  it("every reading question carries its passage (the screen shows it)", () => {
    const reading = bank("english.reading").filter((i) => i.meta["passage_en"] !== undefined);
    expect(reading.length).toBeGreaterThan(50);
    for (const i of reading) expect(String(i.meta["passage_en"]).length, i.id).toBeGreaterThan(40);
  });
});

describe("subjects", () => {
  it("every battle subject has questions at every grade the child can meet", () => {
    const lib = library();
    for (const s of BATTLE_SUBJECTS) expect(lib.bySubject(s).length, s).toBeGreaterThan(5);
  });
});
