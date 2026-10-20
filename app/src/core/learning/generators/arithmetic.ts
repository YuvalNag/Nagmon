/**
 * Whole-number arithmetic generators (kindergarten to grade 6), a
 * line-by-line port of `generators/arithmetic.py`: the same randomness
 * calls in the same order, so a seed gives the same question.
 */
import { F, Fraction } from "../fraction";
import { makeFigure, type Question } from "../model";
import type { PyRandom } from "../random";
import { divmod, floorDiv, formatG, pyMod } from "../py";
import {
  asList,
  b,
  type Distractor,
  fmt,
  type GenContext,
  ltr,
  money,
  numericQuestion,
  type Opt,
  opt,
  optionsQuestion,
  type Params,
  pget,
  pint,
  pyInt,
  range,
  register,
  scale,
  trueFalseQuestion,
  zfill,
} from "./common";
import { NUMBER_WORDS_F, OBJECTS } from "./names";

export const PLACE_NAMES = ["אחדות", "עשרות", "מאות", "אלפים", "עשרות אלפים", "מאות אלפים", "מיליונים"] as const;
export const PLACE_DEF = ["האחדות", "העשרות", "המאות", "האלפים", "עשרות האלפים", "מאות האלפים", "המיליונים"] as const;

/** Digits from the ones place up. */
export function digits(n: number, width = 0): number[] {
  return Array.from(String(n).padStart(width, "0"))
    .reverse()
    .map((c) => Number(c));
}

export function fromDigits(ds: readonly number[]): number {
  return ds.reduce((acc, d, i) => acc + d * 10 ** i, 0);
}

const sum = (xs: readonly number[]): number => xs.reduce((a, x) => a + x, 0);

// --------------------------------------------------------------------------
// Counting and number sense
// --------------------------------------------------------------------------

register("arithmetic.count", (rng, params, ctx) => {
  const mx = pint(params, "max", 10);
  const mn = Math.max(2, pint(params, "min", 2));
  const [code, , plural] = rng.choice(OBJECTS);
  const n = rng.randint(mn, mx);
  const seq = range(1, n + 1).join(", ");
  let expl = `סופרים כל אחד פעם אחת בלבד: ${seq}. יש ${n} ${plural}.`;
  if (expl.length > 200) expl = `סופרים כל אחד פעם אחת, ואפשר בקבוצות של 5. יש ${n} ${plural}.`;
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.count:${code}x${n}`,
    prompt_he: `כמה ${plural} יש בתמונה?`,
    prompt_en: "How many are there?",
    answer: n,
    distractors: [
      [n - 1, "off_by_one"],
      [n + 1, "off_by_one"],
      [n + 2, null],
    ],
    explanation_he: expl,
    difficulty: 0.9 * scale(n, mn, mx),
    figure: makeFigure("objects", { emoji: code, count: n }),
    calc: `${n}`,
    allow_negative: false,
  });
});

register("arithmetic.recognize", (rng, params, ctx) => {
  const mx = Math.min(pint(params, "max", 10), 10);
  const n = rng.randint(0, mx);
  const word = NUMBER_WORDS_F[n]!;
  const mode = rng.choice(["digit", "word"] as const);
  const itemId = `arithmetic.recognize:${mode}${n}`;
  const counted = NUMBER_WORDS_F.slice(1, n + 1);
  const expl = `המספר ${n} נקרא "${word}". סופרים: ` + (counted.length ? counted : ["אפס"]).join(", ") + ".";
  if (mode === "digit") {
    const shape: Record<number, number> = { 6: 9, 9: 6 };
    return numericQuestion(rng, ctx, params, {
      item_id: itemId,
      prompt_he: `בחרו את המספר ${word}`,
      prompt_en: `Choose the number ${n}`,
      answer: n,
      distractors: [
        [n + 1, "number_neighbor"],
        [n - 1, "number_neighbor"],
        [shape[n] ?? null, "digit_shape"],
      ],
      explanation_he: expl,
      difficulty: 0.8 * scale(n, 0, 10),
      calc: `${n}`,
      choice_only: true,
    });
  }
  const others = [n - 1, n + 1, n + 2, n - 2].filter((i) => i >= 0 && i <= 10);
  return optionsQuestion(rng, ctx, {
    item_id: itemId,
    prompt_he: `איך קוראים למספר ${n}?`,
    prompt_en: `How do we say ${n}?`,
    correct: opt(word),
    distractors: others.map((i) => opt(NUMBER_WORDS_F[i]!, { tag: "number_neighbor" })),
    explanation_he: expl,
    difficulty: 0.8 * scale(n, 0, 10) + 0.2,
  });
});

register("arithmetic.compare", (rng, params, ctx) => {
  const mx = pint(params, "max", 10);
  let a = rng.randint(0, mx);
  let bb = rng.randint(0, mx);
  while (bb === a) bb = rng.randint(0, mx);
  if (mx >= 20 && rng.random() < 0.3) {
    // Different number of digits with a larger leading digit.
    const smallHi = rng.randint(2, 9);
    const big = rng.randint(10, Math.min(mx, 19 + 10 * b(mx >= 100)));
    [a, bb] = [smallHi, big];
  }
  const wantBig = rng.random() < 0.5;
  const right = wantBig ? Math.max(a, bb) : Math.min(a, bb);
  const wrong = wantBig ? Math.min(a, bb) : Math.max(a, bb);
  const word = wantBig ? "גדול" : "קטן";
  let tag: string | null = null;
  if (String(wrong).length !== String(right).length && String(wrong)[0]! > String(right)[0]!) tag = "compare_first_digit";
  let why: string;
  if (String(a).length !== String(bb).length) {
    why = `ל־${Math.max(a, bb)} יש יותר ספרות, ולכן הוא הגדול. ` + `${Math.min(a, bb)} קטן ממנו.`;
  } else if (Math.max(a, bb) < 10) {
    why = `${Math.max(a, bb)} בא אחרי ${Math.min(a, bb)} בספירה, ולכן הוא גדול יותר.`;
  } else {
    why = `משווים קודם את הספרה השמאלית (הגבוהה): ${Math.max(a, bb)} גדול ` + `מ־${Math.min(a, bb)}.`;
  }
  const [first, second] = rng.random() < 0.5 ? [a, bb] : [bb, a];
  return optionsQuestion(rng, ctx, {
    item_id: `arithmetic.compare:${first},${second}:${word}`,
    prompt_he: `איזה מספר ${word} יותר: ${first} או ${second}?`,
    prompt_en: (wantBig ? "Which is bigger" : "Which is smaller") + `: ${first} or ${second}?`,
    correct: opt(String(right)),
    distractors: [opt(String(wrong), { tag })],
    explanation_he: `${why} התשובה: ${right}.`,
    difficulty: -0.5 + 0.6 * scale(Math.min(a, bb), 0, mx) + 0.5 * b(Math.abs(a - bb) <= 2),
    calc: `${right}`,
    n: 2,
    shuffle: false,
  });
});

register("arithmetic.neighbors", (rng, params, ctx) => {
  const mx = pint(params, "max", 100);
  const n = rng.randint(2, mx - 2);
  const mode = rng.choice(["after", "before", "between"] as const);
  let prompt: string;
  let ans: number;
  let wrong: number;
  let expl: string;
  if (mode === "after") {
    [prompt, ans, wrong] = [`איזה מספר בא מיד אחרי ${n}?`, n + 1, n - 1];
    expl = `אחרי ${n} בא המספר הגדול ממנו ב־1: ${ltr(`${n} + 1 = ${n + 1}`)}.`;
  } else if (mode === "before") {
    [prompt, ans, wrong] = [`איזה מספר בא מיד לפני ${n}?`, n - 1, n + 1];
    expl = `לפני ${n} בא המספר הקטן ממנו ב־1: ${ltr(`${n} - 1 = ${n - 1}`)}.`;
  } else {
    [prompt, ans, wrong] = [`איזה מספר נמצא בין ${n - 1} ל־${n + 1}?`, n, n + 2];
    expl = `סופרים: ${n - 1}, ${n}, ${n + 1}. באמצע נמצא ${n}.`;
  }
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.neighbors:${mode}${n}`,
    prompt_he: prompt,
    answer: ans,
    distractors: [
      [wrong, "before_after"],
      [ans + 10, "place_value_confusion"],
      [ans - 10, "place_value_confusion"],
      [ans + 2, "off_by_one"],
    ],
    explanation_he: expl,
    difficulty: -0.4 + 0.8 * scale(n, 0, mx) + 0.3 * b(n % 10 === 0 || n % 10 === 9),
    calc: `${ans}`,
  });
});

// --------------------------------------------------------------------------
// Addition and subtraction
// --------------------------------------------------------------------------

/** Steps text, number of carries, and the 'forgot to carry' value. */
export function columnAdd(a: number, bv: number): [string[], number, number] {
  const width = Math.max(String(a).length, String(bv).length);
  const da = digits(a, width);
  const db = digits(bv, width);
  let carry = 0;
  const steps: string[] = [];
  let carries = 0;
  const noCarry: number[] = [];
  for (let i = 0; i < width; i++) {
    const s = da[i]! + db[i]! + carry;
    const expr = `${da[i]} + ${db[i]}` + (carry ? " + 1" : "");
    const name = PLACE_NAMES[i]!;
    noCarry.push((da[i]! + db[i]!) % 10);
    if (s >= 10 && i < width - 1) {
      steps.push(`${name}: ${ltr(`${expr} = ${s}`)}, כותבים ${s % 10} ומעבירים 1`);
      carries += 1;
      carry = 1;
    } else {
      steps.push(`${name}: ${ltr(`${expr} = ${s}`)}`);
      if (s >= 10) carries += 1;
      carry = 0;
    }
  }
  return [steps, carries, fromDigits(noCarry)];
}

register("arithmetic.add", (rng, params, ctx) => {
  const maxSum = pint(params, "max_sum", 10);
  const minSum = pint(params, "min_sum", 2);
  const carryRule = pget(params, "carry", "allowed");
  let a = 1;
  let bv = 1;
  for (let it = 0; it < 200; it++) {
    const s = rng.randint(minSum, maxSum);
    const lo = maxSum <= 20 ? 1 : 10 ** (String(maxSum).length - 2);
    if (s - lo < lo) continue;
    a = rng.randint(lo, s - lo);
    bv = s - a;
    const carries = columnAdd(a, bv)[1];
    if (carryRule === "none" && carries) continue;
    if (carryRule === "required" && !carries) continue;
    break;
  }
  const s = a + bv;
  const [steps, carries, forgot] = columnAdd(a, bv);
  const expr = ltr(`${a} + ${bv}`);
  let expl: string;
  if (s <= 10) {
    const counted = range(a + 1, s + 1).join(", ");
    expl = `מתחילים ב־${a} וסופרים עוד ${bv}: ${counted}. התשובה ${s}.`;
  } else if (s <= 20 && Math.max(a, bv) < 10) {
    const big = Math.max(a, bv);
    const small = Math.min(a, bv);
    const need = 10 - big;
    expl = `משלימים לעשר: ${ltr(`${big} + ${need} = 10`)}, ונשאר ` + `${small - need}. ${ltr(`10 + ${small - need} = ${s}`)}.`;
  } else {
    expl = `${expr} במאונך. ` + steps.join(". ") + `. התשובה ${s}.`;
  }
  let figure = null;
  if (maxSum <= 10) {
    const code = OBJECTS[(a * 7 + bv) % OBJECTS.length]![0];
    figure = makeFigure("objects", { emoji: code, groups: [a, bv] });
  }
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.add:${a}+${bv}`,
    prompt_he: `כמה זה ${expr}?`,
    prompt_en: `What is ${a} + ${bv}?`,
    answer: s,
    distractors: [
      [carries ? forgot : null, "forgot_carry"],
      [Math.abs(a - bv), "sub_instead_of_add"],
      [s - 1, "off_by_one"],
      [s + 1, "off_by_one"],
      [s + 10, null],
    ],
    explanation_he: expl,
    difficulty: -0.8 + 0.45 * carries + (0.7 * s) / maxSum,
    figure,
    speak: { he: `כמה זה ${a} ועוד ${bv}?`, en: `What is ${a} plus ${bv}?` },
    calc: { expr: `${a} + ${bv}`, a, b: bv },
  });
});

/** Steps, borrows, 'smaller from larger' value, 'borrow not reduced'. */
export function columnSub(a: number, bv: number): [string[], number, number, number] {
  const width = String(a).length;
  const da = digits(a, width);
  const db = digits(bv, width);
  const steps: string[] = [];
  let borrows = 0;
  const work = [...da];
  for (let i = 0; i < width; i++) {
    const name = PLACE_NAMES[i]!;
    if (work[i]! < db[i]!) {
      borrows += 1;
      let j = i + 1;
      while (work[j] === 0) {
        work[j] = 9;
        j += 1;
      }
      work[j]! -= 1;
      const top = work[i]! + 10;
      steps.push(`${name}: ${work[i]} קטן מ־${db[i]}, פורטים: ` + `${ltr(`${top} - ${db[i]} = ${top - db[i]!}`)}`);
      work[i] = top;
    } else {
      const res = work[i]! - db[i]!;
      if (i === width - 1 && res === 0 && width > 1) steps.push(`${name}: ${ltr(`${work[i]} - ${db[i]} = 0`)}`);
      else if (work[i] || db[i] || i < width - 1) steps.push(`${name}: ${ltr(`${work[i]} - ${db[i]} = ${res}`)}`);
    }
  }
  const smaller = fromDigits(da.map((x, i) => Math.abs(x - db[i]!)));
  const nr = fromDigits(range(width).map((i) => (da[i]! < db[i]! ? da[i]! + 10 - db[i]! : da[i]! - db[i]!)));
  return [steps, borrows, smaller, nr];
}

register("arithmetic.sub", (rng, params, ctx) => {
  const mx = pint(params, "max", 10);
  const mn = pint(params, "min", 2);
  const rule = pget(params, "borrow", "allowed");
  const top = mx >= 100 ? mx - 1 : mx;
  let a = 2;
  let bv = 1;
  for (let it = 0; it < 200; it++) {
    a = rng.randint(Math.max(mn, 2), top);
    const lo = mx <= 20 ? 1 : 10 ** (String(mx).length - 2);
    if (lo > a - 1) continue;
    bv = rng.randint(lo, a - 1);
    const borrows = columnSub(a, bv)[1];
    if (rule === "none" && borrows) continue;
    if (rule === "required" && !borrows) continue;
    break;
  }
  const d = a - bv;
  const [steps, borrows, smaller, nr] = columnSub(a, bv);
  const expr = ltr(`${a} - ${bv}`);
  let expl: string;
  if (a <= 10) {
    const back = range(a - 1, d - 1, -1).join(", ");
    expl = `מתחילים ב־${a} וסופרים ${bv} אחורה: ${back}. התשובה ${d}.`;
  } else if (a <= 20 && bv < 10 && a - 10 < bv) {
    const first = a - 10;
    expl = `מורידים ${first} ומגיעים ל־10, ואז עוד ${bv - first}: ` + `${ltr(`10 - ${bv - first} = ${d}`)}.`;
  } else {
    expl = `${expr} במאונך. ` + steps.join(". ") + `. התשובה ${d}.`;
    if (expl.length > 200) {
      expl = `${expr}: בודקים בחיבור. ${ltr(`${bv} + ${d} = ${a}`)}, ` + `ולכן התשובה ${d}. ` + steps.slice(0, 2).join(". ") + ".";
    }
  }
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.sub:${a}-${bv}`,
    prompt_he: `כמה זה ${expr}?`,
    prompt_en: `What is ${a} - ${bv}?`,
    answer: d,
    distractors: [
      [borrows ? smaller : null, "smaller_from_larger"],
      [borrows && nr !== smaller ? nr : null, "borrow_not_reduced"],
      [a + bv, "add_instead_of_sub"],
      [d + 1, "off_by_one"],
      [d - 1, "off_by_one"],
    ],
    explanation_he: expl,
    difficulty: -0.7 + 0.5 * borrows + (0.7 * a) / mx,
    speak: { he: `כמה זה ${a} פחות ${bv}?`, en: `What is ${a} minus ${bv}?` },
    calc: { expr: `${a} - ${bv}`, a, b: bv },
  });
});

register("arithmetic.missing_addend", (rng, params, ctx) => {
  const maxSum = pint(params, "max_sum", 10);
  const c = rng.randint(3, maxSum);
  const a = rng.randint(1, c - 1);
  const x = c - a;
  const expr = ltr(`${a} + __ = ${c}`);
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.missing_addend:${a}+?=${c}`,
    prompt_he: `איזה מספר חסר? ${expr}`,
    prompt_en: `What number is missing? ${a} + __ = ${c}`,
    answer: x,
    distractors: [
      [a + c, "added_instead"],
      [x + 1, "off_by_one"],
      [x - 1, "off_by_one"],
      [c, null],
    ],
    explanation_he: `כמה צריך להוסיף ל־${a} כדי להגיע ל־${c}? ` + `${ltr(`${c} - ${a} = ${x}`)}. בודקים: ` + `${ltr(`${a} + ${x} = ${c}`)}.`,
    difficulty: -0.3 + (0.8 * c) / maxSum,
    calc: `${c} - ${a}`,
  });
});

register("arithmetic.even_odd", (rng, params, ctx) => {
  const mx = pint(params, "max", 20);
  const n = rng.randint(1, mx);
  const even = n % 2 === 0;
  const [right, wrong] = even ? ["זוגי", "אי־זוגי"] : ["אי־זוגי", "זוגי"];
  const last = n % 10;
  let tag: string | null = null;
  if (n >= 10 && (Number(String(n)[0]) % 2) !== last % 2) tag = "even_odd_first_digit";
  let why: string;
  if (n <= 10) why = even ? `את ${n} אפשר לחלק לזוגות בלי שארית.` : `כשמחלקים את ${n} לזוגות, נשאר אחד בלי זוג.`;
  else why = `מסתכלים רק על ספרת האחדות: ${last}. ` + `${last} ${even ? "זוגי" : "אי־זוגי"}.`;
  return optionsQuestion(rng, ctx, {
    item_id: `arithmetic.even_odd:${n}`,
    prompt_he: `האם המספר ${n} זוגי או אי־זוגי?`,
    prompt_en: `Is ${n} even or odd?`,
    correct: opt(right, { en: even ? "even" : "odd" }),
    distractors: [opt(wrong, { en: even ? "odd" : "even", tag })],
    explanation_he: `${why} לכן ${n} ${right}.`,
    difficulty: -0.6 + 0.8 * scale(n, 1, mx) + 0.4 * b(tag !== null),
    n: 2,
    shuffle: false,
  });
});

register("arithmetic.place_value", (rng, params, ctx) => {
  const mx = pint(params, "max", 99);
  const mn = Math.max(10, pint(params, "min", 10));
  let n = 0;
  let ds: number[] = [];
  let pos = 0;
  let d = 0;
  let found = false;
  for (let it = 0; it < 100; it++) {
    n = rng.randint(mn, mx);
    ds = digits(n);
    pos = rng.randrange(ds.length);
    d = ds[pos]!;
    if (d !== 0 && ds.filter((x) => x === d).length === 1) {
      found = true;
      break;
    }
  }
  if (!found) [n, ds, pos, d] = [47, [7, 4], 1, 4];
  const value = d * 10 ** pos;
  const mode = pos >= 1 ? rng.choice(["value", "count"] as const) : "value";
  const parts = ds
    .map((x, i) => [i, x] as const)
    .reverse()
    .filter(([, x]) => x)
    .map(([i, x]) => `${x} ${PLACE_NAMES[i]}`)
    .join(", ");
  let prompt: string;
  let ans: number;
  let expl: string;
  let dis: Distractor[];
  if (mode === "value") {
    prompt = `מה הערך של הספרה ${d} במספר ${fmt(n)}?`;
    ans = value;
    expl = `${fmt(n)} = ${parts}. הספרה ${d} במקום ${PLACE_DEF[pos]}, ` + `ולכן ערכה ${fmt(value)}.`;
    dis = [
      [d, "place_value_confusion"],
      [value * 10, "place_value_confusion"],
      [pos >= 2 ? floorDiv(value, 10) : null, "place_value_confusion"],
    ];
  } else {
    prompt = `איזו ספרה נמצאת במקום ${PLACE_DEF[pos]} במספר ${fmt(n)}?`;
    ans = d;
    const others = ds.filter((x) => x !== d);
    expl = `${fmt(n)} = ${parts}. במקום ${PLACE_DEF[pos]} נמצאת הספרה ${d}.`;
    dis = others.slice(0, 3).map((o) => [o, "place_value_confusion"] as const);
  }
  if (expl.length > 200) {
    expl = `מונים מקומות מימין: אחדות, עשרות, מאות... ` + `הספרה ${d} במקום ${PLACE_DEF[pos]}. התשובה ${fmt(ans)}.`;
  }
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.place_value:${n}@${pos}:${mode}`,
    prompt_he: prompt,
    answer: ans,
    distractors: dis,
    explanation_he: expl,
    difficulty: -0.4 + 0.25 * pos + 0.3 * b(mode === "value"),
    calc: `${ans}`,
  });
});

register("arithmetic.rounding", (rng, params, ctx) => {
  const tos = asList<unknown>(params["to"], [10]);
  const to = pyInt(rng.choice(tos));
  const mx = pint(params, "max", 1000);
  let n = rng.randint(to + 1, mx);
  while (n % to === 0) n = rng.randint(to + 1, mx);
  const down = n - (n % to);
  const up = down + to;
  const ans = n % to >= floorDiv(to, 2) ? up : down;
  const names: Record<number, string> = { 10: "עשרות", 100: "מאות", 1000: "אלפים", 10000: "עשרות אלפים" };
  const digit = floorDiv(n % to, floorDiv(to, 10));
  const other = to !== 10 ? 10 : 100;
  const wrongPlace = floorDiv(n + floorDiv(other, 2), other) * other;
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.rounding:${n}~${to}`,
    prompt_he: `עגלו את ${fmt(n)} ל${names[to]} הקרובות.`,
    prompt_en: `Round ${n} to the nearest ${to}.`,
    answer: ans,
    distractors: [
      [ans === up ? down : null, "rounding_down_always"],
      [ans === down ? up : null, "rounding_up_always"],
      [wrongPlace !== ans ? wrongPlace : null, "rounding_wrong_place"],
      [ans + to, null],
    ],
    explanation_he:
      `${fmt(n)} נמצא בין ${fmt(down)} ל־${fmt(up)}. הספרה ` +
      `שקובעת היא ${digit}: ` +
      (digit >= 5 ? "5 ומעלה, ולכן מעגלים למעלה" : "פחות מ־5, ולכן מעגלים למטה") +
      `. התשובה ${fmt(ans)}.`,
    difficulty: -0.3 + (0.3 * String(to).length) / 2 + 0.4 * b(digit === 4 || digit === 5),
    calc: `${ans}`,
    step: to,
  });
});

// --------------------------------------------------------------------------
// Multiplication and division
// --------------------------------------------------------------------------

const EASY: Record<number, number> = { 0: -1.4, 1: -1.4, 10: -1.1, 2: -0.9, 5: -0.7 };

export function factDifficulty(a: number, bv: number): number {
  if (a in EASY || bv in EASY) return Math.min(EASY[a] ?? 0.0, EASY[bv] ?? 0.0);
  let d = -1.0 + 0.11 * (a + bv);
  if (a === bv) d -= 0.3;
  if (a === 9 || bv === 9) d -= 0.2;
  return d;
}

export function factExplanation(a: number, bv: number): string {
  const p = a * bv;
  if (a === 1 || bv === 1) return `כל מספר כפול 1 שווה לעצמו: ${ltr(`${a} × ${bv} = ${p}`)}.`;
  if (a === 10 || bv === 10) {
    const o = a === 10 ? bv : a;
    return `כופלים ב־10: מוסיפים 0 בסוף. ${ltr(`${o} × 10 = ${p}`)}.`;
  }
  if (a === 2 || bv === 2) {
    const o = a === 2 ? bv : a;
    return `פעמיים ${o} זה ${ltr(`${o} + ${o} = ${p}`)}.`;
  }
  if (a === 5 || bv === 5) {
    const o = a === 5 ? bv : a;
    return `${ltr(`5 × ${o}`)} זה חצי מ־${ltr(`10 × ${o} = ${10 * o}`)}` + `, כלומר ${p}.`;
  }
  if (a === 9 || bv === 9) {
    const o = a === 9 ? bv : a;
    return `${ltr(`9 × ${o} = 10 × ${o} - ${o}`)} = ` + `${ltr(`${10 * o} - ${o} = ${p}`)}.`;
  }
  return `${ltr(`${a} × ${bv} = ${a} × ${bv - 1} + ${a}`)} = ` + `${ltr(`${a * (bv - 1)} + ${a} = ${p}`)}.`;
}

register("arithmetic.mul_facts", (rng, params, ctx) => {
  const tables = asList<unknown>(params["tables"], range(2, 11)).map(pyInt);
  const maxFactor = pint(params, "max_factor", 10);
  const t = rng.choice(tables);
  const o = rng.randint(1, maxFactor);
  const [a, bv] = rng.random() < 0.5 ? [t, o] : [o, t];
  const p = a * bv;
  const lo = Math.min(a, bv);
  const hi = Math.max(a, bv);
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.mul_facts:${lo}x${hi}`,
    prompt_he: `כמה זה ${ltr(`${a} × ${bv}`)}?`,
    prompt_en: `What is ${a} × ${bv}?`,
    answer: p,
    distractors: [
      [a * (bv + 1), "table_neighbor"],
      [bv > 1 ? a * (bv - 1) : null, "table_neighbor"],
      [(a + 1) * bv, "table_neighbor"],
      [a + bv, "add_instead_of_mul"],
    ],
    explanation_he: factExplanation(a, bv),
    difficulty: factDifficulty(a, bv),
    speak: { he: `כמה זה ${a} כפול ${bv}?`, en: `What is ${a} times ${bv}?` },
    calc: { expr: `${a} * ${bv}`, a, b: bv },
  });
});

register("arithmetic.div_facts", (rng, params, ctx) => {
  const tables = asList<unknown>(params["tables"], range(2, 11)).map(pyInt);
  const d = rng.choice(tables);
  const q = rng.randint(1, pint(params, "max_factor", 10));
  const n = d * q;
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.div_facts:${n}/${d}`,
    prompt_he: `כמה זה ${ltr(`${n} : ${d}`)}?`,
    prompt_en: `What is ${n} ÷ ${d}?`,
    answer: q,
    distractors: [
      [q + 1, "table_neighbor"],
      [q - 1, "table_neighbor"],
      [n - d, "div_sub_confusion"],
    ],
    explanation_he:
      `חילוק הוא הפוך לכפל: איזה מספר כפול ${d} נותן ${n}? ` + `${ltr(`${q} × ${d} = ${n}`)}, ולכן ` + `${ltr(`${n} : ${d} = ${q}`)}.`,
    difficulty: factDifficulty(d, q) + 0.3,
    speak: { he: `כמה זה ${n} לחלק ל${d}?` },
    calc: `${n} // ${d}`,
  });
});

export function randDigits(rng: PyRandom, k: number): number {
  return rng.randint(10 ** (k - 1), 10 ** k - 1);
}

register("arithmetic.mul_multi", (rng, params, ctx) => {
  const ka = pint(params, "a_digits", 2);
  const kb = pint(params, "b_digits", 1);
  const a = randDigits(rng, ka);
  const bv = kb > 1 ? randDigits(rng, kb) : rng.randint(2, 9);
  const p = a * bv;
  const dis: Distractor[] = [];
  let expl: string;
  if (kb === 1) {
    const da = digits(a);
    const forgot = fromDigits(da.map((x) => (x * bv) % 10));
    const concat = Number([...da].reverse().map((x) => String(x * bv)).join(""));
    dis.push([forgot, "forgot_carry"], [concat, "concat_products"]);
    let carry = 0;
    const parts: string[] = [];
    for (const x of da) {
      const s = x * bv + carry;
      const plus = carry ? ` + ${carry}` : "";
      parts.push(`${ltr(`${x} × ${bv}${plus} = ${s}`)}`);
      carry = floorDiv(s, 10);
    }
    expl = "כופלים כל ספרה, מהאחדות: " + parts.join(", ") + ` (כותבים את האחדות ומעבירים את השאר). התשובה ${fmt(p)}.`;
  } else {
    const tens = floorDiv(bv, 10) * 10;
    const ones = bv % 10;
    dis.push([a * floorDiv(bv, 10) + a * ones, "partial_product_shift"], [a * tens, null]);
    expl = `מפרקים: ${ltr(`${a} × ${bv} = ${a} × ${tens} + ${a} × ${ones}`)}` + ` = ${ltr(`${fmt(a * tens)} + ${fmt(a * ones)} = ${fmt(p)}`)}.`;
  }
  dis.push([p + 10, null], [p - 10, null], [a + bv, "add_instead_of_mul"]);
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.mul_multi:${a}x${bv}`,
    prompt_he: `כמה זה ${ltr(`${a} × ${bv}`)}?`,
    prompt_en: `What is ${a} × ${bv}?`,
    answer: p,
    distractors: dis,
    explanation_he: expl,
    difficulty: -0.6 + 0.35 * (ka + kb - 3) + (0.6 * p) / 10 ** (ka + kb),
    calc: { expr: `${a} * ${bv}`, a, b: bv },
    step: 10,
  });
});

register("arithmetic.div_remainder", (rng, params, ctx) => {
  const d = rng.randint(2, pint(params, "max_divisor", 9));
  const q = rng.randint(1, pint(params, "max_quotient", 10));
  const r = rng.randint(1, d - 1);
  const n = d * q + r;
  const mode = rng.choice(["full", "remainder"] as const);
  const expl =
    `הכפולה הגדולה של ${d} שלא עוברת את ${n} היא ` +
    `${ltr(`${q} × ${d} = ${d * q}`)}. נשאר ` +
    `${ltr(`${n} - ${d * q} = ${r}`)}. כלומר ${q} ושארית ${r}.`;
  if (mode === "remainder") {
    return numericQuestion(rng, ctx, params, {
      item_id: `arithmetic.div_remainder:${n}/${d}:r`,
      prompt_he: `מה השארית כשמחלקים ${n} ב־${d}?`,
      prompt_en: `What is the remainder of ${n} ÷ ${d}?`,
      answer: r,
      distractors: [
        [q !== r ? q : null, "remainder_quotient_swap"],
        [d - r !== r ? d - r : null, null],
        [r + d, "remainder_too_big"],
      ],
      explanation_he: expl,
      difficulty: 0.0 + 0.4 * scale(n, 3, 100),
      calc: `${n} % ${d}`,
    });
  }
  const text = (qq: number, rr: number): string => (rr ? `${qq} ושארית ${rr}` : `${qq} בלי שארית`);
  const dis: Opt[] = [opt(text(q, 0), { tag: "remainder_ignored" }), opt(text(q + 1, r), { tag: "off_by_one" })];
  if (q > 1) dis.push(opt(text(q - 1, r + d), { tag: "remainder_too_big" }));
  if (r !== q) dis.push(opt(text(r, q), { tag: "remainder_quotient_swap" }));
  return optionsQuestion(rng, ctx, {
    item_id: `arithmetic.div_remainder:${n}/${d}:full`,
    prompt_he: `כמה זה ${ltr(`${n} : ${d}`)}?`,
    prompt_en: `What is ${n} ÷ ${d}?`,
    correct: opt(text(q, r)),
    distractors: dis,
    explanation_he: expl,
    difficulty: 0.2 + 0.4 * scale(n, 3, 100),
    calc: `divmod(${n}, ${d})`,
  });
});

register("arithmetic.div_long", (rng, params, ctx) => {
  const k = pint(params, "dividend_digits", 3);
  const lo = 10 ** (k - 1);
  const hi = 10 ** k - 1;
  let d = 0;
  let q = 0;
  let n = 0;
  let found = false;
  for (let it = 0; it < 200; it++) {
    d = rng.randint(2, 9);
    if (rng.random() < 0.35) {
      // Force a zero in the quotient.
      q = rng.randint(1, 9) * 100 + rng.randint(1, 9);
      if (k === 3) q = rng.random() < 0.5 ? rng.randint(1, 9) * 10 + 0 : q;
    } else {
      q = rng.randint(Math.max(floorDiv(lo, d), 2), floorDiv(hi, d));
    }
    n = d * q;
    if (lo <= n && n <= hi) {
      found = true;
      break;
    }
  }
  if (!found) [d, q, n] = [4, 171, 684];
  const steps: string[] = [];
  let cur = 0;
  let started = false;
  for (const ch of String(n)) {
    cur = cur * 10 + Number(ch);
    if (cur < d && !started) continue;
    started = true;
    const [qd, rem] = divmod(cur, d);
    steps.push(`${ltr(`${cur} : ${d} = ${qd}`)}` + (rem ? ` (שארית ${rem})` : ""));
    cur = rem;
  }
  let expl = "מחלקים בשלבים משמאל: " + steps.join(", ") + `. התשובה ${q}.`;
  if (expl.length > 200) expl = `מחלקים בשלבים משמאל, ספרה אחר ספרה. בודקים: ` + `${ltr(`${q} × ${d} = ${n}`)}. התשובה ${q}.`;
  const noZero = String(q).includes("0") ? Number(String(q).split("0").join("")) : null;
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.div_long:${n}/${d}`,
    prompt_he: `כמה זה ${ltr(`${n} : ${d}`)}?`,
    prompt_en: `What is ${n} ÷ ${d}?`,
    answer: q,
    distractors: [
      [noZero, "quotient_zero_dropped"],
      [q + 10, null],
      [q - 10, null],
      [q + 1, "off_by_one"],
    ],
    explanation_he: expl,
    difficulty: -0.3 + 0.4 * (k - 3) + 0.5 * b(noZero !== null) + 0.03 * d,
    calc: `${n} // ${d}`,
  });
});

type OpsForm = "a+b*c" | "a*b+c" | "a-b*c" | "(a+b)*c" | "a*(b-c)" | "a+b*c-d" | "a:b+c*d";

register("arithmetic.order_ops", (rng, params, ctx) => {
  const level = pint(params, "level", 1);
  let a = rng.randint(2, 9);
  let bv = rng.randint(2, 9);
  let c = rng.randint(2, 9);
  const form = rng.choice<OpsForm>(level === 1 ? ["a+b*c", "a*b+c", "a-b*c"] : ["(a+b)*c", "a*(b-c)", "a+b*c-d", "a:b+c*d"]);
  const d = rng.randint(2, 6);
  if (form === "a-b*c") a = bv * c + rng.randint(1, 20);
  if (form === "a*(b-c)" && bv <= c) [bv, c] = [c + 1, bv];
  if (form === "a:b+c*d") a = bv * rng.randint(2, 9);
  if (form === "a+b*c-d") a = a + d;
  const shown = {
    "a+b*c": `${a} + ${bv} × ${c}`,
    "a*b+c": `${a} × ${bv} + ${c}`,
    "a-b*c": `${a} - ${bv} × ${c}`,
    "(a+b)*c": `(${a} + ${bv}) × ${c}`,
    "a*(b-c)": `${a} × (${bv} - ${c})`,
    "a+b*c-d": `${a} + ${bv} × ${c} - ${d}`,
    "a:b+c*d": `${a} : ${bv} + ${c} × ${d}`,
  }[form];
  const py = shown.split("×").join("*").split(":").join("//");
  const ans = {
    "a+b*c": a + bv * c,
    "a*b+c": a * bv + c,
    "a-b*c": a - bv * c,
    "(a+b)*c": (a + bv) * c,
    "a*(b-c)": a * (bv - c),
    "a+b*c-d": a + bv * c - d,
    "a:b+c*d": floorDiv(a, bv) + c * d,
  }[form];
  let ltrEval: number;
  let steps: string;
  if (form === "a+b*c") {
    ltrEval = (a + bv) * c;
    steps = `קודם כפל: ${ltr(`${bv} × ${c} = ${bv * c}`)}, ואז ${ltr(`${a} + ${bv * c} = ${ans}`)}.`;
  } else if (form === "a*b+c") {
    steps = `קודם כפל: ${ltr(`${a} × ${bv} = ${a * bv}`)}, ואז ${ltr(`${a * bv} + ${c} = ${ans}`)}.`;
    ltrEval = a * (bv + c);
  } else if (form === "a-b*c") {
    ltrEval = (a - bv) * c;
    steps = `קודם כפל: ${ltr(`${bv} × ${c} = ${bv * c}`)}, ואז ${ltr(`${a} - ${bv * c} = ${ans}`)}.`;
  } else if (form === "(a+b)*c") {
    ltrEval = a + bv * c;
    steps = `קודם הסוגריים: ${ltr(`${a} + ${bv} = ${a + bv}`)}, ואז ${ltr(`${a + bv} × ${c} = ${ans}`)}.`;
  } else if (form === "a*(b-c)") {
    ltrEval = a * bv - c;
    steps = `קודם הסוגריים: ${ltr(`${bv} - ${c} = ${bv - c}`)}, ואז ${ltr(`${a} × ${bv - c} = ${ans}`)}.`;
  } else if (form === "a+b*c-d") {
    ltrEval = (a + bv) * c - d;
    steps = `קודם כפל: ${ltr(`${bv} × ${c} = ${bv * c}`)}. אחר כך משמאל ` + `לימין: ${ltr(`${a} + ${bv * c} - ${d} = ${ans}`)}.`;
  } else {
    ltrEval = (floorDiv(a, bv) + c) * d;
    steps =
      `קודם חילוק וכפל: ${ltr(`${a} : ${bv} = ${floorDiv(a, bv)}`)}, ` +
      `${ltr(`${c} × ${d} = ${c * d}`)}. ואז ` +
      `${ltr(`${floorDiv(a, bv)} + ${c * d} = ${ans}`)}.`;
  }
  const tag = form.includes("(") ? "parens_ignored" : "order_left_to_right";
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.order_ops:${shown.split(" ").join("")}`,
    prompt_he: `כמה זה ${ltr(shown)}?`,
    prompt_en: `What is ${shown}?`,
    answer: ans,
    distractors: [
      [ltrEval, tag],
      [ans + 1, null],
      [ans - 1, null],
      [ans + 10, null],
    ],
    explanation_he: steps,
    difficulty: -0.3 + 0.4 * (level - 1) + 0.3 * b(form === "a+b*c-d" || form === "a:b+c*d"),
    calc: py,
  });
});

// --------------------------------------------------------------------------
// Money, time, patterns
// --------------------------------------------------------------------------

export const COINS = [1, 2, 5, 10] as const;
export const SHOP: readonly (readonly [string, number, number])[] = [
  ["מחברת", 3, 15],
  ["ספר", 20, 80],
  ["כדור", 15, 60],
  ["משחק קופסה", 40, 150],
  ["עוגה", 25, 90],
  ["זר פרחים", 20, 70],
  ["קלמר", 10, 40],
  ["בקבוק מים", 3, 12],
  ["פאזל", 25, 120],
  ["צבעים", 8, 35],
];

register("arithmetic.money_count", (rng, params, ctx) => {
  const mx = pint(params, "max", 20);
  const coins: number[] = [];
  let total = 0;
  const countTarget = rng.randint(2, 5);
  while (coins.length < countTarget) {
    const fits = COINS.filter((x) => total + x <= mx);
    const c = rng.choice(fits.length ? fits : [1]);
    if (total + c > mx) break;
    coins.push(c);
    total += c;
  }
  coins.sort((x, y) => y - x);
  const expr = coins.join(" + ");
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.money_count:${coins.join("+")}`,
    prompt_he: "כמה שקלים יש כאן בסך הכול?",
    prompt_en: "How many shekels are there?",
    answer: total,
    distractors: [
      [coins.length !== total ? coins.length : null, "count_coins_not_value"],
      [total - coins[coins.length - 1]!, "off_by_one"],
      [total + 1, null],
    ],
    explanation_he: `מחברים את ערכי המטבעות, מהגדול לקטן: ` + `${ltr(`${expr} = ${total}`)} ₪.`,
    difficulty: -0.5 + (0.8 * total) / mx + 0.1 * coins.length,
    figure: makeFigure("objects", { coins, currency: "ILS" }),
    unit: " ₪",
    calc: expr,
  });
});

register("arithmetic.money_change", (rng, params, ctx) => {
  const mx = pint(params, "max", 100);
  const agorot = Boolean(pget(params, "agorot", false));
  const options = SHOP.filter((s) => s[1] < mx);
  const [name, lo, hi0] = rng.choice(options);
  const hi = Math.min(hi0, mx - 1);
  let price: Fraction = F(rng.randint(lo, hi));
  if (agorot && rng.random() < 0.6) price = price.add(F(rng.choice([10, 20, 50, 90]), 100));
  const bills = [10, 20, 50, 100, 200].filter((bl) => price.lt(bl) && bl <= Math.max(mx, 20));
  const paid = bills.length ? rng.choice(bills.slice(0, 2)) : 200;
  const change = F(paid).sub(price);
  const style = agorot ? "money" : "auto";
  const pr = money(price);
  const expr = `${fmt(paid, style)} - ${fmt(price, style)} = ${fmt(change, style)}`;
  let smaller: number | null = null;
  if (price.isInt() && change.isInt()) {
    const pInt = price.toInt();
    const [, borrows, sm] = columnSub(paid, pInt);
    smaller = borrows ? sm : null;
  }
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.money_change:${name}:${price}:${paid}`,
    prompt_he: `${name} עולה ${pr}. משלמים ${money(paid)}. כמה עודף מקבלים?`,
    prompt_en: `It costs ${formatG(price.toNumber())} ₪. You pay ${paid} ₪. Change?`,
    answer: change,
    distractors: [
      [price.add(paid), "change_added"],
      [smaller, "smaller_from_larger"],
      [change.add(1), "off_by_one"],
      [change.sub(1), "off_by_one"],
    ],
    explanation_he:
      `עודף = מה ששילמנו פחות המחיר: ${ltr(expr)} ₪. ` + `בודקים: ${ltr(`${fmt(price, style)} + ${fmt(change, style)} = ${paid}`)}.`,
    difficulty: -0.4 + (0.6 * price.toNumber()) / mx + 0.5 * b(!price.isInt()),
    style,
    unit: " ₪",
    calc: `${paid} - F(${price.n}, ${price.d})`,
  });
});

register("arithmetic.clock", (rng, params, ctx) => {
  const step = pint(params, "step", 60);
  const h = rng.randint(1, 12);
  const m = step < 60 ? rng.randrange(0, 60, step) : 0;
  const t = (hh: number, mm: number): string => `${pyMod(hh - 1, 12) + 1}:${zfill(mm, 2)}`;
  const right = t(h, m);
  const dis: Opt[] = [];
  const swappedH = floorDiv(m, 5);
  const swappedM = (h % 12) * 5;
  if (swappedH && !(swappedH === h && swappedM === m) && m % 5 === 0) dis.push(opt(t(swappedH, swappedM), { tag: "clock_hands_swapped" }));
  dis.push(opt(t(h + 1, m), { tag: m > 0 ? "clock_hour_off" : null }));
  dis.push(opt(t(h - 1, m), { tag: null }));
  if (step < 60) dis.push(opt(t(h, (m + 5 * rng.choice([1, 2])) % 60)));
  else dis.push(opt(t(h, 30)));
  let why: string;
  if (m === 0) why = `המחוג הארוך על 12, כלומר שעה עגולה. המחוג הקצר על ${h}. ` + `השעה ${right}.`;
  else if (m % 5 === 0) {
    why =
      `המחוג הקצר אחרי ${h} (לפני ${(h % 12) + 1}). המחוג הארוך על ` +
      `${floorDiv(m, 5)}, כלומר ${ltr(`${floorDiv(m, 5)} × 5 = ${m}`)} דקות. ` +
      `השעה ${right}.`;
  } else {
    why = `המחוג הקצר אחרי ${h}. המחוג הארוך ${m % 5} שנתות אחרי ` + `${m >= 5 ? floorDiv(m, 5) : 12}: ${m} דקות. השעה ${right}.`;
  }
  const stepDiff: Record<number, number> = { 60: -0.6, 30: -0.2, 15: 0.1, 5: 0.4, 1: 0.8 };
  return optionsQuestion(rng, ctx, {
    item_id: `arithmetic.clock:${right}`,
    prompt_he: "מה השעה בשעון?",
    prompt_en: "What time is it?",
    correct: opt(right),
    distractors: dis,
    explanation_he: why,
    difficulty: (stepDiff[step] ?? 0) + 0.2 * b(m > 30),
    figure: makeFigure("clock", { hour: h, minute: m }),
  });
});

register("arithmetic.pattern", (rng, params, ctx) => {
  const steps = asList<unknown>(params["steps"], [2, 5, 10]).map(pyInt);
  const kind = pget(params, "kind", "skip");
  let step = rng.choice(steps);
  let start = rng.random() < 0.6 ? step * rng.randint(0, 6) : rng.randint(1, 20);
  if (kind === "back") {
    start += step * 6;
    step = -step;
  }
  const terms = range(5).map((i) => start + i * step);
  const ans = terms[terms.length - 1]!;
  const prev = terms[terms.length - 2]!;
  const shown = terms.slice(0, -1).join(", ") + ", ?";
  const word = step > 0 ? "מוסיפים" : "מורידים";
  const sign = step > 0 ? "+" : "-";
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.pattern:${start}${step >= 0 ? "+" : ""}${step}`,
    prompt_he: `מה המספר הבא? ${shown}`,
    prompt_en: `What comes next? ${shown}`,
    answer: ans,
    distractors: [
      [ans + step, "sequence_off_step"],
      [ans - floorDiv(step, Math.abs(step)), "sequence_off_step"],
      [prev + 1, "sequence_off_step"],
    ],
    explanation_he: `בכל פעם ${word} ${Math.abs(step)}: ` + `${ltr(`${prev} ${sign} ${Math.abs(step)} = ${ans}`)}.`,
    difficulty: -0.4 + 0.08 * Math.abs(step) + 0.4 * b(step < 0) + 0.3 * b(pyMod(start, Math.abs(step)) !== 0),
    calc: `${prev} + (${step})`,
  });
});

register("arithmetic.divisibility", (rng, params, ctx) => {
  const divisors = asList<unknown>(params["divisors"], [2, 3, 5, 9, 10]).map(pyInt);
  const d = rng.choice(divisors);
  const truth = rng.random() < 0.5;
  let n = 0;
  for (let it = 0; it < 200; it++) {
    n = rng.randint(100, 9999);
    if ((n % d === 0) === truth) break;
  }
  const ds = Array.from(String(n)).map(Number);
  const s = sum(ds);
  let tag: string | null = null;
  let why: string;
  if (d === 3 || d === 9) {
    why = `סכום הספרות: ${ltr(ds.join(" + ") + ` = ${s}`)}. ` + `${s} ${s % d === 0 ? "מתחלק" : "לא מתחלק"} ב־${d}`;
    const lastD = ds[ds.length - 1]!;
    if (!truth && lastD % d === 0 && lastD !== 0) tag = "divisibility_last_digit";
  } else if (d === 2 || d === 5 || d === 10) {
    const last = ds[ds.length - 1]!;
    const rule = ({ 2: "זוגית", 5: "0 או 5", 10: "0" } as Record<number, string>)[d];
    why = `מתחלק ב־${d} אם ספרת האחדות ${rule}. ספרת האחדות היא ${last}`;
  } else if (d === 4) {
    const two = n % 100;
    why = `מתחלק ב־4 אם שתי הספרות האחרונות (${two}) מתחלקות ב־4: ` + `${two} ${two % 4 === 0 ? "מתחלק" : "לא מתחלק"}`;
    if (!truth && ds[ds.length - 1]! % 2 === 0) tag = "divisibility_last_digit";
  } else {
    why = `מתחלק ב־6 אם הוא זוגי וגם סכום ספרותיו (${s}) מתחלק ב־3`;
  }
  const diffs: Record<number, number> = { 2: -0.8, 10: -0.9, 5: -0.6, 3: 0.2, 9: 0.3, 4: 0.5, 6: 0.6 };
  return trueFalseQuestion(ctx, {
    item_id: `arithmetic.divisibility:${n}/${d}`,
    prompt_he: `האם ${n} מתחלק ב־${d} בלי שארית?`,
    prompt_en: `Is ${n} divisible by ${d}?`,
    truth: n % d === 0,
    explanation_he: `${why}. לכן התשובה: ${n % d === 0 ? "כן" : "לא"}.`,
    difficulty: diffs[d] ?? 0.0,
    wrong_tag: tag,
    meta: { calc: { divisible: n % d === 0 } },
  });
});

register("arithmetic.average", (rng, params, ctx) => {
  const k = rng.randint(3, pint(params, "count", 4));
  const mx = pint(params, "max", 20);
  const mean = rng.randint(3, mx - 3);
  let nums = range(k - 1).map(() => rng.randint(Math.max(0, mean - 6), mean + 6));
  let last = mean * k - sum(nums);
  if (last < 0) {
    nums = new Array<number>(k - 1).fill(mean);
    last = mean;
  }
  nums.push(last);
  rng.shuffle(nums);
  const total = sum(nums);
  const middle = [...nums].sort((x, y) => x - y)[floorDiv(k, 2)]!;
  const listed = nums.join(", ");
  return numericQuestion(rng, ctx, params, {
    item_id: `arithmetic.average:${nums.join(",")}`,
    prompt_he: `מה הממוצע של המספרים ${listed}?`,
    prompt_en: `What is the mean of ${listed}?`,
    answer: mean,
    distractors: [
      [total, "avg_forgot_divide"],
      [middle !== mean ? middle : null, "avg_middle_value"],
      [mean + 1, null],
      [mean - 1, null],
    ],
    explanation_he:
      `מחברים: ${ltr(nums.join(" + ") + ` = ${total}`)}. ` + `מחלקים במספר המספרים (${k}): ` + `${ltr(`${total} : ${k} = ${mean}`)}.`,
    difficulty: -0.2 + 0.2 * (k - 3) + (0.4 * mx) / 100,
    calc: `F(${nums.join("+")}, ${k})`,
  });
});

/** The questions here, for a quick type check of the module's exports. */
export type ArithmeticQuestion = Question;
export type { GenContext, Params };
