/**
 * Shared helpers for generators: context, formatting and builders
 * (a port of `generators/common.py`).
 *
 * Every generator has the signature `(rng, params, ctx) => Question` and
 * is deterministic given `rng`. A generator first decides the *item* (its
 * operands, hence its `item_id`) and only then calls a builder, which may
 * consume more randomness to pick the answer kind and order the choices.
 * That keeps `item_id` stable whatever the context.
 */
import { Fraction, type FracLike } from "../fraction";
import {
  type Choice,
  FALSE_ID,
  type Figure,
  formatNumber,
  makeChoice,
  makeQuestion,
  type Question,
  TRUE_ID,
  trueFalseChoices,
} from "../model";
import type { PyRandom } from "../random";
import { pyRound } from "../py";

export type Params = Readonly<Record<string, unknown>>;
export type Generator = (rng: PyRandom, params: Params, ctx: GenContext) => Question;

/** Every ported generator by name. */
export const GENERATORS = new Map<string, Generator>();
export const CHOICE_IDS = "abcdef";

/**
 * Math expressions are wrapped in Unicode LTR isolates (U+2066 ... U+2069)
 * so that "12 - 5" is not reordered inside a right-to-left paragraph.
 * React renders them; a Phaser canvas strips them (`stripBidi`).
 */
export const LRI = "⁦";
export const PDI = "⁩";

/** Register a generator under its Python name. */
export function register(name: string, fn: Generator): Generator {
  GENERATORS.set(name, fn);
  return fn;
}

export interface GenContext {
  readonly skill_id: string;
  readonly subject: string;
  readonly grade: number;
  readonly age: number | null;
  readonly max_choices: number | null;
  /** "choice" | "number" | null. */
  readonly prefer_kind: string | null;
}

/** A context with the dataclass defaults. */
export function genContext(init: Partial<GenContext> = {}): GenContext {
  return {
    skill_id: init.skill_id ?? "",
    subject: init.subject ?? "math",
    grade: init.grade ?? 0,
    age: init.age ?? null,
    max_choices: init.max_choices ?? null,
    prefer_kind: init.prefer_kind ?? null,
  };
}

/** A choice before it gets an id. `tag` = misconception if chosen. */
export interface Opt {
  readonly text_he: string;
  readonly text_en: string | null;
  readonly image: string | null;
  readonly tag: string | null;
}

/** `Opt(text_he, text_en, image, tag)`; a new object each call (identity matters). */
export function opt(textHe: string, more: { en?: string | null; image?: string | null; tag?: string | null } = {}): Opt {
  return { text_he: textHe, text_en: more.en ?? null, image: more.image ?? null, tag: more.tag ?? null };
}

// --------------------------------------------------------------------------
// Python helpers used by the generators
// --------------------------------------------------------------------------

/** Python `int(x)`. */
export function pyInt(x: unknown): number {
  if (typeof x === "boolean") return x ? 1 : 0;
  return Math.trunc(Number(x));
}

/** Python `bool` as 1 or 0, for `0.5 * (a > b)`. */
export function b(cond: boolean): number {
  return cond ? 1 : 0;
}

/** `int(params.get(key, dflt))`. */
export function pint(params: Params, key: string, dflt: number): number {
  return pyInt(key in params ? params[key] : dflt);
}

/** `params.get(key, dflt)`. */
export function pget(params: Params, key: string, dflt: unknown): unknown {
  return key in params ? params[key] : dflt;
}

/** Python `range(a, b)` as an array. */
export function range(a: number, bEnd?: number, step = 1): number[] {
  const [lo, hi] = bEnd === undefined ? [0, a] : [a, bEnd];
  const out: number[] = [];
  if (step > 0) for (let i = lo; i < hi; i += step) out.push(i);
  else for (let i = lo; i > hi; i += step) out.push(i);
  return out;
}

/** Python `str(n).zfill(width)` for a non-negative integer. */
export function zfill(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

// --------------------------------------------------------------------------
// Formatting
// --------------------------------------------------------------------------

export function ltr(text: string): string {
  return `${LRI}${text}${PDI}`;
}

function thousands(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export type FmtStyle = "auto" | "int" | "decimal" | "fraction" | "money";

/**
 * Display a number: thousands separators from 10,000, isolated minus.
 * `style`: auto | int | decimal | fraction | money (2 decimals).
 */
export function fmt(value: FracLike, style: FmtStyle = "auto"): string {
  const v = Fraction.coerce(value);
  let body: string;
  if (style === "money" && v.d !== 1n) {
    const whole = (v.n < 0n ? -v.n : v.n) / v.d;
    const cents = v.abs().sub(whole).mul(100).round();
    body = `${whole}.${cents.toString().padStart(2, "0")}`;
  } else {
    body = formatNumber(v.abs(), style === "fraction" ? "fraction" : "auto");
    if (!body.includes(".") && !body.includes("/") && v.abs().ge(10000)) body = thousands(v.abs().floor());
  }
  if (v.lt(0)) return ltr(`-${body}`);
  return body;
}

export function money(value: FracLike): string {
  return `${fmt(value, "money")} ₪`;
}

/** Canonical answer text for a number question (keeps fraction form). */
export function key(value: FracLike, style: FmtStyle = "auto"): string {
  return formatNumber(Fraction.coerce(value), style === "fraction" ? "fraction" : "auto");
}

export function chooseKindChoice(rng: PyRandom, ctx: GenContext, params: Params): boolean {
  const mode = pget(params, "kind", "auto");
  if (mode === "choice") return true;
  if (mode === "number") return false;
  if (ctx.prefer_kind === "number") return false;
  if (ctx.prefer_kind === "choice" || ctx.max_choices) return true;
  const young = ctx.age !== null ? ctx.age <= 7 : ctx.grade <= 1;
  if (young) return true;
  return rng.random() < 0.6;
}

export function nOptions(ctx: GenContext): number {
  const young = ctx.age !== null ? ctx.age <= 6 : ctx.grade === 0;
  let n = young ? 3 : 4;
  if (ctx.max_choices) n = Math.min(n, ctx.max_choices);
  return Math.max(2, n);
}

/** The fields every generated question shares (`_base` in Python). */
export interface Base {
  item_id: string;
  skill_id: string;
  subject: string;
  prompt_he: string;
  prompt_en: string | null;
  explanation_he: string;
  explanation_en: string | null;
  difficulty: number;
  figure: Figure | null;
  speak: Record<string, string>;
  meta: Record<string, unknown>;
}

export function base(
  ctx: GenContext,
  itemId: string,
  promptHe: string,
  explanationHe: string,
  difficulty: number,
  promptEn: string | null,
  explanationEn: string | null,
  figure: Figure | null,
  speak: Readonly<Record<string, string>> | null,
  meta: Record<string, unknown>,
): Base {
  return {
    item_id: itemId,
    skill_id: ctx.skill_id,
    subject: ctx.subject,
    prompt_he: promptHe,
    prompt_en: promptEn,
    explanation_he: explanationHe,
    explanation_en: explanationEn,
    difficulty: pyRound(Math.max(-3.0, Math.min(3.0, difficulty)), 3),
    figure,
    speak: speak ? { ...speak } : { he: promptHe },
    meta,
  };
}

// --------------------------------------------------------------------------
// Builders
// --------------------------------------------------------------------------

/** (value, misconception tag or null); a null value is skipped. */
export type Distractor = readonly [FracLike | null | undefined, string | null];

export interface NumericSpec {
  item_id: string;
  prompt_he: string;
  answer: FracLike;
  distractors?: readonly Distractor[];
  explanation_he: string;
  difficulty: number;
  prompt_en?: string | null;
  explanation_en?: string | null;
  figure?: Figure | null;
  style?: FmtStyle;
  unit?: string;
  allow_negative?: boolean | null;
  speak?: Readonly<Record<string, string>> | null;
  calc?: string | Readonly<Record<string, unknown>> | null;
  meta?: Readonly<Record<string, unknown>> | null;
  choice_only?: boolean;
  step?: FracLike | null;
}

/**
 * A question whose answer is a number: open answer or choices.
 * `distractors` are (value, misconception tag or null), most important
 * first. Numeric choices are shown in ascending order.
 */
export function numericQuestion(rng: PyRandom, ctx: GenContext, params: Params, spec: NumericSpec): Question {
  const ans = Fraction.coerce(spec.answer);
  const style = spec.style ?? "auto";
  const unit = spec.unit ?? "";
  const allowNegative = spec.allow_negative ?? ans.lt(0);
  const md: Record<string, unknown> = { ...(spec.meta ?? {}) };
  if (spec.calc !== null && spec.calc !== undefined) {
    md["calc"] = typeof spec.calc === "string" ? { expr: spec.calc } : { ...spec.calc };
  }
  const asChoice = spec.choice_only || chooseKindChoice(rng, ctx, params);
  const seen = new Set<string>([ans.key()]);
  const cands: [Fraction, string | null][] = [];
  for (const [value, tag] of spec.distractors ?? []) {
    if (value === null || value === undefined) continue;
    const v = Fraction.coerce(value);
    if (seen.has(v.key()) || (v.lt(0) && !allowNegative)) continue;
    if (style === "int" && v.d !== 1n) continue;
    if (style === "money" && v.mul(100).d !== 1n) continue;
    seen.add(v.key());
    cands.push([v, tag]);
  }
  const bs = base(
    ctx,
    spec.item_id,
    spec.prompt_he,
    spec.explanation_he,
    spec.difficulty,
    spec.prompt_en ?? null,
    spec.explanation_en ?? null,
    spec.figure ?? null,
    spec.speak ?? null,
    md,
  );
  if (!asChoice) {
    const mis: Record<string, string> = {};
    for (const [v, t] of cands) if (t) mis[key(v, style)] = t;
    return makeQuestion({ ...bs, kind: "number", answer: key(ans, style), misconceptions: mis });
  }
  const n = nOptions(ctx);
  let tagged = cands.filter((c) => c[1]);
  const plain = cands.filter((c) => !c[1]);
  if (tagged.length > n - 1) tagged = rng.sample(tagged, n - 1);
  rng.shuffle(plain);
  const picked: [Fraction, string | null][] = [...tagged, ...plain.slice(0, Math.max(0, n - 1 - tagged.length))];
  const step = Fraction.coerce(spec.step ?? (ans.d === 1n ? 1 : new Fraction(1n, ans.d)));
  let k = 1;
  while (picked.length < n - 1 && k < 200) {
    for (const v of [ans.add(step.mul(k)), ans.sub(step.mul(k))]) {
      if (picked.length >= n - 1) break;
      if (seen.has(v.key()) || (v.lt(0) && !allowNegative)) continue;
      seen.add(v.key());
      picked.push([v, null]);
    }
    k += 1;
  }
  const opts = [[ans, null] as [Fraction, string | null], ...picked].sort((x, y) => x[0].cmp(y[0]));
  const choices: Choice[] = [];
  const mis: Record<string, string> = {};
  let answerId = "a";
  opts.forEach(([v, tag], i) => {
    const cid = CHOICE_IDS[i]!;
    choices.push(makeChoice(cid, `${fmt(v, style)}${unit}`));
    if (v.eq(ans)) answerId = cid;
    else if (tag) mis[cid] = tag;
  });
  return makeQuestion({ ...bs, kind: "choice", answer: answerId, choices, misconceptions: mis });
}

export interface OptionsSpec {
  item_id: string;
  prompt_he: string;
  correct: Opt;
  distractors: readonly Opt[];
  explanation_he: string;
  difficulty: number;
  prompt_en?: string | null;
  explanation_en?: string | null;
  figure?: Figure | null;
  speak?: Readonly<Record<string, string>> | null;
  meta?: Readonly<Record<string, unknown>> | null;
  calc?: string | null;
  n?: number | null;
  shuffle?: boolean;
}

/** A choice question from text options (shapes, times, words...). */
export function optionsQuestion(rng: PyRandom, ctx: GenContext, spec: OptionsSpec): Question {
  const md: Record<string, unknown> = { ...(spec.meta ?? {}) };
  if (spec.calc !== null && spec.calc !== undefined) md["calc"] = { expr: spec.calc };
  const bs = base(
    ctx,
    spec.item_id,
    spec.prompt_he,
    spec.explanation_he,
    spec.difficulty,
    spec.prompt_en ?? null,
    spec.explanation_en ?? null,
    spec.figure ?? null,
    spec.speak ?? null,
    md,
  );
  let limit = spec.n !== null && spec.n !== undefined ? spec.n : nOptions(ctx);
  if (ctx.max_choices) limit = Math.min(limit, ctx.max_choices);
  limit = Math.max(2, limit);
  const correct = spec.correct;
  const seen = new Set([correct.text_he]);
  const uniq: Opt[] = [];
  for (const d of spec.distractors) {
    if (seen.has(d.text_he)) continue;
    seen.add(d.text_he);
    uniq.push(d);
  }
  let tagged = uniq.filter((d) => d.tag);
  const plain = uniq.filter((d) => !d.tag);
  if (tagged.length > limit - 1) tagged = rng.sample(tagged, limit - 1);
  const rest = rng.sample(plain, Math.min(plain.length, limit - 1 - tagged.length));
  const opts = [correct, ...tagged, ...rest];
  if (spec.shuffle ?? true) rng.shuffle(opts);
  const choices: Choice[] = [];
  const mis: Record<string, string> = {};
  let answerId = "a";
  opts.forEach((o, i) => {
    const cid = CHOICE_IDS[i]!;
    choices.push(makeChoice(cid, o.text_he, o.text_en, o.image));
    if (o === correct) answerId = cid;
    else if (o.tag) mis[cid] = o.tag;
  });
  return makeQuestion({ ...bs, kind: "choice", answer: answerId, choices, misconceptions: mis });
}

export interface TrueFalseSpec {
  item_id: string;
  prompt_he: string;
  truth: boolean;
  explanation_he: string;
  difficulty: number;
  wrong_tag?: string | null;
  prompt_en?: string | null;
  explanation_en?: string | null;
  figure?: Figure | null;
  meta?: Readonly<Record<string, unknown>> | null;
}

export function trueFalseQuestion(ctx: GenContext, spec: TrueFalseSpec): Question {
  const bs = base(
    ctx,
    spec.item_id,
    spec.prompt_he,
    spec.explanation_he,
    spec.difficulty,
    spec.prompt_en ?? null,
    spec.explanation_en ?? null,
    spec.figure ?? null,
    null,
    { ...(spec.meta ?? {}) },
  );
  const answer = spec.truth ? TRUE_ID : FALSE_ID;
  const wrong = spec.truth ? FALSE_ID : TRUE_ID;
  const mis: Record<string, string> = spec.wrong_tag ? { [wrong]: spec.wrong_tag } : {};
  return makeQuestion({ ...bs, kind: "true_false", answer, choices: trueFalseChoices(), misconceptions: mis });
}

// --------------------------------------------------------------------------
// Small utilities
// --------------------------------------------------------------------------

/** Map `x` in [lo, hi] to [-1, 1]. */
export function scale(x: number, lo: number, hi: number): number {
  if (hi <= lo) return 0.0;
  return Math.max(-1.0, Math.min(1.0, (2.0 * (x - lo)) / (hi - lo) - 1.0));
}

export function asList<T>(value: unknown, dflt: readonly T[]): T[] {
  if (value === null || value === undefined) return [...dflt];
  if (Array.isArray(value)) return [...(value as T[])];
  return [value as T];
}

/** Pick a verb form by the subject's grammatical gender. */
export function g(gender: string, male: string, female: string): string {
  return gender === "f" ? female : male;
}

export function emoji(code: string): string {
  return `emoji:${code}`;
}
