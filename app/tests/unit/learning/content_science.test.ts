// @vitest-environment node
/// <reference types="node" />
/**
 * Schema and quality checks for the science and Hebrew bank content
 * (test_content_science.py). The Python parametrises the per-item checks
 * by item; here each check walks every item and lists all problems.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONTENT_DIR, realDocs } from "./helpers";

type Dict = Record<string, unknown>;
type Choice = { he: string; en: string; emoji?: string };
type Item = Dict & { id: string; kind: string; prompt_he: string; explanation_he: string; tags: string[]; choices?: Choice[]; answer: unknown };
type SkillDoc = { id: string; grade: number; title_he: string; title_en: string; prereq: string[]; generator: string; params: Dict; mastery?: Dict };

const BANK_DIRS = ["science", "hebrew"];
const SKILL_FILES: Record<string, string> = { science: "skills/science.yaml", hebrew: "skills/hebrew.yaml" };
const KINDS = new Set(["choice", "true_false", "order"]);
const ITEM_REQUIRED = ["id", "kind", "grade", "difficulty", "prompt_he", "prompt_en", "answer", "explanation_he", "explanation_en", "tags"];
const ITEM_ALLOWED = new Set([...ITEM_REQUIRED, "skill", "choices"]);
const CHOICE_ALLOWED = new Set(["he", "en", "emoji"]);
const ELEMENTS = ["cosmic", "earth", "fire", "frost", "heroic", "lightning", "metal", "normal", "shadow", "sky", "venom", "water", "wood"];
const MAX_PROMPT_HE = 140;
const MAX_CHOICE_HE = 40;
const MAX_CHOICE_EN = 60;
const MAX_EXPLANATION_HE = 200;
const MAX_FACT_HE = 200;
const MIN_ITEMS_PER_SKILL = 10;
const NIQQUD = /[֑-ׇ]/;
const HEBREW_LETTER = /[א-ת]/;
const EMOJI_DIR = join(CONTENT_DIR, "..", "gfx", "emoji");
const EMOJI_HEX = /^[0-9a-f]{4,6}(-[0-9a-f]{4,6})*$/;
const ID_RE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

const len = (s: string): number => Array.from(s).length;

/** A reading-passage file (a list of passages) as an ordinary bank: its questions inherit skill, grade and tags from their passage. */
function flattenPassages(passages: Dict[]): Dict {
  const items: Dict[] = [];
  for (const p of passages) {
    for (const q of p["questions"] as Dict[]) {
      const item: Dict = {};
      for (const k of ["skill", "grade", "tags"]) if (k in p) item[k] = p[k];
      items.push({ ...item, ...q });
    }
  }
  return { skill: passages[0]!["skill"], items };
}

function banks(): Map<string, Dict> {
  const out = new Map<string, Dict>();
  for (const [rel, doc] of Object.entries(realDocs()).sort()) {
    if (!BANK_DIRS.includes(rel.split("/")[0]!) || rel.split("/").length !== 2) continue;
    out.set(rel, Array.isArray(doc) ? flattenPassages(doc as Dict[]) : (doc as Dict));
  }
  return out;
}

function skillsBySubject(): Map<string, { subject: string; skills: SkillDoc[] }> {
  const out = new Map<string, { subject: string; skills: SkillDoc[] }>();
  for (const [subject, rel] of Object.entries(SKILL_FILES)) if (rel in realDocs()) out.set(subject, realDocs()[rel] as { subject: string; skills: SkillDoc[] });
  return out;
}

function allSkills(): Map<string, SkillDoc> {
  return new Map([...skillsBySubject().values()].flatMap((d) => d.skills.map((s) => [s.id, s] as const)));
}

function items(): [string, Dict, Item][] {
  return [...banks()].flatMap(([rel, doc]) => (doc["items"] as Item[]).map((it) => [rel, doc, it] as [string, Dict, Item]));
}

function* hebrewStrings(item: Item): Generator<[string, string]> {
  yield ["prompt_he", item.prompt_he];
  yield ["explanation_he", item.explanation_he];
  for (const c of item.choices ?? []) yield ["choice.he", c.he];
}

function emojiValid(code: unknown): boolean {
  if (typeof code !== "string" || !EMOJI_HEX.test(code)) return false;
  for (const part of code.split("-")) {
    if (part === "200d" || part === "fe0f") continue;
    // Twemoji file names: emoji code points are >= U+00A9.
    if (parseInt(part, 16) < 0xa9) return false;
  }
  // The picture must ship with the game.
  return existsSync(join(EMOJI_DIR, `${code}.png`));
}

function skillItems(skill: SkillDoc): Item[] {
  const doc = banks().get(String(skill.params["bank"]));
  expect(doc, `${skill.id}: bank ${String(skill.params["bank"])} not found`).toBeDefined();
  const tags = new Set((skill.params["tags"] as string[] | undefined) ?? []);
  return (doc!["items"] as Item[]).filter((i) => !tags.size || i.tags.some((t) => tags.has(t)));
}

describe("content: science and hebrew", () => {
  it("content present", () => {
    const rels = [...banks().keys()];
    expect(rels.some((r) => r.startsWith("science/"))).toBe(true);
    expect(rels.some((r) => r.startsWith("hebrew/"))).toBe(true);
    expect(items().filter(([rel]) => rel.startsWith("science/")).length).toBeGreaterThanOrEqual(600);
    expect(items().filter(([rel]) => rel.startsWith("hebrew/")).length).toBeGreaterThanOrEqual(700);
  });

  it.each([...banks().keys()])("bank file shape: %s", (rel) => {
    const doc = banks().get(rel)!;
    expect(Array.isArray(doc["items"]) && (doc["items"] as unknown[]).length > 0, `${rel}: empty items`).toBe(true);
    expect(allSkills().has(String(doc["skill"])), `${rel}: default skill ${String(doc["skill"])} is not defined`).toBe(true);
  });

  it("item schema (every item)", () => {
    const bad: string[] = [];
    for (const [, , item] of items()) {
      const iid = item.id;
      const check = (ok: unknown, what: string): void => void (!ok && bad.push(`${iid}: ${what}`));
      const missing = ITEM_REQUIRED.filter((k) => !(k in item));
      check(!missing.length, `missing ${missing.join(",")}`);
      const unknown = Object.keys(item).filter((k) => !ITEM_ALLOWED.has(k));
      check(!unknown.length, `unknown keys ${unknown.join(",")}`);
      check(typeof iid === "string" && ID_RE.test(iid), "bad id");
      check(KINDS.has(item.kind), "bad kind");
      const g = item["grade"];
      check(Number.isInteger(g) && (g as number) >= 0 && (g as number) <= 9, "grade");
      const d = item["difficulty"];
      check(typeof d === "number" && d >= -2 && d <= 2, `difficulty ${String(d)}`);
      for (const key of ["prompt_he", "prompt_en", "explanation_he", "explanation_en"]) check(typeof item[key] === "string" && (item[key] as string).trim(), `empty ${key}`);
      check(Array.isArray(item.tags) && item.tags.length > 0, "tags must be a non-empty list");
      check(item.tags.every((t) => typeof t === "string" && /^[a-z0-9_]+$/.test(t)), "tag format");
      check(HEBREW_LETTER.test(item.prompt_he), "prompt_he has no Hebrew");
      check(HEBREW_LETTER.test(item.explanation_he), "explanation_he has no Hebrew");
      const { kind, answer, choices } = item;
      if (kind === "true_false") {
        check(choices === undefined || choices === null, "true_false choices are added by the engine");
        check(typeof answer === "boolean", "true_false answer must be true/false");
        continue;
      }
      check(Array.isArray(choices), "choices missing");
      for (const c of choices ?? []) {
        const keys = Object.keys(c);
        check("he" in c && "en" in c && keys.every((k) => CHOICE_ALLOWED.has(k)), `bad choice ${JSON.stringify(c)}`);
        check(typeof c.he === "string" && c.he.trim() && typeof c.en === "string" && c.en.trim(), "choice text");
      }
      const n = (choices ?? []).length;
      if (kind === "choice") {
        check(n >= 2 && n <= 5, `${n} choices`);
        check(Number.isInteger(answer), "answer must be an index");
        check((answer as number) >= 0 && (answer as number) < n, "answer out of range");
      } else {
        check(n >= 3 && n <= 6, "order needs 3-6 steps");
        const ans = answer as number[];
        check(Array.isArray(ans) && [...ans].sort((a, b) => a - b).join() === [...Array(n).keys()].join(), "answer not a permutation");
        check(Array.isArray(ans) && ans.join() !== [...Array(n).keys()].join(), "order shown already solved");
      }
    }
    expect(bad).toEqual([]);
  });

  it("item choices unique (every item)", () => {
    const bad: string[] = [];
    for (const [, , item] of items()) {
      for (const lang of ["he", "en"] as const) {
        const texts = (item.choices ?? []).map((c) => c[lang].trim());
        if (new Set(texts).size !== texts.length) bad.push(`${item.id}: duplicate ${lang} choices ${texts.join("|")}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("item text rules (every item)", () => {
    const bad: string[] = [];
    for (const [, , item] of items()) {
      for (const [field, text] of hebrewStrings(item)) if (NIQQUD.test(text)) bad.push(`${item.id}: niqqud/maqaf in ${field}: ${text}`);
      if (len(item.prompt_he) > MAX_PROMPT_HE) bad.push(`${item.id}: prompt_he too long`);
      if (len(item.explanation_he) > MAX_EXPLANATION_HE) bad.push(`${item.id}: explanation_he too long`);
      for (const c of item.choices ?? []) {
        if (len(c.he) > MAX_CHOICE_HE) bad.push(`${item.id}: choice too long: ${c.he}`);
        if (len(c.en) > MAX_CHOICE_EN) bad.push(`${item.id}: English choice too long: ${c.en}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("item emoji (every item)", () => {
    const bad: string[] = [];
    for (const [, , item] of items()) for (const c of item.choices ?? []) if ("emoji" in c && !emojiValid(c.emoji)) bad.push(`${item.id}: bad emoji code ${String(c.emoji)}`);
    expect(bad).toEqual([]);
  });

  it("ids unique across banks", () => {
    const ids = items().map(([, , item]) => item.id);
    for (const doc of banks().values()) {
      for (const el of Object.values((doc["elements"] as Record<string, { facts: { id: string }[] }> | undefined) ?? {})) ids.push(...el.facts.map((f) => f.id));
    }
    const seen = new Set<string>();
    const dupes = ids.filter((i) => (seen.has(i) ? true : (seen.add(i), false)));
    expect(dupes).toEqual([]);
  });

  it("questions unique", () => {
    // the same prompt with the same choices is a real duplicate (same prompt, other choices is fine)
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const [, , item] of items()) {
      const key = `${item.prompt_he.trim()}|${(item.choices ?? [])
        .map((c) => c.he)
        .sort()
        .join("|")}`;
      if (seen.has(key)) dupes.push(item.prompt_he);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });

  it("science kind mix", () => {
    const sci = items().filter(([rel]) => rel.startsWith("science/"));
    const kinds = new Map<string, number>();
    for (const [, , it] of sci) kinds.set(it.kind, (kinds.get(it.kind) ?? 0) + 1);
    const total = sci.length;
    const tf = (kinds.get("true_false") ?? 0) / total;
    expect(tf >= 0.12 && tf <= 0.3).toBe(true);
    expect((kinds.get("order") ?? 0) / total).toBeGreaterThanOrEqual(0.05);
    expect((kinds.get("choice") ?? 0) / total).toBeGreaterThanOrEqual(0.5);
  });

  it.each(Object.keys(SKILL_FILES).sort())("skill file shape: %s", (subject) => {
    const doc = skillsBySubject().get(subject);
    expect(doc, `missing ${SKILL_FILES[subject]}`).toBeDefined();
    expect(doc!.subject).toBe(subject);
    const ids = doc!.skills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of doc!.skills) {
      expect(new RegExp(`^${subject}\\.[a-z0-9_]+\\.[a-z0-9_]+$`).test(s.id), `bad skill id ${s.id}`).toBe(true);
      expect(Number.isInteger(s.grade) && s.grade >= 0 && s.grade <= 9, s.id).toBe(true);
      for (const key of ["title_he", "title_en"] as const) expect(typeof s[key] === "string" && s[key].trim(), `${s.id}: ${key}`).toBeTruthy();
      expect(NIQQUD.test(s.title_he), `${s.id}: niqqud in title`).toBe(false);
      expect(Array.isArray(s.prereq), `${s.id}: prereq must be a list`).toBe(true);
      expect(s.generator, `${s.id}: expected bank generator`).toBe("bank");
      if (s.mastery) expect(Object.keys(s.mastery).every((k) => ["min_attempts", "threshold", "rating"].includes(k))).toBe(true);
    }
  });

  it("skill counts", () => {
    expect(skillsBySubject().get("science")!.skills.length).toBeGreaterThanOrEqual(40);
    expect(skillsBySubject().get("hebrew")!.skills.length).toBeGreaterThanOrEqual(35);
  });

  it("skill bank resolves (every skill)", () => {
    for (const [sid, skill] of allSkills()) {
      expect(Object.keys(skill.params).every((k) => k === "bank" || k === "tags"), sid).toBe(true);
      expect(BANK_DIRS).toContain(String(skill.params["bank"]).split("/")[0]);
      const n = skillItems(skill).length;
      expect(n, `${sid}: only ${n} items`).toBeGreaterThanOrEqual(MIN_ITEMS_PER_SKILL);
    }
  });

  it("prereqs exist and acyclic", () => {
    const all = allSkills();
    for (const [sid, s] of all) {
      for (const p of s.prereq) {
        expect(all.has(p), `${sid}: unknown prereq ${p}`).toBe(true);
        expect(p).not.toBe(sid);
        expect(all.get(p)!.grade, `${sid}: prereq ${p} is for a later grade`).toBeLessThanOrEqual(s.grade);
      }
    }
    const state = new Map<string, number>();
    const visit = (node: string, path: string[]): void => {
      if (state.get(node) === 1) throw new Error(`prereq cycle: ${[...path, node].join(" -> ")}`);
      if (state.get(node) === 2) return;
      state.set(node, 1);
      for (const p of all.get(node)!.prereq) visit(p, [...path, node]);
      state.set(node, 2);
    };
    for (const sid of all.keys()) visit(sid, []);
  });

  it("items belong to their skill", () => {
    const all = allSkills();
    for (const [rel, doc, item] of items()) {
      const sid = String("skill" in item ? item["skill"] : doc["skill"]);
      expect(all.has(sid), `${item.id}: unknown skill ${sid}`).toBe(true);
      const skill = all.get(sid)!;
      expect(skill.params["bank"], `${item.id}: skill ${sid} reads another bank`).toBe(rel);
      const tags = new Set((skill.params["tags"] as string[] | undefined) ?? []);
      expect(!tags.size || item.tags.some((t) => tags.has(t)), `${item.id}: not selected by its skill ${sid}`).toBe(true);
    }
  });

  it("every item reachable", () => {
    const reachable = new Set([...allSkills().values()].flatMap((s) => skillItems(s).map((i) => i.id)));
    expect(
      items()
        .map(([, , item]) => item.id)
        .filter((id) => !reachable.has(id))
        .slice(0, 10),
    ).toEqual([]);
  });

  it("monster facts", () => {
    const doc = banks().get("science/monster_facts.yaml")!;
    expect(doc).toBeDefined();
    const elements = doc["elements"] as Record<string, { title_he: string; title_en: string; facts: Dict[] }>;
    expect(Object.keys(elements).sort()).toEqual([...ELEMENTS].sort());
    for (const [name, el] of Object.entries(elements)) {
      expect(el.title_he && el.title_en).toBeTruthy();
      expect(el.facts.length, `${name}: ${el.facts.length} facts`).toBe(8);
      for (const f of el.facts) {
        expect(Object.keys(f).sort()).toEqual(["en", "he", "id"]);
        expect(HEBREW_LETTER.test(String(f["he"])) && String(f["en"]).trim()).toBeTruthy();
        expect(NIQQUD.test(String(f["he"])), `${String(f["id"])}: niqqud`).toBe(false);
        expect(len(String(f["he"])), `${String(f["id"])}: fact too long`).toBeLessThanOrEqual(MAX_FACT_HE);
      }
      expect(new Set(el.facts.map((f) => f["he"])).size, `${name}: duplicate facts`).toBe(8);
      const quiz = (doc["items"] as Item[]).filter((i) => i.tags.includes(`element_${name}`));
      expect(quiz.length, `${name}: needs 2 quiz items`).toBeGreaterThanOrEqual(2);
    }
  });
});
