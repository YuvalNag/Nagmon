// @vitest-environment node
/**
 * Schema and consistency checks for the English learning content
 * (test_content_english.py): english/*.yaml and skills/english.yaml, read
 * as parsed documents. Per-item checks collect every problem in one test.
 */
import { describe, expect, it } from "vitest";
import { realDocs } from "./helpers";

type Dict = Record<string, unknown>;
type Word = { word: string; he: string; pos: string; topic: string; level: string; grade: number; emoji: string | null; example_en: string; example_he: string };
type SkillDoc = { id: string; grade: number; title_he: string; title_en: string; prereq: string[]; generator: string; params: Dict };

const BANK_FILES = ["english/sentences.yaml", "english/phonics.yaml"];
const READING_FILE = "english/reading.yaml";
const POS = new Set(["noun", "verb", "adj", "adv", "prep", "pron", "num", "phrase", "other"]);
const LEVELS = ["preA1", "A1", "A2", "B1"];
const LEVEL_GRADES: Record<string, [number, number]> = { preA1: [0, 2], A1: [3, 4], A2: [5, 6], B1: [7, 9] };
const KINDS = new Set(["choice", "true_false", "order"]);
const VOCAB_MODES = new Set(["picture_to_word", "word_to_translation", "listen_to_picture", "spelling", "sentence_cloze"]);
const PICTURE_MODES = new Set(["picture_to_word", "listen_to_picture"]);
const NIQQUD = /[֑-ׇ]/;
const HEBREW = /[א-ת]/;
const EMOJI = /^[0-9a-f]{2,6}(-[0-9a-f]{2,6})*$/;
const SKILL_ID = /^english\.(phonics|vocab|grammar|reading)\.[A-Za-z0-9_]+$/;
const MAX_PROMPT_HE = 140;
const MAX_CHOICE = 40;
const MAX_EXPLANATION = 200;
const MIN_ITEMS_PER_TAG = 8;
const MIN_WORDS_PER_TOPIC_LEVEL = 4;

const len = (s: string): number => Array.from(s).length;
const load = (rel: string): unknown => realDocs()[rel];
const words = (): Word[] => load("english/words.yaml") as Word[];
const skills = (): SkillDoc[] => (load("skills/english.yaml") as { skills: SkillDoc[] }).skills;

/** Items of a bank file, with reading questions flattened and given their passage's fields. */
function bankItems(rel: string): Dict[] {
  const data = load(rel);
  if (rel === READING_FILE) {
    const out: Dict[] = [];
    for (const passage of data as Dict[]) {
      for (const q of passage["questions"] as Dict[]) {
        const item: Dict = {};
        for (const k of ["grade", "skill", "tags"]) if (k in passage) item[k] = passage[k];
        Object.assign(item, q);
        out.push(item);
      }
    }
    return out;
  }
  const d = data as Dict;
  return (d["items"] as Dict[]).map((it) => ({ skill: d["skill"], ...it }));
}

function allBankItems(): [string, Dict][] {
  return [...BANK_FILES, READING_FILE].flatMap((rel) => bankItems(rel).map((it) => [rel, it] as [string, Dict]));
}

function* allStrings(obj: unknown): Generator<string> {
  if (typeof obj === "string") yield obj;
  else if (Array.isArray(obj)) for (const v of obj) yield* allStrings(v);
  else if (obj !== null && typeof obj === "object") for (const v of Object.values(obj)) yield* allStrings(v);
}

function emojiProblem(code: unknown): string | null {
  if (typeof code !== "string" || !EMOJI.test(code)) return `bad emoji code ${String(code)}`;
  const cps = code.split("-").map((p) => parseInt(p, 16));
  for (const cp of cps) if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return `bad code point in ${code}`;
  // Twemoji file names drop U+FE0F unless the sequence has a ZWJ.
  if (cps.includes(0xfe0f) && !cps.includes(0x200d)) return `${code}: fe0f only allowed in ZWJ sequences`;
  return null;
}

function counter<T>(xs: Iterable<T>, key: (x: T) => string = String): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
}

describe("content: english", () => {
  it.each(["english/words.yaml", "english/sentences.yaml", "english/reading.yaml", "english/phonics.yaml", "skills/english.yaml"])(
    "file has no niqqud: %s",
    (rel) => {
      const bad = [...allStrings(load(rel))].filter((s) => NIQQUD.test(s));
      expect(bad.slice(0, 5)).toEqual([]);
    },
  );

  it("words count and levels", () => {
    const counts = counter(words(), (w) => w.level);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(850);
    expect(counts.get("preA1")!).toBeGreaterThanOrEqual(280);
    expect(counts.get("A1")!).toBeGreaterThanOrEqual(330);
    expect(counts.get("A2")!).toBeGreaterThanOrEqual(190);
    expect(counts.get("B1")!).toBeGreaterThanOrEqual(45);
  });

  it("word entries schema", () => {
    const bad: string[] = [];
    const required = ["word", "he", "pos", "topic", "level", "grade", "emoji", "example_en", "example_he"];
    for (const w of words()) {
      const check = (ok: unknown, what: string): void => void (!ok && bad.push(`${w.word}: ${what}`));
      for (const key of required) check(key in w, `missing ${key}`);
      check(typeof w.word === "string" && w.word.trim() === w.word && w.word, "word");
      check(POS.has(w.pos), `pos ${w.pos}`);
      check(LEVELS.includes(w.level), `level ${w.level}`);
      check(Number.isInteger(w.grade) && w.grade >= 0 && w.grade <= 9, "grade");
      const [lo, hi] = LEVEL_GRADES[w.level] ?? [0, 9];
      check(lo <= w.grade && w.grade <= hi, `grade ${w.grade} vs ${w.level}`);
      check(typeof w.topic === "string" && /^[a-z]+$/.test(w.topic), "topic");
      check(HEBREW.test(w.he) && HEBREW.test(w.example_he), "Hebrew");
      check(!HEBREW.test(w.word + w.example_en), "Hebrew in English");
      check(len(w.word) <= MAX_CHOICE && len(w.he) <= MAX_CHOICE, "length");
      check(len(w.example_en) <= MAX_PROMPT_HE && len(w.example_he) <= MAX_PROMPT_HE, "example length");
      if (w.emoji !== null) check(emojiProblem(w.emoji) === null, String(emojiProblem(w.emoji)));
    }
    expect(bad).toEqual([]);
  });

  it("words unique", () => {
    const keys = counter(words(), (w) => `${w.word.toLowerCase()}|${w.pos}`);
    expect([...keys].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
  });

  it("example contains word for cloze", () => {
    const missing = words()
      .filter((w) => {
        const stem = w.word
          .toLowerCase()
          .replace(/\?+$/, "")
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return !new RegExp(`(?<![a-z])${stem}`).test(w.example_en.toLowerCase());
      })
      .map((w) => w.word);
    expect(missing).toEqual([]);
  });

  it("topic level groups big enough for distractors", () => {
    const groups = counter(words(), (w) => `${w.level}|${w.topic}`);
    expect([...groups].filter(([, n]) => n < MIN_WORDS_PER_TOPIC_LEVEL)).toEqual([]);
  });

  it("translations unambiguous within group", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const w of words()) {
      const key = `${w.level}|${w.topic}|${w.he}`;
      if (seen.has(key)) clashes.push(`${seen.get(key)} / ${w.word}: ${w.he}`);
      seen.set(key, w.word);
    }
    expect(clashes).toEqual([]);
  });

  it("bank item ids unique", () => {
    const ids = counter(allBankItems(), ([, it]) => String(it["id"]));
    expect([...ids].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
  });

  it("bank items schema", () => {
    const skillIds = new Set(skills().map((s) => s.id));
    const bad: string[] = [];
    for (const [rel, it] of allBankItems()) {
      const where = `${rel}:${String(it["id"])}`;
      const check = (ok: unknown, what: string): void => void (!ok && bad.push(`${where}: ${what}`));
      for (const key of ["id", "kind", "prompt_he", "answer", "explanation_he", "skill"]) check(key in it, `missing ${key}`);
      check(KINDS.has(it["kind"] as string), "kind");
      check(skillIds.has(it["skill"] as string), `unknown skill ${String(it["skill"])}`);
      const grade = it["grade"];
      check(Number.isInteger(grade) && (grade as number) >= 0 && (grade as number) <= 9, "grade");
      const diff = "difficulty" in it ? it["difficulty"] : 0.0;
      check(typeof diff === "number" && diff >= -2 && diff <= 2, "difficulty");
      const prompt = String(it["prompt_he"]);
      check(HEBREW.test(prompt), "prompt Hebrew");
      check(len(prompt) <= MAX_PROMPT_HE, "prompt length");
      const expl = it["explanation_he"] as string;
      check(expl && len(expl) <= MAX_EXPLANATION, "explanation");
      check(Array.isArray(it["tags"] ?? []), "tags");
      if ("emoji" in it) check(emojiProblem(it["emoji"]) === null, String(emojiProblem(it["emoji"])));
      if ("speak_en" in it) check(typeof it["speak_en"] === "string" && (it["speak_en"] as string).trim(), "speak_en");
      const choices = ((it["choices"] as unknown[] | undefined) ?? []).map((c) => (c !== null && typeof c === "object" ? (c as Dict) : { en: c }));
      if (it["kind"] === "true_false") {
        check(it["answer"] === true || it["answer"] === false, "true_false answer");
        check(!choices.length, "true_false must not list choices");
        continue;
      }
      check(choices.length >= 2 && choices.length <= 6, "choices count");
      for (const c of choices) {
        check(c["en"] || c["he"], "empty choice");
        for (const lang of ["en", "he"]) {
          if (c[lang] !== null && c[lang] !== undefined) {
            check(typeof c[lang] === "string", "choice type");
            check(len(String(c[lang])) <= MAX_CHOICE, `choice too long ${String(c[lang])}`);
          }
        }
        if (c["emoji"]) check(emojiProblem(c["emoji"]) === null, String(emojiProblem(c["emoji"])));
      }
      for (const lang of ["en", "he"]) {
        const texts = choices.filter((c) => c[lang]).map((c) => String(c[lang]).trim().toLowerCase());
        check(new Set(texts).size === texts.length, `duplicate choices ${texts.join("|")}`);
      }
      const answer = it["answer"];
      if (it["kind"] === "choice") {
        check(choices.length <= 4, "more than 4 choices");
        check(Number.isInteger(answer), "answer type");
        check((answer as number) >= 0 && (answer as number) < choices.length, "answer out of range");
      } else {
        const ans = answer as number[];
        const sorted = [...ans].sort((a, b) => a - b).join();
        check(sorted === choices.map((_, i) => i).join(), "bad order answer");
        check(ans.join() !== choices.map((_, i) => i).join(), "tiles not shuffled");
      }
    }
    expect(bad).toEqual([]);
  });

  it("grammar items have english prompt", () => {
    for (const it of bankItems("english/sentences.yaml")) {
      expect(it["prompt_en"], String(it["id"])).toBeTruthy();
      const skill = String(it["skill"]);
      expect(skill.startsWith("english.grammar."), String(it["id"])).toBe(true);
      expect(it["tags"]).toEqual([skill.split(".").at(-1)]);
    }
  });

  it("grammar bank size", () => {
    expect(bankItems("english/sentences.yaml").length).toBeGreaterThanOrEqual(230);
  });

  it("phonics listening items have speech", () => {
    const items = bankItems("english/phonics.yaml");
    expect(items.length).toBeGreaterThanOrEqual(200);
    for (const it of items) {
      expect(String(it["skill"]).startsWith("english.phonics."), String(it["id"])).toBe(true);
      expect(it["grade"] as number).toBeLessThanOrEqual(2);
      const tags = it["tags"] as string[];
      if (String(it["prompt_en"] ?? "").includes("Listen") || ["letter_names", "initial_sounds", "digraphs"].includes(tags[0]!)) {
        expect(it["speak_en"], `${String(it["id"])}: listening item needs speak_en`).toBeTruthy();
      }
    }
  });

  const wordCount = (text: string): number => (text.match(/[A-Za-z0-9'-]+/g) ?? []).length;

  it("reading passages schema", () => {
    const passages = load(READING_FILE) as Dict[];
    expect(passages.length).toBeGreaterThanOrEqual(28);
    const ids = counter(passages, (p) => String(p["id"]));
    expect([...ids.values()].every((n) => n === 1)).toBe(true);
    for (const p of passages) {
      const id = String(p["id"]);
      for (const key of ["id", "grade", "level", "title", "text_en", "text_he", "questions", "skill"]) expect(key in p, `${id}: missing ${key}`).toBe(true);
      expect(LEVELS).toContain(p["level"]);
      expect((p["grade"] as number) >= 3 && (p["grade"] as number) <= 9, id).toBe(true);
      expect(/^english\.reading\.level\d+$/.test(String(p["skill"])), id).toBe(true);
      expect(HEBREW.test(String(p["text_he"])) && !HEBREW.test(String(p["text_en"])), id).toBe(true);
      const n = wordCount(String(p["text_en"]));
      expect(n >= 25 && n <= 200, `${id}: ${n} words`).toBe(true);
      const qs = p["questions"] as Dict[];
      expect(qs.length >= 3 && qs.length <= 4, id).toBe(true);
      for (const q of qs) {
        expect(String(q["id"]).startsWith(id + ".q"), String(q["id"])).toBe(true);
        expect(q["prompt_en"], String(q["id"])).toBeTruthy();
      }
    }
  });

  it("reading gets longer with level", () => {
    const byLevel = new Map<number, number[]>();
    for (const p of load(READING_FILE) as Dict[]) {
      const n = Number(String(p["skill"]).split("level").at(-1));
      if (!byLevel.has(n)) byLevel.set(n, []);
      byLevel.get(n)!.push(wordCount(String(p["text_en"])));
    }
    const averages = [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.reduce((a, b) => a + b, 0) / v.length);
    expect(averages).toEqual([...averages].sort((a, b) => a - b));
    expect(averages[0]!).toBeLessThan(50);
    expect(averages.at(-1)!).toBeGreaterThan(150);
  });

  it("skills schema", () => {
    const data = load("skills/english.yaml") as Dict;
    expect(data["subject"]).toBe("english");
    const ids = counter(skills(), (s) => s.id);
    expect([...ids].filter(([, n]) => n > 1)).toEqual([]);
    expect(ids.size).toBeGreaterThanOrEqual(40);
    for (const s of skills()) {
      for (const key of ["id", "grade", "title_he", "title_en", "prereq", "generator", "params"]) expect(key in s, `${s.id}: missing ${key}`).toBe(true);
      expect(SKILL_ID.test(s.id), s.id).toBe(true);
      expect(Number.isInteger(s.grade) && s.grade >= 0 && s.grade <= 9, s.id).toBe(true);
      expect(HEBREW.test(s.title_he), s.id).toBe(true);
      expect(Array.isArray(s.prereq), s.id).toBe(true);
    }
  });

  it("prereqs exist and not later grade", () => {
    const byId = new Map(skills().map((s) => [s.id, s]));
    for (const s of skills()) {
      for (const p of s.prereq) {
        expect(byId.has(p), `${s.id}: unknown prereq ${p}`).toBe(true);
        expect(p).not.toBe(s.id);
        expect(byId.get(p)!.grade, `${s.id}: prereq ${p} has a later grade`).toBeLessThanOrEqual(s.grade);
      }
    }
  });

  it("skill graph has no cycles", () => {
    const graph = new Map(skills().map((s) => [s.id, s.prereq]));
    const state = new Map<string, number>();
    const visit = (node: string, path: string[]): void => {
      if (state.get(node) === 2) return;
      expect(state.get(node), `cycle: ${[...path, node].join(" -> ")}`).not.toBe(1);
      state.set(node, 1);
      for (const nxt of graph.get(node) ?? []) visit(nxt, [...path, node]);
      state.set(node, 2);
    };
    for (const node of graph.keys()) visit(node, []);
  });

  it("bank skills reference existing banks and tags", () => {
    for (const s of skills()) {
      if (s.generator !== "bank") continue;
      const rel = String(s.params["bank"]);
      expect(rel in realDocs(), `${s.id}: missing bank ${rel}`).toBe(true);
      const items = bankItems(rel);
      const tags = (s.params["tags"] as string[] | undefined) ?? [];
      for (const tag of tags) {
        const n = items.filter((it) => ((it["tags"] as string[] | undefined) ?? []).includes(tag)).length;
        expect(n, `${s.id}: tag ${tag} has only ${n} items`).toBeGreaterThanOrEqual(MIN_ITEMS_PER_TAG);
      }
      if (!tags.length) expect(items.some((it) => it["skill"] === s.id), s.id).toBe(true);
    }
  });

  it("every bank tag is used by a skill", () => {
    const used = new Map<string, Set<string>>();
    for (const s of skills()) {
      if (s.generator !== "bank") continue;
      const rel = String(s.params["bank"]);
      if (!used.has(rel)) used.set(rel, new Set());
      for (const t of (s.params["tags"] as string[] | undefined) ?? []) used.get(rel)!.add(t);
    }
    for (const rel of [...BANK_FILES, READING_FILE]) {
      const tags = new Set(bankItems(rel).flatMap((it) => (it["tags"] as string[] | undefined) ?? []));
      expect([...tags].filter((t) => !used.get(rel)?.has(t)).sort(), rel).toEqual([]);
    }
  });

  it("vocab skills match word list", () => {
    const groups = new Map<string, Word[]>();
    for (const w of words()) {
      const k = `${w.level}|${w.topic}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(w);
    }
    const covered = new Set<string>();
    for (const s of skills()) {
      if (s.generator !== "english.vocab") continue;
      const p = s.params as { level: string; modes: string[]; topics: string[] };
      expect(LEVELS).toContain(p.level);
      expect(p.modes.length > 0 && p.modes.every((m) => VOCAB_MODES.has(m)), s.id).toBe(true);
      let pics = 0;
      for (const topic of p.topics) {
        const group = groups.get(`${p.level}|${topic}`);
        expect(group, `${s.id}: no ${p.level} words for topic ${topic}`).toBeDefined();
        pics += group!.filter((w) => w.emoji).length;
        covered.add(`${p.level}|${topic}`);
      }
      if (p.modes.some((m) => PICTURE_MODES.has(m))) expect(pics, `${s.id}: picture modes need at least 4 words with emoji`).toBeGreaterThanOrEqual(4);
    }
    expect([...groups.keys()].filter((k) => !covered.has(k)).sort()).toEqual([]);
  });
});
