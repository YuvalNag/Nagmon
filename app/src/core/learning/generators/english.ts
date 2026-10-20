/**
 * English vocabulary generator `english.vocab` (SDD_LEARNING section 16),
 * a port of `generators/english.py`.
 *
 * Driven by `english/words.yaml`. A skill names `{topics, level, modes}`;
 * the content library hands the generator a `VocabPool` with the words of
 * that level and those topics in `params._pool`. The generator first picks
 * the *word* and then the *mode*; the item id is
 * `english.vocab:<slug>.<pos>.<mode>`.
 */
import { makeChoice, makeFigure, makeQuestion, type Figure, type Question } from "../model";
import type { PyRandom } from "../random";
import { pyLen, strip } from "../py";
import { base, emoji, type GenContext, nOptions, type Opt, opt, optionsQuestion, type Params, register } from "./common";

export const LEVELS: readonly string[] = ["preA1", "A1", "A2", "B1"];
export const LEVEL_FIRST_GRADE: Readonly<Record<string, number>> = { preA1: 0, A1: 3, A2: 5, B1: 7 };
export const VOCAB_MODES: readonly string[] = ["picture_to_word", "word_to_translation", "listen_to_picture", "spelling", "sentence_cloze"];
export const PICTURE_MODES: ReadonlySet<string> = new Set(["picture_to_word", "listen_to_picture"]);
/** word_to_translation covers both directions; each has its own item id. */
const VARIANTS: Readonly<Record<string, readonly string[]>> = { word_to_translation: ["word_to_translation", "translation_to_word"] };
const DIFFICULTY: Readonly<Record<string, number>> = {
  listen_to_picture: -0.8,
  picture_to_word: -0.5,
  word_to_translation: -0.2,
  translation_to_word: 0.2,
  sentence_cloze: 0.4,
  spelling: 0.6,
};
const SPELLING = /^[A-Za-z]{2,10}$/;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const SLUG = /[^a-z0-9]+/g;
export const EXPLANATION_LIMIT = 200;
export const PROMPT_LIMIT = 140;

export interface VocabWord {
  readonly word: string;
  readonly he: string;
  readonly pos: string;
  readonly topic: string;
  readonly level: string;
  readonly grade: number;
  readonly emoji: string | null;
  readonly example_en: string;
  readonly example_he: string;
}

export function wordSlug(w: VocabWord): string {
  return strip(w.word.toLowerCase().replace(SLUG, "_"), "_") || "word";
}

// --------------------------------------------------------------------------
// Loading and validation
// --------------------------------------------------------------------------

const isStr = (x: unknown): x is string => typeof x === "string";

/** One words-file entry, or the reasons it is invalid. */
export function parseWord(raw: unknown): [VocabWord | null, string[]] {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [null, ["word entry must be a mapping"]];
  const r = raw as Record<string, unknown>;
  const errors: string[] = [];
  const word = r["word"];
  if (!isStr(word) || !strip(word)) return [null, ["word is missing"]];
  for (const key of ["he", "topic", "pos"]) {
    const v = r[key];
    if (!isStr(v) || !strip(v)) errors.push(`${word}: ${key} is missing`);
  }
  if (!LEVELS.includes(r["level"] as string)) errors.push(`${word}: level must be one of ${LEVELS.join(", ")}`);
  const code = r["emoji"];
  if (code !== null && code !== undefined && !isStr(code)) errors.push(`${word}: emoji must be a code or null`);
  const grade = "grade" in r ? r["grade"] : 0;
  if (typeof grade !== "number" || !Number.isInteger(grade)) errors.push(`${word}: grade must be an integer`);
  if (errors.length) return [null, errors];
  return [
    {
      word: strip(word),
      he: strip(String(r["he"])),
      pos: strip(String(r["pos"])),
      topic: strip(String(r["topic"])),
      level: String(r["level"]),
      grade: grade as number,
      emoji: (code as string | null | undefined) || null,
      example_en: strip(String(r["example_en"] || "")),
      example_he: strip(String(r["example_he"] || "")),
    },
    [],
  ];
}

/** All entries of a words file; duplicates of (word, pos) are errors. */
export function parseWords(doc: unknown): [VocabWord[], string[]] {
  if (doc === null || doc === undefined) return [[], []];
  if (!Array.isArray(doc)) return [[], ["top level must be a list of words"]];
  const out: VocabWord[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const raw of doc) {
    const [w, errs] = parseWord(raw);
    errors.push(...errs);
    if (w === null) continue;
    const k = `${w.word.toLowerCase()}\u0000${w.pos}`;
    if (seen.has(k)) {
      errors.push(`${w.word}: duplicate (word, pos)`);
      continue;
    }
    seen.add(k);
    out.push(w);
  }
  return [out, errors];
}

function listParam(params: Params, key: string): unknown[] {
  const v = params[key];
  return Array.isArray(v) ? v : v ? [v] : [];
}

export function skillWords(params: Params, words: Iterable<VocabWord>): VocabWord[] {
  const topics = new Set(listParam(params, "topics"));
  const level = params["level"];
  return [...words].filter((w) => w.level === level && topics.has(w.topic));
}

export function validateVocabParams(params: Params, words: readonly VocabWord[]): string[] {
  const errors: string[] = [];
  const level = params["level"];
  let topics = params["topics"];
  const modes = listParam(params, "modes").length ? listParam(params, "modes") : [...VOCAB_MODES];
  if (!LEVELS.includes(level as string)) errors.push(`level must be one of ${LEVELS.join(", ")}`);
  if (!Array.isArray(topics) || !topics.length) {
    errors.push("topics must be a non-empty list");
    topics = [];
  }
  for (const m of modes) if (!VOCAB_MODES.includes(m as string)) errors.push(`unknown vocab mode '${String(m)}'`);
  for (const t of topics as unknown[]) {
    if (!words.some((w) => w.level === level && w.topic === t)) errors.push(`no ${String(level)} words for topic '${String(t)}'`);
  }
  if (skillWords(params, words).length < 2) errors.push("needs at least 2 words");
  return errors;
}

// --------------------------------------------------------------------------
// Pool: candidates and which modes fit a word
// --------------------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `example_en` with the word replaced by ___ (whole word, once). */
export function blank(w: VocabWord): string | null {
  const core = w.word.replace(/[?!.]+$/, "");
  if (!core || !w.example_en) return null;
  const pattern = new RegExp(`(?<![A-Za-z])${escapeRe(core)}(?![A-Za-z])`, "giu");
  const found = [...w.example_en.matchAll(pattern)];
  if (found.length !== 1) return null;
  const m = found[0]!;
  return w.example_en.slice(0, m.index) + "___" + w.example_en.slice(m.index + m[0].length);
}

function uniquePicks(cands: Iterable<VocabWord>, k: number, needEmoji: boolean): VocabWord[] {
  const picked: VocabWord[] = [];
  const words = new Set<string>();
  const hes = new Set<string>();
  const codes = new Set<string | null>();
  for (const d of cands) {
    if (picked.length >= k) break;
    if (words.has(d.word.toLowerCase()) || hes.has(d.he)) continue;
    if (needEmoji && codes.has(d.emoji)) continue;
    picked.push(d);
    words.add(d.word.toLowerCase());
    hes.add(d.he);
    if (d.emoji) codes.add(d.emoji);
  }
  return picked;
}

/** The words of one skill, with memoized mode eligibility. */
export class VocabPool {
  readonly words: readonly VocabWord[];
  private readonly modes = new Map<VocabWord, ReadonlySet<string>>();

  constructor(words: Iterable<VocabWord>) {
    this.words = [...words];
  }

  /** Words that can stand next to `w` without a second answer. */
  candidates(w: VocabWord, needEmoji = false): VocabWord[] {
    const out: VocabWord[] = [];
    for (const d of this.words) {
      if (d === w || d.word.toLowerCase() === w.word.toLowerCase() || d.he === w.he) continue;
      if (w.emoji && d.emoji === w.emoji) continue;
      if (needEmoji && !d.emoji) continue;
      out.push(d);
    }
    return out;
  }

  /** Concrete modes (both translation directions) that fit `w`. */
  modesFor(w: VocabWord): ReadonlySet<string> {
    const cached = this.modes.get(w);
    if (cached !== undefined) return cached;
    const text = uniquePicks(this.candidates(w), 2, false).length;
    const modes = new Set<string>();
    if (text >= 1) {
      modes.add("word_to_translation");
      modes.add("translation_to_word");
      if (blank(w) !== null) modes.add("sentence_cloze");
    }
    if (w.emoji && text >= 2) modes.add("picture_to_word");
    if (w.emoji) {
      const pics = uniquePicks(this.candidates(w, true), 2, true);
      if (pics.length >= 2) modes.add("listen_to_picture");
    }
    if (SPELLING.test(w.word)) modes.add("spelling");
    this.modes.set(w, modes);
    return modes;
  }

  /** Same topic first (same part of speech first when asked). */
  distractors(rng: PyRandom, w: VocabWord, k: number, needEmoji = false, preferPos = false): VocabWord[] {
    const cands = this.candidates(w, needEmoji);
    const tier = (d: VocabWord): number => (d.topic === w.topic ? 0 : 2) + (preferPos && d.pos !== w.pos ? 1 : 0);
    const tiers = new Map<number, VocabWord[]>();
    for (const d of cands) {
      const t = tier(d);
      if (!tiers.has(t)) tiers.set(t, []);
      tiers.get(t)!.push(d);
    }
    const ordered: VocabWord[] = [];
    for (const t of [...tiers.keys()].sort((a, b) => a - b)) {
      const group = tiers.get(t)!;
      rng.shuffle(group);
      ordered.push(...group);
    }
    return uniquePicks(ordered, k, needEmoji);
  }
}

// --------------------------------------------------------------------------
// Builders
// --------------------------------------------------------------------------

function young(ctx: GenContext): boolean {
  return ctx.age !== null ? ctx.age <= 7 : ctx.grade <= 1;
}

function expand(modes: Iterable<string>): string[] {
  const out: string[] = [];
  for (const m of modes) for (const v of VARIANTS[m] ?? [m]) if (!out.includes(v)) out.push(v);
  return out;
}

function explanations(w: VocabWord): [string, string] {
  const b = `${w.word} = ${w.he}.`;
  let he = b;
  for (const cand of [`${b} ${w.example_en} (${w.example_he})`, `${b} ${w.example_en}`]) {
    if (w.example_en && pyLen(cand) <= EXPLANATION_LIMIT) {
      he = cand;
      break;
    }
  }
  let en = `"${w.word}" means ${w.he}.`;
  if (w.example_en) en += ` Example: ${w.example_en}`;
  return [he, en];
}

function difficulty(w: VocabWord, mode: string): number {
  let d = DIFFICULTY[mode]!;
  d += 0.25 * (w.grade - (LEVEL_FIRST_GRADE[w.level] ?? 0));
  if (mode === "spelling") d += 0.1 * (pyLen(w.word) - 5);
  return d;
}

function picture(w: VocabWord): Figure | null {
  return w.emoji ? makeFigure("objects", { emoji: w.emoji, count: 1 }) : null;
}

function wordOpt(w: VocabWord): Opt {
  return opt(w.word, { en: w.word });
}

function meta(w: VocabWord, mode: string): Record<string, unknown> {
  return { word: w.word, mode, topic: w.topic, level: w.level, pos: w.pos };
}

function buildChoice(rng: PyRandom, ctx: GenContext, w: VocabWord, mode: string, pool: VocabPool): Question {
  const k = nOptions(ctx) - 1;
  const [explanationHe, explanationEn] = explanations(w);
  const common = {
    item_id: `english.vocab:${wordSlug(w)}.${w.pos}.${mode}`,
    explanation_he: explanationHe,
    explanation_en: explanationEn,
    difficulty: difficulty(w, mode),
    meta: meta(w, mode),
    n: k + 1,
  };
  if (mode === "picture_to_word") {
    const promptHe = "איזו מילה באנגלית מתאימה לתמונה?";
    return optionsQuestion(rng, ctx, {
      ...common,
      prompt_he: promptHe,
      prompt_en: "Which word matches the picture?",
      correct: wordOpt(w),
      distractors: pool.distractors(rng, w, k).map(wordOpt),
      figure: picture(w),
      speak: { he: promptHe },
    });
  }
  if (mode === "listen_to_picture") {
    const promptHe = "הקשיבו למילה ובחרו את התמונה המתאימה";
    const ds = pool.distractors(rng, w, k, true);
    return optionsQuestion(rng, ctx, {
      ...common,
      prompt_he: promptHe,
      prompt_en: "Listen and choose the picture.",
      correct: opt(w.he, { image: emoji(String(w.emoji)) }),
      distractors: ds.map((d) => opt(d.he, { image: emoji(String(d.emoji)) })),
      speak: { he: promptHe, en: w.word },
    });
  }
  if (mode === "word_to_translation") {
    return optionsQuestion(rng, ctx, {
      ...common,
      prompt_he: `מה פירוש המילה ${w.word}?`,
      prompt_en: `What does "${w.word}" mean?`,
      correct: opt(w.he),
      distractors: pool.distractors(rng, w, k).map((d) => opt(d.he)),
      speak: { he: "מה פירוש המילה?", en: w.word },
    });
  }
  if (mode === "translation_to_word") {
    const promptHe = `איך אומרים באנגלית: ${w.he}?`;
    return optionsQuestion(rng, ctx, {
      ...common,
      prompt_he: promptHe,
      prompt_en: "How do you say it in English?",
      correct: wordOpt(w),
      distractors: pool.distractors(rng, w, k).map(wordOpt),
      speak: { he: promptHe },
    });
  }
  // sentence_cloze
  const instruction = "בחרו את המילה החסרה במשפט";
  let promptHe = instruction;
  const withHint = `${instruction} (${w.example_he})`;
  if (w.example_he && pyLen(withHint) <= PROMPT_LIMIT) promptHe = withHint;
  const ds = pool.distractors(rng, w, k, false, true);
  return optionsQuestion(rng, ctx, {
    ...common,
    prompt_he: promptHe,
    prompt_en: blank(w),
    correct: wordOpt(w),
    distractors: ds.map(wordOpt),
    speak: { he: instruction },
  });
}

function buildSpelling(rng: PyRandom, ctx: GenContext, w: VocabWord): Question {
  const word = w.word;
  const used = new Set(Array.from(word.toLowerCase()));
  const spare = Array.from(ALPHABET).filter((c) => !used.has(c));
  const extra = rng.sample(spare, pyLen(word) <= 4 ? 1 : 2);
  const tiles = [...Array.from(word), ...extra];
  rng.shuffle(tiles);
  const promptHe = `סדרו את האותיות וכתבו באנגלית: ${w.he}`;
  const [explanationHe, explanationEn] = explanations(w);
  const bs = base(
    ctx,
    `english.vocab:${wordSlug(w)}.${w.pos}.spelling`,
    promptHe,
    explanationHe,
    difficulty(w, "spelling"),
    "Spell the word.",
    explanationEn,
    picture(w),
    { he: promptHe, en: word },
    meta(w, "spelling"),
  );
  const choices = tiles.map((t, i) => makeChoice(`t${i}`, t, t));
  return makeQuestion({ ...bs, kind: "letters", answer: word, choices });
}

register("english.vocab", (rng, params, ctx) => {
  let pool = params["_pool"] as VocabPool | undefined;
  if (pool === undefined || pool === null) pool = new VocabPool((params["_words"] as VocabWord[] | undefined) ?? []);
  if (!pool.words.length) throw new Error(`${ctx.skill_id}: no vocabulary words`);
  const listed = listParam(params, "modes");
  let allowed = expand((listed.length ? listed : VOCAB_MODES).filter((m): m is string => VOCAB_MODES.includes(m as string)));
  const p = pool;
  if (young(ctx)) {
    // pre-readers: pictures and listening only (when the skill has them)
    const pictures = allowed.filter((m) => PICTURE_MODES.has(m));
    if (pictures.length && p.words.some((w) => w.emoji && pictures.some((m) => p.modesFor(w).has(m)))) allowed = pictures;
  }
  let words = p.words.filter((w) => allowed.some((m) => p.modesFor(w).has(m)));
  if (!words.length) {
    // nothing fits: plain translation of any word
    words = [...p.words];
    allowed = ["word_to_translation", "translation_to_word"];
  }
  const w = rng.choice(words);
  const fittingAll = allowed.filter((m) => p.modesFor(w).has(m));
  const fitting = fittingAll.length ? fittingAll : ["word_to_translation"];
  const mode = rng.choice(fitting);
  if (mode === "spelling") return buildSpelling(rng, ctx, w);
  return buildChoice(rng, ctx, w, mode, p);
});
