/**
 * Word problems with Hebrew names and family-friendly contexts, a
 * line-by-line port of `generators/word_problems.py`.
 */
import type { PyRandom } from "../random";
import { floorDiv } from "../py";
import { asList, type Distractor, g, ltr, numericQuestion, pint, range, register } from "./common";
import { NAMES, WP_THINGS } from "./names";

/** key, prompt, answer, distractors, explanation, calc. */
type TemplateOut = [string, string, number, Distractor[], string, string];
type Template = (rng: PyRandom, mx: number) => TemplateOut;

function person(rng: PyRandom): readonly [string, string] {
  return rng.choice(NAMES);
}

const tAddGot: Template = (rng, mx) => {
  const [name, sex] = person(rng);
  const thing = rng.choice(WP_THINGS);
  const a = rng.randint(2, mx - 2);
  const c = rng.randint(1, mx - a);
  const s = a + c;
  const prompt = `ל${name} יש ${a} ${thing}. ${name} ${g(sex, "קיבל", "קיבלה")} ` + `עוד ${c}. כמה ${thing} יש ל${name} עכשיו?`;
  const expl = `${g(sex, "קיבל", "קיבלה")} עוד, ולכן מחברים: ` + `${ltr(`${a} + ${c} = ${s}`)}. עכשיו יש ${s} ${thing}.`;
  return [`got:${name}:${thing}:${a}+${c}`, prompt, s, [[Math.abs(a - c), "wrong_operation"]], expl, `${a} + ${c}`];
};

const tAddPages: Template = (rng, mx) => {
  const [name, sex] = person(rng);
  const a = rng.randint(2, mx - 2);
  const c = rng.randint(1, mx - a);
  const s = a + c;
  const read = g(sex, "קרא", "קראה");
  const prompt = `${name} ${read} ${a} עמודים בבוקר ו־${c} עמודים בערב. ` + `כמה עמודים ${read} בסך הכול?`;
  const expl = `בסך הכול = מחברים: ${ltr(`${a} + ${c} = ${s}`)} עמודים.`;
  return [`pages:${name}:${a}+${c}`, prompt, s, [[Math.abs(a - c), "wrong_operation"]], expl, `${a} + ${c}`];
};

const tSubGave: Template = (rng, mx) => {
  const [name, sex] = person(rng);
  const thing = rng.choice(WP_THINGS);
  const a = rng.randint(3, mx);
  const c = rng.randint(1, a - 1);
  const d = a - c;
  const prompt = `ל${name} היו ${a} ${thing}. ${name} ${g(sex, "נתן", "נתנה")} ` + `${c} לחברים. כמה ${thing} נשארו?`;
  const expl = `${g(sex, "נתן", "נתנה")} חלק, ולכן מחסרים: ` + `${ltr(`${a} - ${c} = ${d}`)}. נשארו ${d}.`;
  return [`gave:${name}:${thing}:${a}-${c}`, prompt, d, [[a + c, "wrong_operation"]], expl, `${a} - ${c}`];
};

const tSubLibrary: Template = (rng, mx) => {
  const [name, sex] = person(rng);
  const a = rng.randint(3, mx);
  const c = rng.randint(1, a - 1);
  const d = a - c;
  const prompt = `בספריית הכיתה היו ${a} ספרים. ${name} ` + `${g(sex, "לקח", "לקחה")} ${c} ספרים הביתה. ` + `כמה ספרים נשארו בספרייה?`;
  const expl = `ספרים יצאו מהספרייה, ולכן מחסרים: ${ltr(`${a} - ${c} = ${d}`)}.`;
  return [`library:${name}:${a}-${c}`, prompt, d, [[a + c, "wrong_operation"]], expl, `${a} - ${c}`];
};

const tCompare: Template = (rng, mx) => {
  const [[n1], [n2]] = rng.sample(NAMES, 2) as [readonly [string, string], readonly [string, string]];
  const thing = rng.choice(WP_THINGS);
  const a = rng.randint(3, mx);
  const c = rng.randint(1, a - 1);
  const d = a - c;
  const prompt = `ל${n1} יש ${a} ${thing} ול${n2} יש ${c}. ` + `כמה ${thing} יש ל${n1} יותר מאשר ל${n2}?`;
  const expl = `"כמה יותר" = ההפרש. מחסרים: ${ltr(`${a} - ${c} = ${d}`)}.`;
  return [`compare:${n1}:${n2}:${a}-${c}`, prompt, d, [[a + c, "wrong_operation"]], expl, `${a} - ${c}`];
};

const tMulBoxes: Template = (rng, mx) => {
  const a = rng.randint(2, 10);
  const c = rng.randint(2, Math.max(2, Math.min(10, floorDiv(mx, a))));
  const p = a * c;
  const thing = rng.choice(["עפרונות", "עוגיות", "צבעים", "כדורים"]);
  const prompt = `בכל קופסה יש ${a} ${thing}. יש ${c} קופסאות. כמה ${thing} יש בסך הכול?`;
  const expl = `${c} קבוצות של ${a}: כופלים: ${ltr(`${c} × ${a} = ${p}`)}.`;
  return [`boxes:${a}x${c}:${thing}`, prompt, p, [[a + c, "wrong_operation"]], expl, `${a} * ${c}`];
};

const tMulGarden: Template = (rng, mx) => {
  const [name, sex] = person(rng);
  const a = rng.randint(2, 10);
  const c = rng.randint(2, Math.max(2, Math.min(10, floorDiv(mx, a))));
  const p = a * c;
  const planted = g(sex, "שתל", "שתלה");
  const prompt = `${name} ${planted} בגינה ${c} שורות, ובכל שורה ${a} פרחים. ` + `כמה פרחים ${planted}?`;
  const expl = `${c} שורות של ${a}: ${ltr(`${c} × ${a} = ${p}`)} פרחים.`;
  return [`garden:${name}:${a}x${c}`, prompt, p, [[a + c, "wrong_operation"]], expl, `${a} * ${c}`];
};

const tDivShare: Template = (rng, mx) => {
  const k = rng.randint(2, 8);
  const q = rng.randint(2, Math.max(2, Math.min(10, floorDiv(mx, k))));
  const n = k * q;
  const prompt = `מחלקים ${n} עוגיות שווה בשווה בין ${k} ילדים. כמה עוגיות מקבל כל אחד?`;
  const expl = `מחלקים שווה בשווה: ${ltr(`${n} : ${k} = ${q}`)}. בודקים: ` + `${ltr(`${k} × ${q} = ${n}`)}.`;
  return [
    `share:${n}/${k}`,
    prompt,
    q,
    [
      [n - k, "wrong_operation"],
      [n * k, "wrong_operation"],
    ],
    expl,
    `${n} // ${k}`,
  ];
};

const tDivTables: Template = (rng, mx) => {
  const k = rng.randint(2, 8);
  const q = rng.randint(2, Math.max(2, Math.min(10, floorDiv(mx, k))));
  const n = k * q;
  const prompt = `בחוג יש ${n} ילדים. ליד כל שולחן יושבים ${k} ילדים. כמה שולחנות צריך?`;
  const expl = `כמה קבוצות של ${k} יש ב־${n}? ${ltr(`${n} : ${k} = ${q}`)} שולחנות.`;
  return [`tables:${n}/${k}`, prompt, q, [[n - k, "wrong_operation"]], expl, `${n} // ${k}`];
};

const tTwoStepShop: Template = (rng) => {
  const [name, sex] = person(rng);
  const k = rng.randint(2, 5);
  const p = rng.randint(2, 12);
  const cost = k * p;
  const paid = [20, 50, 100, 200].find((bl) => bl > cost)!;
  const ch = paid - cost;
  const prompt =
    `${name} ${g(sex, "קנה", "קנתה")} ${k} מחברות, כל אחת ב־${p} ₪, ` +
    `${g(sex, "ושילם", "ושילמה")} ${paid} ₪. כמה עודף ` +
    `${g(sex, "קיבל", "קיבלה")}?`;
  const expl = `שלב 1: המחיר ${ltr(`${k} × ${p} = ${cost}`)} ₪. שלב 2: העודף ` + `${ltr(`${paid} - ${cost} = ${ch}`)} ₪.`;
  return [
    `shop:${name}:${k}x${p}/${paid}`,
    prompt,
    ch,
    [
      [paid - p, "wrong_operation"],
      [cost, "wrong_operation"],
    ],
    expl,
    `${paid} - ${k} * ${p}`,
  ];
};

const tTwoStepHarvest: Template = (rng) => {
  const r = rng.randint(2, 6);
  const c = rng.randint(3, 9);
  const tot = r * c;
  const p = rng.randint(1, tot - 1);
  const left = tot - p;
  const prompt = `בגינה המשפחתית ${r} שורות עגבניות, ובכל שורה ${c} עגבניות. ` + `קטפו ${p} לסלט. כמה עגבניות נשארו?`;
  const expl = `שלב 1: ${ltr(`${r} × ${c} = ${tot}`)} עגבניות. שלב 2: ` + `${ltr(`${tot} - ${p} = ${left}`)} נשארו.`;
  return [
    `harvest:${r}x${c}-${p}`,
    prompt,
    left,
    [
      [r + c > p ? r + c - p : null, "wrong_operation"],
      [tot + p, "wrong_operation"],
    ],
    expl,
    `${r} * ${c} - ${p}`,
  ];
};

const tPercentSale: Template = (rng) => {
  const pct = rng.choice([10, 20, 25, 50]);
  const price = rng.choice(range(40, 301, 20).filter((x) => (x * pct) % 100 === 0));
  const off = floorDiv(price * pct, 100);
  const pay = price - off;
  const item = rng.choice(["משחק קופסה", "כדור כדורסל", "ספר הרפתקאות", "פאזל"]);
  const prompt = `${item} עולה ${price} ₪, ובמבצע יש ${pct}% הנחה. כמה עולה ${item} במבצע?`;
  const expl = `ההנחה: ${pct}% מ־${price} = ${off} ₪. המחיר: ` + `${ltr(`${price} - ${off} = ${pay}`)} ₪.`;
  return [
    `sale:${price}-${pct}%`,
    prompt,
    pay,
    [
      [off, "discount_not_subtracted"],
      [price - pct, "percent_as_number"],
    ],
    expl,
    `${price} - ${price} * ${pct} // 100`,
  ];
};

export const TEMPLATES: Readonly<Record<string, readonly Template[]>> = {
  add: [tAddGot, tAddPages],
  sub: [tSubGave, tSubLibrary, tCompare],
  mul: [tMulBoxes, tMulGarden],
  div: [tDivShare, tDivTables],
  two_step: [tTwoStepShop, tTwoStepHarvest],
  percent: [tPercentSale],
};

const DIFFICULTY: Readonly<Record<string, number>> = { add: -0.6, sub: -0.3, mul: 0.0, div: 0.2, two_step: 0.6, percent: 0.5 };

register("word.problem", (rng, params, ctx) => {
  const ops = asList<string>(params["ops"], ["add", "sub"]);
  const mx = pint(params, "max", 20);
  const op = rng.choice(ops);
  const template = rng.choice(TEMPLATES[op]!);
  const [key, prompt, ans, dis, expl, calc] = template(rng, mx);
  return numericQuestion(rng, ctx, params, {
    item_id: `word.problem:${op}:${key}`,
    prompt_he: prompt,
    answer: ans,
    distractors: [...dis, [ans + 1, "off_by_one"], [ans - 1, "off_by_one"]],
    explanation_he: expl,
    difficulty: DIFFICULTY[op]! + 0.4 * Math.min(1.0, ans / Math.max(mx, 1)),
    calc,
  });
});
