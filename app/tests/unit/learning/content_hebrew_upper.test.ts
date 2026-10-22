// @vitest-environment node
/**
 * Hebrew language content for grades 3-9 (the old Hebrew content ended at grade 2, so an older child got grade-2
 * Hebrew: docs/app/QUESTION_AUDIT.md). The skill graph, the shape of every item, and the biases a quiz must not have:
 * the right answer not always the longest, not always in one place, true-or-false not always "false", an
 * explanation that teaches and is not the question again, kind words only.
 */
import { describe, expect, it } from "vitest";
import { genContext } from "../../../src/core/learning/generators/common";
import { PyRandom } from "../../../src/core/learning/random";
import { siblingExample } from "../../../src/core/learning/worked_example";
import { library, realDocs } from "./helpers";

type Dict = Record<string, unknown>;

const lib = library();
const upper = [...lib.skills.values()].filter((s) => s.subject === "hebrew" && s.grade >= 3);
const bankOf = (id: string) => lib.banks.get(id) ?? [];
const text = (c: { he?: unknown; en?: unknown }): string => String(c.he ?? c.en ?? "");
const words = (s: string): string[] => s.replace(/["'.,:;?!()\-־״׳]/g, " ").split(/\s+/).filter(Boolean);

/** The skills this work adds, by grade: the graph the selector walks. */
const EXPECTED: Record<number, string[]> = {
  3: ["grammar.parts_of_speech", "grammar.agreement", "vocab.synonyms", "spelling.similar_sounds", "text.sentence_types", "reading.passage_3"],
  4: ["grammar.tenses", "grammar.person", "text.punctuation", "grammar.subject_predicate", "vocab.homonyms", "reading.passage_4"],
  5: ["grammar.roots", "grammar.prefixes_suffixes", "vocab.proverbs", "text.text_types", "reading.passage_5"],
  6: ["grammar.binyanim", "vocab.figurative", "reading.passage_6"],
  7: ["grammar.smichut", "text.text_analysis", "grammar.clauses", "reading.passage_7"],
  8: ["vocab.register", "grammar.word_formation", "text.summary", "reading.passage_8"],
  9: ["text.argument", "text.poetry", "text.tone", "reading.passage_9"],
};

/** Hebrew words that would be unkind, or a religious claim, in a child's quiz. */
const NOT_ALLOWED = ["טיפש", "מטומטם", "מפגר", "דבילי", "אידיוט", "סתום", "אלוהים", "אלוקים", "תפילה", "גן עדן"];

describe("the skill graph of Hebrew grades 3-9", () => {
  it("has every planned skill at its grade, and nothing else above grade 2", () => {
    const got = upper.map((s) => s.id).sort();
    const want = Object.values(EXPECTED).flatMap((ids) => ids.map((i) => `hebrew.${i}`)).sort();
    expect(got).toEqual(want);
    for (const [g, ids] of Object.entries(EXPECTED)) for (const id of ids) expect(lib.skill(`hebrew.${id}`).grade, id).toBe(Number(g));
    expect(upper.length).toBeGreaterThanOrEqual(25);
  });

  it("every grade from 3 to 9 has at least two skills, and the titles are Hebrew without niqqud", () => {
    for (let g = 3; g <= 9; g++) expect(upper.filter((s) => s.grade === g).length, `grade ${g}`).toBeGreaterThanOrEqual(2);
    for (const s of upper) {
      expect(/[א-ת]/.test(s.title_he), s.id).toBe(true);
      expect(/[֑-ׇ]/.test(s.title_he), `${s.id}: niqqud`).toBe(false);
      expect(s.title_en.trim().length, s.id).toBeGreaterThan(3);
      expect(s.title_he.length, s.id).toBeLessThanOrEqual(40);
    }
  });

  it("prerequisites exist, never point to a later grade, and chain back to the early skills so the selector can open each", () => {
    for (const s of upper) {
      expect(s.prereq.length, `${s.id} has no prerequisite`).toBeGreaterThan(0);
      for (const p of s.prereq) {
        const ps = lib.skills.get(p);
        expect(ps, `${s.id}: unknown prereq ${p}`).toBeDefined();
        expect(ps!.subject).toBe("hebrew");
        expect(ps!.grade, `${s.id}: prereq ${p}`).toBeLessThanOrEqual(s.grade);
      }
      // a step of at most two grades: no jump a child cannot make
      expect(Math.max(...s.prereq.map((p) => lib.skill(p).grade)), `${s.id}: prerequisites too far below`).toBeGreaterThanOrEqual(s.grade - 2);
      // every chain ends in a skill with no prerequisite, at grade 2 or below
      const roots = new Set<string>();
      const walk = (id: string): void => {
        const k = lib.skill(id);
        if (k.prereq.length === 0) roots.add(id);
        k.prereq.forEach(walk);
      };
      walk(s.id);
      for (const r of roots) expect(lib.skill(r).grade, `${s.id}: chain starts at ${r}`).toBeLessThanOrEqual(2);
    }
  });

  it("the reading passages grow one grade at a time", () => {
    for (let g = 4; g <= 9; g++) expect(lib.skill(`hebrew.reading.passage_${g}`).prereq).toContain(`hebrew.reading.passage_${g - 1}`);
    expect(lib.skill("hebrew.reading.passage_3").prereq).toContain("hebrew.reading.sentences");
  });
});

describe("every new skill is a bank of 20 to 40 items", () => {
  it("size, grade of the items, ids, and tags", () => {
    for (const s of upper) {
      expect(s.generator, s.id).toBe("bank");
      const items = bankOf(s.id);
      expect(items.length, s.id).toBeGreaterThanOrEqual(20);
      expect(items.length, s.id).toBeLessThanOrEqual(40);
      for (const i of items) {
        expect(i.grade, i.id).toBe(s.grade);
        expect(i.id, i.id).toMatch(/^heb\.[a-z0-9_]+\.\d{3}$/);
        expect(i.difficulty, i.id).toBeGreaterThanOrEqual(-2);
        expect(i.difficulty, i.id).toBeLessThanOrEqual(2);
      }
      // a spread of difficulty inside the skill, so the rating has something to tell apart
      expect(new Set(items.map((i) => i.difficulty)).size, `${s.id}: difficulty never varies`).toBeGreaterThanOrEqual(3);
    }
  });

  it("no duplicate item: the same prompt with the same options (and the same passage)", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const s of upper) {
      for (const i of bankOf(s.id)) {
        const key = [i.prompt_he.trim(), String(i.meta["passage_id"] ?? ""), ...i.choices.map((c) => text(c)).sort()].join("|");
        if (seen.has(key)) dupes.push(i.id);
        seen.add(key);
      }
    }
    expect(dupes).toEqual([]);
    // and no two items of one skill ask the very same thing in the same words
    for (const s of upper) {
      const prompts = bankOf(s.id).filter((i) => i.meta["passage_id"] === undefined).map((i) => i.prompt_he.trim());
      const dup = prompts.filter((p, k) => prompts.indexOf(p) !== k);
      expect(dup.length, `${s.id}: the same prompt twice, ${dup.slice(0, 3).join(" / ")}`).toBeLessThanOrEqual(Math.floor(prompts.length * 0.4));
    }
  });

  it("choices: three or four, all different, the answer among them, no empty or stray option", () => {
    for (const s of upper) {
      for (const i of bankOf(s.id)) {
        if (i.kind === "true_false") {
          expect(typeof i.answer, i.id).toBe("boolean");
          continue;
        }
        const n = i.choices.length;
        expect(n, i.id).toBeGreaterThanOrEqual(i.kind === "order" ? 3 : 3);
        expect(n, i.id).toBeLessThanOrEqual(i.kind === "order" ? 6 : 4);
        const he = i.choices.map((c) => text(c).trim());
        expect(new Set(he).size, `${i.id}: duplicate options`).toBe(n);
        expect(he.every((t) => t.length > 0), i.id).toBe(true);
        if (i.kind === "choice") {
          expect(Number.isInteger(i.answer) && (i.answer as number) >= 0 && (i.answer as number) < n, i.id).toBe(true);
          // a distractor must not repeat the answer's text as a part of the prompt in its stead
          const right = he[i.answer as number]!;
          for (const [k, t] of he.entries()) if (k !== i.answer) expect(t, `${i.id}: a distractor equals the answer`).not.toBe(right);
        }
      }
    }
  });

  it("the right answer is neither always the longest nor always the shortest, and not in one place", () => {
    let n = 0;
    let longest = 0;
    let shortest = 0;
    const pos = [0, 0, 0, 0];
    for (const s of upper) {
      let sn = 0;
      let slong = 0;
      const spos = [0, 0, 0, 0];
      for (const i of bankOf(s.id)) {
        if (i.kind !== "choice") continue;
        const lens = i.choices.map((c) => text(c).length);
        const a = lens[i.answer as number]!;
        if (new Set(lens).size === 1) continue;
        const others = lens.filter((_, k) => k !== i.answer);
        n++;
        sn++;
        // strictly longer (or shorter) than every other option: the length alone gives it away
        if (a > Math.max(...others)) {
          longest++;
          slong++;
        }
        if (a < Math.min(...others)) shortest++;
        pos[i.answer as number]!++;
        spos[i.answer as number]!++;
      }
      if (sn >= 12) {
        expect(slong / sn, `${s.id}: the answer is the longest option too often`).toBeLessThanOrEqual(0.6);
        for (const p of spos.slice(0, 3)) expect(p / sn, `${s.id}: the answer sits in one place`).toBeLessThanOrEqual(0.6);
      }
    }
    expect(n).toBeGreaterThan(300);
    // three or four options: by chance about 0.3; the old banks were 0.28
    expect(longest / n).toBeLessThanOrEqual(0.4);
    expect(shortest / n).toBeLessThanOrEqual(0.45);
    expect(longest / n).toBeGreaterThanOrEqual(0.15);
    for (const p of pos.slice(0, 3)) {
      expect(p / n).toBeGreaterThanOrEqual(0.22);
      expect(p / n).toBeLessThanOrEqual(0.45);
    }
  });

  it("true-or-false is about half true, and there are enough of them; there are order questions too", () => {
    const all = upper.flatMap((s) => bankOf(s.id));
    const tf = all.filter((i) => i.kind === "true_false");
    expect(tf.length).toBeGreaterThanOrEqual(30);
    const share = tf.filter((i) => i.answer === true).length / tf.length;
    expect(share).toBeGreaterThanOrEqual(0.4);
    expect(share).toBeLessThanOrEqual(0.6);
    expect(all.filter((i) => i.kind === "order").length).toBeGreaterThanOrEqual(12);
  });

  it("an explanation teaches: not the question again, not empty, not a scolding", () => {
    for (const s of upper) {
      for (const i of bankOf(s.id)) {
        const ex = i.explanation_he.trim();
        expect(ex.length, `${i.id}: explanation too short`).toBeGreaterThanOrEqual(25);
        expect(ex, `${i.id}: explanation is the prompt`).not.toBe(i.prompt_he.trim());
        const p = new Set(words(i.prompt_he));
        const fresh = words(ex).filter((w) => !p.has(w));
        expect(fresh.length, `${i.id}: the explanation adds nothing to the question`).toBeGreaterThanOrEqual(3);
        expect((i.explanation_en ?? "").trim().length, i.id).toBeGreaterThan(15);
        expect((i.prompt_en ?? "").trim().length, i.id).toBeGreaterThan(8);
      }
    }
  });

  it("explanations of different items of one skill are different", () => {
    for (const s of upper) {
      const ex = bankOf(s.id).map((i) => i.explanation_he.trim());
      expect(new Set(ex).size, s.id).toBe(ex.length);
    }
  });

  it("kind and modest: no insults, no religious claims, no niqqud, Hebrew text everywhere", () => {
    for (const s of upper) {
      for (const i of bankOf(s.id)) {
        const all = [i.prompt_he, i.explanation_he, String(i.meta["passage_he"] ?? ""), ...i.choices.map(text)].join(" \n ");
        expect(/[֑-ׇ]/.test(all), `${i.id}: niqqud`).toBe(false);
        for (const w of NOT_ALLOWED) expect(all.includes(w), `${i.id}: ${w}`).toBe(false);
        // an explanation never scolds the child
        expect(/^(טעית|טעות שלך|לא נכון|חבל)/.test(i.explanation_he.trim()), `${i.id}: scolding explanation`).toBe(false);
        expect(/[א-ת]/.test(i.prompt_he), i.id).toBe(true);
        expect(i.prompt_he.length, i.id).toBeLessThanOrEqual(140);
      }
    }
  });
});

describe("reading passages (hebrew.reading.passage_3 to 9)", () => {
  const BAND: Record<number, [number, number]> = { 3: [35, 100], 4: [50, 125], 5: [60, 150], 6: [70, 180], 7: [90, 200], 8: [105, 230], 9: [120, 260] };

  it("each skill has five or more passages with four to six questions each, drawn on the question screen", () => {
    for (let g = 3; g <= 9; g++) {
      const id = `hebrew.reading.passage_${g}`;
      const items = bankOf(id);
      const byPassage = new Map<string, typeof items>();
      for (const i of items) {
        expect(typeof i.meta["passage_he"], `${i.id}: the passage must be on the question`).toBe("string");
        const pid = String(i.meta["passage_id"]);
        byPassage.set(pid, [...(byPassage.get(pid) ?? []), i]);
      }
      expect(byPassage.size, id).toBeGreaterThanOrEqual(5);
      for (const [pid, qs] of byPassage) {
        expect(qs.length, `${pid}`).toBeGreaterThanOrEqual(4);
        expect(qs.length, `${pid}`).toBeLessThanOrEqual(6);
        const n = words(String(qs[0]!.meta["passage_he"])).length;
        expect(n, `${pid}: ${n} words`).toBeGreaterThanOrEqual(BAND[g]![0]);
        expect(n, `${pid}: ${n} words`).toBeLessThanOrEqual(BAND[g]![1]);
        expect(typeof qs[0]!.meta["passage_title"], `${pid}: title`).toBe("string");
      }
    }
  });

  it("the passages grow: the mean length never falls from one grade to the next", () => {
    const mean = (g: number): number => {
      const seen = new Map<string, number>();
      for (const i of bankOf(`hebrew.reading.passage_${g}`)) seen.set(String(i.meta["passage_id"]), words(String(i.meta["passage_he"])).length);
      return [...seen.values()].reduce((a, b) => a + b, 0) / seen.size;
    };
    for (let g = 4; g <= 9; g++) expect(mean(g), `grade ${g}`).toBeGreaterThan(mean(g - 1));
  });

  it("the passages are all different and every question of a passage is different", () => {
    const texts = new Set<string>();
    for (let g = 3; g <= 9; g++) {
      for (const i of bankOf(`hebrew.reading.passage_${g}`)) texts.add(String(i.meta["passage_he"]));
      const prompts = bankOf(`hebrew.reading.passage_${g}`).map((i) => `${String(i.meta["passage_id"])}|${i.prompt_he}`);
      expect(new Set(prompts).size, `grade ${g}`).toBe(prompts.length);
    }
    expect(texts.size).toBeGreaterThanOrEqual(35);
  });

  it("passage files are lists of passages, with a title and Hebrew text only", () => {
    const docs = realDocs();
    for (let g = 3; g <= 9; g++) {
      const doc = docs[`hebrew/passages_${g}.yaml`];
      expect(Array.isArray(doc), `passages_${g}.yaml`).toBe(true);
      for (const p of doc as Dict[]) {
        expect(p["text_he"], String(p["id"])).toBeTruthy();
        expect(p["text_en"], `${String(p["id"])}: Hebrew-only passage`).toBeUndefined();
        expect(p["grade"]).toBe(g);
      }
    }
  });
});

describe("the owl's worked example (a sibling item) exists for every new skill", () => {
  it("another item of the skill, another answer, an explanation of its own", () => {
    for (const s of upper) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const ctx = genContext({ skill_id: s.id, subject: s.subject, grade: s.grade });
        const q = lib.generate(s.id, new PyRandom(seed), ctx);
        const ex = siblingExample(lib, q, ctx);
        expect(ex, `${s.id} seed ${seed}: no sibling`).not.toBeNull();
        expect(ex!.item_id, s.id).not.toBe(q.item_id);
        expect(ex!.skill_id, s.id).toBe(s.id);
        expect(ex!.steps_he, s.id).not.toBe(q.explanation_he);
        expect(ex!.idea_he, s.id).toBe(s.title_he);
      }
    }
  });
});
