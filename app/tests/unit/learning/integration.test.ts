// @vitest-environment node
/// <reference types="node" />
/**
 * I1-I14: content integration (test_learning_integration.py). Real merged
 * content (all subjects), the `english.vocab` generator, the extra bank
 * formats (sentences, phonics, reading, monster facts) and the AI-studio
 * bank given to the loader as `extraBanks`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ContentError, type ContentLibrary } from "../../../src/core/learning/content";
import { LearningEngine } from "../../../src/core/learning/engine";
import { genContext } from "../../../src/core/learning/generators/common";
import type { VocabWord } from "../../../src/core/learning/generators/english";
import { LearnerState } from "../../../src/core/learning/learner";
import { CHOICE_KINDS, checkAnswer, type Question } from "../../../src/core/learning/model";
import { PyRandom } from "../../../src/core/learning/random";
import { CONTENT_DIR, dedent, FakeClock, library, loadTexts, parseYaml } from "./helpers";

const NIQQUD = /[֑-ׇֽֿׁׂׅׄ]/;
const PICTURE_MODES = new Set(["picture_to_word", "listen_to_picture"]);
const ALL_MODES = ["picture_to_word", "word_to_translation", "listen_to_picture", "spelling", "sentence_cloze"];
const ITEM_ID =
  /^english\.vocab:[a-z0-9_]+\.[a-z]+\.(picture_to_word|word_to_translation|translation_to_word|listen_to_picture|spelling|sentence_cloze)$/;

function counter(xs: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** The answer is reachable from the choices and checks as correct. */
function assertValid(q: Question): void {
  const ids = q.choices.map((c) => c.id);
  expect(new Set(ids).size, q.item_id).toBe(ids.length);
  if (CHOICE_KINDS.has(q.kind)) expect(ids).toContain(q.answer);
  else if (q.kind === "order") expect([...(q.answer as string[])].sort()).toEqual([...ids].sort());
  else if (q.kind === "letters") {
    const tiles = counter(q.choices.map((c) => c.text_he));
    for (const [ch, n] of counter(Array.from(q.answer as string))) expect(tiles.get(ch) ?? 0, q.item_id).toBeGreaterThanOrEqual(n);
  }
  expect(checkAnswer(q, q.answer).correct, q.item_id).toBe(true);
  expect(q.explanation_he, q.item_id).toBeTruthy();
  for (const text of [q.prompt_he, q.explanation_he, ...q.choices.map((c) => c.text_he)]) expect(NIQQUD.test(text), text).toBe(false);
}

/** Parse YAML texts as files; a text that does not parse becomes an Error, as a reader would pass it. */
function files(texts: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(texts)) {
    try {
      out[k] = parseYaml(dedent(v));
    } catch (e) {
      out[k] = e instanceof Error ? e : new Error(String(e));
    }
  }
  return out;
}

describe("integration: real content", () => {
  beforeAll(() => void library(), 120_000);

  it("i1 real content counts", () => {
    const lib = library();
    const skills = counter([...lib.skills.values()].map((s) => s.subject));
    expect(skills.get("english")!).toBeGreaterThanOrEqual(55);
    expect(skills.get("science")!).toBeGreaterThanOrEqual(55);
    expect(skills.get("hebrew")!).toBeGreaterThanOrEqual(11);
    expect([...lib.skills.values()].filter((s) => s.generator === "english.vocab").length).toBeGreaterThanOrEqual(20);
    const items = new Map<string, Set<string>>();
    for (const [sid, bank] of lib.banks) {
      const subject = lib.skill(sid).subject;
      if (!items.has(subject)) items.set(subject, new Set());
      for (const it of bank) items.get(subject)!.add(it.id);
    }
    expect(items.get("english")!.size).toBeGreaterThanOrEqual(600); // phonics + grammar + reading
    expect(items.get("science")!.size).toBeGreaterThanOrEqual(700);
    expect(items.get("hebrew")!.size).toBeGreaterThanOrEqual(150);
    expect(lib.words.length).toBeGreaterThanOrEqual(850);
    expect(lib.warnings).toEqual([]);
  });

  it("i8 reading passages", () => {
    const lib = library();
    for (let level = 1; level < 7; level++) {
      const sid = `english.reading.level${level}`;
      const bank = lib.banks.get(sid)!;
      expect(bank.length, sid).toBeGreaterThanOrEqual(12);
      for (const it of bank) {
        expect(it.skill).toBe(sid);
        expect(it.tags).toContain(`level${level}`);
      }
      for (let seed = 0; seed < 20; seed++) {
        const q = lib.generate(sid, new PyRandom(seed));
        assertValid(q);
        const meta = q.meta as Record<string, string>;
        expect(q.item_id.startsWith(meta["passage_id"] + ".q")).toBe(true);
        expect(meta["passage_en"] && meta["passage_he"]).toBeTruthy();
        expect(meta["passage_title"]).toBeTruthy();
        expect(q.prompt_he.includes(meta["passage_en"]!)).toBe(false);
        expect(Array.from(q.prompt_he).length).toBeLessThanOrEqual(140);
      }
    }
  });

  it("i9 element facts", () => {
    const lib = library();
    const facts = lib.elementFacts;
    for (const e of ["fire", "water", "cosmic", "shadow"]) expect(facts.has(e), e).toBe(true);
    const ids = new Set<string>();
    for (const [element, lst] of facts) {
      expect(lst.length, element).toBeGreaterThanOrEqual(8);
      for (const f of lst) {
        expect(Object.keys(f).sort()).toEqual(["en", "he", "id"]);
        expect(f.he && f.en && !NIQQUD.test(f.he)).toBeTruthy();
        expect(ids.has(f.id)).toBe(false);
        ids.add(f.id);
      }
    }
    expect(lib.elementTitles.get("fire")!.he).toBeTruthy();
    expect(lib.banks.get("science.elements.cards")!.length).toBeGreaterThanOrEqual(20);
  });

  it("i11 engine records vocab words", () => {
    const clock = new FakeClock();
    const learner = new LearnerState({ learner_id: "t", name: "ת", grade: 1, age: 6 });
    learner.settings["worked_examples"] = false;
    const eng = new LearningEngine(library(), learner, { rng: new PyRandom(3), clock: clock.call });
    const q = eng.nextQuestion({ skill_id: "english.vocab.preA1_animals", context: "practice" });
    const word = q.meta["word"] as string;
    const wrong = q.choices.find((c) => c.id !== q.answer)!.id;
    eng.submit(q, wrong, { elapsed_s: 3.0, context: "practice" });
    expect(learner.words.has(word)).toBe(false);
    eng.submit(q, q.answer, { elapsed_s: 3.0, context: "practice" });
    expect(learner.words.get(word)).toBe(clock.now);
  });

  it("i12 words_he", () => {
    const he = library().wordsHe();
    expect(he.get("dog")).toBe("כלב");
    expect(he.get("cat")).toBe("חתול");
    expect(he.size).toBeGreaterThanOrEqual(850);
    for (const v of he.values()) expect(typeof v === "string" && v.length > 0).toBe(true);
  });

  it("i14 every skill generates valid", { timeout: 60_000 }, () => {
    const lib = library();
    const problems: string[] = [];
    for (const skill of lib.skills.values()) {
      for (let seed = 0; seed < 5; seed++) {
        for (const age of [6, 10]) {
          try {
            const q = lib.generate(skill.id, new PyRandom(seed), genContext({ skill_id: skill.id, subject: skill.subject, grade: skill.grade, age }));
            expect(q.skill_id).toBe(skill.id);
            assertValid(q);
          } catch (e) {
            problems.push(`${skill.id} seed=${seed} age=${age}: ${String(e)}`);
          }
        }
      }
    }
    expect(problems.slice(0, 20)).toEqual([]);
  });
});

describe("integration: english.vocab (I2-I6)", () => {
  let vocabLib: ContentLibrary;

  beforeAll(() => {
    // Real words.yaml, one skill per mode (A1 animals + food).
    const lines = ["subject: english", "skills:"];
    for (const mode of [...ALL_MODES, "all"]) {
      const modes = mode === "all" ? ALL_MODES : [mode];
      lines.push(
        `  - id: english.vocab.m_${mode}`,
        "    grade: 3",
        "    title_he: אוצר מילים",
        "    title_en: Vocabulary",
        "    prereq: []",
        "    generator: english.vocab",
        `    params: {topics: [animals, food], level: A1, modes: [${modes.join(", ")}]}`,
      );
    }
    vocabLib = loadTexts({
      "english/words.yaml": readFileSync(join(CONTENT_DIR, "english", "words.yaml"), "utf8"),
      "skills/english.yaml": lines.join("\n") + "\n",
    });
  }, 120_000);

  function wordsBy(key: "word" | "he"): Map<string, VocabWord> {
    const out = new Map<string, VocabWord>();
    for (const w of vocabLib.words) if (w.level === "A1" && (w.topic === "animals" || w.topic === "food") && !out.has(w[key])) out.set(w[key], w);
    return out;
  }

  function gen(sid: string, seed: number, age = 10): Question {
    const sk = vocabLib.skill(sid);
    return vocabLib.generate(sid, new PyRandom(seed), genContext({ skill_id: sid, subject: sk.subject, grade: age - 6, age }));
  }

  it.each(ALL_MODES)("i2 vocab mode valid: %s", (mode) => {
    const sid = `english.vocab.m_${mode}`;
    const byWord = wordsBy("word");
    const byHe = wordsBy("he");
    const modes = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const q = gen(sid, seed);
      assertValid(q);
      modes.add(q.meta["mode"] as string);
      expect(q.skill_id).toBe(sid);
      expect(q.subject).toBe("english");
      const target = byWord.get(q.meta["word"] as string)!;
      expect(q.meta["topic"]).toBe(target.topic);
      expect(q.meta["level"]).toBe("A1");
      if (q.kind === "letters") continue;
      const textsHe = q.choices.map((c) => c.text_he);
      const textsEn = q.choices.map((c) => c.text_en).filter((t) => t);
      const images = q.choices.map((c) => c.image).filter((t) => t);
      expect(new Set(textsHe).size).toBe(textsHe.length);
      expect(new Set(textsEn).size).toBe(textsEn.length);
      expect(new Set(images).size).toBe(images.length);
      expect([0, q.choices.length], "giveaway picture").toContain(images.length);
      expect(q.choices.length >= 3 && q.choices.length <= 4).toBe(true);
      for (const c of q.choices) {
        const w = byWord.get(c.text_en ?? "") ?? byHe.get(c.text_he);
        expect(w, `${q.item_id} ${c.text_he}`).toBeDefined();
        expect(w!.level === "A1" && (w!.topic === "animals" || w!.topic === "food")).toBe(true);
        if (c.id !== q.answer && target.emoji && w!.emoji) expect(w!.emoji).not.toBe(target.emoji);
      }
    }
    if (mode === "word_to_translation") expect(modes).toEqual(new Set(["word_to_translation", "translation_to_word"]));
    else expect(modes).toEqual(new Set([mode]));
  });

  it("i2 distractors same topic", () => {
    const byWord = wordsBy("word");
    for (let seed = 0; seed < 40; seed++) {
      const q = gen("english.vocab.m_picture_to_word", seed);
      const topics = new Set(q.choices.map((c) => byWord.get(c.text_en!)!.topic));
      expect(topics).toEqual(new Set([q.meta["topic"]]));
    }
  });

  it("i5 mode details", () => {
    const byWord = wordsBy("word");
    for (let seed = 0; seed < 30; seed++) {
      let q = gen("english.vocab.m_picture_to_word", seed);
      let w = byWord.get(q.meta["word"] as string)!;
      expect(q.figure?.kind).toBe("objects");
      expect(q.figure!.data["emoji"]).toBe(w.emoji);
      expect(q.choices.some((c) => c.image)).toBe(false);
      expect(q.choices.filter((c) => c.id === q.answer).map((c) => c.text_en)).toEqual([w.word]);

      q = gen("english.vocab.m_listen_to_picture", seed);
      w = byWord.get(q.meta["word"] as string)!;
      expect(q.speak["en"]).toBe(w.word);
      expect(q.choices.every((c) => c.image && c.image.startsWith("emoji:"))).toBe(true);
      let answer = q.choices.find((c) => c.id === q.answer)!;
      expect(answer.image).toBe(`emoji:${w.emoji}`);
      expect((q.prompt_en ?? "").toLowerCase().includes(w.word.toLowerCase())).toBe(false);
      expect(q.prompt_he.toLowerCase().includes(w.word.toLowerCase())).toBe(false);

      q = gen("english.vocab.m_spelling", seed);
      expect(q.kind).toBe("letters");
      expect(q.answer).toBe(q.meta["word"]);
      expect(q.speak["en"]).toBe(q.meta["word"]);
      expect(q.choices.length).toBeGreaterThan((q.answer as string).length); // extra letters to choose
      expect(checkAnswer(q, Array.from(q.answer as string)).correct).toBe(true);
      expect(checkAnswer(q, Array.from(q.answer as string).reverse().join("") + "x").correct).toBe(false);

      q = gen("english.vocab.m_sentence_cloze", seed);
      expect(q.prompt_en).toContain("___");
      const word = q.meta["word"] as string;
      const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z])`, "iu").test(q.prompt_en!)).toBe(false);
      answer = q.choices.find((c) => c.id === q.answer)!;
      expect(answer.text_en).toBe(word);

      q = gen("english.vocab.m_word_to_translation", seed);
      w = byWord.get(q.meta["word"] as string)!;
      answer = q.choices.find((c) => c.id === q.answer)!;
      if (q.meta["mode"] === "word_to_translation") {
        expect(answer.text_he).toBe(w.he);
        expect(q.speak["en"]).toBe(w.word);
      } else {
        expect(answer.text_en).toBe(w.word);
        expect(q.prompt_he).toContain(w.he);
      }
    }
  });

  it.each([5, 6, 7])("i3 young only picture modes: age %d", (age) => {
    for (let seed = 0; seed < 60; seed++) {
      const q = gen("english.vocab.m_all", seed, age);
      expect(PICTURE_MODES.has(q.meta["mode"] as string), String(q.meta["mode"])).toBe(true);
      assertValid(q);
    }
  });

  it("i3 young fallback without picture modes", () => {
    expect(gen("english.vocab.m_spelling", 1, 6).meta["mode"]).toBe("spelling");
  });

  it("i3 older get all modes", () => {
    const modes = new Set<string>();
    for (let s = 0; s < 200; s++) modes.add(gen("english.vocab.m_all", s, 10).meta["mode"] as string);
    for (const m of ALL_MODES) expect(modes.has(m), m).toBe(true);
  });

  it("i4 vocab stable ids", () => {
    const seen = new Map<string, string>();
    for (let seed = 0; seed < 300; seed++) {
      const q = gen("english.vocab.m_all", seed);
      expect(ITEM_ID.test(q.item_id), q.item_id).toBe(true);
      const key = `${String(q.meta["word"])}|${String(q.meta["mode"])}`;
      if (!seen.has(q.item_id)) seen.set(q.item_id, key);
      expect(seen.get(q.item_id)).toBe(key);
      expect(q.item_id.endsWith("." + String(q.meta["mode"]))).toBe(true);
      expect(gen("english.vocab.m_all", seed)).toEqual(q);
    }
    expect(vocabLib.skill("english.vocab.m_all").srs).toBe(true);
  });

  it("i6 hebrew and explanation", () => {
    const byWord = wordsBy("word");
    const singular = /(?<![\p{L}\p{N}_])(בחר|בחרי|הקשב|הקשיבי|סדר|סדרי|כתוב|כתבי)(?![\p{L}\p{N}_])/u;
    for (let seed = 0; seed < 120; seed++) {
      const q = gen("english.vocab.m_all", seed);
      const w = byWord.get(q.meta["word"] as string)!;
      expect(singular.test(q.prompt_he), q.prompt_he).toBe(false);
      expect(Array.from(q.prompt_he).length).toBeLessThanOrEqual(140);
      expect(Array.from(q.explanation_he).length).toBeLessThanOrEqual(200);
      expect(q.explanation_he.includes(w.word) && q.explanation_he.includes(w.he)).toBe(true);
      expect(q.explanation_he.includes(w.example_en) || (q.explanation_en ?? "").includes(w.example_en)).toBe(true);
    }
  });
});

describe("integration: validation and banks", () => {
  it("vocab skill validation", () => {
    let err: unknown;
    try {
      loadTexts({
        "english/words.yaml": "[]\n",
        "skills/english.yaml": `
        subject: english
        skills:
          - id: english.vocab.bad
            grade: 1
            title_he: מילים
            title_en: Words
            prereq: []
            generator: english.vocab
            params: {topics: [nothing], level: A1, modes: [juggling]}
        `,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ContentError);
    const errs = (err as ContentError).errors.join(" ");
    expect(errs).toContain("juggling");
    expect(errs).toContain("nothing");
  });

  const EN_SKILLS = `
subject: english
skills:
  - id: english.phonics.initial_sounds
    grade: 1
    title_he: הצליל הראשון
    title_en: Initial sounds
    prereq: []
    generator: bank
    params: {bank: english/phonics.yaml, tags: [initial_sounds]}
  - id: english.phonics.other
    grade: 1
    title_he: אחר
    title_en: Other
    prereq: []
    generator: bank
    params: {bank: english/phonics.yaml, tags: [other]}
`;

  const PHONICS = `
items:
  - id: eng.ph.initial_sounds.001
    skill: english.phonics.initial_sounds
    kind: choice
    grade: 1
    prompt_he: "באיזו אות מתחילה המילה?"
    prompt_en: "Which letter does the word start with?"
    emoji: "1f34e"
    speak_en: "apple"
    choices:
      - {en: "n"}
      - {en: "z"}
      - {en: "a"}
    answer: 2
    explanation_he: "apple מתחילה באות a."
    tags: [initial_sounds]
  - id: eng.ph.other.001
    skill: english.phonics.other
    kind: choice
    grade: 1
    prompt_he: "מה בתמונה?"
    choices:
      - {en: "cat", emoji: 1f408}
      - {en: "dog", emoji: 1f415}
    answer: 0
    explanation_he: "חתול הוא cat."
    tags: [other]
`;

  it("i7 speak_en, emoji and English choices", () => {
    const lib = loadTexts({ "skills/english.yaml": EN_SKILLS, "english/phonics.yaml": PHONICS });
    const q = lib.generate("english.phonics.initial_sounds", new PyRandom(1));
    expect(q.item_id).toBe("eng.ph.initial_sounds.001");
    expect(q.speak["en"]).toBe("apple");
    expect(q.speak["he"]).toBe(q.prompt_he);
    expect(q.figure?.kind).toBe("objects");
    expect(q.figure!.data).toEqual({ emoji: "1f34e", count: 1 });
    expect(q.choices.map((c) => c.text_he).sort()).toEqual(["a", "n", "z"]);
    const aTile = q.choices.find((c) => c.text_he === "a")!.id;
    expect(aTile).toBe(q.answer); // the UI submits choice ids
    const other = lib.generate("english.phonics.other", new PyRandom(1));
    expect(other.item_id).toBe("eng.ph.other.001"); // tags pick by skill
    expect(other.choices.every((c) => c.image)).toBe(true);
  });

  it("i7 partial choice emoji is an error", () => {
    let err: unknown;
    try {
      loadTexts({ "skills/english.yaml": EN_SKILLS, "english/phonics.yaml": PHONICS.replace('{en: "dog", emoji: 1f415}', '{en: "dog"}') });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ContentError);
    expect((err as ContentError).errors.some((e) => e.includes("emoji"))).toBe(true);
  });

  it.each(["eng ph 1", "שלום.1", "a/b"])("item id charset: %j", (bad) => {
    let err: unknown;
    try {
      loadTexts({ "skills/english.yaml": EN_SKILLS, "english/phonics.yaml": PHONICS.replace("id: eng.ph.other.001", `id: '${bad}'`) });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ContentError);
    expect((err as ContentError).errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("ai style ids valid in main bank", () => {
    const lib = loadTexts({ "skills/english.yaml": EN_SKILLS, "english/phonics.yaml": PHONICS.replace("id: eng.ph.other.001", "id: ai.1a2b3c4d") });
    expect(lib.banks.get("english.phonics.other")![0]!.id).toBe("ai.1a2b3c4d");
  });
});

describe("integration: AI-studio bank (I10)", () => {
  const SCI_SKILLS = `
subject: science
skills:
  - id: science.living.basic
    grade: 1
    title_he: חי, צומח ודומם
    title_en: Living things
    prereq: []
    generator: bank
    params: {bank: science/living.yaml, tags: [living]}
`;

  const MATH_SKILLS = `
subject: math
skills:
  - id: math.add.a
    grade: 1
    title_he: חיבור
    title_en: Addition
    prereq: []
    generator: arithmetic.add
    params: {max_sum: 10}
`;

  const SCI_BANK = `
skill: science.living.basic
items:
  - id: sci.living.001
    kind: true_false
    grade: 1
    prompt_he: עץ הוא יצור חי.
    answer: true
    explanation_he: עץ גדל, ניזון ומתרבה.
    tags: [living]
`;

  const AI_SCIENCE = `
items:
  - id: ai.0a1b2c3d
    skill: science.living.basic
    kind: choice
    grade: 1
    difficulty: 0.0
    prompt_he: מה צריך צמח כדי לגדול?
    prompt_en: What does a plant need to grow?
    choices:
      - {he: מים ואור}
      - {he: חושך בלבד}
    answer: 0
    explanation_he: צמח צריך מים ואור כדי לייצר מזון.
    tags: [plants, ai]
  - id: ai.ffffffff
    skill: science.nope.unknown
    kind: true_false
    prompt_he: שאלה למיומנות שלא קיימת.
    answer: true
    explanation_he: הסבר.
  - id: ai.eeeeeeee
    skill: science.living.basic
    kind: choice
    prompt_he: פריט פגום
    choices: [{he: א}, {he: ב}]
    answer: 7
    explanation_he: הסבר.
  - id: sci.living.001
    skill: science.living.basic
    kind: true_false
    prompt_he: כפילות של פריט מהמאגר.
    answer: false
    explanation_he: הסבר.
`;

  const AI_MATH = `
items:
  - id: ai.12345678
    skill: math.add.a
    kind: choice
    grade: 1
    prompt_he: לדני 2 תפוחים ולנועה 3. כמה יחד?
    choices: [{he: '5'}, {he: '6'}, {he: '4'}]
    answer: 0
    explanation_he: 2 ועוד 3 הם 5.
`;

  const content = { "skills/science.yaml": SCI_SKILLS, "skills/math.yaml": MATH_SKILLS, "science/living.yaml": SCI_BANK };
  const aiBank = (): Record<string, unknown> =>
    files({
      "science.yaml": AI_SCIENCE,
      "math.yaml": AI_MATH,
      "english.yaml": "items: [unclosed\n",
      "provenance.yaml": "{ai.0a1b2c3d: {provider: x}}\n",
    });

  it("i10 ai bank attaches by skill", () => {
    const lib = loadTexts(content, { extraBanks: [aiBank()] });
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) seen.add(lib.generate("science.living.basic", new PyRandom(s)).item_id);
    expect(seen).toEqual(new Set(["sci.living.001", "ai.0a1b2c3d"])); // bypasses tags
    const warn = lib.warnings.join(" ");
    expect(warn).toContain("science.nope.unknown");
    expect(warn).toContain("ai.eeeeeeee");
    expect(warn).toContain("sci.living.001"); // duplicate id
    expect(warn).toContain("english.yaml"); // broken YAML
    expect(warn).not.toContain("provenance");
  });

  it("i10 ai items mix into generator skills", () => {
    const lib = loadTexts(content, { extraBanks: [aiBank()] });
    let ai = 0;
    for (let s = 0; s < 300; s++) {
      const q = lib.generate("math.add.a", new PyRandom(s));
      assertValid(q);
      if (q.item_id === "ai.12345678") ai += 1;
    }
    expect(ai).toBeGreaterThan(0);
    expect(ai).toBeLessThan(100);
  });

  it("i10 missing extra dir is fine", () => {
    const lib = loadTexts(content, { extraBanks: [{}] });
    expect(lib.warnings).toEqual([]);
  });

  it("i10 ai reading and vocab", () => {
    const toys = [
      ["ball", "כדור"],
      ["doll", "בובה"],
      ["kite", "עפיפון"],
    ];
    const words = toys
      .map(([w, h]) => `- {word: ${w}, he: ${h}, pos: noun, topic: toys, level: A1, grade: 3, emoji: null, example_en: 'A ${w}.', example_he: '${h}.'}\n`)
      .join("");
    const lib = loadTexts(
      {
        "skills/english.yaml": `
        subject: english
        skills:
          - id: english.reading.level1
            grade: 3
            title_he: קריאה
            title_en: Reading
            prereq: []
            generator: bank
            params: {bank: english/reading.yaml, tags: [level1]}
          - id: english.reading.level2
            grade: 4
            title_he: קריאה 2
            title_en: Reading 2
            prereq: []
            generator: bank
            params: {bank: english/reading.yaml, tags: [level2]}
          - id: english.vocab.a1_toys
            grade: 3
            title_he: צעצועים
            title_en: Toys
            prereq: []
            generator: english.vocab
            params: {topics: [toys], level: A1, modes: [word_to_translation]}
        `,
        "english/reading.yaml": "[]\n",
        "english/words.yaml": words,
      },
      {
        extraBanks: [
          files({
            "reading.yaml": `
        - id: ai.aaaaaaaa
          grade: 3
          level: A1
          skill: english.reading
          title: Tom
          text_en: Tom has a red kite.
          text_he: לתום יש עפיפון אדום.
          questions:
            - id: ai.aaaaaaaa.q1
              kind: choice
              prompt_he: מה יש לתום?
              prompt_en: What does Tom have?
              choices: [{en: a kite, he: עפיפון}, {en: a dog, he: כלב}]
              answer: 0
              explanation_he: 'כתוב: Tom has a red kite.'
        `,
            "vocab.yaml": "- {word: robot, he: רובוט, pos: noun, topic: toys, level: A1, grade: 3, emoji: null, example_en: 'A robot.', example_he: 'רובוט.'}\n",
          }),
        ],
      },
    );
    // the studio writes the generic skill "english.reading": it is attached
    // to the matching skill with the closest grade
    const q = lib.generate("english.reading.level1", new PyRandom(0));
    expect(q.item_id).toBe("ai.aaaaaaaa.q1");
    expect(q.meta["passage_en"]).toBe("Tom has a red kite.");
    const seen = new Set<string>();
    for (let s = 0; s < 80; s++) seen.add(lib.generate("english.vocab.a1_toys", new PyRandom(s)).meta["word"] as string);
    expect(seen.has("robot")).toBe(true);
    expect(lib.wordsHe().get("robot")).toBe("רובוט");
  });
});
