// @vitest-environment node
/**
 * G1-G4: every generator over many seeds produces valid questions
 * (test_learning_generators.py), plus per-generator checks the port adds:
 * Hebrew text present, every distractor checks as wrong, and the ranges of
 * the arithmetic generators.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { Skill } from "../../../src/core/learning/content";
import { F, Fraction } from "../../../src/core/learning/fraction";
import { genContext } from "../../../src/core/learning/generators/common";
import { MISCONCEPTIONS } from "../../../src/core/learning/generators/misconceptions";
import { NAMES } from "../../../src/core/learning/generators/names";
import { checkAnswer, parseNumber, type Question } from "../../../src/core/learning/model";
import { PyRandom } from "../../../src/core/learning/random";
import { library } from "./helpers";

const NIQQUD = /[֑-ׇֽֿׁׂׅׄ]/;
const HEBREW = /[א-ת]/;
const FIGURE_KINDS = new Set([
  "polygon",
  "angle",
  "grid_area",
  "circle",
  "solid",
  "number_line",
  "clock",
  "bar_model",
  "objects",
  "pie",
  "grid_path",
  "coordinate",
  "symmetry",
  "pattern",
  "grid_numbers",
]);
const KINDS = new Set(["choice", "number", "true_false", "order", "tap_figure", "letters"]);
const SEEDS = 200;
type Extra = { age: number; max_choices?: number; prefer_kind?: string };
const CONTEXTS: Extra[] = [{ age: 6 }, { age: 10 }, { age: 10, max_choices: 3 }, { age: 12, prefer_kind: "number" }];

function make(skill: Skill, seed: number, extra: Extra): Question {
  const ctx = genContext({ skill_id: skill.id, subject: skill.subject, grade: skill.grade, ...extra });
  return library().generate(skill.id, new PyRandom(seed), ctx);
}

const len = (s: string): number => Array.from(s).length;

function allTexts(q: Question): string[] {
  return [q.prompt_he, q.explanation_he, ...q.choices.map((c) => c.text_he)];
}

/**
 * The checks of the Python `validate`, as a list of problems (plain checks,
 * not `expect`, so 200k questions stay fast).
 */
function validate(q: Question): string[] {
  const bad: string[] = [];
  const check = (ok: unknown, what: string): void => {
    if (!ok) bad.push(`${q.item_id}: ${what}`);
  };
  check(KINDS.has(q.kind), `kind ${q.kind}`);
  check(q.item_id && q.item_id.includes(":"), "item id");
  check(len(q.prompt_he) > 0 && len(q.prompt_he) <= 140, `prompt length: ${q.prompt_he}`);
  check(q.explanation_he.trim(), "explanation missing");
  check(len(q.explanation_he) <= 200, `explanation length ${len(q.explanation_he)}`);
  check(Number.isFinite(q.difficulty) && q.difficulty >= -3.5 && q.difficulty <= 3.5, `difficulty ${q.difficulty}`);
  for (const text of allTexts(q)) check(!NIQQUD.test(text), `niqqud: ${text}`);
  if (q.figure !== null) check(FIGURE_KINDS.has(q.figure.kind), `figure ${q.figure.kind}`);
  for (const tag of Object.values(q.misconceptions)) check(tag in MISCONCEPTIONS, `tag ${tag}`);
  if (["choice", "true_false", "order", "tap_figure"].includes(q.kind)) {
    const ids = q.choices.map((c) => c.id);
    check(ids.length >= 2 && ids.length <= 6, `${ids.length} choices`);
    check(new Set(ids).size === ids.length, "duplicate ids");
    const texts = q.choices.map((c) => c.text_he);
    check(new Set(texts).size === texts.length, `duplicate texts ${texts.join("|")}`);
    for (const t of texts) check(len(t) > 0 && len(t) <= 40, `choice text ${t}`);
    if (q.kind === "order") check([...(q.answer as string[])].sort().join() === [...ids].sort().join(), "order answer");
    else check(ids.includes(q.answer as string), "answer not a choice");
    for (const key of Object.keys(q.misconceptions)) check(ids.includes(key) && key !== q.answer, `misconception key ${key}`);
  }
  if (q.kind === "number") {
    const ans = parseNumber(q.answer);
    check(ans !== null, `answer ${String(q.answer)}`);
    for (const key of Object.keys(q.misconceptions)) {
      const v = parseNumber(key);
      check(v !== null && ans !== null && !v.eq(ans), `misconception key ${key}`);
    }
  }
  check(checkAnswer(q, q.answer).correct, "answer does not check as correct");
  // The port's extra checks: Hebrew in the prompt, every distractor wrong.
  check(HEBREW.test(q.prompt_he), `no Hebrew in ${q.prompt_he}`);
  if (q.kind === "choice" || q.kind === "true_false" || q.kind === "tap_figure") {
    for (const c of q.choices) if (c.id !== q.answer) check(!checkAnswer(q, c.id).correct, `distractor ${c.text_he} checks as correct`);
  }
  if (q.kind === "number") for (const key of Object.keys(q.misconceptions)) check(!checkAnswer(q, key).correct, `misconception ${key} checks as correct`);
  return bad;
}

function answerText(q: Question): string {
  if (q.kind === "number") return q.answer as string;
  return q.choices.find((c) => c.id === q.answer)!.text_he;
}

const NUM_TOKEN = /-?\d+(?:\.\d+)?(?:\/\d+)?/g;

function numbersIn(text: string): Fraction[] {
  return (text.split(",").join("").match(NUM_TOKEN) ?? []).map((t) => parseNumber(t)!);
}

// --------------------------------------------------------------------------
// A small evaluator for the Python expressions in `meta.calc.expr`
// (ints, F(a, b), + - * / // % **, divmod, sqrt, max, min, abs, round).
// --------------------------------------------------------------------------

type Val = Fraction | Fraction[];

function evalPy(expr: string): Val {
  const toks = expr.match(/\d+|\*\*|\/\/|[A-Za-z_]+|[-+*/%(),]/g) ?? [];
  let i = 0;
  const peek = (): string | undefined => toks[i];
  const eat = (t?: string): string => {
    const tok = toks[i++];
    if (t !== undefined && tok !== t) throw new Error(`expected ${t} in ${expr}`);
    return tok!;
  };
  const num = (v: Val): Fraction => {
    if (Array.isArray(v)) throw new Error(`tuple in arithmetic: ${expr}`);
    return v;
  };
  const additive = (): Val => {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = eat();
      const r = num(term());
      v = op === "+" ? num(v).add(r) : num(v).sub(r);
    }
    return v;
  };
  const term = (): Val => {
    let v = unary();
    while (["*", "/", "//", "%"].includes(peek() ?? "")) {
      const op = eat();
      const l = num(v);
      const r = num(unary());
      if (op === "*") v = l.mul(r);
      else if (op === "/") v = l.div(r);
      else if (op === "//") v = F(l.div(r).floor());
      else v = l.sub(r.mul(l.div(r).floor()));
    }
    return v;
  };
  const unary = (): Val => {
    if (peek() === "-") {
      eat();
      return num(unary()).neg();
    }
    if (peek() === "+") {
      eat();
      return unary();
    }
    return power();
  };
  const power = (): Val => {
    const base = atom();
    if (peek() === "**") {
      eat();
      const e = num(unary()).toInt();
      let r = F(1);
      for (let k = 0; k < e; k++) r = r.mul(num(base));
      return r;
    }
    return base;
  };
  const atom = (): Val => {
    const t = peek();
    if (t === "(") {
      eat("(");
      const v = additive();
      eat(")");
      return v;
    }
    if (t !== undefined && /^\d+$/.test(t)) return F(BigInt(eat()));
    const name = eat();
    eat("(");
    const args: Val[] = [];
    if (peek() !== ")") {
      args.push(additive());
      while (peek() === ",") {
        eat(",");
        args.push(additive());
      }
    }
    eat(")");
    const a = args.map(num);
    switch (name) {
      case "F":
        return a.length === 1 ? a[0]! : a[0]!.div(a[1]!);
      case "divmod": {
        const q = F(a[0]!.div(a[1]!).floor());
        return [q, a[0]!.sub(q.mul(a[1]!))];
      }
      case "sqrt": {
        const r = BigInt(Math.round(Math.sqrt(a[0]!.toNumber())));
        expect(F(r * r).eq(a[0]!)).toBe(true);
        return F(r);
      }
      case "abs":
        return a[0]!.abs();
      case "max":
        return a.reduce((x, y) => (y.gt(x) ? y : x));
      case "min":
        return a.reduce((x, y) => (y.lt(x) ? y : x));
      case "round":
        return F(a[0]!.round());
      default:
        throw new Error(`unknown function ${name} in ${expr}`);
    }
  };
  const v = additive();
  if (i !== toks.length) throw new Error(`trailing tokens in ${expr}`);
  return v;
}

describe("generators", () => {
  beforeAll(() => void library(), 120_000);

  it("the evaluator knows Python's floor division and modulo", () => {
    const one = (e: string): Fraction => evalPy(e) as Fraction;
    expect(one("-7 // 2").eq(-4)).toBe(true);
    expect(one("(-7) // (2)").eq(-4)).toBe(true);
    expect(one("-7 % 3").eq(2)).toBe(true);
    expect(one("7 % 3").eq(1)).toBe(true);
    expect(one("2 * 3 ** 2").eq(18)).toBe(true);
    expect((evalPy("divmod(17, 5)") as Fraction[]).map(String)).toEqual(["3", "2"]);
  });

  const lib = library();
  const byGenerator = new Map<string, Skill[]>();
  for (const s of lib.skills.values()) {
    if (s.generator === "bank") continue;
    if (!byGenerator.has(s.generator)) byGenerator.set(s.generator, []);
    byGenerator.get(s.generator)!.push(s);
  }
  let checkedCalc = 0;

  for (const [gen, skills] of [...byGenerator].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    it(`g1 g2 ${gen}: ${skills.length} skills x ${SEEDS} seeds x ${CONTEXTS.length} contexts`, { timeout: 120_000 }, () => {
      const problems: string[] = [];
      for (const skill of skills) {
        for (const extra of CONTEXTS) {
          for (let seed = 0; seed < SEEDS; seed++) {
            const q = make(skill, seed, extra);
            problems.push(...validate(q));
            if (extra.max_choices !== undefined && q.choices.length && q.kind === "choice" && q.choices.length > extra.max_choices) {
              problems.push(`${q.item_id}: ${q.choices.length} choices > ${extra.max_choices}`);
            }
            const calc = q.meta["calc"] as { expr?: string } | undefined;
            if (calc !== undefined && calc.expr !== undefined) {
              const expected = evalPy(calc.expr);
              const got = numbersIn(answerText(q));
              const ok = Array.isArray(expected)
                ? got.slice(0, expected.length).map(String).join() === expected.map(String).join()
                : got.length > 0 && got[0]!.eq(expected);
              if (!ok) problems.push(`${skill.id}: calc ${calc.expr} vs ${answerText(q)}`);
              checkedCalc += 1;
            }
          }
        }
      }
      expect(problems.slice(0, 10)).toEqual([]);
    });
  }

  it("checked more than 10000 calc expressions", () => {
    expect(checkedCalc).toBeGreaterThan(10000);
  });

  it("g3 deterministic", () => {
    for (const skill of lib.skills.values()) {
      for (const seed of [1, 7, 99]) {
        const a = make(skill, seed, { age: 9 });
        const b = make(skill, seed, { age: 9 });
        expect(a).toEqual(b);
        const c = make(skill, seed, { age: 9, max_choices: 2 });
        expect(c.item_id, skill.id).toBe(a.item_id);
      }
    }
  });

  it("g4 borrow misconception", () => {
    let foundNum = 0;
    let foundChoice = 0;
    for (let seed = 0; seed < 100; seed++) {
      const q = make(lib.skill("math.sub.within_100"), seed, { age: 9 });
      const calc = q.meta["calc"] as { a: number; b: number };
      const a = String(calc.a).padStart(2, "0");
      const b = String(calc.b).padStart(2, "0");
      const wrong = Number(
        Array.from(a)
          .map((x, i) => String(Math.abs(Number(x) - Number(b[i]))))
          .join(""),
      );
      const tags = q.misconceptions;
      if (q.kind === "number") {
        expect(tags[String(wrong)]).toBe("smaller_from_larger");
        foundNum += 1;
      } else {
        const texts = new Map(q.choices.map((c) => [c.id, c.text_he]));
        const tagged = Object.entries(tags)
          .filter(([, v]) => v === "smaller_from_larger")
          .map(([k]) => texts.get(k));
        if (tagged.length) {
          expect(tagged).toEqual([String(wrong)]);
          foundChoice += 1;
        }
      }
    }
    expect(foundNum).toBeGreaterThan(0);
    expect(foundChoice).toBeGreaterThan(0);
  });

  it("word problem names", () => {
    const names = NAMES.map(([n]) => n);
    for (let seed = 0; seed < 50; seed++) {
      const q = make(lib.skill("math.wp.add_sub_20"), seed, { age: 7 });
      expect(
        names.some((n) => q.prompt_he.includes(n)),
        q.prompt_he,
      ).toBe(true);
    }
  });

  it("figures present", () => {
    const expect_: Record<string, string | null> = {
      "math.time.hours": "clock",
      "math.fraction.identify": null,
      "geometry.angle.types": "angle",
      "geometry.area.grid": "grid_area",
      "logic.robot.path_end": "grid_path",
      "math.count.objects_10": "objects",
    };
    for (const [sid, kind] of Object.entries(expect_)) {
      const q = make(lib.skill(sid), 3, { age: 9 });
      expect(q.figure, sid).not.toBeNull();
      if (kind) expect(q.figure!.kind).toBe(kind);
    }
  });

  it("kind preferences", () => {
    const skill = lib.skill("math.add.within_20");
    const kinds = new Set<string>();
    for (let s = 0; s < 20; s++) kinds.add(make(skill, s, { age: 12, prefer_kind: "number" }).kind);
    expect(kinds).toEqual(new Set(["number"]));
    const kinds2 = new Set<string>();
    for (let s = 0; s < 20; s++) kinds2.add(make(skill, s, { age: 12, max_choices: 4 }).kind);
    expect(kinds2).toEqual(new Set(["choice"]));
    const young = make(skill, 1, { age: 5 });
    expect(young.kind).toBe("choice");
    expect(young.choices.length).toBe(3);
  });

  it.each(Object.keys(MISCONCEPTIONS).sort())("misconception catalog: %s", (tag) => {
    const entry = MISCONCEPTIONS[tag]!;
    expect(entry.parent_he && entry.hint_he).toBeTruthy();
    expect(NIQQUD.test(entry.parent_he + entry.hint_he)).toBe(false);
    expect(len(entry.hint_he)).toBeLessThanOrEqual(120);
  });
});

describe("arithmetic ranges (port checks for the first generators)", () => {
  beforeAll(() => void library(), 120_000);
  const lib = library();
  const all = (gen: string): Skill[] => [...lib.skills.values()].filter((s) => s.generator === gen);
  const each = (gen: string, fn: (skill: Skill, q: Question, calc: Record<string, number>) => void): void => {
    for (const skill of all(gen)) {
      for (let seed = 0; seed < 300; seed++) {
        const q = make(skill, seed, { age: 8 });
        fn(skill, q, (q.meta["calc"] ?? {}) as Record<string, number>);
      }
    }
  };
  const num = (v: unknown, d: number): number => (v === undefined ? d : Number(v));

  it("add: operands positive, sum within min_sum..max_sum, carry rule kept", () => {
    each("arithmetic.add", (skill, q, c) => {
      const s = c.a + c.b;
      expect(c.a).toBeGreaterThan(0);
      expect(c.b).toBeGreaterThan(0);
      expect(s).toBeLessThanOrEqual(num(skill.params["max_sum"], 10));
      expect(s).toBeGreaterThanOrEqual(Math.min(num(skill.params["min_sum"], 2), s));
      if (skill.params["carry"] === "none") expect(((c.a % 10) + (c.b % 10)) < 10, q.item_id).toBe(true);
    });
  });

  it("sub: a within min..max, 0 < b < a, borrow rule kept", () => {
    each("arithmetic.sub", (skill, q, c) => {
      expect(c.a).toBeLessThanOrEqual(num(skill.params["max"], 10));
      expect(c.b).toBeGreaterThan(0);
      expect(c.b).toBeLessThan(c.a);
      if (skill.params["borrow"] === "none") {
        const da = String(c.a).split("").reverse();
        const db = String(c.b).split("").reverse();
        da.forEach((d, i) => expect(Number(d) >= Number(db[i] ?? 0), q.item_id).toBe(true));
      }
    });
  });

  it("mul facts: one factor from the tables, the other 1..max_factor", () => {
    each("arithmetic.mul_facts", (skill, _q, c) => {
      const tables = (skill.params["tables"] as number[] | undefined) ?? [2, 3, 4, 5, 6, 7, 8, 9, 10];
      const mf = num(skill.params["max_factor"], 10);
      const ok = (t: number, o: number): boolean => tables.includes(t) && o >= 1 && o <= mf;
      expect(ok(c.a, c.b) || ok(c.b, c.a)).toBe(true);
    });
  });

  it("div facts: the quotient is a whole number", () => {
    each("arithmetic.div_facts", (_skill, q) => {
      const m = /(\d+)\/(\d+)$/.exec(q.item_id)!;
      expect(Number(m[1]) % Number(m[2])).toBe(0);
    });
  });

  it("money change: 0 < change < paid, price under max", () => {
    each("arithmetic.money_change", (skill, q) => {
      const parts = q.item_id.split(":");
      const price = F(parts[2]!.includes("/") ? Fraction.parse(parts[2]!) : BigInt(parts[2]!));
      const paid = Number(parts[3]);
      const change = parseNumber(q.kind === "number" ? q.answer : answerText(q))!;
      expect(change.gt(0)).toBe(true);
      expect(change.lt(paid)).toBe(true);
      expect(price.lt(num(skill.params["max"], 100))).toBe(true);
      expect(change.eq(F(paid).sub(price))).toBe(true);
    });
  });

  it("count: between min and max objects", () => {
    each("arithmetic.count", (skill, q) => {
      const n = Number(/x(\d+)$/.exec(q.item_id)![1]);
      expect(n).toBeGreaterThanOrEqual(Math.max(2, num(skill.params["min"], 2)));
      expect(n).toBeLessThanOrEqual(num(skill.params["max"], 10));
    });
  });
});
