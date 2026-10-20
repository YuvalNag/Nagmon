/**
 * Content library: skills, banks and the generator registry (a port of
 * `content.py`).
 *
 * The loader takes already-parsed documents, keyed by their path under
 * `mods/nagmon/learning/` ("skills/math.yaml", "science/living.yaml",
 * "english/words.yaml"). The build pipeline turns each YAML file into
 * JSON with the same structure; a key may end in ".json" instead of
 * ".yaml" (a bank named "science/living.yaml" in a skill is found under
 * either name). Everything is validated and every problem is collected
 * into one `ContentError`.
 */
import { GENERATORS, type GenContext, genContext, type Generator, type Params } from "./generators/common";
import { parseWord, parseWords, skillWords, validateVocabParams, VocabPool, type VocabWord } from "./generators/english";
import { FALSE_ID, makeChoice, makeFigure, makeQuestion, type Question, SUBJECTS, TRUE_ID, trueFalseChoices, type Choice } from "./model";
import { casefold, pyLen, strip } from "./py";
import type { PyRandom } from "./random";

export const WORDS_FILE = "english/words.yaml";
const NIQQUD = /[֑-ׇֽֿׁׂׅׄ]/;
const HEBREW = /[א-ת]/;
const ITEM_ID = /^[A-Za-z0-9_.-]+$/;
export const LIMITS = { prompt_he: 140, choice: 40, explanation_he: 200 } as const;
/** Share of questions taken from extra (AI) items in a generator skill. */
export const EXTRA_SHARE_MAX = 0.3;
export const EXTRA_SHARE_HALF = 20;

export class ContentError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super("invalid learning content:\n  " + errors.join("\n  "));
    this.name = "ContentError";
    this.errors = [...errors];
  }
}

export interface MasteryRule {
  readonly min_attempts: number;
  readonly threshold: number;
}

export interface Skill {
  readonly id: string;
  readonly subject: string;
  readonly grade: number;
  readonly title_he: string;
  readonly title_en: string;
  readonly prereq: readonly string[];
  readonly generator: string;
  readonly params: Params;
  readonly mastery: MasteryRule;
  readonly srs: boolean;
}

export type RawChoice = Readonly<Record<string, unknown>>;

export interface BankItem {
  readonly id: string;
  readonly skill: string;
  readonly kind: string;
  readonly grade: number;
  readonly difficulty: number;
  readonly prompt_he: string;
  readonly prompt_en: string | null;
  readonly choices: readonly RawChoice[];
  readonly answer: unknown;
  readonly explanation_he: string;
  readonly explanation_en: string | null;
  readonly tags: readonly string[];
  readonly meta: Readonly<Record<string, unknown>>;
  /** TTS text instead of prompt_en. */
  readonly speak_en: string | null;
  /** Picture shown with the prompt. */
  readonly emoji: string | null;
}

export interface ElementFact {
  readonly id: string;
  readonly he: string;
  readonly en: string;
}

export class GeneratorRegistry {
  private readonly gens: Map<string, Generator>;

  constructor(generators?: ReadonlyMap<string, Generator>) {
    this.gens = new Map(generators ?? []);
  }

  register(name: string, fn: Generator): void {
    this.gens.set(name, fn);
  }

  get(name: string): Generator {
    const g = this.gens.get(name);
    if (g === undefined) throw new Error(`unknown generator ${name}`);
    return g;
  }

  has(name: string): boolean {
    return this.gens.has(name);
  }

  names(): string[] {
    return [...this.gens.keys()].sort();
  }
}

/** Every ported generator plus `bank`. Import "./generators" first to fill GENERATORS. */
export function defaultRegistry(): GeneratorRegistry {
  const reg = new GeneratorRegistry(GENERATORS);
  reg.register("bank", bankGenerator);
  return reg;
}

// --------------------------------------------------------------------------
// bank generator
// --------------------------------------------------------------------------

/** Display text: Hebrew, or the English text of an English-only choice. */
function choiceText(raw: RawChoice): string {
  return String(raw["he"] || raw["en"] || "");
}

function bankChoice(raw: RawChoice, idx: number): Choice {
  const em = raw["emoji"];
  return makeChoice(
    String.fromCharCode(97 + idx),
    choiceText(raw),
    (raw["en"] as string | undefined) ?? null,
    em ? `emoji:${String(em)}` : ((raw["image"] as string | undefined) ?? null),
  );
}

/** A question from one bank item (choices trimmed to `ctx.max_choices` and shuffled). */
export function bankQuestion(item: BankItem, rng: PyRandom, ctx: GenContext): Question {
  const speakEn = item.speak_en || item.prompt_en;
  const common = {
    item_id: item.id,
    skill_id: ctx.skill_id || item.skill,
    subject: ctx.subject,
    prompt_he: item.prompt_he,
    prompt_en: item.prompt_en,
    explanation_he: item.explanation_he,
    explanation_en: item.explanation_en,
    difficulty: Number(item.difficulty),
    figure: item.emoji ? makeFigure("objects", { emoji: item.emoji, count: 1 }) : null,
    speak: { he: item.prompt_he, ...(speakEn ? { en: speakEn } : {}) },
    source: "bank",
    meta: { ...item.meta },
  };
  if (item.kind === "true_false") {
    return makeQuestion({ ...common, kind: "true_false", choices: trueFalseChoices(), answer: item.answer ? TRUE_ID : FALSE_ID });
  }
  const choices = item.choices.map((c, i) => bankChoice(c, i));
  if (item.kind === "order") {
    const order = (item.answer as number[]).map((i) => choices[i]!.id);
    const shuffled = [...choices];
    rng.shuffle(shuffled);
    return makeQuestion({ ...common, kind: "order", choices: shuffled, answer: order });
  }
  const correct = choices[Number(item.answer)]!;
  let limit = choices.length;
  if (ctx.max_choices) limit = Math.max(2, Math.min(limit, ctx.max_choices));
  const others = choices.filter((c) => c !== correct);
  const keep = rng.sample(others, limit - 1);
  const opts = [correct, ...keep];
  rng.shuffle(opts);
  // Re-letter so ids stay a, b, c... after trimming.
  let answer = "a";
  const relettered = opts.map((c, i) => {
    const nc = makeChoice(String.fromCharCode(97 + i), c.text_he, c.text_en, c.image);
    if (c === correct) answer = nc.id;
    return nc;
  });
  return makeQuestion({ ...common, kind: "choice", choices: relettered, answer });
}

/** The `bank` generator: a random item of the skill (by `params.tags` when given). */
export const bankGenerator: Generator = (rng, params, ctx) => {
  const items = (params["_items"] as readonly BankItem[] | undefined) ?? [];
  const extra = (params["_extra"] as readonly BankItem[] | undefined) ?? [];
  const tagsRaw = params["tags"];
  const tags = new Set<string>(Array.isArray(tagsRaw) ? (tagsRaw as string[]) : []);
  const tagged = items.filter((i) => !tags.size || i.tags.some((t) => tags.has(t)));
  const pool = [...(tagged.length ? tagged : items), ...extra]; // extra (AI) items attach by skill, not tag
  return bankQuestion(rng.choice(pool), rng, ctx);
};

// --------------------------------------------------------------------------
// Library
// --------------------------------------------------------------------------

export interface LibraryExtras {
  words?: Iterable<VocabWord>;
  extra?: ReadonlyMap<string, readonly BankItem[]>;
  elementFacts?: ReadonlyMap<string, readonly ElementFact[]>;
  elementTitles?: ReadonlyMap<string, { he: string; en: string }>;
  warnings?: Iterable<string>;
  skipped?: Iterable<string>;
}

export class ContentLibrary {
  readonly skills: ReadonlyMap<string, Skill>;
  readonly registry: GeneratorRegistry;
  readonly banks: ReadonlyMap<string, readonly BankItem[]>;
  readonly words: readonly VocabWord[];
  readonly extra: ReadonlyMap<string, readonly BankItem[]>;
  readonly elementFacts: ReadonlyMap<string, readonly ElementFact[]>;
  readonly elementTitles: ReadonlyMap<string, { he: string; en: string }>;
  readonly warnings: readonly string[];
  /** Skills left out because their generator is not ported yet (only with `allowMissingGenerators`). */
  readonly skipped: readonly string[];
  private readonly bySubjectMap = new Map<string, Skill[]>();
  private readonly paramsMap = new Map<string, Params>();
  private readonly dependentsMap = new Map<string, string[]>();

  constructor(skills: ReadonlyMap<string, Skill>, registry: GeneratorRegistry, banks?: ReadonlyMap<string, readonly BankItem[]>, more: LibraryExtras = {}) {
    this.skills = new Map(skills);
    this.registry = registry;
    this.banks = new Map(banks ?? []);
    this.words = [...(more.words ?? [])];
    this.extra = new Map(more.extra ?? []);
    this.elementFacts = new Map(more.elementFacts ?? []);
    this.elementTitles = new Map(more.elementTitles ?? []);
    this.warnings = [...(more.warnings ?? [])];
    this.skipped = [...(more.skipped ?? [])];
    const sorted = [...this.skills.values()].sort((a, b) => a.grade - b.grade || cmpStr(a.id, b.id));
    for (const s of sorted) {
      if (!this.bySubjectMap.has(s.subject)) this.bySubjectMap.set(s.subject, []);
      this.bySubjectMap.get(s.subject)!.push(s);
    }
    for (const s of this.skills.values()) {
      const p: Record<string, unknown> = { ...s.params };
      if (s.generator === "bank") {
        p["_items"] = this.banks.get(s.id) ?? [];
        p["_extra"] = this.extra.get(s.id) ?? [];
      } else if (s.generator === "english.vocab") {
        p["_pool"] = new VocabPool(skillWords(p, this.words));
      }
      this.paramsMap.set(s.id, p);
    }
    for (const s of this.skills.values()) {
      for (const pid of s.prereq) {
        if (!this.dependentsMap.has(pid)) this.dependentsMap.set(pid, []);
        this.dependentsMap.get(pid)!.push(s.id);
      }
    }
  }

  // -- queries ---------------------------------------------------------------
  skill(skillId: string): Skill {
    const s = this.skills.get(skillId);
    if (s === undefined) throw new Error(`unknown skill ${skillId}`);
    return s;
  }

  get(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  bySubject(subject: string): Skill[] {
    return [...(this.bySubjectMap.get(subject) ?? [])];
  }

  subjects(): string[] {
    return SUBJECTS.filter((s) => this.bySubjectMap.has(s));
  }

  dependents(skillId: string): string[] {
    return [...(this.dependentsMap.get(skillId) ?? [])];
  }

  /** English word -> Hebrew (first entry), for the language ladder. */
  wordsHe(): Map<string, string> {
    const out = new Map<string, string>();
    for (const w of this.words) if (!out.has(w.word)) out.set(w.word, w.he);
    return out;
  }

  /** One question of the skill; extra (AI) items mix into generator skills. */
  generate(skillId: string, rng: PyRandom, ctx?: GenContext): Question {
    const skill = this.skill(skillId);
    let c: GenContext;
    if (ctx === undefined) c = genContext({ skill_id: skill.id, subject: skill.subject, grade: skill.grade });
    else if (ctx.skill_id !== skill.id || ctx.subject !== skill.subject) c = { ...ctx, skill_id: skill.id, subject: skill.subject };
    else c = ctx;
    const extra = skill.generator !== "bank" ? this.extra.get(skillId) : undefined;
    if (extra && extra.length) {
      const share = Math.min(EXTRA_SHARE_MAX, extra.length / (extra.length + EXTRA_SHARE_HALF));
      if (rng.random() < share) return bankQuestion(rng.choice(extra), rng, c);
    }
    const gen = this.registry.get(skill.generator);
    return gen(rng, this.paramsMap.get(skillId)!, c);
  }
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// --------------------------------------------------------------------------
// Loading
// --------------------------------------------------------------------------

/** Parsed content files keyed by path under the learning folder ("skills/math.yaml"). */
export type ContentDocs = Readonly<Record<string, unknown>>;

export interface LoadOptions {
  registry?: GeneratorRegistry;
  /**
   * AI-studio banks: each is a folder's files by name ("math.yaml",
   * "reading.yaml", "vocab.yaml"). Problems there only produce warnings
   * (`library.warnings`) and never stop the game.
   */
  extraBanks?: readonly ContentDocs[];
  /**
   * Leave out skills whose generator is not registered (and the skills
   * that need them), listing them in `library.skipped`, instead of an
   * error. For tests while generators are still being ported.
   */
  allowMissingGenerators?: boolean;
}

/** Look a file up by its YAML path or the pipeline's JSON name. */
function lookup(docs: ContentDocs, rel: string): { found: boolean; doc: unknown } {
  if (rel in docs) return { found: true, doc: docs[rel] };
  const json = rel.replace(/\.ya?ml$/, ".json");
  if (json in docs) return { found: true, doc: docs[json] };
  return { found: false, doc: undefined };
}

const isMapping = (x: unknown): x is Readonly<Record<string, unknown>> => x !== null && typeof x === "object" && !Array.isArray(x);

/** Load and validate the content; throws `ContentError` with every problem. */
export function loadContent(docs: ContentDocs, opts: LoadOptions = {}): ContentLibrary {
  const registry = opts.registry ?? defaultRegistry();
  const errors: string[] = [];
  const rawSkills: [string, unknown, unknown][] = [];
  const skillFiles = Object.keys(docs)
    .filter((k) => /^skills\/[^/]+\.(ya?ml|json)$/.test(k))
    .sort();
  for (const name of skillFiles) {
    const doc = docs[name] ?? {};
    const fname = name.slice("skills/".length);
    if (!isMapping(doc)) {
      errors.push(`${fname}: top level must be a mapping`);
      continue;
    }
    const subject = doc["subject"];
    for (const s of (doc["skills"] as unknown[] | null | undefined) || []) rawSkills.push([fname, subject, s]);
  }
  let filtered = rawSkills;
  let skipped: string[] = [];
  if (opts.allowMissingGenerators) [filtered, skipped] = dropUnported(rawSkills, registry);
  const built = build(docs, filtered, registry, errors);
  if (errors.length) throw new ContentError(errors);
  const warnings: string[] = [];
  const [extra, extraWords] = loadExtra(opts.extraBanks ?? [], built, warnings);
  return new ContentLibrary(built.skills, registry, built.banks, {
    words: [...built.words, ...extraWords],
    extra,
    elementFacts: built.elementFacts,
    elementTitles: built.elementTitles,
    warnings,
    skipped,
  });
}

/** Skills whose generator is missing, and every skill that needs one of them. */
function dropUnported(raw: [string, unknown, unknown][], registry: GeneratorRegistry): [[string, unknown, unknown][], string[]] {
  const gone = new Set<string>();
  const info = raw.map((r) => (isMapping(r[2]) ? r[2] : {}));
  for (const s of info) if (typeof s["id"] === "string" && !registry.has(String(s["generator"]))) gone.add(s["id"]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of info) {
      const id = s["id"];
      if (typeof id !== "string" || gone.has(id)) continue;
      const pre = (s["prereq"] as unknown[] | null | undefined) || [];
      if (pre.some((p) => gone.has(String(p)))) {
        gone.add(id);
        changed = true;
      }
    }
  }
  return [raw.filter((_, i) => !gone.has(String(info[i]!["id"]))), [...gone].sort()];
}

interface Built {
  skills: Map<string, Skill>;
  banks: Map<string, readonly BankItem[]>;
  words: VocabWord[];
  elementFacts: Map<string, ElementFact[]>;
  elementTitles: Map<string, { he: string; en: string }>;
  itemIds: Set<string>;
}

interface ParsedBank {
  items: BankItem[];
  elementFacts: Map<string, ElementFact[]>;
  elementTitles: Map<string, { he: string; en: string }>;
}

function textErrors(where: string, field: string, text: unknown, limit: number): string[] {
  const out: string[] = [];
  if (typeof text !== "string" || !strip(text)) return [`${where}: ${field} is missing`];
  if (pyLen(text) > limit) out.push(`${where}: ${field} longer than ${limit} characters`);
  if (NIQQUD.test(text)) out.push(`${where}: ${field} contains niqqud`);
  return out;
}

function build(docs: ContentDocs, rawSkills: [string, unknown, unknown][], registry: GeneratorRegistry, errors: string[]): Built {
  const built: Built = {
    skills: buildSkills(rawSkills, registry, errors),
    banks: new Map(),
    words: [],
    elementFacts: new Map(),
    elementTitles: new Map(),
    itemIds: new Set(),
  };
  const skills = built.skills;
  const usesVocab = [...skills.values()].some((s) => s.generator === "english.vocab");
  if (usesVocab || lookup(docs, WORDS_FILE).found) built.words = loadWords(docs, errors);
  for (const [sid, sk] of skills) {
    if (sk.generator === "english.vocab") for (const e of validateVocabParams(sk.params, built.words)) errors.push(`${sid}: ${e}`);
  }
  const parsed = new Map<string, ParsedBank>();
  const owner = new Map<string, string>(); // item id -> bank file
  for (const [sid, sk] of skills) {
    if (sk.generator !== "bank") continue;
    const rel = sk.params["bank"];
    if (!rel) {
      errors.push(`${sid}: bank generator needs params.bank`);
      continue;
    }
    const relS = String(rel);
    if (!parsed.has(relS)) {
      const bank = loadBank(docs, relS, errors);
      if (bank === null) continue;
      parsed.set(relS, bank);
      for (const it of bank.items) {
        if (owner.has(it.id)) {
          errors.push(`${relS}:${it.id}: duplicate item id`);
          continue;
        }
        owner.set(it.id, relS);
        if (it.skill && !skills.has(it.skill)) errors.push(`${relS}:${it.id}: unknown skill '${it.skill}'`);
      }
      for (const [element, facts] of bank.elementFacts) {
        if (!built.elementFacts.has(element)) built.elementFacts.set(element, []);
        built.elementFacts.get(element)!.push(...facts);
      }
      for (const [k, v] of bank.elementTitles) built.elementTitles.set(k, v);
    }
    const items = parsed.get(relS)!.items;
    const mine = items.filter((it) => it.skill === sid);
    built.banks.set(sid, mine.length ? mine : items);
  }
  built.itemIds = new Set(owner.keys());
  return built;
}

function buildSkills(rawSkills: [string, unknown, unknown][], registry: GeneratorRegistry, errors: string[]): Map<string, Skill> {
  const skills = new Map<string, Skill>();
  for (const [fname, subject, s] of rawSkills) {
    const m = isMapping(s) ? s : null;
    const sid = m ? m["id"] : null;
    const where = `${fname}:${String(sid)}`;
    if (!m || !sid || typeof sid !== "string") {
      errors.push(`${fname}: skill without id`);
      continue;
    }
    if (skills.has(sid)) {
      errors.push(`${where}: duplicate skill id`);
      continue;
    }
    const subj = "subject" in m ? m["subject"] : subject;
    if (!SUBJECTS.includes(subj as string)) errors.push(`${where}: unknown subject '${String(subj)}'`);
    else if (sid.split(".")[0] !== subj) errors.push(`${where}: id prefix does not match subject ${String(subj)}`);
    let grade = m["grade"];
    if (typeof grade !== "number" || !Number.isInteger(grade) || grade < 0 || grade > 9) {
      errors.push(`${where}: grade must be an integer 0..9`);
      grade = 0;
    }
    const gen = m["generator"];
    if (!registry.has(String(gen))) errors.push(`${where}: unknown generator '${String(gen)}'`);
    const mr = (isMapping(m["mastery"]) ? m["mastery"] : {}) as Record<string, unknown>;
    const rule: MasteryRule = {
      min_attempts: Math.trunc(Number("min_attempts" in mr ? mr["min_attempts"] : 12)),
      threshold: Number("threshold" in mr ? mr["threshold"] : 0.8),
    };
    if (!(rule.threshold > 0 && rule.threshold < 1) || rule.min_attempts < 1) errors.push(`${where}: bad mastery rule`);
    const params = { ...((isMapping(m["params"]) ? m["params"] : {}) as Record<string, unknown>) };
    const skill: Skill = {
      id: sid,
      subject: String(subj),
      grade: grade as number,
      title_he: String(m["title_he"] ?? ""),
      title_en: String(m["title_en"] ?? ""),
      prereq: [...((m["prereq"] as string[] | null | undefined) || [])],
      generator: String(gen),
      params,
      mastery: rule,
      srs: "srs" in m ? Boolean(m["srs"]) : gen === "bank" || gen === "english.vocab",
    };
    skills.set(sid, skill);
    if (!skill.title_he) errors.push(`${where}: title_he is missing`);
  }
  for (const [sid, sk] of skills) for (const p of sk.prereq) if (!skills.has(p)) errors.push(`${sid}: missing prereq '${p}'`);
  errors.push(...cycles(skills));
  return skills;
}

function loadWords(docs: ContentDocs, errors: string[]): VocabWord[] {
  const { found, doc } = lookup(docs, WORDS_FILE);
  if (!found) {
    errors.push(`${WORDS_FILE}: file not found`);
    return [];
  }
  const [words, errs] = parseWords(doc);
  for (const e of errs) errors.push(`${WORDS_FILE}: ${e}`);
  for (const w of words) {
    for (const [name, text] of [
      ["he", w.he],
      ["example_he", w.example_he],
    ] as const) {
      if (NIQQUD.test(text)) errors.push(`${WORDS_FILE}:${w.word}: ${name} has niqqud`);
    }
  }
  return words;
}

function loadBank(docs: ContentDocs, rel: string, errors: string[]): ParsedBank | null {
  const { found, doc } = lookup(docs, rel);
  if (!found) {
    errors.push(`bank file not found: ${rel}`);
    return null;
  }
  const bank: ParsedBank = { items: [], elementFacts: new Map(), elementTitles: new Map() };
  const [rawItems, fileErrors] = bankRawItems(doc);
  for (const e of fileErrors) errors.push(`${rel}: ${e}`);
  const seen = new Set<string>();
  for (const [raw, defaults] of rawItems) {
    const [item, errs] = parseItem(rel, raw, defaults);
    errors.push(...errs);
    if (item === null) continue;
    if (seen.has(item.id)) {
      errors.push(`${rel}:${item.id}: duplicate item id`);
      continue;
    }
    seen.add(item.id);
    bank.items.push(item);
  }
  if (isMapping(doc) && doc["elements"] !== null && doc["elements"] !== undefined) parseElements(rel, doc["elements"], bank, errors);
  return bank;
}

function cycles(skills: ReadonlyMap<string, Skill>): string[] {
  const state = new Map<string, number>();
  const errors: string[] = [];
  const visit = (sid: string, path: string[]): void => {
    const st = state.get(sid) ?? 0;
    if (st === 1) {
      const cyc = [...path.slice(path.indexOf(sid)), sid];
      errors.push("prereq cycle: " + cyc.join(" -> "));
      return;
    }
    if (st === 2 || !skills.has(sid)) return;
    state.set(sid, 1);
    for (const p of skills.get(sid)!.prereq) visit(p, [...path, sid]);
    state.set(sid, 2);
  };
  for (const sid of skills.keys()) visit(sid, []);
  return errors;
}

const PASSAGE_INHERIT = ["grade", "skill", "tags", "level"];

type Defaults = Readonly<Record<string, unknown>>;

/**
 * (raw item, defaults) pairs of a bank document: `{skill, items}` banks,
 * or a list of reading passages whose questions inherit grade, skill, tags
 * and level, and carry the passage text in `meta`.
 */
function bankRawItems(doc: unknown): [[unknown, Defaults][], string[]] {
  if (doc === null || doc === undefined) return [[], []];
  if (isMapping(doc)) {
    const items = doc["items"] || [];
    if (!Array.isArray(items)) return [[], ["items must be a list"]];
    const defaults = { skill: doc["skill"] ?? null };
    return [items.map((raw: unknown) => [raw, defaults] as [unknown, Defaults]), []];
  }
  if (!Array.isArray(doc)) return [[], ["top level must be a mapping or a list of passages"]];
  const out: [unknown, Defaults][] = [];
  const errors: string[] = [];
  for (const passage of doc) {
    if (!isMapping(passage)) {
      errors.push("passage must be a mapping");
      continue;
    }
    const pid = passage["id"] ?? null;
    if (!passage["text_en"] && !passage["text_he"]) errors.push(`${String(pid)}: passage text is missing`);
    const defaults: Record<string, unknown> = {};
    for (const k of PASSAGE_INHERIT) if (k in passage) defaults[k] = passage[k];
    defaults["meta"] = {
      passage_id: pid,
      passage_title: passage["title"] ?? null,
      passage_en: passage["text_en"] ?? null,
      passage_he: passage["text_he"] ?? null,
    };
    for (const q of (passage["questions"] as unknown[] | null | undefined) || []) out.push([q, defaults]);
  }
  return [out, errors];
}

function normChoice(raw: unknown): RawChoice {
  if (isMapping(raw)) return raw;
  const text = String(raw);
  return HEBREW.test(text) ? { he: text } : { en: text };
}

function choiceErrors(where: string, choices: readonly RawChoice[]): string[] {
  const errors: string[] = [];
  if (choices.length < 2) errors.push(`${where}: needs at least 2 choices`);
  for (const lang of ["he", "en"]) {
    const texts = choices.filter((c) => c[lang]).map((c) => casefold(strip(String(c[lang]))));
    if (new Set(texts).size !== texts.length) {
      errors.push(`${where}: duplicate choice`);
      break;
    }
  }
  for (const c of choices) {
    if (!c["he"] && !c["en"]) {
      errors.push(`${where}: choice is missing`);
      continue;
    }
    // the displayed text (Hebrew, or English for an English-only choice)
    errors.push(...textErrors(where, "choice", choiceText(c), LIMITS.choice));
  }
  const withEmoji = choices.filter((c) => c["emoji"]).length;
  if (withEmoji > 0 && withEmoji < choices.length) errors.push(`${where}: emoji on some choices only (a giveaway)`);
  return errors;
}

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

function parseItem(rel: string, raw: unknown, defaults: Defaults): [BankItem | null, string[]] {
  if (!isMapping(raw)) return [null, [`${rel}: item must be a mapping`]];
  const iid = raw["id"];
  const where = `${rel}:${String(iid)}`;
  if (!iid || typeof iid !== "string") return [null, [`${rel}: item without id`]];
  const errors: string[] = [];
  if (!ITEM_ID.test(iid)) errors.push(`${where}: id may use only A-Z a-z 0-9 _ . -`);
  const kind = "kind" in raw ? raw["kind"] : "choice";
  let choices = ((raw["choices"] as unknown[] | null | undefined) || []).map(normChoice);
  const answer = raw["answer"];
  errors.push(...textErrors(where, "prompt_he", raw["prompt_he"], LIMITS.prompt_he));
  if (raw["explanation_he"]) errors.push(...textErrors(where, "explanation_he", raw["explanation_he"], LIMITS.explanation_he));
  if (kind === "true_false") {
    if (typeof answer !== "boolean") errors.push(`${where}: true_false needs answer: true|false`);
    choices = [];
  } else if (kind === "choice" || kind === "order") {
    errors.push(...choiceErrors(where, choices));
    const n = choices.length;
    if (kind === "choice") {
      if (!isInt(answer) || !(answer >= 0 && answer < n)) errors.push(`${where}: answer out of range`);
    } else if (
      !Array.isArray(answer) ||
      !answer.every(isInt) ||
      JSON.stringify([...(answer as number[])].sort((a, b) => a - b)) !== JSON.stringify(Array.from({ length: n }, (_, i) => i))
    ) {
      errors.push(`${where}: order answer must list all choice indexes`);
    }
  } else {
    errors.push(`${where}: unknown kind '${String(kind)}'`);
  }
  for (const k of ["speak_en", "emoji"]) {
    const v = raw[k];
    if (v !== null && v !== undefined && typeof v !== "string") errors.push(`${where}: ${k} must be text`);
  }
  let grade = "grade" in raw ? raw["grade"] : "grade" in defaults ? defaults["grade"] : 0;
  if (!isInt(grade)) {
    errors.push(`${where}: grade must be an integer`);
    grade = 0;
  }
  let difficulty = 0;
  const rawDiff = "difficulty" in raw ? raw["difficulty"] : 0;
  if (typeof rawDiff === "number" || (typeof rawDiff === "string" && strip(rawDiff) !== "" && Number.isFinite(Number(rawDiff)))) {
    difficulty = Number(rawDiff);
  } else {
    errors.push(`${where}: difficulty must be a number`);
  }
  if (errors.length) return [null, errors];
  const meta: Record<string, unknown> = { ...((defaults["meta"] as Record<string, unknown> | undefined) ?? {}) };
  Object.assign(meta, (raw["meta"] as Record<string, unknown> | null | undefined) || {});
  if (defaults["level"] && !("level" in meta)) meta["level"] = defaults["level"];
  const tagsRaw = raw["tags"] || defaults["tags"] || [];
  return [
    {
      id: iid,
      skill: String(raw["skill"] || defaults["skill"] || ""),
      kind: String(kind),
      grade: grade as number,
      difficulty,
      prompt_he: String(raw["prompt_he"] ?? ""),
      prompt_en: (raw["prompt_en"] as string | undefined) ?? null,
      choices,
      answer,
      explanation_he: String(raw["explanation_he"] ?? ""),
      explanation_en: (raw["explanation_en"] as string | undefined) ?? null,
      tags: Array.isArray(tagsRaw) ? (tagsRaw as unknown[]).map(String) : [String(tagsRaw)],
      meta,
      speak_en: (raw["speak_en"] as string | undefined) || null,
      emoji: (raw["emoji"] as string | undefined) || null,
    },
    [],
  ];
}

/** `elements: {name: {title_he, title_en, facts: [{id, he, en}]}}`. */
function parseElements(rel: string, elements: unknown, bank: ParsedBank, errors: string[]): void {
  if (!isMapping(elements)) {
    errors.push(`${rel}: elements must be a mapping`);
    return;
  }
  const ids = new Set<string>();
  for (const [name, block] of Object.entries(elements)) {
    const where = `${rel}:elements.${name}`;
    if (!isMapping(block)) {
      errors.push(`${where}: must be a mapping`);
      continue;
    }
    bank.elementTitles.set(name, { he: String(block["title_he"] || ""), en: String(block["title_en"] || "") });
    const facts: ElementFact[] = [];
    for (const f of (block["facts"] as unknown[] | null | undefined) || []) {
      const fid = isMapping(f) ? f["id"] : null;
      if (!fid) {
        errors.push(`${where}: fact without id`);
        continue;
      }
      const fidS = String(fid);
      if (ids.has(fidS)) {
        errors.push(`${where}:${fidS}: duplicate fact id`);
        continue;
      }
      ids.add(fidS);
      const he = (f as Record<string, unknown>)["he"];
      if (typeof he !== "string" || !strip(he)) {
        errors.push(`${where}:${fidS}: he is missing`);
        continue;
      }
      if (NIQQUD.test(he)) errors.push(`${where}:${fidS}: he contains niqqud`);
      facts.push({ id: fidS, he, en: String((f as Record<string, unknown>)["en"] || "") });
    }
    bank.elementFacts.set(name, facts);
  }
}

// --------------------------------------------------------------------------
// Extra banks (AI studio, SDD_AI section 2)
// --------------------------------------------------------------------------

function loadExtra(dirs: readonly ContentDocs[], built: Built, warnings: string[]): [Map<string, BankItem[]>, VocabWord[]] {
  const extra = new Map<string, BankItem[]>();
  const words: VocabWord[] = [];
  const seenIds = new Set(built.itemIds);
  const seenWords = new Set(built.words.map((w) => `${w.word.toLowerCase()}\u0000${w.pos}`));
  for (const files of dirs) {
    for (const name of [...SUBJECTS, "reading"]) {
      const { found, doc } = lookup(files, `${name}.yaml`);
      if (found) loadExtraBank(`${name}.yaml`, doc, built, seenIds, extra, warnings);
    }
    const vocab = lookup(files, "vocab.yaml");
    if (vocab.found) words.push(...loadExtraWords("vocab.yaml", vocab.doc, seenWords, warnings));
  }
  return [extra, words];
}

function loadExtraBank(
  name: string,
  doc: unknown,
  built: Built,
  seenIds: Set<string>,
  extra: Map<string, BankItem[]>,
  warnings: string[],
): void {
  const [rawItems, fileErrors] = bankRawItems(doc);
  for (const e of fileErrors) warnings.push(`${name}: ${e}`);
  for (const [raw, defaults] of rawItems) {
    const [item, errs] = parseItem(name, raw, defaults);
    if (item === null) {
      warnings.push(`skipped: ${errs.join("; ")}`);
      continue;
    }
    const where = `${name}:${item.id}`;
    if (seenIds.has(item.id)) {
      warnings.push(`${where}: duplicate item id, skipped`);
      continue;
    }
    const skill = resolveSkill(item, built.skills);
    if (skill === null) {
      warnings.push(`${where}: unknown skill '${item.skill}', skipped`);
      continue;
    }
    seenIds.add(item.id);
    if (!extra.has(skill)) extra.set(skill, []);
    extra.get(skill)!.push(item);
  }
}

/**
 * The item's skill, or for a generic id (the studio writes stories as
 * `english.reading`) the skill under that prefix nearest in grade.
 */
function resolveSkill(item: BankItem, skills: ReadonlyMap<string, Skill>): string | null {
  if (skills.has(item.skill)) return item.skill;
  if (!item.skill) return null;
  const under = [...skills.values()].filter((s) => s.id.startsWith(item.skill + "."));
  if (!under.length) return null;
  under.sort((a, b) => Math.abs(a.grade - item.grade) - Math.abs(b.grade - item.grade) || a.grade - b.grade || cmpStr(a.id, b.id));
  return under[0]!.id;
}

function loadExtraWords(name: string, doc: unknown, seen: Set<string>, warnings: string[]): VocabWord[] {
  if (doc === null || doc === undefined) return [];
  if (!Array.isArray(doc)) {
    warnings.push(`${name}: top level must be a list of words`);
    return [];
  }
  const out: VocabWord[] = [];
  for (const raw of doc) {
    const [w, errs] = parseWord(raw);
    if (w === null) {
      warnings.push(`${name}: skipped: ${errs.join("; ")}`);
      continue;
    }
    if (NIQQUD.test(w.he)) {
      warnings.push(`${name}:${w.word}: niqqud, skipped`);
      continue;
    }
    const k = `${w.word.toLowerCase()}\u0000${w.pos}`;
    if (seen.has(k)) continue; // already in the main list
    seen.add(k);
    out.push(w);
  }
  return out;
}
