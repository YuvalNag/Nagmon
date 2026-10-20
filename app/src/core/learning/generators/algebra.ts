/**
 * Negative numbers, powers and roots, equations and functions (grades
 * 7-9), a line-by-line port of `generators/algebra.py`.
 */
import { F, type Fraction } from "../fraction";
import { makeFigure } from "../model";
import type { PyRandom } from "../random";
import { floorDiv, pyMod } from "../py";
import { b as B, type Distractor, fmt, ltr, numericQuestion, opt, optionsQuestion, pget, range, register } from "./common";

const SUP_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

export function sup(n: number): string {
  return Array.from(String(n))
    .map((c) => (c >= "0" && c <= "9" ? SUP_DIGITS[Number(c)]! : c))
    .join("");
}

/** Signed operand: negatives in parentheses, e.g. (-3). */
export function paren(n: number): string {
  return n < 0 ? `(${n})` : String(n);
}

export function nz(rng: PyRandom, lo: number, hi: number): number {
  let v = 0;
  while (v === 0) v = rng.randint(lo, hi);
  return v;
}

register("algebra.negative", (rng, params, ctx) => {
  const op = pget(params, "op", "addsub");
  if (op === "compare") {
    let [a, c] = rng.sample(
      range(-12, 13).filter((x) => x),
      2,
    ) as [number, number];
    if (rng.random() < 0.6) {
      [a, c] = [-Math.abs(a), -Math.abs(c)];
      if (a === c) c = a - 1;
    }
    const big = Math.max(a, c);
    const small = Math.min(a, c);
    const tag = Math.abs(small) > Math.abs(big) ? "negative_sign_error" : null;
    return optionsQuestion(rng, ctx, {
      item_id: `algebra.negative:cmp${a},${c}`,
      prompt_he: `איזה מספר גדול יותר: ${fmt(a)} או ${fmt(c)}?`,
      prompt_en: `Which is bigger: ${a} or ${c}?`,
      correct: opt(fmt(big)),
      distractors: [opt(fmt(small), { tag })],
      explanation_he: `על ציר המספרים, מספר שנמצא ימינה יותר גדול יותר.` + ` ${fmt(big)} נמצא מימין ל־${fmt(small)}.`,
      difficulty: -0.3 + 0.6 * B(a < 0 && c < 0),
      figure: makeFigure("number_line", { min: -12, max: 12, marks: [a, c] }),
      calc: `max(${a}, ${c})`,
      n: 2,
      shuffle: false,
    });
  }
  if (op === "addsub") {
    let a: number;
    let c: number;
    let sign: string;
    let res: number;
    for (;;) {
      a = nz(rng, -15, 15);
      c = nz(rng, -15, 15);
      sign = rng.choice(["+", "-"]);
      res = sign === "+" ? a + c : a - c;
      if (a < 0 || c < 0 || res < 0) break;
    }
    const shown = `${a} ${sign} ${paren(c)}`;
    let why: string;
    if (sign === "-" && c < 0) why = `חיסור של מספר שלילי הוא כמו חיבור: ` + `${ltr(`${shown} = ${a} + ${-c} = ${res}`)}.`;
    else if (sign === "+" && c < 0) why = `חיבור של מספר שלילי הוא כמו חיסור: ` + `${ltr(`${shown} = ${a} - ${-c} = ${res}`)}.`;
    else {
      const move = sign === "+" ? c : -c;
      const side = move > 0 ? "ימינה" : "שמאלה";
      why = `על ציר המספרים: מתחילים ב־${fmt(a)} וזזים ${Math.abs(move)} ` + `${side}. מגיעים ל־${fmt(res)}.`;
    }
    const wrong = sign === "+" ? a - c : a + c;
    return numericQuestion(rng, ctx, params, {
      item_id: `algebra.negative:${shown.split(" ").join("")}`,
      prompt_he: `כמה זה ${ltr(shown)}?`,
      prompt_en: `What is ${shown}?`,
      answer: res,
      distractors: [
        [res ? -res : null, "negative_sign_error"],
        [wrong, "negative_sign_error"],
        [res + 1, null],
        [res - 1, null],
      ],
      explanation_he: why,
      difficulty: -0.2 + 0.3 * B(c < 0) + 0.2 * B(a < 0),
      allow_negative: true,
      calc: `${a} ${sign} (${c})`,
    });
  }
  let a = nz(rng, -10, 10);
  const c = nz(rng, -10, 10);
  if (a > 0 && c > 0) a = -a;
  let res: number;
  let shown: string;
  let py: string;
  if (rng.random() < 0.5) {
    res = a * c;
    shown = `${paren(a)} × ${paren(c)}`;
    py = `(${a}) * (${c})`;
  } else {
    res = a;
    a = a * c;
    shown = `${paren(a)} : ${paren(c)}`;
    py = `(${a}) // (${c})`;
  }
  const same = a < 0 === c < 0;
  const why = same ? "שני הסימנים זהים, ולכן התוצאה חיובית" : "הסימנים שונים, ולכן התוצאה שלילית";
  return numericQuestion(rng, ctx, params, {
    item_id: `algebra.negative:${shown.split(" ").join("")}`,
    prompt_he: `כמה זה ${ltr(shown)}?`,
    prompt_en: `What is ${shown}?`,
    answer: res,
    distractors: [
      [-res, same ? "neg_times_neg" : "negative_sign_error"],
      [res + (res > 0 ? 1 : -1), null],
    ],
    explanation_he: `${why}: ${ltr(`${shown} = ${res}`)}.`,
    difficulty: 0.0 + 0.3 * B(same),
    allow_negative: true,
    calc: py,
  });
});

register("algebra.powers", (rng, params, ctx) => {
  const kind = pget(params, "kind", "power");
  if (kind === "power") {
    const base = rng.randint(2, 10);
    let exp = rng.randint(2, base > 5 ? 3 : 5);
    if (base === 10) exp = rng.randint(2, 6);
    const val = base ** exp;
    const chain = new Array<string>(exp).fill(String(base)).join(" × ");
    return numericQuestion(rng, ctx, params, {
      item_id: `algebra.powers:${base}^${exp}`,
      prompt_he: `כמה זה ${base} בחזקת ${exp}?`,
      prompt_en: `What is ${base} to the power of ${exp}?`,
      answer: val,
      distractors: [
        [base * exp, "power_as_multiply"],
        [base + exp, null],
        [base ** (exp - 1), null],
        [exp ** base < 10 ** 7 ? exp ** base : null, "power_base_swap"],
      ],
      explanation_he: `${base} בחזקת ${exp} זה ${base} כפול עצמו ${exp} ` + `פעמים: ${ltr(`${chain} = ${fmt(val)}`)}.`,
      difficulty: -0.4 + 0.15 * exp + 0.05 * base,
      calc: `${base} ** ${exp}`,
    });
  }
  if (kind === "sqrt") {
    const r = rng.randint(2, 15);
    const n = r * r;
    return numericQuestion(rng, ctx, params, {
      item_id: `algebra.powers:sqrt${n}`,
      prompt_he: `כמה זה ${ltr(`√${n}`)}?`,
      prompt_en: `What is √${n}?`,
      answer: r,
      distractors: [
        [n % 2 === 0 ? floorDiv(n, 2) : null, "sqrt_half"],
        [r + 1, null],
        [r - 1, null],
      ],
      explanation_he: `מחפשים מספר שכפול עצמו נותן ${n}: ` + `${ltr(`${r} × ${r} = ${n}`)}. לכן ` + `${ltr(`√${n} = ${r}`)}.`,
      difficulty: -0.5 + 0.1 * r,
      calc: `sqrt(${n})`,
    });
  }
  if (kind === "laws") {
    const base = rng.randint(2, 9);
    let m = rng.randint(2, 8);
    const n = rng.randint(2, 6);
    const law = rng.choice(["mul", "div", "pow"] as const);
    let shown: string;
    let ans: number;
    let wrong: number;
    let tag: string;
    let why: string;
    if (law === "mul") {
      [shown, ans] = [`${base}${sup(m)} × ${base}${sup(n)}`, m + n];
      [wrong, tag] = [m * n, "exponent_multiply"];
      why = `בכפל חזקות עם אותו בסיס מחברים מעריכים: ${m} + ${n} = ${ans}.`;
    } else if (law === "div") {
      m = m + n;
      [shown, ans] = [`${base}${sup(m)} : ${base}${sup(n)}`, m - n];
      wrong = m % n === 0 ? floorDiv(m, n) : m + n;
      tag = "exponent_multiply";
      why = `בחילוק חזקות עם אותו בסיס מחסרים מעריכים: ${m} - ${n} = ${ans}.`;
    } else {
      [shown, ans] = [`(${base}${sup(m)})${sup(n)}`, m * n];
      [wrong, tag] = [m + n, "exponent_add"];
      why = `בחזקה של חזקה כופלים מעריכים: ${m} × ${n} = ${ans}.`;
    }
    const calcs = { mul: `${m} + ${n}`, div: `${m} - ${n}`, pow: `${m} * ${n}` };
    return numericQuestion(rng, ctx, params, {
      item_id: `algebra.powers:law:${shown}`,
      prompt_he: `${ltr(`${shown} = ${base}^?`)} מה המעריך החסר?`,
      prompt_en: `${shown} = ${base}^? Find the exponent.`,
      answer: ans,
      distractors: [
        [wrong, tag],
        [ans + 1, null],
        [ans - 1, null],
      ],
      explanation_he: why,
      difficulty: 0.0 + 0.3 * B(law !== "mul"),
      calc: calcs[law],
    });
  }
  // scientific notation: n = a.bc x 10^k
  const k = rng.randint(3, 8);
  const mant = F(rng.randint(11, 99), 10);
  const n = mant.mul(10 ** k).toInt();
  return numericQuestion(rng, ctx, params, {
    item_id: `algebra.powers:sci${n}`,
    prompt_he: `כותבים את ${fmt(n)} בכתיב מדעי: ` + `${ltr(`${fmt(mant)} × 10^?`)} מה המעריך?`,
    prompt_en: `Write ${n} as ${fmt(mant)} × 10^?`,
    answer: k,
    distractors: [
      [k + 1, "decimal_shift_count"],
      [k - 1, "decimal_shift_count"],
      [String(n).length, "decimal_shift_count"],
    ],
    explanation_he: `מזיזים את הנקודה מסוף ${fmt(n)} עד אחרי הספרה ` + `הראשונה: ${k} מקומות. לכן ` + `${ltr(`${fmt(n)} = ${fmt(mant)} × 10${sup(k)}`)}.`,
    difficulty: 0.2 + 0.05 * k,
    calc: `${k}`,
  });
});

register("algebra.root_estimate", (rng, _params, ctx) => {
  const r = rng.randint(2, 14);
  const n = rng.randint(r * r + 1, (r + 1) ** 2 - 1);
  const between = (lo: number): string => `בין ${lo} ל־${lo + 1}`;
  const dis = [opt(between(r - 1)), opt(between(r + 1))];
  if (floorDiv(n, 2) > r + 2) dis.push(opt(between(floorDiv(n, 2)), { tag: "sqrt_half" }));
  else dis.push(opt(between(r + 2)));
  return optionsQuestion(rng, ctx, {
    item_id: `algebra.root_estimate:${n}`,
    prompt_he: `בין אילו שני מספרים שלמים נמצא ${ltr(`√${n}`)}?`,
    prompt_en: `Between which whole numbers is √${n}?`,
    correct: opt(between(r)),
    distractors: dis,
    explanation_he:
      `${ltr(`${r}² = ${r * r}`)} ו־` + `${ltr(`${r + 1}² = ${(r + 1) ** 2}`)}. ${n} ביניהם, ` + `ולכן ${ltr(`√${n}`)} בין ${r} ל־${r + 1}.`,
    difficulty: 0.0 + 0.05 * r,
  });
});

register("algebra.equation", (rng, params, ctx) => {
  const kind = pget(params, "kind", "two_step");
  const neg = Boolean(pget(params, "negatives", false));
  const lo = neg ? -9 : 1;
  let x = rng.randint(lo, 12);
  while (x === 0) x = rng.randint(lo, 12);
  let shown: string;
  let py: string;
  let expl: string;
  let wrong: number | Fraction | null;
  let diff: number;
  let tag: string;
  let disExtra: Distractor[] = [];
  if (kind === "one_step") {
    const form = rng.choice(["x+a", "x-a", "ax", "x:a"] as const);
    const a = rng.randint(2, 12);
    let c: number;
    let why: string;
    if (form === "x+a") {
      c = x + a;
      [shown, why] = [`x + ${a} = ${c}`, `מחסירים ${a} משני האגפים`];
      [wrong, py] = [c + a, `${c} - ${a}`];
    } else if (form === "x-a") {
      c = x - a;
      [shown, why] = [`x - ${a} = ${c}`, `מוסיפים ${a} לשני האגפים`];
      [wrong, py] = [c - a, `${c} + ${a}`];
    } else if (form === "ax") {
      c = a * x;
      [shown, why] = [`${a}x = ${c}`, `מחלקים את שני האגפים ב־${a}`];
      [wrong, py] = [c - a, `${c} // ${a}`];
    } else {
      x = a * rng.randint(1, 9);
      c = floorDiv(x, a);
      [shown, why] = [`x : ${a} = ${c}`, `כופלים את שני האגפים ב־${a}`];
      py = `${c} * ${a}`;
      wrong = null;
    }
    expl = `${why}: ${ltr(`x = ${x}`)}. בודקים: מציבים ${x} ומקבלים ${c}.`;
    diff = -0.5 + 0.2 * B(form === "ax" || form === "x:a");
    tag = "equation_inverse_op";
  } else if (kind === "two_step") {
    const a = rng.randint(2, 9);
    const r1 = rng.randint(1, 20);
    const bb = r1 * rng.choice(neg ? [1, -1] : [1]);
    const c = a * x + bb;
    const bs = bb >= 0 ? `+ ${bb}` : `- ${-bb}`;
    shown = `${a}x ${bs} = ${c}`;
    py = `(${c} - (${bb})) // ${a}`;
    const step1 = `${a}x = ${c - bb}`;
    expl =
      `קודם מבטלים את ה־${Math.abs(bb)}: ${ltr(step1)}. אחר כך מחלקים ב־${a}:` + ` ${ltr(`x = ${x}`)}. בודקים: ` + `${ltr(`${a} × ${paren(x)} ${bs} = ${c}`)}.`;
    const w = F(c + bb, a);
    wrong = w.isInt() ? w : null;
    const alt = F(c, a).sub(bb);
    diff = 0.0 + 0.3 * B(neg);
    tag = "equation_inverse_op";
    disExtra = [[alt.isInt() ? alt : null, "equation_divide_first"]];
  } else {
    // both sides: ax + b = cx + d
    const a = rng.randint(3, 9);
    const c2 = rng.randint(1, a - 1);
    const bb = rng.randint(-10, 10);
    const d = (a - c2) * x + bb;
    const bs = bb >= 0 ? `+ ${bb}` : `- ${-bb}`;
    const ds = d >= 0 ? `+ ${d}` : `- ${-d}`;
    const cx = c2 === 1 ? "x" : `${c2}x`;
    shown = `${a}x ${bs} = ${cx} ${ds}`;
    py = `(${d} - (${bb})) // (${a} - ${c2})`;
    expl = `מעבירים את ה־x לאגף אחד: ${ltr(`${a - c2}x = ${d - bb}`)}. ` + `מחלקים ב־${a - c2}: ${ltr(`x = ${x}`)}.`;
    const w = F(d - bb, a + c2);
    wrong = w.isInt() ? w : null;
    diff = 0.4;
    tag = "equation_inverse_op";
    disExtra = [[pyMod(d + bb, a - c2) === 0 ? F(d + bb, a - c2) : null, "equation_inverse_op"]];
  }
  if (kind === "one_step") disExtra = [];
  return numericQuestion(rng, ctx, params, {
    item_id: `algebra.equation:${shown.split(" ").join("")}`,
    prompt_he: `פתרו את המשוואה: ${ltr(shown)}. כמה זה x?`,
    prompt_en: `Solve: ${shown}. What is x?`,
    answer: x,
    distractors: [[wrong, tag], ...disExtra, [-x, "negative_sign_error"], [x + 1, null]],
    explanation_he: expl,
    difficulty: diff,
    allow_negative: neg,
    calc: py,
  });
});

register("algebra.substitute", (rng, params, ctx) => {
  const v = rng.choice(["a", "b", "n", "x", "y"]);
  const val = rng.randint(2, 9);
  const form = rng.choice(["ax+b", "a(x+b)", "x2+b", "ax-b"] as const);
  const a = rng.randint(2, 9);
  let bb = rng.randint(1, 12);
  let shown: string;
  let res: number;
  let wrong: number;
  let tag: string;
  let step: string;
  if (form === "ax+b") {
    [shown, res] = [`${a}${v} + ${bb}`, a * val + bb];
    [wrong, tag] = [Number(`${a}${val}`) + bb, "substitute_concat"];
    step = `${a} × ${val} + ${bb} = ${a * val} + ${bb} = ${res}`;
  } else if (form === "ax-b") {
    bb = Math.min(bb, a * val);
    [shown, res] = [`${a}${v} - ${bb}`, a * val - bb];
    [wrong, tag] = [Number(`${a}${val}`) - bb, "substitute_concat"];
    step = `${a} × ${val} - ${bb} = ${a * val} - ${bb} = ${res}`;
  } else if (form === "a(x+b)") {
    [shown, res] = [`${a}(${v} + ${bb})`, a * (val + bb)];
    [wrong, tag] = [a * val + bb, "parens_ignored"];
    step = `${a} × (${val} + ${bb}) = ${a} × ${val + bb} = ${res}`;
  } else {
    [shown, res] = [`${v}² + ${bb}`, val * val + bb];
    [wrong, tag] = [2 * val + bb, "power_as_multiply"];
    step = `${val} × ${val} + ${bb} = ${val * val} + ${bb} = ${res}`;
  }
  return numericQuestion(rng, ctx, params, {
    item_id: `algebra.substitute:${shown.split(" ").join("")}@${val}`,
    prompt_he: `מה הערך של ${ltr(shown)} כאשר ${ltr(`${v} = ${val}`)}?`,
    prompt_en: `Evaluate ${shown} when ${v} = ${val}.`,
    answer: res,
    distractors: [
      [wrong, tag],
      [res + 1, null],
      [res - a, null],
    ],
    explanation_he: `מציבים ${val} במקום ${v}: ${ltr(step)}.`,
    difficulty: -0.2 + 0.3 * B(form === "a(x+b)" || form === "x2+b"),
    calc: step.split("=")[0]!.split("×").join("*"),
  });
});

register("algebra.linear", (rng, params, ctx) => {
  let kind = String(pget(params, "kind", "value"));
  if (kind === "mixed") kind = rng.choice(["value", "slope", "intercept", "two_points"]);
  const m = nz(rng, -5, 6);
  const bb = rng.randint(-9, 9);
  const bs = bb === 0 ? "" : bb > 0 ? ` + ${bb}` : ` - ${-bb}`;
  const mx = m === 1 ? "x" : m === -1 ? "-x" : `${m}x`;
  const rule = `y = ${mx}${bs}`;
  if (kind === "value") {
    const x = rng.randint(-4, 6);
    const y = m * x + bb;
    return numericQuestion(rng, ctx, params, {
      item_id: `algebra.linear:value:${rule}@${x}`,
      prompt_he: `נתונה הפונקציה ${ltr(`f(x) = ${mx}${bs}`)}. ` + `כמה זה ${ltr(`f(${x})`)}?`,
      prompt_en: `f(x) = ${mx}${bs}. What is f(${x})?`,
      answer: y,
      distractors: [
        [m + x + bb, "add_instead_of_mul"],
        [y ? -y : null, "negative_sign_error"],
        [m * x, null],
      ],
      explanation_he: `מציבים ${fmt(x)} במקום x: ` + `${ltr(`${m} × ${paren(x)}${bs} = ${m * x}${bs} = ${y}`)}.`,
      difficulty: -0.2 + 0.3 * B(x < 0 || m < 0),
      allow_negative: true,
      calc: `${m} * (${x}) + (${bb})`,
    });
  }
  if (kind === "slope" || kind === "intercept") {
    const ans = kind === "slope" ? m : bb;
    const other = kind === "slope" ? bb : m;
    const word = kind === "slope" ? "השיפוע" : "נקודת החיתוך עם ציר y";
    return numericQuestion(rng, ctx, params, {
      item_id: `algebra.linear:${kind}:${rule}`,
      prompt_he: `מה ${word} של הישר ${ltr(rule)}?`,
      prompt_en: `What is the ${kind} of ${rule}?`,
      answer: ans,
      distractors: [
        [other !== ans ? other : null, "slope_intercept_swap"],
        [ans ? -ans : null, "negative_sign_error"],
        [ans + 1, null],
      ],
      explanation_he:
        `בישר ${ltr("y = mx + b")}, המספר שליד x הוא ` + `השיפוע (${fmt(m)}), והמספר החופשי הוא נקודת ` + `החיתוך עם ציר y (${fmt(bb)}).`,
      difficulty: -0.1,
      allow_negative: true,
      calc: `${ans}`,
    });
  }
  const x1 = rng.randint(-3, 3);
  const x2 = x1 + rng.randint(1, 4);
  const y1 = m * x1 + bb;
  const y2 = m * x2 + bb;
  const swapped = y2 !== y1 ? F(x2 - x1, y2 - y1) : null;
  return numericQuestion(rng, ctx, params, {
    item_id: `algebra.linear:pts:(${x1},${y1})(${x2},${y2})`,
    prompt_he: `ישר עובר בנקודות ${ltr(`(${x1}, ${y1})`)} ו־` + `${ltr(`(${x2}, ${y2})`)}. מה השיפוע שלו?`,
    prompt_en: `Slope through (${x1}, ${y1}) and (${x2}, ${y2})?`,
    answer: m,
    distractors: [
      [swapped && !swapped.isZero() && swapped.isInt() ? swapped : null, "slope_intercept_swap"],
      [-m, "negative_sign_error"],
      [y2 - y1, null],
    ],
    explanation_he:
      `שיפוע = שינוי ב־y חלקי שינוי ב־x: ` + `${ltr(`(${y2} - ${paren(y1)}) : (${x2} - ${paren(x1)})`)}` + ` = ${ltr(`${y2 - y1} : ${x2 - x1} = ${m}`)}.`,
    difficulty: 0.5,
    allow_negative: true,
    calc: `F(${y2} - (${y1}), ${x2} - (${x1}))`,
  });
});
