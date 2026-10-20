/**
 * Fractions, decimals, percentages and ratios (grades 3-8), a line-by-line
 * port of `generators/rational.py`.
 */
import { F, Fraction } from "../fraction";
import { makeFigure } from "../model";
import type { PyRandom } from "../random";
import { floorDiv } from "../py";
import {
  asList,
  b,
  type Distractor,
  fmt,
  ltr,
  money,
  numericQuestion,
  opt,
  optionsQuestion,
  pget,
  pint,
  range,
  register,
  scale,
} from "./common";

export const UNIT_NAMES: Readonly<Record<number, string>> = {
  2: "חצי",
  3: "שליש",
  4: "רבע",
  5: "חמישית",
  6: "שישית",
  8: "שמינית",
  10: "עשירית",
};

export function gcd(a: number, c: number): number {
  a = Math.abs(a);
  c = Math.abs(c);
  while (c) [a, c] = [c, a % c];
  return a;
}

export function lcm(a: number, c: number): number {
  return a && c ? Math.abs(a * c) / gcd(a, c) : 0;
}

function fr(n: number | bigint, d: number | bigint): string {
  return `${n}/${d}`;
}

function fexpr(text: string): string {
  return ltr(text);
}

/** Python `int(Fraction)` (toward zero; the values here are positive). */
function int(x: Fraction): number {
  const v = x.n / x.d;
  return Number(v);
}

// --------------------------------------------------------------------------
// Fractions
// --------------------------------------------------------------------------

register("fractions.identify", (rng, params, ctx) => {
  const maxDen = pint(params, "max_den", 8);
  const den = rng.randint(2, maxDen);
  const num = rng.randint(1, den - 1);
  let shape = String(pget(params, "figure", "mixed"));
  if (shape === "mixed") shape = rng.choice(["pie", "bar_model"]);
  const value = F(num, den);
  const candidates: [number, number, string | null][] = [
    [den - num, den, "fraction_complement"],
    [num, den - num, "fraction_part_over_rest"],
    [den, num, "fraction_inverted"],
    [num, den + 1, null],
    [num + 1, den, null],
  ];
  const dis = [];
  const seen = new Set([value.key()]);
  for (const [n2, d2, tag] of candidates) {
    if (d2 <= 1 || n2 <= 0 || n2 === d2) continue;
    const v = F(n2, d2);
    if (seen.has(v.key())) continue;
    seen.add(v.key());
    dis.push(opt(fr(n2, d2), { tag }));
  }
  return optionsQuestion(rng, ctx, {
    item_id: `fractions.identify:${num}/${den}:${shape}`,
    prompt_he: "איזה חלק מהצורה צבוע?",
    prompt_en: "What fraction is shaded?",
    correct: opt(fr(num, den)),
    distractors: dis,
    explanation_he:
      `הצורה מחולקת ל־${den} חלקים שווים: זה המכנה. ` + (num === 1 ? "חלק אחד צבוע" : `${num} חלקים צבועים`) + `: זה המונה. לכן ${fr(num, den)}.`,
    difficulty: -0.6 + 0.12 * den + 0.2 * b(num > 1),
    figure: makeFigure(shape, { parts: den, shaded: num }),
    calc: `F(${num}, ${den})`,
  });
});

register("fractions.compare", (rng, params, ctx) => {
  let mode = String(pget(params, "mode", "mixed"));
  if (mode === "mixed") mode = rng.choice(["same_den", "same_num", "different"]);
  let x = F(0);
  let y = F(0);
  let fx: [number, number] = [0, 1];
  let fy: [number, number] = [0, 1];
  for (let it = 0; it < 100; it++) {
    if (mode === "same_den") {
      const d = rng.randint(3, 12);
      const [a, c] = rng.sample(range(1, d), 2) as [number, number];
      [x, y] = [F(a, d), F(c, d)];
      [fx, fy] = [
        [a, d],
        [c, d],
      ];
    } else if (mode === "same_num") {
      const n = rng.randint(1, 4);
      const [d1, d2] = rng.sample(range(n + 1, 13), 2) as [number, number];
      [x, y] = [F(n, d1), F(n, d2)];
      [fx, fy] = [
        [n, d1],
        [n, d2],
      ];
    } else {
      const [d1, d2] = rng.sample(range(2, 11), 2) as [number, number];
      const a = rng.randint(1, d1 - 1);
      const c = rng.randint(1, d2 - 1);
      [x, y] = [F(a, d1), F(c, d2)];
      [fx, fy] = [
        [a, d1],
        [c, d2],
      ];
    }
    if (!x.eq(y)) break;
  }
  const [big, small] = x.gt(y) ? [fx, fy] : [fy, fx];
  const tb = fr(...big);
  const ts = fr(...small);
  let why: string;
  let tag: string | null;
  if (mode === "same_den") {
    why = `המכנה זהה, אז משווים מונים: המונה ${big[0]} גדול מ־${small[0]},` + ` כלומר יותר חלקים. לכן ${tb} גדול יותר.`;
    tag = null;
  } else if (mode === "same_num") {
    why = `המונה זהה. מכנה קטן יותר אומר חלקים גדולים יותר, ולכן ` + `${tb} גדול מ־${ts}.`;
    tag = "fraction_bigger_den_bigger";
  } else {
    const common = lcm(big[1], small[1]);
    const cb = floorDiv(big[0] * common, big[1]);
    const cs = floorDiv(small[0] * common, small[1]);
    why = `מכנה משותף ${common}: ${tb} = ${fr(cb, common)}, ` + `${ts} = ${fr(cs, common)}. לכן ${tb} גדול יותר.`;
    tag = small[1] > big[1] ? "fraction_bigger_den_bigger" : null;
  }
  const [first, second] = rng.random() < 0.5 ? [fx, fy] : [fy, fx];
  const modeDiff: Record<string, number> = { same_den: -0.7, same_num: 0.0, different: 0.6 };
  return optionsQuestion(rng, ctx, {
    item_id: `fractions.compare:${fr(...first)}|${fr(...second)}`,
    prompt_he: `איזה שבר גדול יותר: ${fr(...first)} או ${fr(...second)}?`,
    prompt_en: `Which is bigger: ${fr(...first)} or ${fr(...second)}?`,
    correct: opt(tb),
    distractors: [opt(ts, { tag })],
    explanation_he: why,
    difficulty: modeDiff[mode]! + 0.3 * b(x.sub(y).abs().lt(F(1, 8))),
    calc: `max(F(${fx[0]}, ${fx[1]}), F(${fy[0]}, ${fy[1]}))`,
    n: 2,
    shuffle: false,
  });
});

register("fractions.equivalent", (rng, params, ctx) => {
  const maxDen = pint(params, "max_den", 10);
  const modes = asList<string>(params["modes"], ["pick", "missing", "simplify"]);
  const mode = rng.choice(modes);
  const d = rng.randint(2, maxDen);
  let n = rng.randint(1, d - 1);
  while (gcd(n, d) !== 1) n = rng.randint(1, d - 1);
  const k = rng.randint(2, 5);
  const base = fr(n, d);
  const big = fr(n * k, d * k);
  if (mode === "pick") {
    let dis = [
      opt(fr(n + k, d + k), { tag: "fraction_add_same" }),
      opt(fr(n, d * k), { tag: "fraction_mul_one_part" }),
      opt(fr(n * k, d), { tag: "fraction_mul_one_part" }),
      n !== 1 ? opt(fr(d, n), { tag: "fraction_inverted" }) : opt(fr(n + 1, d * k)),
    ];
    dis = dis.filter((o) => {
      const [p, q] = o.text_he.split("/").map(Number) as [number, number];
      return !F(p, q).eq(F(n, d));
    });
    return optionsQuestion(rng, ctx, {
      item_id: `fractions.equivalent:pick:${base}x${k}`,
      prompt_he: `איזה שבר שווה ל־${base}?`,
      prompt_en: `Which fraction equals ${base}?`,
      correct: opt(big),
      distractors: dis,
      explanation_he: `כופלים את המונה ואת המכנה באותו מספר (${k}): ` + `${fexpr(`${base} = ${big}`)}. השבר לא משתנה.`,
      difficulty: -0.1 + 0.08 * k,
      calc: `F(${n * k}, ${d * k})`,
    });
  }
  if (mode === "missing") {
    const prompt = `מה המונה החסר? ${fexpr(`${base} = ?/${d * k}`)}`;
    return numericQuestion(rng, ctx, params, {
      item_id: `fractions.equivalent:missing:${base}x${k}`,
      prompt_he: prompt,
      prompt_en: `Missing numerator: ${base} = ?/${d * k}`,
      answer: n * k,
      distractors: [
        [n + (d * k - d), "fraction_add_same"],
        [n, "fraction_mul_one_part"],
        [n * k + 1, null],
      ],
      explanation_he: `המכנה גדל פי ${k} (${fexpr(`${d} × ${k} = ${d * k}`)}` + `), אז גם המונה: ${fexpr(`${n} × ${k} = ${n * k}`)}.`,
      difficulty: 0.1 + 0.08 * k,
      calc: `${n} * ${k}`,
    });
  }
  const g = k;
  return numericQuestion(rng, ctx, params, {
    item_id: `fractions.equivalent:simplify:${big}`,
    prompt_he: `צמצמו את השבר ${big} ככל האפשר.`,
    prompt_en: `Simplify ${big} fully.`,
    answer: F(n, d),
    distractors: [
      [F(floorDiv(n * k, 1), d * k), null],
      [F(n + 1, d), null],
      [F(n, d + 1), null],
      [n > 1 ? F(d, n) : null, "fraction_inverted"],
    ],
    explanation_he:
      `מחלקים את המונה ואת המכנה במחלק המשותף הגדול ` +
      `(${g}): ${fexpr(`${n * k} : ${g} = ${n}`)}, ` +
      `${fexpr(`${d * k} : ${g} = ${d}`)}. התשובה ${base}.`,
    difficulty: 0.3 + (0.06 * k * d) / 4,
    style: "fraction",
    meta: { fraction_form: "simplest" },
    calc: `F(${n * k}, ${d * k})`,
  });
});

register("fractions.of_quantity", (rng, params, ctx) => {
  const maxDen = pint(params, "max_den", 10);
  const d = rng.randint(2, maxDen);
  const n = rng.random() < 0.7 ? rng.randint(1, d - 1) : 1;
  const unit = rng.randint(2, 12);
  const total = d * unit;
  const ans = n * unit;
  const first = `${fr(1, d)} מ־${total} זה ${fexpr(`${total} : ${d} = ${unit}`)}.`;
  const rest = n > 1 ? ` ${fr(n, d)} זה ${fexpr(`${n} × ${unit} = ${ans}`)}.` : "";
  return numericQuestion(rng, ctx, params, {
    item_id: `fractions.of_quantity:${n}/${d}of${total}`,
    prompt_he: `כמה זה ${fr(n, d)} מ־${total}?`,
    prompt_en: `What is ${fr(n, d)} of ${total}?`,
    answer: ans,
    distractors: [
      [n > 1 ? unit : null, "fraction_divide_only"],
      [n > 1 ? total * n : null, "fraction_mul_only"],
      [total - ans, "fraction_complement"],
      [ans + unit, null],
    ],
    explanation_he: first + rest,
    difficulty: -0.2 + 0.25 * b(n > 1) + (0.6 * total) / 120,
    calc: `F(${n}, ${d}) * ${total}`,
  });
});

register("fractions.addsub", (rng, params, ctx) => {
  const same = Boolean(pget(params, "same_den", true));
  const ops = asList<string>(params["op"], ["+", "-"]);
  const op = rng.choice(ops);
  let d1 = 2;
  let d2 = 2;
  let a = 1;
  let c = 1;
  let x = F(0);
  let y = F(0);
  for (let it = 0; it < 200; it++) {
    if (same) d1 = d2 = rng.randint(3, 12);
    else [d1, d2] = rng.sample(range(2, 11), 2) as [number, number];
    a = rng.randint(1, d1 - 1);
    c = rng.randint(1, d2 - 1);
    [x, y] = [F(a, d1), F(c, d2)];
    if (op === "-" && x.le(y)) continue;
    if (op === "+" && x.add(y).gt(2)) continue;
    break;
  }
  const res = op === "+" ? x.add(y) : x.sub(y);
  const shown = `${fr(a, d1)} ${op} ${fr(c, d2)}`;
  let expl: string;
  let dis: Distractor[];
  if (same) {
    const top = op === "+" ? a + c : a - c;
    expl =
      `המכנה זהה, ולכן ${op === "+" ? "מחברים" : "מחסרים"} רק ` + `את המונים: ${fexpr(`${a} ${op} ${c} = ${top}`)}. ` + `${fexpr(`${shown} = ${fr(top, d1)}`)}`;
    if (F(top, d1).d !== BigInt(d1)) expl += `, ובצמצום ${fmt(res, "fraction")}`;
    expl += ".";
    dis = [[op === "+" ? F(top, d1 + d2) : null, "fraction_add_across"]];
  } else {
    const common = lcm(d1, d2);
    const ca = floorDiv(a * common, d1);
    const cb = floorDiv(c * common, d2);
    const top = op === "+" ? ca + cb : ca - cb;
    expl =
      `מכנה משותף ${common}: ${fr(a, d1)} = ${fr(ca, common)}, ` +
      `${fr(c, d2)} = ${fr(cb, common)}. ` +
      `${fexpr(`${fr(ca, common)} ${op} ${fr(cb, common)} = ${fr(top, common)}`)}` +
      (F(top, common).d !== BigInt(common) ? ` = ${fmt(res, "fraction")}.` : ".");
    const across = op === "+" ? F(a + c, d1 + d2) : a > c && d1 > d2 ? F(a - c, d1 - d2) : null;
    dis = [
      [across, "fraction_add_across"],
      [F(op === "+" ? a + c : Math.abs(a - c), Math.max(d1, d2)), "fraction_den_kept_wrong"],
    ];
  }
  dis.push([res.add(F(1n, res.d)), null], [res.sub(F(1n, res.d)), null]);
  return numericQuestion(rng, ctx, params, {
    item_id: `fractions.addsub:${shown.split(" ").join("")}`,
    prompt_he: `כמה זה ${fexpr(shown)}?`,
    prompt_en: `What is ${shown}?`,
    answer: res,
    distractors: dis,
    explanation_he: expl,
    difficulty: (same ? -0.5 : 0.4) + 0.2 * b(op === "-") + 0.3 * b(res.d !== BigInt(same ? d1 : lcm(d1, d2))),
    style: "fraction",
    step: F(1, lcm(d1, d2)),
    calc: `F(${a}, ${d1}) ${op} F(${c}, ${d2})`,
  });
});

register("fractions.mul_whole", (rng, params, ctx) => {
  const d = rng.randint(2, 10);
  const n = rng.randint(1, d - 1);
  const w = rng.randint(2, 9);
  const res = F(n * w, d);
  const shown = `${w} × ${fr(n, d)}`;
  let expl = `כופלים רק את המונה: ${fexpr(`${w} × ${n} = ${n * w}`)}, ` + `ולכן ${fexpr(`${shown} = ${fr(n * w, d)}`)}`;
  if (res.d !== BigInt(d)) expl += ` = ${fmt(res, "fraction")}`;
  return numericQuestion(rng, ctx, params, {
    item_id: `fractions.mul_whole:${w}x${n}/${d}`,
    prompt_he: `כמה זה ${fexpr(shown)}?`,
    prompt_en: `What is ${shown}?`,
    answer: res,
    distractors: [
      [F(n * w, d * w), "fraction_mul_den"],
      [F(n + w, d), "add_instead_of_mul"],
      [res.add(1), null],
    ],
    explanation_he: expl + ".",
    difficulty: 0.0 + 0.3 * b(res.gt(1)),
    style: "fraction",
    calc: `${w} * F(${n}, ${d})`,
  });
});

// --------------------------------------------------------------------------
// Decimals
// --------------------------------------------------------------------------

function dec(value: Fraction): string {
  return fmt(value, "decimal");
}

export function randDec(rng: PyRandom, places: number, lo = 0, hi = 20): Fraction {
  const s = 10 ** places;
  return F(rng.randint(lo * s + 1, hi * s), s);
}

register("decimals.compare", (rng, _params, ctx) => {
  const whole = rng.randint(0, 9);
  const trap = rng.random() < 0.6;
  let x: Fraction;
  let y: Fraction;
  if (trap) {
    // 0.5 vs 0.25: the longer one looks bigger but isn't.
    const a = F(rng.randint(2, 9), 10);
    let c = F(rng.randint(10, int(a.mul(100)) - 1), 100);
    if (c.mul(100).floor() % 10n === 0n) c = c.add(F(1, 100));
    [x, y] = [a.add(whole), c.add(whole)];
  } else {
    x = F(rng.randint(1, 99), 100).add(whole);
    y = F(rng.randint(1, 99), 100).add(whole);
    while (y.eq(x)) y = F(rng.randint(1, 99), 100).add(whole);
  }
  const big = x.gt(y) ? x : y;
  const small = x.gt(y) ? y : x;
  const tag = dec(small).length > dec(big).length ? "decimal_longer_bigger" : null;
  const pad = (v: Fraction): string => fmt(v, "money"); // 2 decimal places
  const [first, second] = rng.random() < 0.5 ? [x, y] : [y, x];
  return optionsQuestion(rng, ctx, {
    item_id: `decimals.compare:${dec(first)}|${dec(second)}`,
    prompt_he: `איזה מספר גדול יותר: ${dec(first)} או ${dec(second)}?`,
    prompt_en: `Which is bigger: ${dec(first)} or ${dec(second)}?`,
    correct: opt(dec(big)),
    distractors: [opt(dec(small), { tag })],
    explanation_he: `משלימים לאותו מספר ספרות: ${pad(big)} ו־${pad(small)}.` + ` משווים ספרה אחר ספרה: ${dec(big)} גדול יותר.`,
    difficulty: -0.3 + 0.6 * b(trap),
    calc: `max(F(${x.n}, ${x.d}), ` + `F(${y.n}, ${y.d}))`,
    n: 2,
    shuffle: false,
  });
});

register("decimals.addsub", (rng, params, ctx) => {
  const op = rng.choice(asList<string>(params["op"], ["+", "-"]));
  let [pa, pb] = rng.choice([
    [1, 2],
    [2, 1],
    [1, 1],
    [2, 2],
  ] as const) as readonly number[] as [number, number];
  let a = randDec(rng, pa, 0, 30);
  let c = randDec(rng, pb, 0, 20);
  if (op === "-" && a.lt(c)) {
    [a, c] = [c, a];
    [pa, pb] = [pb, pa];
  }
  const res = op === "+" ? a.add(c) : a.sub(c);
  const mp = Math.max(pa, pb);
  let misalign: Fraction | null = null;
  if (pa !== pb && op === "+") {
    const fa = int(a.sub(int(a)).mul(10 ** pa));
    const fb = int(c.sub(int(c)).mul(10 ** pb));
    misalign = F(fa + fb, 10 ** mp).add(int(a) + int(c));
  }
  const paddedA = mp === 2 ? fmt(a, "money") : dec(a);
  const paddedB = mp === 2 ? fmt(c, "money") : dec(c);
  const shown = `${dec(a)} ${op} ${dec(c)}`;
  return numericQuestion(rng, ctx, params, {
    item_id: `decimals.addsub:${dec(a)}${op}${dec(c)}`,
    prompt_he: `כמה זה ${ltr(shown)}?`,
    prompt_en: `What is ${shown}?`,
    answer: res,
    distractors: [
      [misalign, "decimal_misalign"],
      [res.add(F(1, 10)), null],
      [res.sub(F(1, 10)), null],
      [res.add(1), null],
    ],
    explanation_he:
      `מיישרים את הנקודות זו מתחת לזו: ` +
      `${ltr(`${paddedA} ${op} ${paddedB}`)}. ` +
      `${op === "+" ? "מחברים" : "מחסרים"} כרגיל משמאל` +
      ` לנקודה ומימינה: ${dec(res)}.`,
    difficulty: -0.2 + 0.4 * b(pa !== pb) + 0.2 * b(op === "-"),
    style: "decimal",
    step: F(1, 10),
    calc: `F(${a.n}, ${a.d}) ${op} ` + `F(${c.n}, ${c.d})`,
  });
});

register("decimals.mul_pow10", (rng, params, ctx) => {
  const x = randDec(rng, rng.choice([1, 2]), 0, 50);
  const p = rng.choice([10, 100, 1000]);
  const zeros = String(p).length - 1;
  const op = rng.choice(["×", ":"]);
  const res = op === "×" ? x.mul(p) : x.div(p);
  const wrongWay = op === "×" ? x.div(p) : x.mul(p);
  const wrongCount = op === "×" ? x.mul(p > 10 ? floorDiv(p, 10) : 100) : x.div(p > 10 ? floorDiv(p, 10) : 100);
  const side = op === "×" ? "ימינה" : "שמאלה";
  const shown = `${dec(x)} ${op} ${p}`;
  return numericQuestion(rng, ctx, params, {
    item_id: `decimals.mul_pow10:${dec(x)}${op}${p}`,
    prompt_he: `כמה זה ${ltr(shown)}?`,
    prompt_en: `What is ${shown}?`,
    answer: res,
    distractors: [
      [wrongWay, "decimal_shift_wrong_way"],
      [wrongCount, "decimal_shift_count"],
    ],
    explanation_he:
      `${op === "×" ? "כפל" : "חילוק"} ב־${p}: מזיזים את ` +
      `הנקודה ${zeros === 1 ? "מקום אחד" : `${zeros} מקומות`} ` +
      `${side}. ` +
      `${ltr(`${shown} = ${dec(res)}`)}.`,
    difficulty: -0.2 + 0.2 * zeros + 0.3 * b(op === ":"),
    style: "decimal",
    step: !res.isZero() ? res.div(10) : F(1, 10),
    calc: `F(${x.n}, ${x.d}) ` + (op === "×" ? "*" : "/") + ` ${p}`,
  });
});

register("decimals.muldiv", (rng, params, ctx) => {
  const mode = rng.choice(["dec_x_whole", "dec_x_dec", "dec_div_whole"] as const);
  let a: Fraction;
  let c: Fraction;
  let res: Fraction;
  let places: number;
  let shown: string;
  let wrong: Fraction;
  let why: string;
  if (mode === "dec_x_whole") {
    a = F(rng.randint(2, 99), 10);
    c = F(rng.randint(2, 9));
    res = a.mul(c);
    places = 1;
    shown = `${dec(a)} × ${dec(c)}`;
    wrong = res.mul(10);
    why = `מתעלמים מהנקודה: ${ltr(`${int(a.mul(10))} × ${int(c)} = ${int(res.mul(10))}`)}.` + ` בתרגיל ספרה אחת אחרי הנקודה, ולכן ${dec(res)}.`;
  } else if (mode === "dec_x_dec") {
    a = F(rng.randint(1, 9), 10);
    c = F(rng.randint(2, 9), 10);
    res = a.mul(c);
    places = 2;
    shown = `${dec(a)} × ${dec(c)}`;
    wrong = res.mul(10);
    why = `${ltr(`${int(a.mul(10))} × ${int(c.mul(10))} = ${int(res.mul(100))}`)}. ` + `בתרגיל שתי ספרות אחרי הנקודה (אחת בכל מספר), ולכן ${dec(res)}.`;
  } else {
    c = F(rng.randint(2, 9));
    res = F(rng.randint(2, 30), 10);
    a = res.mul(c);
    places = 1;
    shown = `${dec(a)} : ${dec(c)}`;
    wrong = res.mul(10);
    why =
      `${ltr(`${int(a.mul(10))} : ${int(c)} = ${int(res.mul(10))}`)}, ` +
      `ומחזירים את הנקודה: ${dec(res)}. בודקים: ` +
      `${ltr(`${dec(res)} × ${int(c)} = ${dec(a)}`)}.`;
  }
  const py = shown.split("×").join("*").split(":").join("/");
  const pyTerms = py.split(/\s+/).map((t) => {
    if (t === "*" || t === "/") return t;
    const f = Fraction.parse(t);
    return `F(${f.n}, ${f.d})`;
  });
  const modeDiff: Record<string, number> = { dec_x_whole: -0.2, dec_x_dec: 0.5, dec_div_whole: 0.3 };
  return numericQuestion(rng, ctx, params, {
    item_id: `decimals.muldiv:${shown.split(" ").join("")}`,
    prompt_he: `כמה זה ${ltr(shown)}?`,
    prompt_en: `What is ${shown}?`,
    answer: res,
    distractors: [
      [wrong, "decimal_places_count"],
      [res.div(10), "decimal_places_count"],
      [res.add(F(1, 10 ** places)), null],
    ],
    explanation_he: why,
    difficulty: modeDiff[mode]!,
    style: "decimal",
    calc: pyTerms.join(" "),
  });
});

// --------------------------------------------------------------------------
// Percent and ratio
// --------------------------------------------------------------------------

export const PCTS = [10, 20, 25, 50, 75, 5, 15, 30, 40, 60] as const;
export const ITEMS = ["חולצה", "משחק", "ספר", "זוג נעליים", "תיק", "שמיכה", "מנורה", "אופניים"] as const;

register("percent.of", (rng, params, ctx) => {
  const pct = rng.choice(PCTS);
  const base = rng.choice(range(20, 601, 10).filter((x) => (x * pct) % 100 === 0));
  const ans = floorDiv(base * pct, 100);
  let why: string;
  if (pct % 10 === 0) {
    const tenth = floorDiv(base, 10);
    why = `10% מ־${base} זה ${ltr(`${base} : 10 = ${tenth}`)}.`;
    if (pct !== 10) why += ` ${pct}% זה פי ${floorDiv(pct, 10)}: ` + `${ltr(`${floorDiv(pct, 10)} × ${tenth} = ${ans}`)}.`;
  } else {
    why = `${pct}% זה ${pct}/100. ${ltr(`${base} × ${pct} : 100 = ${ans}`)}.`;
  }
  return numericQuestion(rng, ctx, params, {
    item_id: `percent.of:${pct}%${base}`,
    prompt_he: `כמה זה ${pct}% מ־${base}?`,
    prompt_en: `What is ${pct}% of ${base}?`,
    answer: ans,
    distractors: [
      [pct, "percent_as_number"],
      [base - ans, "percent_complement"],
      [base - pct, "percent_as_number"],
      [ans * 10, null],
    ],
    explanation_he: why,
    difficulty: -0.4 + 0.5 * b(pct % 10 !== 0) + (0.3 * base) / 600,
    calc: `F(${base} * ${pct}, 100)`,
  });
});

register("percent.discount", (rng, params, ctx) => {
  const pct = rng.choice([10, 20, 25, 50, 30, 40, 15]);
  const price = rng.choice(range(20, 401, 10).filter((x) => (x * pct) % 100 === 0));
  const off = floorDiv(price * pct, 100);
  const ans = price - off;
  const item = rng.choice(ITEMS);
  return numericQuestion(rng, ctx, params, {
    item_id: `percent.discount:${item}:${price}-${pct}%`,
    prompt_he: `${item} עולה ${money(price)}. יש הנחה של ${pct}%. ` + `כמה משלמים אחרי ההנחה?`,
    prompt_en: `Costs ${price} ₪ with ${pct}% off. What do you pay?`,
    answer: ans,
    distractors: [
      [off, "discount_not_subtracted"],
      [price - pct, "percent_as_number"],
      [price + off, "change_added"],
      [ans - 10, null],
    ],
    explanation_he: `ההנחה: ${pct}% מ־${price} = ${off} ₪. משלמים ` + `${ltr(`${price} - ${off} = ${ans}`)} ₪.`,
    difficulty: 0.0 + 0.3 * b(pct % 10 !== 0) + (0.2 * price) / 400,
    unit: " ₪",
    calc: `${price} - F(${price} * ${pct}, 100)`,
  });
});

register("percent.change", (rng, params, ctx) => {
  const up = rng.random() < 0.6;
  let pct = 10;
  let base = 20;
  let diff = 2;
  let neu = 22;
  for (let it = 0; it < 200; it++) {
    pct = rng.choice([10, 20, 25, 50, 40, 60, 75, 100]);
    if (!up && pct >= 100) continue;
    base = rng.choice(range(20, 401, 10).filter((x) => (x * pct) % 100 === 0));
    diff = floorDiv(base * pct, 100);
    neu = up ? base + diff : base - diff;
    break;
  }
  const wrongBase = F(diff * 100, neu);
  const ratio = fmt(F(diff, base), "decimal");
  const word = up ? "עלה" : "ירד";
  return numericQuestion(rng, ctx, params, {
    item_id: `percent.change:${base}->${neu}`,
    prompt_he: `מחיר ${word} מ־${base} ₪ ל־${neu} ₪. בכמה אחוזים ${word}?`,
    prompt_en: `A price went from ${base} to ${neu}. Percent change?`,
    answer: pct,
    distractors: [
      [wrongBase.isInt() ? wrongBase : null, "percent_change_base"],
      [diff, "percent_as_number"],
      [pct + 5, null],
    ],
    explanation_he: `השינוי: ${diff} ₪. מחלקים במחיר המקורי: ` + `${ltr(`${diff} : ${base} = ${ratio}`)}` + `, כלומר ${pct}%.`,
    difficulty: 0.3 + 0.3 * b(!up),
    unit: "%",
    calc: `F(${diff} * 100, ${base})`,
  });
});

export const RATIO_CONTEXTS: readonly (readonly [string, string, string, string])[] = [
  ["בשקית יש גולות אדומות וכחולות", "גולות אדומות", "גולות כחולות", "גולות"],
  ["במתכון יש קמח וסוכר", "כוסות קמח", "כוסות סוכר", "כוסות"],
  ["בגינה יש עגבניות ומלפפונים", "עגבניות", "מלפפונים", "ירקות"],
  ["בקופסה יש עפרונות וטושים", "עפרונות", "טושים", "כלי כתיבה"],
];

register("ratio.share", (rng, params, ctx) => {
  const [intro, first, second, totalWord] = rng.choice(RATIO_CONTEXTS);
  let a = rng.randint(1, 5);
  let c = rng.randint(1, 5);
  while (a === c || gcd(a, c) !== 1) {
    a = rng.randint(1, 5);
    c = rng.randint(1, 5);
  }
  const unit = rng.randint(2, 12);
  const total = (a + c) * unit;
  const askSecond = rng.random() < 0.5;
  const ans = (askSecond ? c : a) * unit;
  const other = (askSecond ? a : c) * unit;
  const asked = askSecond ? second : first;
  return numericQuestion(rng, ctx, params, {
    item_id: `ratio.share:${a}:${c}:${total}:${b(askSecond)}`,
    prompt_he: `${intro} ביחס ${ltr(`${a}:${c}`)}. בסך הכול ${total} ` + `${totalWord}. כמה ${asked}?`,
    prompt_en: `Ratio ${a}:${c}, total ${total}. How many?`,
    answer: ans,
    distractors: [
      [other, "ratio_reversed"],
      [unit, "ratio_one_part"],
      [total - (askSecond ? c : a), null],
    ],
    explanation_he:
      `יש ${ltr(`${a} + ${c} = ${a + c}`)} חלקים. כל חלק: ` +
      `${ltr(`${total} : ${a + c} = ${unit}`)}. ` +
      `${asked}: ${ltr(`${askSecond ? c : a} × ${unit} = ${ans}`)}.`,
    difficulty: 0.0 + 0.4 * scale(total, 6, 120),
    calc: `F(${total} * ${askSecond ? c : a}, ${a + c})`,
  });
});
