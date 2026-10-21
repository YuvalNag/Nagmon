/**
 * Geometry generators: figures are specs only, the UI draws them. A
 * line-by-line port of `generators/geometry.py`.
 */
import { F, type Fraction } from "../fraction";
import { type Figure, makeFigure } from "../model";
import type { PyRandom } from "../random";
import { floorDiv, pyRound } from "../py";
import {
  asList,
  b as B,
  type Distractor,
  emoji,
  fmt,
  type FmtStyle,
  ltr,
  numericQuestion,
  type Opt,
  opt,
  optionsQuestion,
  pget,
  pint,
  range,
  register,
  scale,
} from "./common";

const CM = ' ס"מ';
const CM2 = ' סמ"ר';
const CM3 = ' סמ"ק';
const PI = F(314, 100);

/** `math.radians`: x * (pi / 180), as CPython computes it. */
function radians(x: number): number {
  return x * (Math.PI / 180.0);
}

/** Python `str(tuple)` / `str(list)` of ints. */
const tup = (xs: readonly number[]): string => `(${xs.join(", ")})`;
const lst = (xs: readonly number[]): string => `[${xs.join(", ")}]`;

/**
 * CPython's `hash()` of a tuple of tuples of small non-negative ints
 * (64-bit xxHash-style `tuplehash`), the value the old item ids used.
 */
export function pyTupleHash(items: readonly (readonly number[])[]): bigint {
  const M = (1n << 64n) - 1n;
  const P1 = 11400714785074694791n;
  const P2 = 14029467366897019727n;
  const P5 = 2870177450012600261n;
  const rot = (x: bigint): bigint => ((x << 31n) | (x >> 33n)) & M;
  const hashTuple = (lanes: readonly bigint[]): bigint => {
    let acc = P5;
    for (const lane of lanes) {
      acc = (acc + ((lane & M) * P2)) & M;
      acc = rot(acc);
      acc = (acc * P1) & M;
    }
    acc = (acc + (BigInt(lanes.length) ^ (P5 ^ 3527539n))) & M;
    if (acc === M) return 1546275796n;
    return acc;
  };
  const toSigned = (u: bigint): bigint => (u >= 1n << 63n ? u - (1n << 64n) : u);
  const inner = items.map((t) => hashTuple(t.map((n) => BigInt(n))));
  return toSigned(hashTuple(inner.map((h) => h & M)));
}

export function regular(n: number, r = 3.0, rot = 90.0): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = radians(rot + (360.0 * i) / n);
    pts.push([pyRound(r * Math.cos(a), 2), pyRound(r * Math.sin(a), 2)]);
  }
  return pts;
}

/** Triangle with sides a=BC, b=CA, c=AB. */
export function triPoints(a: number, bb: number, c: number): number[][] {
  const x = (bb * bb + c * c - a * a) / (2 * c);
  const y = Math.sqrt(Math.max(bb * bb - x * x, 0.0));
  return [
    [0.0, 0.0],
    [pyRound(c, 2), 0.0],
    [pyRound(x, 2), pyRound(y, 2)],
  ];
}

export function triFromAngles(alpha: number, beta: number): number[][] {
  const gamma = 180 - alpha - beta;
  const c = 5.0;
  const a = (c * Math.sin(radians(alpha))) / Math.sin(radians(gamma));
  const bb = (c * Math.sin(radians(beta))) / Math.sin(radians(gamma));
  return triPoints(a, bb, c);
}

export const SHAPES: Readonly<Record<string, readonly [string, Figure]>> = {
  triangle: [
    "משולש",
    makeFigure("polygon", {
      points: [
        [0, 0],
        [4, 0],
        [2, 3],
      ],
      name: "triangle",
    }),
  ],
  square: [
    "ריבוע",
    makeFigure("polygon", {
      points: [
        [0, 0],
        [3, 0],
        [3, 3],
        [0, 3],
      ],
      name: "square",
    }),
  ],
  rectangle: [
    "מלבן",
    makeFigure("polygon", {
      points: [
        [0, 0],
        [5, 0],
        [5, 3],
        [0, 3],
      ],
      name: "rectangle",
    }),
  ],
  circle: ["עיגול", makeFigure("circle", { r: 3, name: "circle" })],
  pentagon: ["מחומש", makeFigure("polygon", { points: regular(5), name: "pentagon" })],
  hexagon: ["משושה", makeFigure("polygon", { points: regular(6), name: "hexagon" })],
  rhombus: [
    "מעוין",
    makeFigure("polygon", {
      points: [
        [0, 0],
        [3, 2],
        [6, 0],
        [3, -2],
      ],
      name: "rhombus",
    }),
  ],
  trapezoid: [
    "טרפז",
    makeFigure("polygon", {
      points: [
        [0, 0],
        [6, 0],
        [4.5, 3],
        [1.5, 3],
      ],
      name: "trapezoid",
    }),
  ],
};
const SHAPE_WHY: Readonly<Record<string, string>> = {
  triangle: "יש לו 3 צלעות ו־3 קודקודים",
  square: "יש לו 4 צלעות שוות ו־4 פינות ישרות",
  rectangle: "יש לו 4 פינות ישרות, ושתי צלעות ארוכות ושתיים קצרות",
  circle: "הוא עגול לגמרי, בלי צלעות ובלי פינות",
  pentagon: "יש לו 5 צלעות",
  hexagon: "יש לו 6 צלעות",
  rhombus: "יש לו 4 צלעות שוות, בלי פינות ישרות",
  trapezoid: "יש לו 4 צלעות, ורק שתיים מהן מקבילות",
};
const CONFUSABLE = new Set(["square|rectangle", "rectangle|square", "square|rhombus", "rhombus|square", "pentagon|hexagon", "hexagon|pentagon"]);

type Animal = readonly [string, string, number];
export const ANIMALS: readonly Animal[] = [
  ["נמלה", "1f41c", 1],
  ["דבורה", "1f41d", 2],
  ["עכבר", "1f401", 3],
  ["ארנב", "1f407", 4],
  ["חתול", "1f408", 5],
  ["כלב", "1f415", 6],
  ["כבשה", "1f411", 7],
  ["סוס", "1f40e", 8],
  ["פיל", "1f418", 10],
  ["לווייתן", "1f40b", 12],
];

const byStr = (a: string, c: string): number => (a < c ? -1 : a > c ? 1 : 0);

register("geometry.size_compare", (rng, _params, ctx) => {
  let picks: Animal[] = [];
  let sizes: number[] = [];
  for (let it = 0; it < 100; it++) {
    picks = rng.sample(ANIMALS, 3);
    sizes = picks.map((p) => p[2]).sort((x, y) => x - y);
    if (sizes[1]! - sizes[0]! >= 2 && sizes[2]! - sizes[1]! >= 2) break;
  }
  const big = rng.random() < 0.5;
  const pick = (better: (x: number, y: number) => boolean): Animal => picks.reduce((best, p) => (better(p[2], best[2]) ? p : best));
  const target = big ? pick((x, y) => x > y) : pick((x, y) => x < y);
  const word = big ? "גדול" : "קטן";
  const others = picks.filter((p) => p !== target);
  const order = [...picks].sort((x, y) => (big ? y[2] - x[2] : x[2] - y[2]));
  return optionsQuestion(rng, ctx, {
    item_id: `geometry.size_compare:${word}:` + picks.map((p) => p[0]).sort(byStr).join(","),
    prompt_he: `מי הכי ${word}?`,
    prompt_en: big ? "Which is the biggest?" : "Which is the smallest?",
    correct: opt(target[0], { image: emoji(target[1]) }),
    distractors: others.map((p) => opt(p[0], { image: emoji(p[1]) })),
    explanation_he: `מסדרים מה${big ? "גדול" : "קטן"}: ` + order.map((p) => p[0]).join(", ") + `. הכי ${word}: ${target[0]}.`,
    difficulty: -0.5 + 0.1 * B(sizes[1]! - sizes[0]! < 3),
    n: 3,
  });
});

/** Everyday things whose outline is one plain shape (a second way to ask the basic shapes, with no picture). */
const SHAPE_THINGS: Readonly<Record<string, readonly [string, string][]>> = {
  circle: [
    ["גלגל של אופניים", "a bicycle wheel"],
    ["צלחת", "a plate"],
    ["פיצה שלמה", "a whole pizza"],
  ],
  triangle: [
    ["פרוסת פיצה", "a slice of pizza"],
    ["כובע של ליצן", "a clown's hat"],
    ["דגל משולש", "a pennant flag"],
  ],
  rectangle: [
    ["דלת", "a door"],
    ["מסך של טלוויזיה", "a TV screen"],
    ["שוקולד בצורת לוח", "a bar of chocolate"],
  ],
  square: [
    ["משבצת במחברת", "a square in a notebook"],
    ["אריח ריצוף ריבועי", "a square floor tile"],
    ["כרית ריבועית", "a square cushion"],
  ],
};

register("geometry.shape_identify", (rng, params, ctx) => {
  const names = asList<string>(params["shapes"], ["triangle", "square", "rectangle", "circle"]);
  const shape = rng.choice(names);
  const [he, fig] = SHAPES[shape]!;
  const things = SHAPE_THINGS[shape];
  if (things && params["things"] !== false && rng.random() < 0.4) {
    const [thing, thingEn] = rng.choice(things);
    const dis = names.filter((s) => s !== shape).map((s) => opt(SHAPES[s]![0], { en: s, tag: CONFUSABLE.has(`${shape}|${s}`) ? "shape_confusion" : null }));
    return optionsQuestion(rng, ctx, {
      item_id: `geometry.shape_identify:thing:${shape}:${thingEn}`,
      prompt_he: `מה הצורה של ${thing}?`,
      prompt_en: `What shape is ${thingEn}?`,
      correct: opt(he, { en: shape }),
      distractors: dis,
      explanation_he: `הצורה של ${thing} היא ${he}: ${SHAPE_WHY[shape]}.`,
      difficulty: -0.6 + 0.3 * B(shape === "rectangle" || shape === "square"),
    });
  }
  const dis = names.filter((s) => s !== shape).map((s) => opt(SHAPES[s]![0], { en: s, tag: CONFUSABLE.has(`${shape}|${s}`) ? "shape_confusion" : null }));
  return optionsQuestion(rng, ctx, {
    item_id: `geometry.shape_identify:${shape}`,
    prompt_he: "איזו צורה זו?",
    prompt_en: "What shape is this?",
    correct: opt(he, { en: shape }),
    distractors: dis,
    explanation_he: `זה ${he}: ${SHAPE_WHY[shape]}.`,
    difficulty:
      -0.8 + (0.25 * names.indexOf(shape)) / Math.max(1, names.length - 1) + 0.3 * B(shape === "rectangle" || shape === "rhombus" || shape === "trapezoid"),
    figure: fig,
  });
});

export const POLY_NAMES: ReadonlyMap<number, string> = new Map([
  [3, "משולש"],
  [4, "מרובע"],
  [5, "מחומש"],
  [6, "משושה"],
  [7, "משובע"],
  [8, "מתומן"],
  [10, "מעושר"],
  [12, "מתריסר"],
]);

register("geometry.polygon_count", (rng, params, ctx) => {
  let what = String(pget(params, "what", "mixed"));
  if (what === "mixed") what = rng.choice(["sides", "vertices", "name"]);
  const mx = pint(params, "max", 8);
  const n = rng.choice([...POLY_NAMES.keys()].filter((k) => k <= mx));
  const fig = makeFigure("polygon", { points: regular(n), name: POLY_NAMES.get(n) });
  if (what === "name") {
    const dis = [...POLY_NAMES.keys()]
      .filter((k) => k !== n && k <= 8)
      .map((k) => opt(POLY_NAMES.get(k)!, { tag: Math.abs(k - n) === 1 ? "shape_confusion" : null }));
    return optionsQuestion(rng, ctx, {
      item_id: `geometry.polygon_count:name${n}`,
      prompt_he: `איך קוראים למצולע עם ${n} צלעות?`,
      prompt_en: `What is a polygon with ${n} sides called?`,
      correct: opt(POLY_NAMES.get(n)!),
      distractors: dis,
      explanation_he: `מצולע עם ${n} צלעות ו־${n} קודקודים נקרא ${POLY_NAMES.get(n)}.`,
      difficulty: -0.2 + 0.1 * n,
      figure: fig,
    });
  }
  const word = what === "sides" ? "צלעות" : "קודקודים";
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.polygon_count:${what}${n}`,
    prompt_he: `כמה ${word} יש למצולע?`,
    prompt_en: `How many ${what === "sides" ? "sides" : "vertices"}?`,
    answer: n,
    distractors: [
      [n + 1, "off_by_one"],
      [n - 1, "off_by_one"],
      [2 * n, "vertices_sides_confusion"],
    ],
    explanation_he: `סופרים מסביב ומסמנים מאיפה התחלנו: ${n} ${word}. ` + `במצולע מספר הצלעות שווה למספר הקודקודים.`,
    min_value: 3,
    difficulty: -0.8 + 0.15 * n,
    figure: fig,
    calc: `${n}`,
  });
});

register("geometry.triangle_classify", (rng, params, ctx) => {
  let by = String(pget(params, "by", "mixed"));
  if (by === "mixed") by = rng.choice(["sides", "angles"]);
  if (by === "sides") {
    const kind = rng.choice(["equi", "iso", "scalene"] as const);
    let sides: number[];
    if (kind === "equi") {
      const a = rng.randint(3, 9);
      sides = [a, a, a];
    } else if (kind === "iso") {
      const a = rng.randint(3, 9);
      let c = rng.randint(2, 2 * a - 1);
      while (c === a) c = rng.randint(2, 2 * a - 1);
      sides = [a, a, c];
    } else {
      let s: number[];
      for (;;) {
        s = rng.sample(range(3, 13), 3).sort((x, y) => x - y);
        if (s[0]! + s[1]! > s[2]!) break;
      }
      sides = s;
    }
    const names = { equi: "שווה צלעות", iso: "שווה שוקיים", scalene: "שונה צלעות" };
    const why = { equi: "כל שלוש הצלעות שוות", iso: "שתי צלעות שוות זו לזו", scalene: "כל הצלעות באורכים שונים" }[kind];
    const pts = triPoints(sides[0]!, sides[1]!, sides[2]!);
    const labels: Record<string, string> = {};
    [sides[2]!, sides[0]!, sides[1]!].forEach((s, i) => (labels[`side_${i}`] = `${s}`));
    const fig = makeFigure("polygon", { points: pts, labels });
    const dis = (Object.entries(names) as [string, string][]).filter(([k]) => k !== kind).map(([, v]) => opt(v, { tag: "triangle_type_confusion" }));
    const listed = sides.join(", ");
    return optionsQuestion(rng, ctx, {
      item_id: `geometry.triangle_classify:sides${tup(sides)}`,
      prompt_he: `אורכי הצלעות של משולש: ${listed} ס"מ. איזה משולש זה?`,
      prompt_en: `A triangle has sides ${listed}. Which type?`,
      correct: opt(names[kind]),
      distractors: dis,
      explanation_he: `${why}, ולכן זה משולש ${names[kind]}.`,
      difficulty: { equi: -0.5, iso: 0.0, scalene: -0.2 }[kind],
      figure: fig,
    });
  }
  const kind = rng.choice(["acute", "right", "obtuse"] as const);
  let angles: number[];
  if (kind === "right") {
    const a = rng.randrange(20, 71, 5);
    angles = [90, a, 90 - a];
  } else if (kind === "obtuse") {
    const big = rng.randrange(100, 161, 5);
    const a = rng.randrange(5, 180 - big - 4, 5);
    angles = [big, a, 180 - big - a];
  } else {
    let a: number;
    let c: number;
    let d: number;
    for (;;) {
      a = rng.randrange(35, 86, 5);
      c = rng.randrange(35, 86, 5);
      d = 180 - a - c;
      if (d > 0 && d < 90) break;
    }
    angles = [a, c, d];
  }
  angles = rng.sample(angles, 3);
  const names = { acute: "חד־זווית", right: "ישר־זווית", obtuse: "קהה־זווית" };
  const mx = Math.max(...angles);
  const why = { acute: "כל הזוויות קטנות מ־90°", right: "יש זווית של 90°", obtuse: `יש זווית גדולה מ־90° (${mx}°)` }[kind];
  const pts = triFromAngles(angles[0]!, angles[1]!);
  const labels: Record<string, string> = {};
  angles.forEach((v, i) => (labels[`angle_${i}`] = `${v}°`));
  const fig = makeFigure("polygon", { points: pts, labels });
  const listed = angles.map((v) => `${v}°`).join(", ");
  return optionsQuestion(rng, ctx, {
    item_id: `geometry.triangle_classify:angles${tup(angles)}`,
    prompt_he: `הזוויות של משולש: ${listed}. איזה משולש זה?`,
    prompt_en: `A triangle has angles ${listed}. Which type?`,
    correct: opt(names[kind]),
    distractors: (Object.entries(names) as [string, string][]).filter(([k]) => k !== kind).map(([, v]) => opt(v, { tag: "triangle_type_confusion" })),
    explanation_he: `${why}, ולכן זה משולש ${names[kind]}.`,
    difficulty: { acute: 0.2, right: -0.4, obtuse: 0.0 }[kind],
    figure: fig,
  });
});

export const QUADS: Readonly<Record<string, readonly [string, string]>> = {
  square: ["ריבוע", "4 צלעות שוות ו־4 זוויות ישרות"],
  rectangle: ["מלבן", "4 זוויות ישרות, וצלעות נגדיות שוות (לא כולן)"],
  rhombus: ["מעוין", "4 צלעות שוות, בלי זוויות ישרות"],
  parallelogram: ["מקבילית", "2 זוגות צלעות מקבילות, בלי זוויות ישרות, והצלעות לא כולן שוות"],
  trapezoid: ["טרפז", "רק זוג אחד של צלעות מקבילות"],
  kite: ["דלתון", "2 זוגות של צלעות סמוכות שוות"],
};
const QUAD_PTS: Readonly<Record<string, number[][]>> = {
  square: [
    [0, 0],
    [3, 0],
    [3, 3],
    [0, 3],
  ],
  rectangle: [
    [0, 0],
    [5, 0],
    [5, 3],
    [0, 3],
  ],
  rhombus: [
    [0, 0],
    [3, 2],
    [6, 0],
    [3, -2],
  ],
  parallelogram: [
    [0, 0],
    [5, 0],
    [6.5, 2.5],
    [1.5, 2.5],
  ],
  trapezoid: [
    [0, 0],
    [6, 0],
    [4.5, 3],
    [1.5, 3],
  ],
  kite: [
    [0, 0],
    [2, 2],
    [0, 5],
    [-2, 2],
  ],
};
const QUAD_HIER = new Set([
  "square|rectangle",
  "square|rhombus",
  "rectangle|parallelogram",
  "rhombus|parallelogram",
  "square|parallelogram",
  "rhombus|kite",
]);

register("geometry.quad_classify", (rng, _params, ctx) => {
  const kind = rng.choice(Object.keys(QUADS));
  const [name, props] = QUADS[kind]!;
  const dis = Object.entries(QUADS)
    .filter(([k]) => k !== kind)
    .map(([k, v]) => opt(v[0], { tag: QUAD_HIER.has(`${kind}|${k}`) || QUAD_HIER.has(`${k}|${kind}`) ? "quad_hierarchy" : null }));
  const diffs: Record<string, number> = { square: -0.6, rectangle: -0.4, rhombus: 0.2, parallelogram: 0.5, trapezoid: 0.2, kite: 0.4 };
  return optionsQuestion(rng, ctx, {
    item_id: `geometry.quad_classify:${kind}`,
    prompt_he: `למרובע יש ${props}. מה הוא?`,
    prompt_en: "Which quadrilateral is it?",
    correct: opt(name),
    distractors: dis,
    explanation_he: `${name}: ${props}.`,
    difficulty: diffs[kind]!,
    figure: makeFigure("polygon", { points: QUAD_PTS[kind], name: kind }),
  });
});

const ANGLE_NAMES: Readonly<Record<string, string>> = { acute: "חדה", right: "ישרה", obtuse: "קהה", straight: "שטוחה" };

register("geometry.angle_type", (rng, params, ctx) => {
  const straight = Boolean(pget(params, "include_straight", false));
  const kinds = ["acute", "right", "obtuse", ...(straight ? ["straight"] : [])];
  const kind = rng.choice(kinds);
  // Python builds the whole dict, so both random angles are always drawn.
  const acute = rng.randrange(15, 81, 5);
  const obtuse = rng.randrange(100, 171, 5);
  const deg = ({ acute, right: 90, obtuse, straight: 180 } as Record<string, number>)[kind]!;
  const rot = rng.randrange(0, 360, 30);
  const why = {
    acute: "קטנה מזווית ישרה (פחות מ־90°)",
    right: "בדיוק כמו פינה של דף: 90°",
    obtuse: "גדולה מזווית ישרה וקטנה מקו ישר (בין 90° ל־180°)",
    straight: "שתי הקרניים יוצרות קו ישר: 180°",
  }[kind as "acute" | "right" | "obtuse" | "straight"];
  return optionsQuestion(rng, ctx, {
    item_id: `geometry.angle_type:${deg}@${rot}`,
    prompt_he: "איזו זווית זו?",
    prompt_en: "What kind of angle is this?",
    correct: opt(ANGLE_NAMES[kind]!),
    distractors: kinds.filter((k) => k !== kind).map((k) => opt(ANGLE_NAMES[k]!, { tag: Math.abs(deg - 90) <= 20 ? "angle_type_confusion" : null })),
    explanation_he: `הזווית ${ANGLE_NAMES[kind]}: היא ${why}.`,
    difficulty: -0.5 + 0.6 * B(Math.abs(deg - 90) <= 15 && kind !== "right"),
    figure: makeFigure("angle", { degrees: deg, rotation: rot }),
  });
});

register("geometry.angle_pair", (rng, params, ctx) => {
  const kinds = asList<string>(params["kind"], ["right", "supplementary", "vertical"]);
  const kind = rng.choice(kinds);
  let a: number;
  let ans: number;
  let prompt: string;
  let expl: string;
  let dis: Distractor[];
  if (kind === "right") {
    a = rng.randrange(10, 81, 5);
    ans = 90 - a;
    prompt = `זווית ישרה מחולקת לשתי זוויות. אחת מהן ${a}°. מה גודל השנייה?`;
    expl = `זווית ישרה היא 90°: ${ltr(`90 - ${a} = ${ans}`)}°.`;
    dis = [[180 - a, "used_180_not_90"]];
  } else if (kind === "supplementary") {
    a = rng.randrange(20, 161, 5);
    ans = 180 - a;
    prompt = `שתי זוויות צמודות. אחת מהן ${a}°. מה גודל השנייה?`;
    expl = `סכום זוויות צמודות הוא 180° (קו ישר): ` + `${ltr(`180 - ${a} = ${ans}`)}°.`;
    dis = [
      [a < 90 ? 90 - a : null, "used_90_not_180"],
      [360 - a, "used_360"],
    ];
  } else {
    a = rng.randrange(20, 161, 5);
    ans = a;
    prompt = `שני ישרים נחתכים. אחת הזוויות ${a}°. מה גודל הזווית הקודקודית לה?`;
    expl = `זוויות קודקודיות שוות זו לזו, ולכן גם היא ${a}°.`;
    dis = [[180 - a, "vertical_as_supplementary"]];
  }
  const diffs: Record<string, number> = { right: -0.3, supplementary: 0.0, vertical: 0.2 };
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.angle_pair:${kind}${a}`,
    prompt_he: prompt,
    answer: ans,
    distractors: [...dis, [ans + 10, null], [ans - 10, null]],
    explanation_he: expl,
    difficulty: diffs[kind]!,
    figure: makeFigure("angle", { degrees: a, pair: kind }),
    unit: "°",
    step: 5,
    calc: kind === "vertical" ? `${ans}` : kind === "right" ? `90 - ${a}` : `180 - ${a}`,
  });
});

register("geometry.triangle_sum", (rng, params, ctx) => {
  const a = rng.randrange(20, 121, 5);
  const c = rng.randrange(15, 160 - a, 5);
  const d = 180 - a - c;
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.triangle_sum:${a},${c}`,
    prompt_he: `שתי זוויות במשולש הן ${a}° ו־${c}°. מה גודל הזווית השלישית?`,
    prompt_en: `Two angles of a triangle are ${a}° and ${c}°. The third?`,
    answer: d,
    distractors: [
      [360 - a - c, "used_360"],
      [a + c < 90 ? 90 - a - c : null, "used_90_not_180"],
      [a + c, null],
      [d + 10, null],
    ],
    explanation_he: `סכום הזוויות במשולש הוא 180°: ${ltr(`180 - ${a} - ${c} = ${d}`)}°.`,
    difficulty: -0.2 + 0.2 * B(a % 10 !== 0 || c % 10 !== 0),
    figure: makeFigure("polygon", { points: triFromAngles(a, c), labels: { angle_0: `${a}°`, angle_1: `${c}°`, angle_2: "?" } }),
    unit: "°",
    step: 5,
    calc: `180 - ${a} - ${c}`,
  });
});

register("geometry.polygon_angle_sum", (rng, params, ctx) => {
  const mode = rng.choice(["sum", "each"]);
  if (mode === "sum") {
    const n = rng.randint(4, 12);
    const ans = (n - 2) * 180;
    return numericQuestion(rng, ctx, params, {
      item_id: `geometry.polygon_angle_sum:sum${n}`,
      prompt_he: `מה סכום הזוויות הפנימיות במצולע עם ${n} צלעות?`,
      prompt_en: `Sum of interior angles of a ${n}-gon?`,
      answer: ans,
      distractors: [
        [n * 180, "polygon_n_times_180"],
        [360, null],
        [(n - 1) * 180, "off_by_one"],
      ],
      explanation_he: `מחלקים את המצולע ל־${n - 2} משולשים מקודקוד אחד: ` + `${ltr(`(${n} - 2) × 180 = ${ans}`)}°.`,
      difficulty: 0.0 + 0.05 * n,
      figure: makeFigure("polygon", { points: regular(n) }),
      unit: "°",
      step: 180,
      calc: `(${n} - 2) * 180`,
    });
  }
  const n = rng.choice([3, 4, 5, 6, 8, 9, 10, 12]);
  const ans = floorDiv((n - 2) * 180, n);
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.polygon_angle_sum:each${n}`,
    prompt_he: `מה גודל כל זווית פנימית במצולע משוכלל עם ${n} צלעות?`,
    prompt_en: `Each interior angle of a regular ${n}-gon?`,
    answer: ans,
    distractors: [
      [360 % n === 0 ? floorDiv(180, n) * 2 : null, "polygon_exterior_interior"],
      [floorDiv(180 * n, n), null],
      [ans + 10, null],
    ],
    explanation_he:
      `הסכום: ${ltr(`(${n} - 2) × 180 = ${(n - 2) * 180}`)}°. ` + `מחלקים ל־${n} זוויות שוות: ` + `${ltr(`${(n - 2) * 180} : ${n} = ${ans}`)}°.`,
    difficulty: 0.4,
    figure: makeFigure("polygon", { points: regular(n) }),
    unit: "°",
    step: 5,
    calc: `(${n} - 2) * 180 // ${n}`,
  });
});

export function polyomino(rng: PyRandom, mx: number): [number[][], number, number] {
  const w = rng.randint(2, mx);
  const h = rng.randint(2, Math.max(2, mx - 2));
  const cells = new Set<string>();
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) cells.add(`${x},${y}`);
  if (rng.random() < 0.5 && w > 2 && h > 2) {
    const cw = rng.randint(1, w - 1);
    const ch = rng.randint(1, h - 1);
    const corner = rng.choice([
      [0, 0],
      [w - cw, 0],
      [0, h - ch],
      [w - cw, h - ch],
    ]);
    for (let x = corner[0]!; x < corner[0]! + cw; x++) for (let y = corner[1]!; y < corner[1]! + ch; y++) cells.delete(`${x},${y}`);
  }
  const list = [...cells].map((c) => c.split(",").map(Number));
  list.sort((p, q) => p[0]! - q[0]! || p[1]! - q[1]!);
  return [list, w, h];
}

export function perimeterOf(cells: readonly (readonly number[])[]): number {
  const s = new Set(cells.map((c) => `${c[0]},${c[1]}`));
  let per = 0;
  for (const c of cells) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (!s.has(`${c[0]! + dx},${c[1]! + dy}`)) per += 1;
    }
  }
  return per;
}

/** `hash(tuple(map(tuple, cells))) % 9973`, as in the Python item ids. */
function cellsHash(cells: readonly (readonly number[])[]): number {
  const h = pyTupleHash(cells);
  return Number(((h % 9973n) + 9973n) % 9973n);
}

register("geometry.grid_area", (rng, params, ctx) => {
  const mx = pint(params, "max", 6);
  const [cells, w, h] = polyomino(rng, mx);
  const area = cells.length;
  const per = perimeterOf(cells);
  const full = w * h;
  let expl: string;
  if (area === full) expl = `זה מלבן של ${w} על ${h} משבצות: ` + `${ltr(`${w} × ${h} = ${area}`)} משבצות.`;
  else
    expl =
      `משלימים למלבן ${ltr(`${w} × ${h} = ${full}`)} ומורידים את ` + `החסר (${full - area}): ${ltr(`${full} - ${full - area} = ${area}`)}` + " משבצות.";
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.grid_area:${w}x${h}:${area}:${cellsHash(cells)}`,
    prompt_he: "מה השטח של הצורה? (כל משבצת = יחידת שטח אחת)",
    prompt_en: "What is the area in squares?",
    answer: area,
    distractors: [
      [per !== area ? per : null, "area_perimeter_confusion"],
      [full !== area ? full : null, null],
      [area + 1, "off_by_one"],
      [w + h, null],
    ],
    explanation_he: expl,
    difficulty: -0.5 + 0.5 * B(area !== full) + (0.4 * area) / (mx * mx),
    figure: makeFigure("grid_area", { width: w + 2, height: h + 2, cells: cells.map(([x, y]) => [x! + 1, y! + 1]) }),
    calc: `${area}`,
  });
});

register("geometry.grid_perimeter", (rng, params, ctx) => {
  const mx = pint(params, "max", 6);
  const [cells, w, h] = polyomino(rng, mx);
  const area = cells.length;
  const per = perimeterOf(cells);
  let expl: string;
  if (area === w * h) expl = `מלבן ${w} על ${h}: מחברים את כל הצלעות: ` + `${ltr(`${w} + ${h} + ${w} + ${h} = ${per}`)} יחידות.`;
  else
    expl =
      `סופרים את צלעות המשבצות שעל הגבול, מסביב לצורה. ` + `כאן הגבול זהה למלבן ${w} על ${h}: ` + `${ltr(`2 × (${w} + ${h}) = ${per}`)} יחידות.`;
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.grid_perimeter:${w}x${h}:${area}:${cellsHash(cells)}`,
    prompt_he: "מה ההיקף של הצורה? (צלע של משבצת = יחידה אחת)",
    prompt_en: "What is the perimeter in units?",
    answer: per,
    distractors: [
      [area !== per ? area : null, "area_perimeter_confusion"],
      [w + h, "half_perimeter"],
      [per - 2, null],
    ],
    explanation_he: expl,
    difficulty: -0.3 + 0.3 * B(area !== w * h) + (0.3 * per) / (4 * mx),
    figure: makeFigure("grid_area", { width: w + 2, height: h + 2, cells: cells.map(([x, y]) => [x! + 1, y! + 1]) }),
    calc: `${per}`,
  });
});

register("geometry.perimeter", (rng, params, ctx) => {
  const shapes = asList<string>(params["shape"], ["rectangle", "square", "triangle", "regular", "missing_side"]);
  const shape = rng.choice(shapes);
  let fig: Figure | null = null;
  let ans: number;
  let prompt: string;
  let expl: string;
  let dis: Distractor[];
  let key: string;
  let calc: string;
  if (shape === "rectangle") {
    const a = rng.randint(2, 20);
    let c = rng.randint(2, 20);
    while (a === c) c = rng.randint(2, 20);
    ans = 2 * (a + c);
    prompt = `מלבן שאורכו ${a} ס"מ ורוחבו ${c} ס"מ. מה ההיקף שלו?`;
    expl = `היקף = סכום כל הצלעות: ${ltr(`${a} + ${c} + ${a} + ${c} = ${ans}`)} ס"מ.`;
    dis = [
      [a + c, "half_perimeter"],
      [a * c, "area_perimeter_confusion"],
    ];
    fig = makeFigure("polygon", {
      points: [
        [0, 0],
        [a, 0],
        [a, c],
        [0, c],
      ],
      labels: { side_0: String(a), side_1: String(c) },
    });
    key = `rect${a}x${c}`;
    calc = `2 * (${a} + ${c})`;
  } else if (shape === "square") {
    const a = rng.randint(2, 25);
    ans = 4 * a;
    prompt = `ריבוע שאורך צלעו ${a} ס"מ. מה ההיקף שלו?`;
    expl = `לריבוע 4 צלעות שוות: ${ltr(`4 × ${a} = ${ans}`)} ס"מ.`;
    dis = [
      [2 * a, "half_perimeter"],
      [a * a, "area_perimeter_confusion"],
    ];
    [key, calc] = [`sq${a}`, `4 * ${a}`];
  } else if (shape === "triangle") {
    let s: number[];
    for (;;) {
      s = rng.sample(range(3, 20), 3).sort((x, y) => x - y);
      if (s[0]! + s[1]! > s[2]!) break;
    }
    ans = s.reduce((x, y) => x + y, 0);
    const listed = s.join(", ");
    prompt = `אורכי הצלעות של משולש: ${listed} ס"מ. מה ההיקף שלו?`;
    expl = `מחברים את שלוש הצלעות: ${ltr(s.join(" + ") + ` = ${ans}`)} ס"מ.`;
    dis = [
      [s[0]! + s[1]!, null],
      [ans + 1, null],
    ];
    [key, calc] = [`tri${lst(s)}`, s.join(" + ")];
  } else if (shape === "regular") {
    const n = rng.choice([5, 6, 8]);
    const a = rng.randint(2, 15);
    ans = n * a;
    prompt = `ל${({ 5: "מחומש", 6: "משושה", 8: "מתומן" } as Record<number, string>)[n]} משוכלל צלע של ${a} ס"מ. מה ההיקף שלו?`;
    expl = `יש ${n} צלעות שוות: ${ltr(`${n} × ${a} = ${ans}`)} ס"מ.`;
    dis = [
      [4 * a, "shape_confusion"],
      [(n - 1) * a, "off_by_one"],
    ];
    [key, calc] = [`reg${n}x${a}`, `${n} * ${a}`];
  } else {
    const a = rng.randint(2, 20);
    const c = rng.randint(2, 20);
    const per = 2 * (a + c);
    ans = c;
    prompt = `היקף מלבן הוא ${per} ס"מ ואורכו ${a} ס"מ. מה הרוחב שלו?`;
    expl = `חצי היקף = אורך + רוחב: ${ltr(`${per} : 2 = ${a + c}`)}. ` + `הרוחב: ${ltr(`${a + c} - ${a} = ${c}`)} ס"מ.`;
    dis = [
      [per - a, "half_perimeter"],
      [per - 2 * a, "half_perimeter"],
      [per % a === 0 ? F(per, a) : null, "area_perimeter_confusion"],
    ];
    [key, calc] = [`miss${per}-${a}`, `${per} // 2 - ${a}`];
  }
  const diffs: Record<string, number> = { rectangle: -0.2, square: -0.4, triangle: -0.3, regular: 0.0, missing_side: 0.6 };
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.perimeter:${key}`,
    prompt_he: prompt,
    answer: ans,
    distractors: [...dis, [ans + 2, null]],
    explanation_he: expl,
    difficulty: diffs[shape]!,
    figure: fig,
    unit: CM,
    calc,
  });
});

register("geometry.area", (rng, params, ctx) => {
  const shapes = asList<string>(params["shape"], ["rectangle"]);
  const shape = rng.choice(shapes);
  let style: FmtStyle = "auto";
  let ans: number | Fraction;
  let prompt: string;
  let expl: string;
  let dis: Distractor[];
  let fig: Figure;
  let key: string;
  let calc: string;
  if (shape === "rectangle") {
    const a = rng.randint(2, 15);
    let c = rng.randint(2, 15);
    while (a === c) c = rng.randint(2, 15);
    ans = a * c;
    prompt = `מלבן שאורכו ${a} ס"מ ורוחבו ${c} ס"מ. מה השטח שלו?`;
    expl = `שטח מלבן = אורך × רוחב: ${ltr(`${a} × ${c} = ${ans}`)} סמ"ר.`;
    dis = [
      [2 * (a + c), "area_perimeter_confusion"],
      [a + c, null],
    ];
    fig = makeFigure("polygon", {
      points: [
        [0, 0],
        [a, 0],
        [a, c],
        [0, c],
      ],
      labels: { side_0: String(a), side_1: String(c) },
    });
    [key, calc] = [`rect${a}x${c}`, `${a} * ${c}`];
  } else if (shape === "square") {
    const a = rng.randint(2, 15);
    ans = a * a;
    prompt = `ריבוע שאורך צלעו ${a} ס"מ. מה השטח שלו?`;
    expl = `שטח ריבוע = צלע × צלע: ${ltr(`${a} × ${a} = ${ans}`)} סמ"ר.`;
    dis = [
      [4 * a, "area_perimeter_confusion"],
      [2 * a, null],
    ];
    fig = makeFigure("polygon", {
      points: [
        [0, 0],
        [a, 0],
        [a, a],
        [0, a],
      ],
    });
    [key, calc] = [`sq${a}`, `${a} * ${a}`];
  } else if (shape === "triangle") {
    let base = rng.randint(2, 16);
    const h = rng.randint(2, 14);
    if ((base * h) % 2) base += 1;
    ans = floorDiv(base * h, 2);
    prompt = `משולש שבסיסו ${base} ס"מ והגובה אליו ${h} ס"מ. מה השטח שלו?`;
    expl = `שטח משולש = בסיס × גובה : 2. ` + `${ltr(`${base} × ${h} : 2 = ${base * h} : 2 = ${ans}`)} סמ"ר.`;
    dis = [
      [base * h, "triangle_area_no_half"],
      [base + h, null],
    ];
    const apex = rng.randint(0, base);
    fig = makeFigure("polygon", {
      points: [
        [0, 0],
        [base, 0],
        [apex, h],
      ],
      height: [
        [apex, 0],
        [apex, h],
      ],
      labels: { side_0: String(base), height: String(h) },
    });
    [key, calc] = [`tri${base}x${h}`, `${base} * ${h} // 2`];
  } else if (shape === "parallelogram") {
    const base = rng.randint(3, 15);
    const h = rng.randint(2, 10);
    const side = h + rng.randint(1, 4);
    ans = base * h;
    prompt = `מקבילית: בסיס ${base} ס"מ, צלע משופעת ${side} ס"מ, ` + `וגובה ${h} ס"מ. מה השטח?`;
    expl = `שטח מקבילית = בסיס × גובה (לא הצלע המשופעת): ` + `${ltr(`${base} × ${h} = ${ans}`)} סמ"ר.`;
    dis = [
      [base * side, "slanted_side_as_height"],
      [(base * h) % 2 === 0 ? floorDiv(base * h, 2) : null, "triangle_area_no_half"],
      [2 * (base + side), "area_perimeter_confusion"],
    ];
    const shift = pyRound(Math.sqrt(side * side - h * h), 2);
    fig = makeFigure("polygon", {
      points: [
        [0, 0],
        [base, 0],
        [base + shift, h],
        [shift, h],
      ],
      labels: { side_0: String(base), side_1: String(side), height: String(h) },
    });
    [key, calc] = [`par${base}x${h}s${side}`, `${base} * ${h}`];
  } else if (shape === "trapezoid") {
    const a = rng.randint(2, 12);
    let c = rng.randint(2, 12);
    let h = rng.randint(2, 10);
    while (a === c) c = rng.randint(2, 12);
    if (((a + c) * h) % 2) h += 1;
    ans = floorDiv((a + c) * h, 2);
    prompt = `טרפז: הבסיסים ${a} ס"מ ו־${c} ס"מ, והגובה ${h} ס"מ. מה השטח שלו?`;
    expl = `שטח טרפז = (בסיס + בסיס) × גובה : 2. ` + `${ltr(`(${a} + ${c}) × ${h} : 2 = ${ans}`)} סמ"ר.`;
    dis = [
      [(a + c) * h, "triangle_area_no_half"],
      [(a * c * h) % 2 === 0 ? floorDiv(a * c * h, 2) : null, null],
    ];
    const hi = Math.max(a, c);
    const lo = Math.min(a, c);
    fig = makeFigure("polygon", {
      points: [
        [0, 0],
        [hi, 0],
        [hi - (hi - lo) / 2, h],
        [(hi - lo) / 2, h],
      ],
      labels: { side_0: String(hi), side_2: String(lo), height: String(h) },
    });
    [key, calc] = [`trap${a},${c}x${h}`, `(${a} + ${c}) * ${h} // 2`];
  } else {
    // circle
    const r = rng.randint(1, 10);
    const givenD = rng.random() < 0.4;
    const area = PI.mul(r).mul(r);
    ans = area;
    style = "decimal";
    if (givenD) {
      prompt = `קוטר העיגול ${2 * r} ס"מ. מה השטח שלו? (π = 3.14)`;
      expl = `הרדיוס הוא חצי מהקוטר: ${r}. שטח = π × r × r = ` + `${ltr(`3.14 × ${r} × ${r} = ${fmt(area)}`)} סמ"ר.`;
    } else {
      prompt = `רדיוס העיגול ${r} ס"מ. מה השטח שלו? (π = 3.14)`;
      expl = `שטח עיגול = π × r × r = ` + `${ltr(`3.14 × ${r} × ${r} = ${fmt(area)}`)} סמ"ר.`;
    }
    dis = [
      [PI.mul(2).mul(r), "circle_area_circumference"],
      [givenD ? PI.mul(4).mul(r).mul(r) : null, "circle_radius_diameter"],
      [!givenD ? PI.mul(r).mul(2).mul(2) : null, null],
      [area.add(1), null],
    ];
    fig = makeFigure("circle", { r, show: givenD ? "diameter" : "radius", label: String(givenD ? 2 * r : r) });
    key = `circ${givenD ? "d" : "r"}${r}`;
    calc = `F(314, 100) * ${r} * ${r}`;
  }
  const diffs: Record<string, number> = { rectangle: -0.3, square: -0.5, triangle: 0.2, parallelogram: 0.3, trapezoid: 0.5, circle: 0.6 };
  const ansF = typeof ans === "number" ? ans : ans.toNumber();
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.area:${key}`,
    prompt_he: prompt,
    answer: ans,
    distractors: dis,
    explanation_he: expl,
    difficulty: diffs[shape]! + 0.3 * scale(ansF, 4, 200),
    figure: fig,
    style,
    unit: CM2,
    calc,
  });
});

register("geometry.circumference", (rng, params, ctx) => {
  const r = rng.randint(1, 15);
  const givenD = rng.random() < 0.5;
  const ans = PI.mul(2).mul(r);
  let prompt: string;
  let expl: string;
  if (givenD) {
    prompt = `קוטר מעגל ${2 * r} ס"מ. מה ההיקף שלו? (π = 3.14)`;
    expl = `היקף מעגל = π × קוטר: ${ltr(`3.14 × ${2 * r} = ${fmt(ans)}`)} ס"מ.`;
  } else {
    prompt = `רדיוס מעגל ${r} ס"מ. מה ההיקף שלו? (π = 3.14)`;
    expl = `היקף מעגל = 2 × π × רדיוס: ` + `${ltr(`2 × 3.14 × ${r} = ${fmt(ans)}`)} ס"מ.`;
  }
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.circumference:${givenD ? "d" : "r"}${r}`,
    prompt_he: prompt,
    answer: ans,
    distractors: [
      [PI.mul(r).mul(r), "circle_area_circumference"],
      [!givenD ? PI.mul(r) : PI.mul(4).mul(r), "circle_radius_diameter"],
      [ans.add(1), null],
    ],
    explanation_he: expl,
    difficulty: 0.2 + 0.3 * B(givenD),
    figure: makeFigure("circle", { r, show: givenD ? "diameter" : "radius" }),
    style: "decimal",
    unit: CM,
    calc: `2 * F(314, 100) * ${r}`,
  });
});

register("geometry.volume", (rng, params, ctx) => {
  const shapes = asList<string>(params["shape"], ["box", "cube"]);
  const shape = rng.choice(shapes);
  let dims: number[];
  let prompt: string;
  if (shape === "cube") {
    const a = rng.randint(2, 10);
    dims = [a, a, a];
    prompt = `מה הנפח של קובייה שאורך צלעה ${a} ס"מ?`;
  } else {
    dims = [rng.randint(2, 12), rng.randint(2, 10), rng.randint(2, 8)];
    prompt = `תיבה שמידותיה ${dims[0]} ס"מ, ${dims[1]} ס"מ ו־${dims[2]} ` + `ס"מ. מה הנפח שלה?`;
  }
  const [l, w, h] = dims as [number, number, number];
  const ans = l * w * h;
  const surface = 2 * (l * w + l * h + w * h);
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.volume:${shape}${tup(dims)}`,
    prompt_he: prompt,
    answer: ans,
    distractors: [
      [l + w + h, "volume_add_dims"],
      [surface, "volume_surface_confusion"],
      [l * w, "volume_base_only"],
    ],
    explanation_he: `נפח = אורך × רוחב × גובה: ` + `${ltr(`${l} × ${w} × ${h} = ${ans}`)} סמ"ק.`,
    difficulty: 0.0 + 0.4 * scale(ans, 8, 960),
    figure: makeFigure("solid", { name: shape, dims: [...dims] }),
    unit: CM3,
    calc: `${l} * ${w} * ${h}`,
  });
});

export const SYMMETRY: readonly (readonly [string, string, string, string])[] = [
  ["ריבוע", "4", "square", "4"],
  ["מלבן", "2", "rectangle", "4"],
  ["משולש שווה צלעות", "3", "equilateral", "1"],
  ["משולש שווה שוקיים", "1", "isosceles", "3"],
  ["משולש שונה צלעות", "0", "scalene", "1"],
  ["עיגול", "אינסוף", "circle", "1"],
  ["מחומש משוכלל", "5", "pentagon", "0"],
  ["משושה משוכלל", "6", "hexagon", "3"],
  ["מעוין", "2", "rhombus", "4"],
  ["מקבילית", "0", "parallelogram", "2"],
  ["דלתון", "1", "kite", "2"],
  ["טרפז שווה שוקיים", "1", "isosceles_trapezoid", "2"],
];

const SYMMETRY_WHY: Readonly<Record<string, string>> = {
  square: "2 אלכסונים ו־2 קווים דרך אמצעי הצלעות",
  rectangle: "רק 2 קווים דרך אמצעי הצלעות. האלכסונים לא צירי סימטריה",
  equilateral: "קו מכל קודקוד לאמצע הצלע שמולו",
  isosceles: "רק הקו מקודקוד הראש לאמצע הבסיס",
  scalene: "אין קו שמחלק אותו לשני חצאים זהים",
  circle: "כל קו שעובר דרך המרכז",
  pentagon: "קו מכל קודקוד לאמצע הצלע שמולו",
  hexagon: "3 קווים בין קודקודים נגדיים ו־3 בין אמצעי צלעות",
  rhombus: "2 האלכסונים",
  parallelogram: "אם מקפלים אותה, החצאים לא מתלכדים",
  kite: "רק האלכסון שעובר בין הצלעות השוות",
  isosceles_trapezoid: "רק הקו דרך אמצעי שני הבסיסים",
};

register("geometry.symmetry", (rng, _params, ctx) => {
  const [name, ans, code, trap] = rng.choice(SYMMETRY);
  const pool = ["0", "1", "2", "3", "4", "5", "6", "אינסוף"];
  const trapTag = code === "rectangle" || code === "rhombus" || code === "parallelogram" ? "symmetry_diagonal" : "symmetry_count";
  const dis: Opt[] = trap !== ans ? [opt(trap, { tag: trapTag })] : [];
  dis.push(...pool.filter((x) => x !== ans && x !== trap).map((x) => opt(x)));
  const diffs: Record<string, number> = { square: 0.0, rectangle: 0.4, circle: 0.2, parallelogram: 0.6, rhombus: 0.3 };
  return optionsQuestion(rng, ctx, {
    item_id: `geometry.symmetry:${code}`,
    prompt_he: `כמה צירי סימטריה יש ל${name}?`,
    prompt_en: "How many lines of symmetry?",
    correct: opt(ans),
    distractors: dis,
    explanation_he: `ל${name} ${ans === "אינסוף" ? "אינסוף" : ans} צירי סימטריה: ${SYMMETRY_WHY[code]}.`,
    difficulty: diffs[code] ?? 0.0,
    figure: makeFigure("symmetry", { shape: code }),
  });
});

export const SOLIDS: Readonly<Record<string, string>> = {
  cube: "קובייה",
  box: "תיבה",
  cylinder: "גליל",
  cone: "חרוט",
  sphere: "כדור",
  pyramid: "פירמידה",
  prism: "מנסרה משולשת",
};
export const SOLID_EXAMPLES: readonly (readonly [string, string])[] = [
  ["פחית שתייה", "cylinder"],
  ["כדורגל", "sphere"],
  ["קופסת נעליים", "box"],
  ["גביע גלידה", "cone"],
  ["קוביית משחק", "cube"],
  ["תפוז", "sphere"],
  ["גליל נייר", "cylinder"],
  ["קרטון חלב", "box"],
  ["כובע ליצן", "cone"],
];
const SOLID_WHY: Readonly<Record<string, string>> = {
  cube: "6 פאות ריבועיות שוות",
  box: "6 פאות מלבניות",
  cylinder: "שני בסיסים עגולים ומעטפת מעוגלת",
  cone: "בסיס עגול אחד וקודקוד אחד",
  sphere: "עגול לגמרי מכל הכיוונים, בלי פאות",
  pyramid: "בסיס, ופאות משולשות שנפגשות בקודקוד",
  prism: "שני בסיסים משולשים ושלוש פאות מלבניות",
};
const SOLID_CONFUSABLE = new Set(["cube|box", "box|cube", "cone|pyramid", "pyramid|cone", "cylinder|prism"]);

register("geometry.solid_identify", (rng, _params, ctx) => {
  let thing: string | null;
  let solid: string;
  let prompt: string;
  let key: string;
  let fig: Figure | null;
  if (rng.random() < 0.5) {
    [thing, solid] = rng.choice(SOLID_EXAMPLES);
    prompt = `לאיזה גוף דומה ${thing}?`;
    key = `ex:${thing}`;
    fig = null;
  } else {
    solid = rng.choice(Object.keys(SOLIDS));
    thing = null;
    prompt = "איזה גוף זה?";
    key = `fig:${solid}`;
    fig = makeFigure("solid", { name: solid });
  }
  const lead = thing ? `${thing} דומה ל${SOLIDS[solid]}` : SOLIDS[solid];
  return optionsQuestion(rng, ctx, {
    item_id: `geometry.solid_identify:${key}`,
    prompt_he: prompt,
    correct: opt(SOLIDS[solid]!),
    distractors: Object.entries(SOLIDS)
      .filter(([k]) => k !== solid)
      .map(([k, v]) => opt(v, { tag: SOLID_CONFUSABLE.has(`${solid}|${k}`) ? "shape_confusion" : null })),
    explanation_he: `${lead}: ${SOLID_WHY[solid]}.`,
    difficulty: -0.4 + 0.3 * B(solid === "prism" || solid === "pyramid" || solid === "cone"),
    figure: fig,
  });
});

const POLY_PRISM: ReadonlyMap<number, string> = new Map([
  [3, "משולשת"],
  [4, "מרובעת"],
  [5, "מחומשת"],
  [6, "משושה"],
]);

export function solidCounts(kind: string, n: number): [number, number, number] {
  if (kind === "prism") return [n + 2, 3 * n, 2 * n];
  return [n + 1, 2 * n, n + 1];
}

register("geometry.solid_count", (rng, params, ctx) => {
  const kind = rng.choice(["prism", "pyramid", "cube"]);
  const n = kind === "cube" ? 4 : rng.choice([...POLY_PRISM.keys()]);
  const baseKind = kind !== "pyramid" ? "prism" : "pyramid";
  const [f, e, v] = solidCounts(baseKind, n);
  const name = kind === "cube" ? "קובייה" : kind === "prism" ? `מנסרה ${POLY_PRISM.get(n)}` : `פירמידה ${POLY_PRISM.get(n)}`;
  const what = rng.choice(["faces", "edges", "vertices"] as const);
  const word = { faces: "פאות", edges: "מקצועות", vertices: "קודקודים" }[what];
  const ans = { faces: f, edges: e, vertices: v }[what];
  const others = [f, e, v].filter((x) => x !== ans);
  const why =
    baseKind === "prism"
      ? {
          faces: `2 בסיסים ועוד ${n} פאות צדדיות: ${f}`,
          edges: `${n} בכל בסיס ועוד ${n} לאורך: ${ltr(`3 × ${n} = ${e}`)}`,
          vertices: `${n} בכל בסיס: ${ltr(`2 × ${n} = ${v}`)}`,
        }[what]
      : {
          faces: `בסיס אחד ועוד ${n} פאות משולשות: ${f}`,
          edges: `${n} בבסיס ועוד ${n} אל הקודקוד: ${e}`,
          vertices: `${n} בבסיס ועוד הקודקוד העליון: ${v}`,
        }[what];
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.solid_count:${kind}${n}:${what}`,
    prompt_he: `כמה ${word} יש ל${name}?`,
    prompt_en: `How many ${what} does it have?`,
    answer: ans,
    distractors: [...others.map((o) => [o, "faces_edges_confusion"] as const), [ans + 1, null]],
    explanation_he: `ל${name}: ${why}.`,
    difficulty: -0.2 + 0.1 * n + 0.3 * B(what === "edges"),
    figure: makeFigure("solid", { name: kind === "cube" ? "cube" : `${baseKind}_${n}` }),
    calc: `${ans}`,
  });
});

register("geometry.euler", (rng, params, ctx) => {
  const kind = rng.choice(["prism", "pyramid"]);
  const n = rng.randint(3, 10);
  const [f, e, v] = solidCounts(kind, n);
  const find = rng.choice(["faces", "edges", "vertices"]);
  let prompt: string;
  let ans: number;
  let py: string;
  let step: string;
  let wrong: number;
  if (find === "edges") {
    prompt = `לגוף יש ${f} פאות ו־${v} קודקודים. כמה מקצועות יש לו?`;
    [ans, py] = [e, `${f} + ${v} - 2`];
    step = `${f} + ${v} - 2 = ${e}`;
    wrong = f + v;
  } else if (find === "faces") {
    prompt = `לגוף יש ${v} קודקודים ו־${e} מקצועות. כמה פאות יש לו?`;
    [ans, py] = [f, `2 + ${e} - ${v}`];
    step = `2 + ${e} - ${v} = ${f}`;
    wrong = e - v;
  } else {
    prompt = `לגוף יש ${f} פאות ו־${e} מקצועות. כמה קודקודים יש לו?`;
    [ans, py] = [v, `2 + ${e} - ${f}`];
    step = `2 + ${e} - ${f} = ${v}`;
    wrong = e - f;
  }
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.euler:${kind}${n}:${find}`,
    prompt_he: prompt,
    answer: ans,
    distractors: [
      [wrong, "euler_forgot_2"],
      [ans + 2, "euler_forgot_2"],
      [ans + 1, null],
    ],
    explanation_he: `נוסחת אוילר: פאות + קודקודים − מקצועות = 2. ${ltr(step)}.`,
    difficulty: 0.3 + 0.03 * n,
    calc: py,
  });
});

function nzr(rng: PyRandom): number {
  let v = 0;
  while (v === 0) v = rng.randint(-8, 8);
  return v;
}

register("geometry.coordinates", (rng, params, ctx) => {
  const kind = rng.choice(asList<string>(params["kind"], ["read"]));
  if (kind === "read") {
    const x = rng.randint(0, 8);
    let y = rng.randint(0, 8);
    while (x === y) y = rng.randint(0, 8);
    const dis = [
      opt(ltr(`(${y}, ${x})`), { tag: "coordinate_swap" }),
      opt(ltr(`(${x + 1}, ${y})`)),
      opt(ltr(`(${x}, ${y + 1})`)),
      opt(ltr(`(${Math.max(x - 1, 0)}, ${y})`)),
    ];
    return optionsQuestion(rng, ctx, {
      item_id: `geometry.coordinates:read(${x},${y})`,
      prompt_he: "מה השיעורים של הנקודה A?",
      prompt_en: "What are the coordinates of A?",
      correct: opt(ltr(`(${x}, ${y})`)),
      distractors: dis,
      explanation_he: `קודם x (ימינה על הציר האופקי): ${x}. אחר כך y ` + `(למעלה): ${y}. לכן A = ${ltr(`(${x}, ${y})`)}.`,
      difficulty: -0.2,
      figure: makeFigure("coordinate", { range: 8, quadrants: 1, points: [{ x, y, label: "A" }] }),
    });
  }
  if (kind === "quadrant") {
    const x = nzr(rng);
    const y = nzr(rng);
    const q = x > 0 ? (y > 0 ? 1 : 4) : y > 0 ? 2 : 3;
    const names: Record<number, string> = { 1: "רביע ראשון", 2: "רביע שני", 3: "רביע שלישי", 4: "רביע רביעי" };
    const mirror = ({ 1: 2, 2: 1, 3: 4, 4: 3 } as Record<number, number>)[q]!;
    const sx = x > 0 ? "חיובי" : "שלילי";
    const sy = y > 0 ? "חיובי" : "שלילי";
    return optionsQuestion(rng, ctx, {
      item_id: `geometry.coordinates:quad(${x},${y})`,
      prompt_he: `באיזה רביע נמצאת הנקודה ${ltr(`(${x}, ${y})`)}?`,
      prompt_en: `Which quadrant is (${x}, ${y}) in?`,
      correct: opt(names[q]!),
      distractors: [opt(names[mirror]!, { tag: "quadrant_confusion" }), ...[1, 2, 3, 4].filter((k) => k !== q && k !== mirror).map((k) => opt(names[k]!))],
      explanation_he: `x ${sx} ו־y ${sy}. הרביעים ממוספרים נגד כיוון ` + `השעון, מהרביע הימני העליון. לכן ${names[q]}.`,
      difficulty: 0.1,
      figure: makeFigure("coordinate", { range: 8, quadrants: 4, points: [{ x, y, label: "A" }] }),
    });
  }
  const horiz = rng.random() < 0.5;
  const a = rng.randint(-8, 8);
  let c = rng.randint(-8, 8);
  while (a === c) c = rng.randint(-8, 8);
  const d = rng.randint(-6, 6);
  const [p1, p2] = horiz
    ? [
        [a, d],
        [c, d],
      ]
    : [
        [d, a],
        [d, c],
      ];
  const dist = Math.abs(a - c);
  const wrong = Math.abs(Math.abs(a) - Math.abs(c));
  const axis = horiz ? "x" : "y";
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.coordinates:dist${tup(p1!)}${tup(p2!)}`,
    prompt_he: `מה המרחק בין הנקודות ${ltr(`(${p1![0]}, ${p1![1]})`)} ו־` + `${ltr(`(${p2![0]}, ${p2![1]})`)}?`,
    prompt_en: `Distance between ${tup(p1!)} and ${tup(p2!)}?`,
    answer: dist,
    distractors: [
      [wrong !== dist ? wrong : null, "negative_sign_error"],
      [dist + 1, "off_by_one"],
      [Math.abs(a) + Math.abs(c) + 1, null],
    ],
    explanation_he: `הנקודות על אותו קו, ושיעור ה־${axis} שונה. המרחק: ` + `${ltr(`|${Math.max(a, c)} - (${Math.min(a, c)})| = ${dist}`)}.`,
    difficulty: 0.0 + 0.4 * B(a * c < 0),
    figure: makeFigure("coordinate", {
      range: 8,
      quadrants: 4,
      points: [
        { x: p1![0], y: p1![1], label: "A" },
        { x: p2![0], y: p2![1], label: "B" },
      ],
    }),
    calc: `abs(${a} - (${c}))`,
  });
});

export const TRIPLES: readonly (readonly [number, number, number])[] = [
  [3, 4, 5],
  [5, 12, 13],
  [8, 15, 17],
  [7, 24, 25],
  [20, 21, 29],
  [9, 40, 41],
];

register("geometry.pythagoras", (rng, params, ctx) => {
  const find = rng.choice(asList<string>(params["find"], ["hyp"]));
  let [a, c, h] = rng.choice(TRIPLES);
  const k = a === 3 && c === 4 && h === 5 ? rng.randint(1, 3) : 1;
  [a, c, h] = [a * k, c * k, h * k];
  if (rng.random() < 0.5) [a, c] = [c, a];
  const fig = makeFigure("polygon", {
    points: [
      [0, 0],
      [a, 0],
      [0, c],
    ],
    right_angle: 0,
    labels: { side_0: String(a), side_2: find === "hyp" ? String(c) : "?", side_1: find === "hyp" ? "?" : String(h) },
  });
  if (find === "hyp") {
    return numericQuestion(rng, ctx, params, {
      item_id: `geometry.pythagoras:hyp${a},${c}`,
      prompt_he: `במשולש ישר־זווית הניצבים ${a} ו־${c}. מה אורך היתר?`,
      answer: h,
      distractors: [
        [a + c, "pythagoras_add_sides"],
        [h * h, "pythagoras_no_root"],
        [h + 1, null],
      ],
      explanation_he: `${ltr(`${a}² + ${c}² = ${a * a} + ${c * c} = ${h * h}`)}. ` + `היתר: ${ltr(`√${h * h} = ${h}`)}.`,
      difficulty: 0.0 + 0.2 * B(h > 20),
      figure: fig,
      calc: `sqrt(${a}**2 + ${c}**2)`,
    });
  }
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.pythagoras:leg${h},${a}`,
    prompt_he: `במשולש ישר־זווית היתר ${h} וניצב אחד ${a}. מה אורך הניצב השני?`,
    answer: c,
    distractors: [
      [h - a, "pythagoras_add_sides"],
      [c * c, "pythagoras_no_root"],
      [c + 1, null],
    ],
    explanation_he: `${ltr(`${h}² - ${a}² = ${h * h} - ${a * a} = ${c * c}`)}. ` + `הניצב: ${ltr(`√${c * c} = ${c}`)}.`,
    difficulty: 0.4 + 0.2 * B(h > 20),
    figure: fig,
    calc: `sqrt(${h}**2 - ${a}**2)`,
  });
});

type Unit = readonly [string, string, string, number];
export const UNITS: Readonly<Record<string, readonly Unit[]>> = {
  length: [
    ["מטר", "מטרים", "סנטימטרים", 100],
    ['ס"מ', 'ס"מ', "מילימטרים", 10],
    ["קילומטר", "קילומטרים", "מטרים", 1000],
  ],
  mass: [["קילוגרם", "קילוגרמים", "גרמים", 1000]],
  volume: [["ליטר", "ליטרים", "מיליליטרים", 1000]],
  time: [
    ["שעה", "שעות", "דקות", 60],
    ["דקה", "דקות", "שניות", 60],
  ],
};

register("geometry.units", (rng, params, ctx) => {
  const kinds = asList<string>(params["kind"], ["length", "mass", "volume", "time"]);
  const kind = rng.choice(kinds);
  const [bigS, bigP, small, factor] = rng.choice(UNITS[kind]!);
  const allowDec = Boolean(pget(params, "decimals", false));
  const toSmall = rng.random() < 0.6 || !allowDec;
  let ans: number | Fraction;
  let prompt: string;
  let expl: string;
  let wrong: Distractor[];
  let key: string;
  let calc: string;
  if (toSmall) {
    const n = rng.randint(2, 12);
    ans = n * factor;
    prompt = `${n} ${bigP} = כמה ${small}?`;
    expl = `ב${bigS} אחד יש ${factor} ${small}: ${ltr(`${n} × ${factor} = ${fmt(ans)}`)}.`;
    wrong = [
      [n * (factor === 100 || factor === 1000 ? floorDiv(factor, 10) : 100), "units_factor"],
      [factor !== 60 ? n * factor * 10 : n * 100, "units_factor"],
      [n + factor, null],
    ];
    key = `${n}${bigS}->${small}`;
    calc = `${n} * ${factor}`;
  } else {
    // Python draws (and drops) one more number here; keep the draw.
    rng.randint(1, floorDiv(9 * factor, 10));
    const a = F(rng.randint(11, 99), 10);
    ans = a;
    const m = a.mul(factor);
    prompt = `${fmt(m)} ${small} = כמה ${bigP}?`;
    expl = `מחלקים ב־${factor}: ${ltr(`${fmt(m)} : ${factor} = ${fmt(a)}`)}.`;
    wrong = [
      [m.div(floorDiv(factor, 10)), "units_factor"],
      [m.mul(factor), "units_factor"],
      [a.mul(10), null],
    ];
    key = `${m}${small}->${bigS}`;
    calc = `F(${m.n}, ${m.d}) / ${factor}`;
  }
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.units:${key}`,
    prompt_he: prompt,
    answer: ans,
    distractors: wrong,
    explanation_he: expl,
    difficulty: -0.3 + 0.5 * B(!toSmall) + 0.2 * B(factor === 60),
    style: "decimal",
    calc,
  });
});

register("geometry.similarity", (rng, params, ctx) => {
  const find = rng.choice(asList<string>(params["find"], ["side", "area"]));
  const k = rng.randint(2, 5);
  if (find === "side") {
    const s = rng.randint(2, 12);
    const ans = s * k;
    return numericQuestion(rng, ctx, params, {
      item_id: `geometry.similarity:side${s}x${k}`,
      prompt_he: `שני משולשים דומים ביחס דמיון ${k}. צלע במשולש הקטן ` + `${s} ס"מ. מה אורך הצלע המתאימה בגדול?`,
      answer: ans,
      distractors: [
        [s + k, "similarity_add"],
        [s * k * k, null],
        [ans + 1, null],
      ],
      explanation_he: `במשולשים דומים כל הצלעות גדלות פי ${k}: ` + `${ltr(`${s} × ${k} = ${ans}`)} ס"מ.`,
      difficulty: -0.2,
      unit: CM,
      calc: `${s} * ${k}`,
    });
  }
  const a = rng.randint(2, 15);
  const ans = a * k * k;
  return numericQuestion(rng, ctx, params, {
    item_id: `geometry.similarity:area${a}x${k}`,
    prompt_he: `שני משולשים דומים ביחס דמיון ${k}. שטח הקטן ${a} סמ"ר. ` + `מה שטח הגדול?`,
    answer: ans,
    distractors: [
      [a * k, "area_ratio_linear"],
      [a + k, "similarity_add"],
      [ans + k, null],
    ],
    explanation_he: `יחס השטחים הוא ריבוע יחס הדמיון: ` + `${ltr(`${k}² = ${k * k}`)}. השטח: ` + `${ltr(`${a} × ${k * k} = ${ans}`)} סמ"ר.`,
    difficulty: 0.5,
    unit: CM2,
    calc: `${a} * ${k} ** 2`,
  });
});

