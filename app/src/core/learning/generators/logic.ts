/**
 * Logic: patterns, odd one out, sequences, mini sudoku, analogies, balance
 * puzzles, robot paths and true/false statements. A line-by-line port of
 * `generators/logic.py`.
 */
import { makeFigure } from "../model";
import type { PyRandom } from "../random";
import { floorDiv } from "../py";
import {
  asList,
  b,
  type Distractor,
  emoji,
  ltr,
  numericQuestion,
  opt,
  optionsQuestion,
  pget,
  pint,
  range,
  register,
  trueFalseQuestion,
} from "./common";

type Token = readonly [string, string];

export const TOKENS: readonly Token[] = [
  ["1f534", "עיגול אדום"],
  ["1f535", "עיגול כחול"],
  ["1f7e2", "עיגול ירוק"],
  ["1f7e1", "עיגול צהוב"],
  ["2b50", "כוכב"],
  ["2764", "לב"],
  ["1f53a", "משולש אדום"],
  ["1f7e6", "ריבוע כחול"],
];

register("logic.pattern_repeat", (rng, params, ctx) => {
  const kinds = asList<string>(params["kinds"], ["AB", "AAB", "ABB", "ABC"]);
  const unit = rng.choice(kinds);
  const letters = [...new Set(Array.from(unit))].sort();
  const toks = rng.sample(TOKENS, letters.length);
  const mapping = new Map(letters.map((l, i) => [l, toks[i]!] as const));
  const seqLen = unit.length * 2 + rng.randint(1, unit.length);
  const seq = range(seqLen + 1).map((i) => unit[i % unit.length]!);
  const shown = seq.slice(0, -1);
  const nxt = seq[seq.length - 1]!;
  const right = mapping.get(nxt)!;
  const prev = mapping.get(seq[seq.length - 2]!)!;
  const dis = toks.filter((t) => t !== right).map((t) => opt(t[1], { image: emoji(t[0]), tag: t === prev ? "pattern_wrong_unit" : null }));
  const extra = TOKENS.filter((t) => !toks.includes(t));
  dis.push(...rng.sample(extra, 2).map((t) => opt(t[1], { image: emoji(t[0]) })));
  const unitNames = Array.from(unit)
    .map((c) => mapping.get(c)![1])
    .join(", ");
  return optionsQuestion(rng, ctx, {
    item_id: `logic.pattern_repeat:${unit}:${toks.map((t) => t[0].slice(-2)).join("")}` + `:${seqLen}`,
    prompt_he: "מה בא אחר כך בתבנית?",
    prompt_en: "What comes next?",
    correct: opt(right[1], { image: emoji(right[0]) }),
    distractors: dis,
    explanation_he: `התבנית חוזרת על עצמה: ${unitNames}. ` + `ממשיכים את החזרה: הבא בתור הוא ${right[1]}.`,
    difficulty: -0.6 + 0.25 * (unit.length - 2) + 0.2 * b(unit === "ABB" || unit === "AAB"),
    figure: makeFigure("pattern", { items: [...shown.map((c) => mapping.get(c)![0]), "?"] }),
  });
});

export const CATEGORIES: Readonly<Record<string, readonly Token[]>> = {
  פירות: [
    ["תפוח", "1f34e"],
    ["בננה", "1f34c"],
    ["ענבים", "1f347"],
    ["תות", "1f353"],
    ["אגס", "1f350"],
    ["אבטיח", "1f349"],
  ],
  חיות: [
    ["כלב", "1f415"],
    ["חתול", "1f408"],
    ["פרה", "1f404"],
    ["סוס", "1f40e"],
    ["ארנב", "1f407"],
    ["תרנגולת", "1f414"],
  ],
  "כלי תחבורה": [
    ["מכונית", "1f697"],
    ["אוטובוס", "1f68c"],
    ["אופניים", "1f6b2"],
    ["רכבת", "1f686"],
    ["מטוס", "2708"],
    ["סירה", "26f5"],
  ],
  בגדים: [
    ["חולצה", "1f455"],
    ["מכנסיים", "1f456"],
    ["כובע", "1f9e2"],
    ["גרביים", "1f9e6"],
    ["מעיל", "1f9e5"],
    ["נעל", "1f45f"],
  ],
  "כלי נגינה": [
    ["תוף", "1f941"],
    ["גיטרה", "1f3b8"],
    ["כינור", "1f3bb"],
    ["חצוצרה", "1f3ba"],
    ["פסנתר", "1f3b9"],
  ],
  ירקות: [
    ["גזר", "1f955"],
    ["מלפפון", "1f952"],
    ["עגבנייה", "1f345"],
    ["תירס", "1f33d"],
    ["ברוקולי", "1f966"],
  ],
};
const NEAR = new Set(["פירות|ירקות", "ירקות|פירות"]);

register("logic.odd_one_out", (rng, params, ctx) => {
  const mode = pget(params, "mode", "emoji");
  if (mode === "numbers") return oddNumbers(rng, ctx);
  const cats = Object.keys(CATEGORIES);
  const cat = rng.choice(cats);
  const otherCat = rng.choice(cats.filter((c) => c !== cat));
  const k = 3;
  const same = rng.sample(CATEGORIES[cat]!, k);
  const odd = rng.choice(CATEGORIES[otherCat]!);
  return optionsQuestion(rng, ctx, {
    item_id: `logic.odd_one_out:${cat}>${odd[0]}:` + same.map((s) => s[0]).sort().join(","),
    prompt_he: "מה לא שייך לקבוצה?",
    prompt_en: "Which one does not belong?",
    correct: opt(odd[0], { image: emoji(odd[1]) }),
    distractors: same.map((s) => opt(s[0], { image: emoji(s[1]) })),
    explanation_he: `${same.map((s) => s[0]).join(", ")}: כולם ${cat}. ` + `${odd[0]} מהקבוצה "${otherCat}".`,
    difficulty: -0.6 + 0.6 * b(NEAR.has(`${cat}|${otherCat}`)),
    n: 4,
  });
});

function oddNumbers(rng: PyRandom, ctx: Parameters<typeof optionsQuestion>[1]) {
  const rule = rng.choice(["even", "odd", "mult"] as const);
  let same: number[];
  let odd: number;
  let why: string;
  if (rule === "even") {
    same = rng.sample(range(2, 60, 2), 3);
    odd = rng.randrange(1, 60, 2);
    why = "כולם זוגיים";
  } else if (rule === "odd") {
    same = rng.sample(range(1, 60, 2), 3);
    odd = rng.randrange(2, 60, 2);
    why = "כולם אי־זוגיים";
  } else {
    const m = rng.choice([3, 4, 5, 6, 7, 9]);
    same = rng.sample(range(2, 11), 3).map((x) => m * x);
    odd = m * rng.randint(2, 10) + rng.randint(1, m - 1);
    why = `כולם בלוח הכפל של ${m}`;
  }
  return optionsQuestion(rng, ctx, {
    item_id: `logic.odd_one_out:num:${rule}:${[...same].sort((x, y) => x - y).join(",")}` + `>${odd}`,
    prompt_he: "איזה מספר לא שייך לקבוצה?",
    prompt_en: "Which number does not belong?",
    correct: opt(String(odd)),
    distractors: same.map((s) => opt(String(s))),
    explanation_he: `${same.join(", ")}: ${why}. ${odd} לא.`,
    difficulty: -0.2 + 0.5 * b(rule === "mult"),
    n: 4,
  });
}

register("logic.sequence", (rng, params, ctx) => {
  const kinds = asList<string>(params["kinds"], ["arith"]);
  const kind = rng.choice(kinds);
  let tagWrong: Distractor[];
  let terms: number[];
  let rule: string;
  let diff: number;
  if (kind === "arith") {
    const d = rng.choice(range(-9, 13).filter((x) => x !== 0));
    const a = rng.randint(1, 30) + (d < 0 ? 40 : 0);
    terms = range(6).map((i) => a + i * d);
    rule = `בכל פעם ${d > 0 ? "מוסיפים" : "מורידים"} ${Math.abs(d)}`;
    tagWrong = [
      [terms.at(-1)! + d, "sequence_off_step"],
      [terms.at(-2)! + d + 1, "sequence_off_step"],
    ];
    diff = -0.5 + 0.05 * Math.abs(d) + 0.3 * b(d < 0);
  } else if (kind === "geom") {
    const r = rng.choice([2, 3, 10]);
    const a = rng.randint(1, 5);
    terms = range(5).map((i) => a * r ** i);
    rule = `בכל פעם כופלים ב־${r}`;
    const dd = terms.at(-2)! - terms.at(-3)!;
    tagWrong = [[terms.at(-2)! + dd, "sequence_add_vs_mul"]];
    diff = 0.2 + 0.1 * b(r === 3);
  } else if (kind === "fib") {
    const a = rng.randint(1, 5);
    const c = rng.randint(1, 6);
    terms = [a, c];
    while (terms.length < 7) terms.push(terms.at(-1)! + terms.at(-2)!);
    rule = "כל מספר הוא סכום שני המספרים שלפניו";
    const dd = terms.at(-2)! - terms.at(-3)!;
    tagWrong = [[terms.at(-2)! + dd, "sequence_add_vs_mul"]];
    diff = 0.6;
  } else if (kind === "squares") {
    const s = rng.randint(1, 4);
    terms = range(5).map((i) => (s + i) ** 2);
    rule = `אלה מספרים ריבועיים: ${s}×${s}, ${s + 1}×${s + 1}... ` + `(ההפרשים גדלים ב־2)`;
    const dd = terms.at(-2)! - terms.at(-3)!;
    tagWrong = [[terms.at(-2)! + dd, "sequence_off_step"]];
    diff = 0.7;
  } else {
    // alternating +a, +b
    const [x, y] = rng.sample(range(1, 10), 2) as [number, number];
    const a = rng.randint(1, 20);
    terms = [a];
    for (let i = 0; i < 6; i++) terms.push(terms.at(-1)! + (i % 2 === 0 ? x : y));
    rule = `מוסיפים לסירוגין ${x} ו־${y}`;
    const prevStep = terms.at(-2)! - terms.at(-3)!;
    tagWrong = [[terms.at(-2)! + prevStep, "sequence_off_step"]];
    diff = 0.8;
  }
  const ans = terms.at(-1)!;
  const shown = terms.slice(0, -1).join(", ") + ", ?";
  return numericQuestion(rng, ctx, params, {
    item_id: `logic.sequence:${kind}:${terms.slice(0, 3).join(",")}`,
    prompt_he: `מה המספר הבא בסדרה? ${shown}`,
    prompt_en: `What comes next? ${shown}`,
    answer: ans,
    distractors: [...tagWrong, [ans + 1, null], [ans - 1, null]],
    explanation_he: `${rule}. לכן אחרי ${terms.at(-2)!} בא ${ans}.`,
    difficulty: diff,
    allow_negative: ans < 0,
    calc: `${ans}`,
  });
});

/** A random 4x4 sudoku (rows, columns and 2x2 boxes). */
export function latin4(rng: PyRandom): number[][] {
  const base = [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1],
  ];
  const perm = rng.sample([1, 2, 3, 4], 4);
  let grid = base.map((row) => row.map((v) => perm[v - 1]!));
  if (rng.random() < 0.5) grid = range(4).map((j) => grid.map((row) => row[j]!));
  if (rng.random() < 0.5) [grid[0], grid[1]] = [grid[1]!, grid[0]!];
  if (rng.random() < 0.5) [grid[2], grid[3]] = [grid[3]!, grid[2]!];
  return grid;
}

register("logic.sudoku", (rng, params, ctx) => {
  const mode = pget(params, "mode", "row");
  if (mode === "row") {
    const n = pint(params, "size", 4);
    const row = rng.sample(range(1, n + 1), n);
    const hole = rng.randrange(n);
    const ans = row[hole]!;
    const shown = row.map((v, i) => (i === hole ? "?" : String(v)));
    const sum = row.reduce((a, x) => a + x, 0);
    return numericQuestion(rng, ctx, params, {
      item_id: `logic.sudoku:row:${row.join("")}@${hole}`,
      prompt_he: `בשורה צריכים להופיע כל המספרים מ־1 עד ${n}, כל אחד ` + `פעם אחת: ${ltr(shown.join(" "))}. מה חסר?`,
      prompt_en: `Each of 1 to ${n} once: ${shown.join(" ")}. Missing?`,
      answer: ans,
      distractors: row
        .filter((v) => v !== ans)
        .map((v) => [v, "sudoku_repeat"] as const)
        .slice(0, 2),
      explanation_he: `בשורה כבר יש ` + `${row.filter((v) => v !== ans).join(", ")}. ` + `המספר שחסר הוא ${ans}.`,
      difficulty: -0.5 + 0.1 * (n - 4),
      min_value: 1,
      max_value: n,
      figure: makeFigure("grid_numbers", { grid: [row.map((v, i) => (i === hole ? null : v))], target: [0, hole] }),
      choice_only: false,
      calc: `${floorDiv(n * (n + 1), 2)} - ${sum - ans}`,
    });
  }
  const grid = latin4(rng);
  const r = rng.randrange(4);
  const c = rng.randrange(4);
  const ans = grid[r]![c]!;
  // Hide the target and one more cell in its row, so the row alone is not
  // enough: the column decides.
  const other = rng.choice(range(4).filter((j) => j !== c));
  const shown = range(4).map((i) => range(4).map((j) => (i === r && (j === c || j === other) ? null : grid[i]![j]!)));
  const colVals = range(4)
    .filter((i) => i !== r)
    .map((i) => grid[i]![c]!);
  const rowMissing = [ans, grid[r]![other]!].sort((x, y) => x - y);
  return numericQuestion(rng, ctx, params, {
    item_id: `logic.sudoku:grid:${grid.flat().join("")}` + `@${r}${c}${other}`,
    prompt_he: "בסודוקו 4 על 4 כל מספר מ־1 עד 4 מופיע פעם אחת בכל שורה, " + "עמודה וריבוע. מה המספר במשבצת המסומנת?",
    prompt_en: "Mini sudoku 4x4: which number goes in the marked cell?",
    answer: ans,
    distractors: [[grid[r]![other]!, "sudoku_row_only"], ...colVals.map((v) => [v, null] as const)],
    explanation_he:
      `בשורה חסרים ${rowMissing[0]} ו־${rowMissing[1]}. ` + `בעמודה כבר יש ${colVals.join(", ")}, ` + `ולכן המספר הוא ${ans}.`,
    difficulty: 0.3,
    min_value: 1,
    max_value: 4,
    figure: makeFigure("grid_numbers", { grid: shown, target: [r, c], boxes: 2 }),
    calc: `${ans}`,
  });
});

export const ANALOGY_RULES: readonly (readonly [string, (x: number) => number, string])[] = [
  ["×2", (x) => 2 * x, "כופלים ב־2"],
  ["+3", (x) => x + 3, "מוסיפים 3"],
  ["×3", (x) => 3 * x, "כופלים ב־3"],
  ["+10", (x) => x + 10, "מוסיפים 10"],
  ["sq", (x) => x * x, "כופלים את המספר בעצמו"],
  ["×2+1", (x) => 2 * x + 1, "כופלים ב־2 ומוסיפים 1"],
  ["-1", (x) => x - 1, "מורידים 1"],
];

register("logic.analogy", (rng, params, ctx) => {
  const [name, f, why] = rng.choice(ANALOGY_RULES);
  const [a, c, d] = rng.sample(range(2, 10), 3) as [number, number, number];
  const ans = f(d);
  const addGuess = d + (f(c) - c);
  return numericQuestion(rng, ctx, params, {
    item_id: `logic.analogy:${name}:${a},${c},${d}`,
    prompt_he: `${a} הופך ל־${f(a)}, ו־${c} הופך ל־${f(c)}. למה הופך ${d}?`,
    prompt_en: `${a} → ${f(a)}, ${c} → ${f(c)}. ${d} → ?`,
    answer: ans,
    distractors: [
      [addGuess !== ans ? addGuess : null, "analogy_add_vs_mul"],
      [ans + 1, null],
      [f(c), null],
    ],
    explanation_he: `הכלל: ${why}. בודקים: ${a} הופך ל־${f(a)}. לכן ${d} הופך ל־${ans}.`,
    difficulty: -0.3 + 0.4 * b(name === "sq" || name === "×2+1"),
    calc: `${ans}`,
  });
});

export const FRUITS: readonly Token[] = [
  ["1f34e", "תפוח"],
  ["1f34c", "בננה"],
  ["1f353", "תות"],
  ["1f350", "אגס"],
  ["1f347", "ענבים"],
];

register("logic.balance", (rng, params, ctx) => {
  const [[ea, na], [eb, nb]] = rng.sample(FRUITS, 2) as [Token, Token];
  const x = rng.randint(1, 9);
  const y = rng.randint(1, 9);
  const k = rng.choice([2, 3]);
  const s1 = k * x;
  const s2 = x + y;
  return numericQuestion(rng, ctx, params, {
    item_id: `logic.balance:${k}x=${s1},x+y=${s2}:${ea}${eb}`,
    prompt_he: `${k} פעמים ${na} שוקלים ${s1}. ${na} ו${nb} ביחד ` + `שוקלים ${s2}. כמה שוקל ${nb}?`,
    prompt_en: `${k} × A = ${s1}; A + B = ${s2}. B = ?`,
    answer: y,
    distractors: [
      [s2, "balance_total"],
      [x, "balance_total"],
      [s2 > s1 ? s2 - s1 : null, null],
      [y + 1, null],
    ],
    explanation_he: `קודם ${na}: ${ltr(`${s1} : ${k} = ${x}`)}. אחר כך ` + `${nb}: ${ltr(`${s2} - ${x} = ${y}`)}.`,
    difficulty: 0.0 + 0.3 * b(k === 3),
    figure: makeFigure("objects", { balance: [new Array<string>(k).fill(ea), [ea, eb]], weights: [s1, s2] }),
    calc: `${s2} - ${s1} // ${k}`,
  });
});

type Pt = readonly [number, number];
const MOVES: Readonly<Record<string, Pt>> = { R: [1, 0], L: [-1, 0], U: [0, 1], D: [0, -1] };
const MOVE_HE: Readonly<Record<string, string>> = { R: "ימינה", L: "שמאלה", U: "למעלה", D: "למטה" };
const MIRROR: Readonly<Record<string, string>> = { R: "L", L: "R", U: "U", D: "D" };
const FLIP_UD: Readonly<Record<string, string>> = { U: "D", D: "U" };
export const LABELS = ["א", "ב", "ג", "ד", "ה"] as const;
const DIRS = ["R", "L", "U", "D"];

export function walk(start: Pt, moves: readonly string[]): Pt {
  let [x, y] = start;
  for (const m of moves) {
    const [dx, dy] = MOVES[m]!;
    [x, y] = [x + dx, y + dy];
  }
  return [x, y];
}

function inside(p: Pt, size: number): boolean {
  return p[0] >= 0 && p[0] < size && p[1] >= 0 && p[1] < size;
}

const same = (p: Pt, q: Pt): boolean => p[0] === q[0] && p[1] === q[1];
/** Python `str(tuple)`: "(1, 2)". */
const tup = (p: Pt): string => `(${p[0]}, ${p[1]})`;

export function randomPath(rng: PyRandom, size: number, steps: number): [Pt, string[]] {
  for (let it = 0; it < 500; it++) {
    const start: Pt = [rng.randrange(size), rng.randrange(size)];
    const moves = range(steps).map(() => rng.choice(DIRS));
    let pos = start;
    let ok = true;
    for (const m of moves) {
      pos = walk(pos, [m]);
      if (!inside(pos, size)) {
        ok = false;
        break;
      }
    }
    if (ok && !same(walk(start, moves), start)) return [start, moves];
  }
  return [[0, 0], new Array<string>(Math.min(steps, size - 1)).fill("R")];
}

/** Compress: ['R','R','U'] -> '2 ימינה, 1 למעלה'. */
export function movesText(moves: readonly string[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < moves.length) {
    let j = i;
    while (j < moves.length && moves[j] === moves[i]) j++;
    out.push(`${j - i} ${MOVE_HE[moves[i]!]}`);
    i = j;
  }
  return out.join(", ");
}

register("logic.robot_end", (rng, params, ctx) => {
  const size = pint(params, "size", 5);
  const steps = pint(params, "steps", 4);
  const [start, moves] = randomPath(rng, size, steps);
  const end = walk(start, moves);
  const cands: [string, Pt][] = [
    ["robot_left_right", walk(start, moves.map((m) => MIRROR[m]!))],
    ["robot_skip_last", walk(start, moves.slice(0, -1))],
    ["robot_up_down", walk(start, moves.map((m) => FLIP_UD[m] ?? m))],
  ];
  const marks: [Pt, string | null][] = [[end, null]];
  const seen = new Set([tup(end), tup(start)]);
  for (const [tag, p] of cands) {
    if (!seen.has(tup(p)) && inside(p, size)) {
      marks.push([p, tag]);
      seen.add(tup(p));
    }
  }
  while (marks.length < 4) {
    const p: Pt = [rng.randrange(size), rng.randrange(size)];
    if (!seen.has(tup(p))) {
      marks.push([p, null]);
      seen.add(tup(p));
    }
  }
  const order = [...marks];
  rng.shuffle(order);
  const labels: Record<string, number[]> = {};
  order.forEach(([p], i) => (labels[LABELS[i]!] = [...p]));
  const correctLabel = LABELS[order.findIndex(([p]) => same(p, end))]!;
  return optionsQuestion(rng, ctx, {
    item_id: `logic.robot_end:${size}:${tup(start)}:${moves.join("")}`,
    prompt_he: `הרובוט זז לפי הפקודות: ${movesText(moves)}. ` + `לאיזו משבצת הוא מגיע?`,
    prompt_en: "Where does the robot end up?",
    correct: opt(correctLabel),
    distractors: order.map(([p, t], i) => [p, t, i] as const).filter(([p]) => !same(p, end)).map(([, t, i]) => opt(LABELS[i]!, { tag: t })),
    explanation_he: `עוקבים צעד אחר צעד מהרובוט: ${movesText(moves)}. ` + `הוא מגיע למשבצת ${correctLabel}.`,
    difficulty: -0.4 + 0.15 * steps + 0.1 * (size - 5),
    figure: makeFigure("grid_path", { width: size, height: size, start: [...start], moves, show_moves: false, marks: labels }),
    shuffle: false,
  });
});

register("logic.robot_program", (rng, params, ctx) => {
  const size = pint(params, "size", 5);
  const steps = pint(params, "steps", 4);
  const [start, moves] = randomPath(rng, size, steps);
  const end = walk(start, moves);
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const fill = (m: string, n: number): string[] => new Array<string>(Math.max(0, n)).fill(m);
  const right = [...(dx > 0 ? fill("R", dx) : fill("L", -dx)), ...(dy > 0 ? fill("U", dy) : fill("D", -dy))];
  const wrongs: [string[], string][] = [
    [right.map((m) => MIRROR[m]!), "robot_left_right"],
    [right.slice(0, -1), "robot_skip_last"],
    [right.map((m) => FLIP_UD[m] ?? m), "robot_up_down"],
    [[...right, right.at(-1)!], "off_by_one"],
  ];
  const dis = wrongs.filter(([w]) => w.length && !same(walk(start, w), end)).map(([w, t]) => opt(movesText(w), { tag: t }));
  return optionsQuestion(rng, ctx, {
    item_id: `logic.robot_program:${size}:${tup(start)}->${tup(end)}`,
    prompt_he: "איזו תוכנית תביא את הרובוט אל הכוכב?",
    prompt_en: "Which program takes the robot to the star?",
    correct: opt(movesText(right)),
    distractors: dis,
    explanation_he: `סופרים משבצות מהרובוט אל הכוכב: ${movesText(right)}.`,
    difficulty: 0.0 + 0.1 * (Math.abs(dx) + Math.abs(dy)),
    figure: makeFigure("grid_path", { width: size, height: size, start: [...start], marks: { "★": [...end] } }),
  });
});

register("logic.robot_loop", (rng, params, ctx) => {
  const size = pint(params, "size", 7);
  let body: string[] = [];
  let times = 2;
  let start: Pt = [0, 0];
  let full: string[] = [];
  for (let it = 0; it < 300; it++) {
    const len = rng.randint(2, 3);
    body = range(len).map(() => rng.choice(DIRS));
    times = rng.randint(2, 4);
    start = [rng.randrange(size), rng.randrange(size)];
    full = range(times).flatMap(() => body);
    let pos = start;
    let ok = true;
    for (const m of full) {
      pos = walk(pos, [m]);
      if (!inside(pos, size)) {
        ok = false;
        break;
      }
    }
    if (ok && !same(pos, start)) break;
  }
  const rep = (n: number): string[] => range(n).flatMap(() => body);
  const end = walk(start, full);
  const once = walk(start, body);
  const extra = walk(start, rep(times + 1));
  const fewer = walk(start, rep(times - 1));
  const xs = end[0] - start[0];
  const ys = end[1] - start[1];
  const coord = (p: Pt): string => ltr(`(${p[0]}, ${p[1]})`);
  const dis = [
    opt(coord(once), { tag: "robot_loop_once" }),
    opt(coord(fewer), { tag: "off_by_one" }),
    opt(coord(extra), { tag: "off_by_one" }),
    opt(coord([start[0] - xs, start[1] + ys]), { tag: "robot_left_right" }),
  ];
  return optionsQuestion(rng, ctx, {
    item_id: `logic.robot_loop:${tup(start)}:${body.join("")}x${times}`,
    prompt_he: `הרובוט ב־${coord(start)}. התוכנית: חזרו ${times} פעמים על ` + `[${movesText(body)}]. איפה הרובוט בסוף?`,
    prompt_en: "Repeat the loop. Where does the robot end?",
    correct: opt(coord(end)),
    distractors: dis.filter((d) => d.text_he !== coord(end)),
    explanation_he: `סיבוב אחד מזיז ל־${coord(once)}. כל סיבוב מוסיף את ` + `אותה תזוזה, ואחרי ${times} סיבובים מגיעים ל־` + `${coord(end)}.`,
    difficulty: 0.3 + 0.1 * times,
    figure: makeFigure("grid_path", { width: size, height: size, start: [...start], moves: body, repeat: times }),
  });
});

export const STATEMENTS: readonly (readonly [string, boolean, string])[] = [
  ["כל ריבוע הוא מלבן.", true, "לריבוע 4 זוויות ישרות, כמו לכל מלבן."],
  ["כל מלבן הוא ריבוע.", false, "למלבן לא חייבות להיות 4 צלעות שוות. זה ההפך מהמשפט הנכון."],
  ["אם מספר מתחלק ב־4, הוא מתחלק גם ב־2.", true, "4 עצמו מתחלק ב־2, ולכן כל כפולה של 4 היא זוגית."],
  ["אם מספר מתחלק ב־2, הוא מתחלק גם ב־4.", false, "דוגמה נגדית: 6 מתחלק ב־2 אבל לא ב־4."],
  ["כל הכלבים הם חיות.", true, "כלב הוא סוג של חיה."],
  ["כל החיות הן כלבים.", false, "דוגמה נגדית: חתול הוא חיה ולא כלב."],
  ["יש מספר זוגי שהוא גם ראשוני.", true, "2 זוגי, ויש לו רק שני מחלקים: 1 ו־2."],
  ["סכום של שני מספרים אי־זוגיים הוא תמיד אי־זוגי.", false, "דוגמה נגדית: 3 ועוד 5 זה 8, מספר זוגי."],
  ["כל מעוין הוא מקבילית.", true, "במעוין שני זוגות של צלעות מקבילות, וזו ההגדרה של מקבילית."],
  ["כל מקבילית היא מעוין.", false, "במקבילית הצלעות לא חייבות להיות שוות, כמו במלבן 2 על 5."],
  ["אם היום יום שישי, אז מחר שבת.", true, "אחרי יום שישי תמיד בא שבת."],
  ["אם מחר שבת, אז היום יום ראשון.", false, "לפני שבת בא יום שישי."],
  ["מכפלה של מספר בעצמו לעולם לא שלילית.", true, "חיובי כפול חיובי חיובי, וגם שלילי כפול שלילי חיובי. ו־0 כפול 0 הוא 0."],
  ["כל מספר שמסתיים ב־5 מתחלק ב־5.", true, "מספר מתחלק ב־5 אם ספרת האחדות שלו 0 או 5."],
  ["כל מספר שמתחלק ב־3 מסתיים ב־3.", false, "דוגמה נגדית: 12 מתחלק ב־3 ומסתיים ב־2."],
];

register("logic.statements", (rng, _params, ctx) => {
  const i = rng.randrange(STATEMENTS.length);
  const [text, truth, why] = STATEMENTS[i]!;
  return trueFalseQuestion(ctx, {
    item_id: `logic.statements:${i}`,
    prompt_he: `נכון או לא נכון? ${text}`,
    prompt_en: "True or false?",
    truth,
    explanation_he: why,
    difficulty: 0.0 + 0.4 * b(!truth),
    wrong_tag: !truth ? "converse_error" : null,
  });
});
