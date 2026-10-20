// @vitest-environment node
/** C1-C7: content library loading and validation (test_learning_content.py). */
import { beforeAll, describe, expect, it } from "vitest";
import { ContentError, loadContent } from "../../../src/core/learning/content";
import { genContext } from "../../../src/core/learning/generators/common";
import { checkAnswer, type Question } from "../../../src/core/learning/model";
import { PyRandom } from "../../../src/core/learning/random";
import { library, loadTexts, realDocs } from "./helpers";

const GOOD = `
subject: math
skills:
  - id: math.add.a
    grade: 1
    title_he: חיבור
    title_en: Addition
    prereq: []
    generator: arithmetic.add
    params: {max_sum: 10}
  - id: math.add.b
    grade: 1
    title_he: חיבור עד 20
    title_en: Addition to 20
    prereq: [math.add.a]
    generator: arithmetic.add
    params: {max_sum: 20}
`;

function expectError(files: Record<string, string>, needle: string): void {
  let err: unknown;
  try {
    loadTexts(files);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ContentError);
  const errors = (err as ContentError).errors;
  expect(errors.some((e) => e.includes(needle)), errors.join("\n")).toBe(true);
}

/** Every skill id in the content files, ported generator or not. */
function allSkills(): { id: string; subject: string; grade: number; generator: string }[] {
  const out: { id: string; subject: string; grade: number; generator: string }[] = [];
  for (const [k, doc] of Object.entries(realDocs())) {
    if (!k.startsWith("skills/")) continue;
    const d = doc as { subject: string; skills: { id: string; grade: number; generator: string }[] };
    for (const s of d.skills) out.push({ id: s.id, subject: d.subject, grade: s.grade, generator: s.generator });
  }
  return out;
}

describe("content", () => {
  beforeAll(() => void library(), 120_000);

  it("c1 real content", () => {
    const skills = allSkills();
    const counts = new Map<string, number>();
    for (const s of skills) counts.set(s.subject, (counts.get(s.subject) ?? 0) + 1);
    expect(counts.get("math")!).toBeGreaterThanOrEqual(55);
    expect(counts.get("geometry")!).toBeGreaterThanOrEqual(28);
    expect(counts.get("logic")!).toBeGreaterThanOrEqual(12);
    const grades = new Set(skills.map((s) => s.grade));
    for (let g = 0; g < 10; g++) expect(grades.has(g)).toBe(true);
    for (const subject of ["math", "geometry"]) {
      const g = new Set(skills.filter((s) => s.subject === subject).map((s) => s.grade));
      for (let i = 0; i < 10; i++) expect(g.has(i), subject).toBe(true);
    }
    // The ported library holds every skill whose generator is ported.
    const lib = library();
    expect(lib.skills.size + lib.skipped.length).toBe(skills.length);
  });

  it("good tmp content", () => {
    const lib = loadTexts({ "skills/math.yaml": GOOD });
    expect(new Set(lib.skills.keys())).toEqual(new Set(["math.add.a", "math.add.b"]));
    expect(lib.skill("math.add.b").prereq).toEqual(["math.add.a"]);
    expect(lib.skill("math.add.a").mastery.min_attempts).toBe(12);
  });

  it("c2 duplicate id", () => {
    expectError({ "skills/math.yaml": GOOD.replace("id: math.add.b", "id: math.add.a") }, "duplicate");
  });

  it("c3 unknown generator", () => {
    const bad = GOOD.replace("generator: arithmetic.add\n    params: {max_sum: 20}", "generator: arithmetic.nope\n    params: {}");
    expectError({ "skills/math.yaml": bad }, "unknown generator");
  });

  it("c4 missing prereq", () => {
    expectError({ "skills/math.yaml": GOOD.replace("prereq: [math.add.a]", "prereq: [math.add.zzz]") }, "missing prereq");
  });

  it("c5 cycle", () => {
    expectError({ "skills/math.yaml": GOOD.replace("prereq: []", "prereq: [math.add.b]") }, "cycle");
  });

  it("bad grade and subject", () => {
    expectError({ "skills/math.yaml": GOOD.replace("grade: 1\n    title_he: חיבור\n", "grade: 12\n    title_he: חיבור\n") }, "grade");
    const bad2 = GOOD.replace("id: math.add.a", "id: geometry.add.a").replace("prereq: [math.add.a]", "prereq: [geometry.add.a]");
    expectError({ "skills/math.yaml": bad2 }, "subject");
  });

  const BANK_SKILLS = `
subject: science
skills:
  - id: science.living.basic
    grade: 1
    title_he: חי, צומח ודומם
    title_en: Living things
    prereq: []
    generator: bank
    params: {bank: science/living.yaml}
`;

  const BANK = `
skill: science.living.basic
items:
  - id: sci.living.001
    kind: choice
    grade: 1
    difficulty: 0.0
    prompt_he: מה מהבאים הוא יצור חי?
    prompt_en: Which of these is a living thing?
    choices:
      - {he: חתול, en: cat, emoji: 1f408}
      - {he: אבן, en: stone, emoji: 1faa8}
      - {he: כיסא, en: chair, emoji: 1fa91}
    answer: 0
    explanation_he: חתול נושם, אוכל, גדל ומתרבה. אבן וכיסא לא.
  - id: sci.living.002
    kind: true_false
    grade: 1
    prompt_he: עץ הוא יצור חי.
    answer: true
    explanation_he: עץ גדל, ניזון ומתרבה, ולכן הוא חי.
  - id: sci.living.003
    kind: order
    grade: 2
    prompt_he: סדרו מהקטן לגדול
    choices: [{he: זרע}, {he: שתיל}, {he: עץ}]
    answer: [0, 1, 2]
    explanation_he: מזרע צומח שתיל, ומשתיל גדל עץ.
`;

  it("c6 bank", () => {
    const lib = loadTexts({ "skills/science.yaml": BANK_SKILLS, "science/living.yaml": BANK });
    const seen = new Map<string, Question>();
    for (let seed = 0; seed < 60; seed++) {
      const q = lib.generate("science.living.basic", new PyRandom(seed));
      seen.set(q.item_id, q);
      expect(q.source).toBe("bank");
    }
    expect(new Set(seen.keys())).toEqual(new Set(["sci.living.001", "sci.living.002", "sci.living.003"]));
    const tf = seen.get("sci.living.002")!;
    expect(tf.kind).toBe("true_false");
    expect(tf.choices.map((c) => c.text_he)).toEqual(["נכון", "לא נכון"]);
    expect(checkAnswer(tf, "נכון").correct).toBe(true);
    const ch = seen.get("sci.living.001")!;
    expect(checkAnswer(ch, ch.answer as string).correct).toBe(true);
    expect(ch.choices.some((c) => c.image === "emoji:1f408")).toBe(true);
    const order = seen.get("sci.living.003")!;
    const texts = new Map(order.choices.map((c) => [c.id, c.text_he]));
    expect((order.answer as string[]).map((i) => texts.get(i))).toEqual(["זרע", "שתיל", "עץ"]);
  });

  it("c6 the pipeline's .json names work too", () => {
    const yamlLib = loadTexts({ "skills/science.yaml": BANK_SKILLS, "science/living.yaml": BANK });
    const jsonLib = loadTexts({ "skills/science.json": BANK_SKILLS, "science/living.json": BANK });
    expect(jsonLib.generate("science.living.basic", new PyRandom(3))).toEqual(yamlLib.generate("science.living.basic", new PyRandom(3)));
  });

  it.each([
    ["answer: 0\n", "answer: 5\n", "answer"],
    ["{he: אבן, en: stone, emoji: 1faa8}", "{he: חתול, en: stone}", "duplicate choice"],
    ["id: sci.living.002", "id: sci.living.001", "duplicate"],
    ["answer: true", "answer: 3", "true_false"],
    ["prompt_he: עץ הוא יצור חי.", "prompt_he: " + "א".repeat(141), "prompt_he"],
    ["prompt_he: עץ הוא יצור חי.", "prompt_he: עֵץ", "niqqud"],
  ])("c6 bank errors: %j -> %j", (old, neu, needle) => {
    expect(BANK.includes(old)).toBe(true);
    expectError({ "skills/science.yaml": BANK_SKILLS, "science/living.yaml": BANK.replace(old, neu) }, needle);
  });

  it("c6 missing bank file", () => {
    expect(() => loadTexts({ "skills/science.yaml": BANK_SKILLS })).toThrow(ContentError);
  });

  it("c7 every skill generates", { timeout: 60_000 }, () => {
    const lib = library();
    for (const skill of lib.skills.values()) {
      for (let seed = 0; seed < 40; seed++) {
        for (const age of [7, 11]) {
          const ctx = genContext({ skill_id: skill.id, subject: skill.subject, grade: skill.grade, age });
          const q = lib.generate(skill.id, new PyRandom(seed), ctx);
          expect(q.skill_id).toBe(skill.id);
          expect(q.subject).toBe(skill.subject);
          expect(checkAnswer(q, q.answer).correct, `${skill.id} ${seed}`).toBe(true);
        }
      }
    }
  });

  it("every generator used", () => {
    const used = new Set(allSkills().map((s) => s.generator));
    const registered = library()
      .registry.names()
      .filter((n) => n !== "bank");
    expect(registered.filter((n) => !used.has(n))).toEqual([]);
  });

  it("strict loading rejects an unported generator", () => {
    // Without allowMissingGenerators the real content must load in full
    // once every generator is ported; until then it lists what is missing.
    const lib = library();
    if (lib.skipped.length === 0) expect(() => loadContent(realDocs())).not.toThrow();
    else expect(() => loadContent(realDocs())).toThrow(ContentError);
  });
});
