/**
 * Question model and answer checking (SDD_ARCHITECTURE section 3).
 * A port of `nagmon/learning/model.py`: same normalisation rules.
 */
import { Fraction } from "./fraction";
import { asciiDigits, casefold, lstrip, PY_DIGIT, PY_SPACE, strip } from "./py";

export type Subject = "math" | "geometry" | "english" | "science" | "logic" | "hebrew" | "family";
export type QuestionKind = "choice" | "number" | "true_false" | "order" | "tap_figure" | "letters";

export const SUBJECTS: readonly string[] = ["math", "geometry", "english", "science", "logic", "hebrew", "family"];
export const CHOICE_KINDS: ReadonlySet<string> = new Set(["choice", "true_false", "tap_figure"]);

export const TRUE_ID = "true";
export const FALSE_ID = "false";

/** One answer option. `image` is "emoji:<code>" or a path. */
export interface Choice {
  readonly id: string;
  readonly text_he: string;
  readonly text_en: string | null;
  readonly image: string | null;
}

/** Drawing spec. The UI draws it; the engine only describes it. */
export interface Figure {
  readonly kind: string;
  readonly data: Readonly<Record<string, unknown>>;
}

/** Extension data: seed, calc, fraction_form, word, worked_example, bucket... */
export type Meta = Readonly<Record<string, unknown>>;

export interface Question {
  readonly item_id: string;
  readonly skill_id: string;
  readonly subject: string;
  readonly kind: string;
  readonly prompt_he: string;
  readonly prompt_en: string | null;
  /** A choice id, the number text, the letters, or the order of choice ids. */
  readonly answer: string | readonly string[];
  readonly choices: readonly Choice[];
  readonly figure: Figure | null;
  readonly speak: Readonly<Record<string, string>>;
  readonly explanation_he: string;
  readonly explanation_en: string | null;
  readonly difficulty: number;
  /** Wrong answer (choice id, number text or text) to misconception tag. */
  readonly misconceptions: Readonly<Record<string, string>>;
  readonly source: string;
  readonly meta: Meta;
}

export interface CheckResult {
  readonly correct: boolean;
  readonly normalized: string | readonly string[] | null;
  readonly misconception: string | null;
}

/** The fields a caller must give; the rest default as in the Python dataclass. */
export type QuestionInit = Pick<Question, "item_id" | "skill_id" | "subject" | "kind" | "prompt_he" | "answer"> &
  Partial<Omit<Question, "item_id" | "skill_id" | "subject" | "kind" | "prompt_he" | "answer">>;

/** Build a question with the dataclass defaults. */
export function makeQuestion(init: QuestionInit): Question {
  return {
    item_id: init.item_id,
    skill_id: init.skill_id,
    subject: init.subject,
    kind: init.kind,
    prompt_he: init.prompt_he,
    prompt_en: init.prompt_en ?? null,
    answer: init.answer,
    choices: init.choices ?? [],
    figure: init.figure ?? null,
    speak: init.speak ?? {},
    explanation_he: init.explanation_he ?? "",
    explanation_en: init.explanation_en ?? null,
    difficulty: init.difficulty ?? 0,
    misconceptions: init.misconceptions ?? {},
    source: init.source ?? "generator",
    meta: init.meta ?? {},
  };
}

/** A choice with optional English text and image. */
export function makeChoice(id: string, textHe: string, textEn: string | null = null, image: string | null = null): Choice {
  return { id, text_he: textHe, text_en: textEn, image };
}

/** The figure kinds the app draws (ui/Figure.tsx). A question whose figure is another kind cannot be answered yet. */
export const DRAWN_FIGURE_KINDS: ReadonlySet<string> = new Set(["objects"]);

/** A figure spec. */
export function makeFigure(kind: string, data: Record<string, unknown> = {}): Figure {
  return { kind, data };
}

export function trueFalseChoices(): [Choice, Choice] {
  return [makeChoice(TRUE_ID, "נכון", "True"), makeChoice(FALSE_ID, "לא נכון", "False")];
}

// --------------------------------------------------------------------------
// Normalization
// --------------------------------------------------------------------------

const BIDI = /[‎‏‪-‮⁦-⁩؜]/g;
const NIQQUD = /[֑-ׇֽֿׁׂׅׄ]/g;
const SPACES = new RegExp(`[${PY_SPACE}]+`, "gu");
const EDGE_PUNCT = ".,!?;:\"'`()[]{}״׳-–—…";
const MINUSES = "−–—‒־";
const NUM_STRIP = "₪%°$";
// Python's `\d` is any Unicode digit ("٣"); matched digits go through
// `asciiDigits` before they become numbers.
const D = PY_DIGIT;
const INT = `${D}+`;
const DEC = `(?:${D}+(?:\\.${D}*)?|\\.${D}+)`;
const S = `[${PY_SPACE}]`;
const RE_DEC = new RegExp(`^([+-]?)(${DEC})$`, "u");
const RE_FRAC = new RegExp(`^([+-]?)(${INT})${S}*/${S}*(${INT})$`, "u");
const RE_MIXED = new RegExp(`^([+-]?)(${INT})${S}+(${INT})${S}*/${S}*(${INT})$`, "u");
const RE_THOUSANDS = new RegExp(`^[+-]?${D}{1,3}(?:,${D}{3})+(?:\\.${D}+)?$`, "u");
const big = (digits: string): bigint => BigInt(asciiDigits(digits));

/**
 * NFKC, no bidi marks, no niqqud, collapsed spaces, trimmed punctuation.
 * Hebrew is left as is; Latin text is casefolded by `textKey`.
 */
export function normalizeText(text: string): string {
  let s = String(text).normalize("NFKC");
  s = s.replace(BIDI, "");
  s = s.replace(NIQQUD, "");
  s = strip(s.replace(SPACES, " "));
  s = strip(strip(s, EDGE_PUNCT));
  return s;
}

function textKey(text: string): string {
  return casefold(normalizeText(text));
}

function cleanNumberText(text: string): string {
  let s = String(text).normalize("NFKC");
  s = s.replace(BIDI, "");
  for (const m of MINUSES) s = s.split(m).join("-");
  s = strip(s.replace(SPACES, " "));
  s = strip(strip(s, NUM_STRIP));
  s = strip(s.split("שקלים").join("").split('ש"ח').join(""));
  if (RE_THOUSANDS.test(s)) s = s.split(",").join("");
  else if (s.split(",").length === 2 && !s.includes(".")) s = s.replace(",", ".");
  return s;
}

/** Parse an integer, decimal, fraction or mixed number exactly. */
export function parseNumber(text: unknown): Fraction | null {
  if (text === null || text === undefined || typeof text === "boolean") return null;
  if (text instanceof Fraction) return text;
  if (typeof text === "number" && Number.isInteger(text)) return new Fraction(text);
  if (typeof text === "bigint") return new Fraction(text);
  const s = cleanNumberText(String(text));
  let m = RE_DEC.exec(s);
  if (m) {
    const value = Fraction.parse(asciiDigits(m[2]!));
    return m[1] === "-" ? value.neg() : value;
  }
  m = RE_FRAC.exec(s);
  if (m) {
    if (big(m[3]!) === 0n) return null;
    const value = new Fraction(big(m[2]!), big(m[3]!));
    return m[1] === "-" ? value.neg() : value;
  }
  m = RE_MIXED.exec(s);
  if (m) {
    if (big(m[4]!) === 0n) return null;
    const value = new Fraction(big(m[3]!), big(m[4]!)).add(big(m[2]!));
    return m[1] === "-" ? value.neg() : value;
  }
  return null;
}

function isTerminating(value: Fraction): boolean {
  let d = value.d;
  for (const p of [2n, 5n]) while (d % p === 0n) d /= p;
  return d === 1n;
}

export type NumberStyle = "auto" | "decimal" | "fraction";

/**
 * Canonical text for a number. `style`: "auto" (int, else terminating
 * decimal, else p/q), "decimal" or "fraction".
 */
export function formatNumber(value: Fraction | number, style: NumberStyle = "auto"): string {
  let v = Fraction.coerce(value);
  if (v.d === 1n) return `${v.n}`;
  if (style === "fraction" || (style === "auto" && !isTerminating(v))) return `${v.n}/${v.d}`;
  const sign = v.lt(0) ? "-" : "";
  v = v.abs();
  const whole = v.n / v.d;
  let rest = v.sub(whole);
  let digits = "";
  while (!rest.isZero() && digits.length < 12) {
    rest = rest.mul(10);
    const d = rest.n / rest.d;
    digits += `${d}`;
    rest = rest.sub(d);
  }
  return digits ? `${sign}${whole}.${digits}` : `${sign}${whole}`;
}

/**
 * Clean number text while keeping its form: "07" -> "7", "3.50" -> "3.5",
 * "1,000" -> "1000", "2/4" -> "2/4" (not reduced), "1 1/2" -> "3/2".
 */
export function normalizeNumber(text: unknown): string | null {
  if (text === null || text === undefined) return null;
  const s = cleanNumberText(String(text));
  const value = parseNumber(s);
  if (value === null) return null;
  const m = RE_FRAC.exec(s);
  if (m) {
    const num = big(m[2]!);
    const den = big(m[3]!);
    const neg = m[1] === "-" && num !== 0n;
    return `${neg ? "-" : ""}${num}/${den}`;
  }
  if (RE_MIXED.test(s)) return `${value.n}/${value.d}`;
  return formatNumber(value, "decimal");
}

// --------------------------------------------------------------------------
// Checking
// --------------------------------------------------------------------------

const TRUE_WORDS = new Set(["true", "נכון", "כן", "yes", "t", "1", "אמת"]);
const FALSE_WORDS = new Set(["false", "לא נכון", "לא", "no", "f", "0", "שקר"]);

/** What the UI may send: a choice id or text, typed text, or a sequence. */
export type Given = string | number | readonly (string | number)[] | null | undefined;

function matchChoice(q: Question, given: Given): string | null {
  if (given === null || given === undefined) return null;
  const raw = pyStr(given);
  if (q.choices.some((c) => c.id === raw)) return raw;
  const key = textKey(raw);
  if (q.kind === "true_false") {
    if (TRUE_WORDS.has(key)) return TRUE_ID;
    if (FALSE_WORDS.has(key)) return FALSE_ID;
  }
  for (const c of q.choices) if (key === textKey(c.id)) return c.id;
  for (const c of q.choices) {
    if (key === textKey(c.text_he)) return c.id;
    if (c.text_en && key === textKey(c.text_en)) return c.id;
  }
  return null;
}

/** Python `str(x)` for what the UI sends (a list prints like Python's). */
function pyStr(x: string | number | readonly (string | number)[]): string {
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(x);
  return `[${x.map((v) => (typeof v === "string" ? `'${v}'` : String(v))).join(", ")}]`;
}

function numberMisconception(q: Question, value: Fraction): string | null {
  for (const [wrong, tag] of Object.entries(q.misconceptions)) {
    const w = parseNumber(wrong);
    if (w !== null && w.eq(value)) return tag;
  }
  return null;
}

function result(correct: boolean, normalized: CheckResult["normalized"], misconception: string | null = null): CheckResult {
  return { correct, normalized, misconception };
}

/** Compare `given` with `q.answer` (SDD_LEARNING section 3). */
export function checkAnswer(q: Question, given: Given): CheckResult {
  if (given === null || given === undefined) return result(false, null, null);
  if (q.kind === "order") {
    const seq: string[] =
      typeof given === "string"
        ? given.split(",").map((p) => strip(p)).filter((p) => p)
        : typeof given === "number"
          ? [String(given)]
          : given.map((x) => String(x));
    const expected = typeof q.answer === "string" ? Array.from(q.answer) : q.answer;
    const ok = seq.length === expected.length && seq.every((x, i) => x === expected[i]);
    return result(ok, seq, ok ? null : (q.misconceptions[seq.join(",")] ?? null));
  }
  if (CHOICE_KINDS.has(q.kind) || (q.choices.length > 0 && q.kind !== "letters")) {
    const cid = matchChoice(q, given);
    const ok = cid !== null && cid === q.answer;
    const mis = ok || cid === null ? null : (q.misconceptions[cid] ?? null);
    return result(ok, cid, mis);
  }
  if (q.kind === "number") {
    const norm = normalizeNumber(typeof given === "object" ? pyStr(given) : given);
    const value = norm !== null ? parseNumber(norm) : null;
    const expectedValue = parseNumber(q.answer);
    if (value === null || expectedValue === null) return result(false, norm, null);
    const ok = value.eq(expectedValue);
    if (ok && q.meta["fraction_form"] === "simplest" && norm) {
      const m = RE_FRAC.exec(lstrip(norm, "-"));
      if (m) {
        const den = big(m[3]!);
        const frac = new Fraction(big(m[2]!), den);
        if (frac.d !== den) return result(false, norm, "not_simplified");
      }
    }
    return result(ok, norm, ok ? null : numberMisconception(q, value));
  }
  // letters / free text
  const text = typeof given === "object" ? given.map((x) => String(x)).join("") : String(given);
  const norm = textKey(text);
  const answer = typeof q.answer === "string" ? q.answer : q.answer.join("");
  const ok = norm === textKey(answer);
  let mis: string | null = null;
  if (!ok) {
    for (const [wrong, tag] of Object.entries(q.misconceptions)) {
      if (textKey(wrong) === norm) {
        mis = tag;
        break;
      }
    }
  }
  return result(ok, norm, mis);
}

/** The correct answer in display form (choice text, number, sequence). */
export function displayAnswer(q: Question): string {
  const texts = new Map(q.choices.map((c) => [c.id, c.text_he]));
  if (q.kind === "order") {
    const ids = typeof q.answer === "string" ? Array.from(q.answer) : q.answer;
    return ids.map((i) => texts.get(i) ?? i).join(", ");
  }
  if (typeof q.answer === "string" && texts.has(q.answer)) return texts.get(q.answer)!;
  if (typeof q.answer === "string") return q.answer;
  return q.answer.join(", ");
}

/** Strip the LRI/PDI isolates and bidi marks, for a canvas that cannot draw them. */
export function stripBidi(text: string): string {
  return text.replace(BIDI, "");
}
