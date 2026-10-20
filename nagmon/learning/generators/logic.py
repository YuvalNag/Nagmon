"""Logic: patterns, odd one out, sequences, mini sudoku, analogies,
balance puzzles, robot paths and true/false statements."""

from __future__ import annotations

import random
from collections.abc import Mapping
from typing import Any

from nagmon.learning.generators.common import (
    GenContext,
    Opt,
    as_list,
    emoji,
    generator,
    ltr,
    numeric_question,
    options_question,
    true_false_question,
)
from nagmon.learning.model import Figure, Question

P = Mapping[str, Any]

TOKENS = (
    ("1f534", "עיגול אדום"),
    ("1f535", "עיגול כחול"),
    ("1f7e2", "עיגול ירוק"),
    ("1f7e1", "עיגול צהוב"),
    ("2b50", "כוכב"),
    ("2764", "לב"),
    ("1f53a", "משולש אדום"),
    ("1f7e6", "ריבוע כחול"),
)
UNITS = {
    "AB": "AB",
    "AAB": "AAB",
    "ABB": "ABB",
    "ABC": "ABC",
    "AABB": "AABB",
    "ABCD": "ABCD",
}


@generator("logic.pattern_repeat")
def pattern_repeat(rng: random.Random, params: P, ctx: GenContext) -> Question:
    kinds = as_list(params.get("kinds"), ["AB", "AAB", "ABB", "ABC"])
    unit = rng.choice(kinds)
    letters = sorted(set(unit))
    toks = rng.sample(TOKENS, len(letters))
    mapping = dict(zip(letters, toks))
    seq_len = len(unit) * 2 + rng.randint(1, len(unit))
    seq = [unit[i % len(unit)] for i in range(seq_len + 1)]
    shown, nxt = seq[:-1], seq[-1]
    right = mapping[nxt]
    prev = mapping[seq[-2]]
    dis = [
        Opt(
            t[1],
            image=emoji(t[0]),
            tag="pattern_wrong_unit" if t == prev else None,
        )
        for t in toks
        if t != right
    ]
    extra = [t for t in TOKENS if t not in toks]
    dis += [Opt(t[1], image=emoji(t[0])) for t in rng.sample(extra, 2)]
    unit_names = ", ".join(mapping[c][1] for c in unit)
    return options_question(
        rng,
        ctx,
        item_id=f"logic.pattern_repeat:{unit}:{''.join(t[0][-2:] for t in toks)}"
        f":{seq_len}",
        prompt_he="מה בא אחר כך בתבנית?",
        prompt_en="What comes next?",
        correct=Opt(right[1], image=emoji(right[0])),
        distractors=dis,
        explanation_he=(
            f"התבנית חוזרת על עצמה: {unit_names}. "
            f"ממשיכים את החזרה: הבא בתור הוא {right[1]}."
        ),
        difficulty=-0.6
        + 0.25 * (len(unit) - 2)
        + 0.2 * (unit in ("ABB", "AAB")),
        figure=Figure(
            "pattern", {"items": [mapping[c][0] for c in shown] + ["?"]}
        ),
    )


CATEGORIES = {
    "פירות": (
        ("תפוח", "1f34e"),
        ("בננה", "1f34c"),
        ("ענבים", "1f347"),
        ("תות", "1f353"),
        ("אגס", "1f350"),
        ("אבטיח", "1f349"),
    ),
    "חיות": (
        ("כלב", "1f415"),
        ("חתול", "1f408"),
        ("פרה", "1f404"),
        ("סוס", "1f40e"),
        ("ארנב", "1f407"),
        ("תרנגולת", "1f414"),
    ),
    "כלי תחבורה": (
        ("מכונית", "1f697"),
        ("אוטובוס", "1f68c"),
        ("אופניים", "1f6b2"),
        ("רכבת", "1f686"),
        ("מטוס", "2708"),
        ("סירה", "26f5"),
    ),
    "בגדים": (
        ("חולצה", "1f455"),
        ("מכנסיים", "1f456"),
        ("כובע", "1f9e2"),
        ("גרביים", "1f9e6"),
        ("מעיל", "1f9e5"),
        ("נעל", "1f45f"),
    ),
    "כלי נגינה": (
        ("תוף", "1f941"),
        ("גיטרה", "1f3b8"),
        ("כינור", "1f3bb"),
        ("חצוצרה", "1f3ba"),
        ("פסנתר", "1f3b9"),
    ),
    "ירקות": (
        ("גזר", "1f955"),
        ("מלפפון", "1f952"),
        ("עגבנייה", "1f345"),
        ("תירס", "1f33d"),
        ("ברוקולי", "1f966"),
    ),
}
NEAR = {("פירות", "ירקות"), ("ירקות", "פירות")}


@generator("logic.odd_one_out")
def odd_one_out(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mode = params.get("mode", "emoji")
    if mode == "numbers":
        return _odd_numbers(rng, params, ctx)
    cats = list(CATEGORIES)
    cat = rng.choice(cats)
    other_cat = rng.choice([c for c in cats if c != cat])
    k = 3
    same = rng.sample(CATEGORIES[cat], k)
    odd = rng.choice(CATEGORIES[other_cat])
    return options_question(
        rng,
        ctx,
        item_id=f"logic.odd_one_out:{cat}>{odd[0]}:"
        + ",".join(sorted(s[0] for s in same)),
        prompt_he="מה לא שייך לקבוצה?",
        prompt_en="Which one does not belong?",
        correct=Opt(odd[0], image=emoji(odd[1])),
        distractors=[Opt(s[0], image=emoji(s[1])) for s in same],
        explanation_he=(
            f"{', '.join(s[0] for s in same)}: כולם {cat}. "
            f'{odd[0]} מהקבוצה "{other_cat}".'
        ),
        difficulty=-0.6 + 0.6 * ((cat, other_cat) in NEAR),
        n=4,
    )


def _odd_numbers(rng: random.Random, params: P, ctx: GenContext) -> Question:
    rule = rng.choice(("even", "odd", "mult"))
    if rule == "even":
        same = rng.sample(range(2, 60, 2), 3)
        odd = rng.randrange(1, 60, 2)
        why = "כולם זוגיים"
    elif rule == "odd":
        same = rng.sample(range(1, 60, 2), 3)
        odd = rng.randrange(2, 60, 2)
        why = "כולם אי־זוגיים"
    else:
        m = rng.choice((3, 4, 5, 6, 7, 9))
        same = [m * x for x in rng.sample(range(2, 11), 3)]
        odd = m * rng.randint(2, 10) + rng.randint(1, m - 1)
        why = f"כולם בלוח הכפל של {m}"
    return options_question(
        rng,
        ctx,
        item_id=f"logic.odd_one_out:num:{rule}:{','.join(map(str, sorted(same)))}"
        f">{odd}",
        prompt_he="איזה מספר לא שייך לקבוצה?",
        prompt_en="Which number does not belong?",
        correct=Opt(str(odd)),
        distractors=[Opt(str(s)) for s in same],
        explanation_he=f"{', '.join(map(str, same))}: {why}. {odd} לא.",
        difficulty=-0.2 + 0.5 * (rule == "mult"),
        n=4,
    )


@generator("logic.sequence")
def sequence(rng: random.Random, params: P, ctx: GenContext) -> Question:
    kinds = as_list(params.get("kinds"), ["arith"])
    kind = rng.choice(kinds)
    tag_wrong: list[tuple[int | None, str | None]] = []
    if kind == "arith":
        d = rng.choice([x for x in range(-9, 13) if x not in (0,)])
        a = rng.randint(1, 30) + (40 if d < 0 else 0)
        terms = [a + i * d for i in range(6)]
        rule = f"בכל פעם {'מוסיפים' if d > 0 else 'מורידים'} {abs(d)}"
        tag_wrong = [
            (terms[-1] + d, "sequence_off_step"),
            (terms[-2] + d + 1, "sequence_off_step"),
        ]
        diff = -0.5 + 0.05 * abs(d) + 0.3 * (d < 0)
    elif kind == "geom":
        r = rng.choice((2, 3, 10))
        a = rng.randint(1, 5)
        terms = [a * r**i for i in range(5)]
        rule = f"בכל פעם כופלים ב־{r}"
        dd = terms[-2] - terms[-3]
        tag_wrong = [(terms[-2] + dd, "sequence_add_vs_mul")]
        diff = 0.2 + 0.1 * (r == 3)
    elif kind == "fib":
        a, b = rng.randint(1, 5), rng.randint(1, 6)
        terms = [a, b]
        while len(terms) < 7:
            terms.append(terms[-1] + terms[-2])
        rule = "כל מספר הוא סכום שני המספרים שלפניו"
        dd = terms[-2] - terms[-3]
        tag_wrong = [(terms[-2] + dd, "sequence_add_vs_mul")]
        diff = 0.6
    elif kind == "squares":
        s = rng.randint(1, 4)
        terms = [(s + i) ** 2 for i in range(5)]
        rule = (
            f"אלה מספרים ריבועיים: {s}×{s}, {s + 1}×{s + 1}... "
            f"(ההפרשים גדלים ב־2)"
        )
        dd = terms[-2] - terms[-3]
        tag_wrong = [(terms[-2] + dd, "sequence_off_step")]
        diff = 0.7
    else:  # alternating +a, +b
        x, y = rng.sample(range(1, 10), 2)
        a = rng.randint(1, 20)
        terms = [a]
        for i in range(6):
            terms.append(terms[-1] + (x if i % 2 == 0 else y))
        rule = f"מוסיפים לסירוגין {x} ו־{y}"
        prev_step = terms[-2] - terms[-3]
        tag_wrong = [(terms[-2] + prev_step, "sequence_off_step")]
        diff = 0.8
    ans = terms[-1]
    shown = ", ".join(map(str, terms[:-1])) + ", ?"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"logic.sequence:{kind}:{','.join(map(str, terms[:3]))}",
        prompt_he=f"מה המספר הבא בסדרה? {shown}",
        prompt_en=f"What comes next? {shown}",
        answer=ans,
        distractors=[*tag_wrong, (ans + 1, None), (ans - 1, None)],
        explanation_he=f"{rule}. לכן אחרי {terms[-2]} בא {ans}.",
        difficulty=diff,
        allow_negative=ans < 0,
        calc=f"{ans}",
    )


def latin4(rng: random.Random) -> list[list[int]]:
    """A random 4x4 sudoku (rows, columns and 2x2 boxes)."""
    base = [[1, 2, 3, 4], [3, 4, 1, 2], [2, 1, 4, 3], [4, 3, 2, 1]]
    perm = rng.sample([1, 2, 3, 4], 4)
    grid = [[perm[v - 1] for v in row] for row in base]
    if rng.random() < 0.5:
        grid = [list(r) for r in zip(*grid)]
    if rng.random() < 0.5:
        grid[0], grid[1] = grid[1], grid[0]
    if rng.random() < 0.5:
        grid[2], grid[3] = grid[3], grid[2]
    return grid


@generator("logic.sudoku")
def sudoku(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mode = params.get("mode", "row")
    if mode == "row":
        n = int(params.get("size", 4))
        row = rng.sample(range(1, n + 1), n)
        hole = rng.randrange(n)
        ans = row[hole]
        shown = ["?" if i == hole else str(v) for i, v in enumerate(row)]
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=f"logic.sudoku:row:{''.join(map(str, row))}@{hole}",
            prompt_he=(
                f"בשורה צריכים להופיע כל המספרים מ־1 עד {n}, כל אחד "
                f"פעם אחת: {ltr(' '.join(shown))}. מה חסר?"
            ),
            prompt_en=f"Each of 1 to {n} once: {' '.join(shown)}. Missing?",
            answer=ans,
            distractors=[(v, "sudoku_repeat") for v in row if v != ans][:2],
            explanation_he=(
                f"בשורה כבר יש "
                f"{', '.join(str(v) for v in row if v != ans)}. "
                f"המספר שחסר הוא {ans}."
            ),
            difficulty=-0.5 + 0.1 * (n - 4),
            figure=Figure(
                "grid_numbers",
                {
                    "grid": [
                        [None if i == hole else v for i, v in enumerate(row)]
                    ],
                    "target": [0, hole],
                },
            ),
            choice_only=False,
            calc=f"{n * (n + 1) // 2} - {sum(row) - ans}",
        )
    grid = latin4(rng)
    r, c = rng.randrange(4), rng.randrange(4)
    ans = grid[r][c]
    # Hide the target and one more cell in its row, so the row alone is not
    # enough: the column decides.
    other = rng.choice([j for j in range(4) if j != c])
    shown = [
        [
            None if (i, j) in ((r, c), (r, other)) else grid[i][j]
            for j in range(4)
        ]
        for i in range(4)
    ]
    col_vals = [grid[i][c] for i in range(4) if i != r]
    row_missing = sorted([ans, grid[r][other]])
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"logic.sudoku:grid:{''.join(str(v) for row in grid for v in row)}"
        f"@{r}{c}{other}",
        prompt_he=(
            "בסודוקו 4 על 4 כל מספר מ־1 עד 4 מופיע פעם אחת בכל שורה, "
            "עמודה וריבוע. מה המספר במשבצת המסומנת?"
        ),
        prompt_en="Mini sudoku 4x4: which number goes in the marked cell?",
        answer=ans,
        distractors=[
            (grid[r][other], "sudoku_row_only"),
            *[(v, None) for v in col_vals],
        ],
        explanation_he=(
            f"בשורה חסרים {row_missing[0]} ו־{row_missing[1]}. "
            f"בעמודה כבר יש {', '.join(map(str, col_vals))}, "
            f"ולכן המספר הוא {ans}."
        ),
        difficulty=0.3,
        figure=Figure(
            "grid_numbers", {"grid": shown, "target": [r, c], "boxes": 2}
        ),
        calc=f"{ans}",
    )


ANALOGY_RULES = (
    ("×2", lambda x: 2 * x, "כופלים ב־2"),
    ("+3", lambda x: x + 3, "מוסיפים 3"),
    ("×3", lambda x: 3 * x, "כופלים ב־3"),
    ("+10", lambda x: x + 10, "מוסיפים 10"),
    ("sq", lambda x: x * x, "כופלים את המספר בעצמו"),
    ("×2+1", lambda x: 2 * x + 1, "כופלים ב־2 ומוסיפים 1"),
    ("-1", lambda x: x - 1, "מורידים 1"),
)


@generator("logic.analogy")
def analogy(rng: random.Random, params: P, ctx: GenContext) -> Question:
    name, f, why = rng.choice(ANALOGY_RULES)
    xs = rng.sample(range(2, 10), 3)
    a, b, c = xs
    ans = f(c)
    add_guess = c + (f(b) - b)
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"logic.analogy:{name}:{a},{b},{c}",
        prompt_he=(f"{a} הופך ל־{f(a)}, ו־{b} הופך ל־{f(b)}. למה הופך {c}?"),
        prompt_en=f"{a} → {f(a)}, {b} → {f(b)}. {c} → ?",
        answer=ans,
        distractors=[
            (add_guess if add_guess != ans else None, "analogy_add_vs_mul"),
            (ans + 1, None),
            (f(b), None),
        ],
        explanation_he=(
            f"הכלל: {why}. בודקים: {a} הופך ל־{f(a)}. לכן {c} הופך ל־{ans}."
        ),
        difficulty=-0.3 + 0.4 * (name in ("sq", "×2+1")),
        calc=f"{ans}",
    )


FRUITS = (
    ("1f34e", "תפוח"),
    ("1f34c", "בננה"),
    ("1f353", "תות"),
    ("1f350", "אגס"),
    ("1f347", "ענבים"),
)


@generator("logic.balance")
def balance(rng: random.Random, params: P, ctx: GenContext) -> Question:
    (ea, na), (eb, nb) = rng.sample(FRUITS, 2)
    x = rng.randint(1, 9)
    y = rng.randint(1, 9)
    k = rng.choice((2, 3))
    s1 = k * x
    s2 = x + y
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"logic.balance:{k}x={s1},x+y={s2}:{ea}{eb}",
        prompt_he=(
            f"{k} פעמים {na} שוקלים {s1}. {na} ו{nb} ביחד "
            f"שוקלים {s2}. כמה שוקל {nb}?"
        ),
        prompt_en=f"{k} × A = {s1}; A + B = {s2}. B = ?",
        answer=y,
        distractors=[
            (s2, "balance_total"),
            (x, "balance_total"),
            (s2 - s1 if s2 > s1 else None, None),
            (y + 1, None),
        ],
        explanation_he=(
            f"קודם {na}: {ltr(f'{s1} : {k} = {x}')}. אחר כך "
            f"{nb}: {ltr(f'{s2} - {x} = {y}')}."
        ),
        difficulty=0.0 + 0.3 * (k == 3),
        figure=Figure(
            "objects", {"balance": [[ea] * k, [ea, eb]], "weights": [s1, s2]}
        ),
        calc=f"{s2} - {s1} // {k}",
    )


MOVES = {"R": (1, 0), "L": (-1, 0), "U": (0, 1), "D": (0, -1)}
MOVE_HE = {"R": "ימינה", "L": "שמאלה", "U": "למעלה", "D": "למטה"}
MIRROR = {"R": "L", "L": "R", "U": "U", "D": "D"}
LABELS = ("א", "ב", "ג", "ד", "ה")


def walk(start: tuple[int, int], moves: list[str]) -> tuple[int, int]:
    x, y = start
    for m in moves:
        dx, dy = MOVES[m]
        x, y = x + dx, y + dy
    return x, y


def inside(p: tuple[int, int], size: int) -> bool:
    return 0 <= p[0] < size and 0 <= p[1] < size


def random_path(
    rng: random.Random, size: int, steps: int
) -> tuple[tuple[int, int], list[str]]:
    for _ in range(500):
        start = (rng.randrange(size), rng.randrange(size))
        moves = [rng.choice("RLUD") for _ in range(steps)]
        pos = start
        ok = True
        for m in moves:
            pos = walk(pos, [m])
            if not inside(pos, size):
                ok = False
                break
        if ok and walk(start, moves) != start:
            return start, moves
    return (0, 0), ["R"] * min(steps, size - 1)


def moves_text(moves: list[str]) -> str:
    """Compress: ['R','R','U'] -> '2 ימינה, 1 למעלה'."""
    out = []
    i = 0
    while i < len(moves):
        j = i
        while j < len(moves) and moves[j] == moves[i]:
            j += 1
        out.append(f"{j - i} {MOVE_HE[moves[i]]}")
        i = j
    return ", ".join(out)


@generator("logic.robot_end")
def robot_end(rng: random.Random, params: P, ctx: GenContext) -> Question:
    size = int(params.get("size", 5))
    steps = int(params.get("steps", 4))
    start, moves = random_path(rng, size, steps)
    end = walk(start, moves)
    cands = {
        "robot_left_right": walk(start, [MIRROR[m] for m in moves]),
        "robot_skip_last": walk(start, moves[:-1]),
        "robot_up_down": walk(
            start, [{"U": "D", "D": "U"}.get(m, m) for m in moves]
        ),
    }
    marks = [(end, None)]
    seen = {end, start}
    for tag, p in cands.items():
        if p not in seen and inside(p, size):
            marks.append((p, tag))
            seen.add(p)
    while len(marks) < 4:
        p = (rng.randrange(size), rng.randrange(size))
        if p not in seen:
            marks.append((p, None))
            seen.add(p)
    order = marks[:]
    rng.shuffle(order)
    labels = {LABELS[i]: list(p) for i, (p, _) in enumerate(order)}
    correct_label = next(
        LABELS[i] for i, (p, _) in enumerate(order) if p == end
    )
    q = options_question(
        rng,
        ctx,
        item_id=f"logic.robot_end:{size}:{start}:{''.join(moves)}",
        prompt_he=(
            f"הרובוט זז לפי הפקודות: {moves_text(moves)}. "
            f"לאיזו משבצת הוא מגיע?"
        ),
        prompt_en="Where does the robot end up?",
        correct=Opt(correct_label),
        distractors=[
            Opt(LABELS[i], tag=t) for i, (p, t) in enumerate(order) if p != end
        ],
        explanation_he=(
            f"עוקבים צעד אחר צעד מהרובוט: {moves_text(moves)}. "
            f"הוא מגיע למשבצת {correct_label}."
        ),
        difficulty=-0.4 + 0.15 * steps + 0.1 * (size - 5),
        figure=Figure(
            "grid_path",
            {
                "width": size,
                "height": size,
                "start": list(start),
                "moves": moves,
                "show_moves": False,
                "marks": labels,
            },
        ),
        shuffle=False,
    )
    return q


@generator("logic.robot_program")
def robot_program(rng: random.Random, params: P, ctx: GenContext) -> Question:
    size = int(params.get("size", 5))
    steps = int(params.get("steps", 4))
    start, moves = random_path(rng, size, steps)
    end = walk(start, moves)
    dx, dy = end[0] - start[0], end[1] - start[1]
    right = (["R"] * dx if dx > 0 else ["L"] * -dx) + (
        ["U"] * dy if dy > 0 else ["D"] * -dy
    )
    wrongs = [
        ([MIRROR[m] for m in right], "robot_left_right"),
        (right[:-1], "robot_skip_last"),
        ([{"U": "D", "D": "U"}.get(m, m) for m in right], "robot_up_down"),
        (right + [right[-1]], "off_by_one"),
    ]
    dis = [
        Opt(moves_text(w), tag=t)
        for w, t in wrongs
        if w and walk(start, w) != end
    ]
    return options_question(
        rng,
        ctx,
        item_id=f"logic.robot_program:{size}:{start}->{end}",
        prompt_he="איזו תוכנית תביא את הרובוט אל הכוכב?",
        prompt_en="Which program takes the robot to the star?",
        correct=Opt(moves_text(right)),
        distractors=dis,
        explanation_he=(
            f"סופרים משבצות מהרובוט אל הכוכב: {moves_text(right)}."
        ),
        difficulty=0.0 + 0.1 * (abs(dx) + abs(dy)),
        figure=Figure(
            "grid_path",
            {
                "width": size,
                "height": size,
                "start": list(start),
                "marks": {"★": list(end)},
            },
        ),
    )


@generator("logic.robot_loop")
def robot_loop(rng: random.Random, params: P, ctx: GenContext) -> Question:
    size = int(params.get("size", 7))
    for _ in range(300):
        body = [rng.choice("RLUD") for _ in range(rng.randint(2, 3))]
        times = rng.randint(2, 4)
        start = (rng.randrange(size), rng.randrange(size))
        full = body * times
        pos = start
        ok = True
        for m in full:
            pos = walk(pos, [m])
            if not inside(pos, size):
                ok = False
                break
        if ok and pos != start:
            break
    end = walk(start, full)
    once = walk(start, body)
    extra = walk(start, body * (times + 1))
    fewer = walk(start, body * (times - 1))
    xs = end[0] - start[0]
    ys = end[1] - start[1]

    def coord(p: tuple[int, int]) -> str:
        return ltr(f"({p[0]}, {p[1]})")

    dis = [
        Opt(coord(once), tag="robot_loop_once"),
        Opt(coord(fewer), tag="off_by_one"),
        Opt(coord(extra), tag="off_by_one"),
        Opt(coord((start[0] - xs, start[1] + ys)), tag="robot_left_right"),
    ]
    return options_question(
        rng,
        ctx,
        item_id=f"logic.robot_loop:{start}:{''.join(body)}x{times}",
        prompt_he=(
            f"הרובוט ב־{coord(start)}. התוכנית: חזרו {times} פעמים על "
            f"[{moves_text(body)}]. איפה הרובוט בסוף?"
        ),
        prompt_en="Repeat the loop. Where does the robot end?",
        correct=Opt(coord(end)),
        distractors=[d for d in dis if d.text_he != coord(end)],
        explanation_he=(
            f"סיבוב אחד מזיז ל־{coord(once)}. כל סיבוב מוסיף את "
            f"אותה תזוזה, ואחרי {times} סיבובים מגיעים ל־"
            f"{coord(end)}."
        ),
        difficulty=0.3 + 0.1 * times,
        figure=Figure(
            "grid_path",
            {
                "width": size,
                "height": size,
                "start": list(start),
                "moves": body,
                "repeat": times,
            },
        ),
    )


STATEMENTS = (
    ("כל ריבוע הוא מלבן.", True, "לריבוע 4 זוויות ישרות, כמו לכל מלבן."),
    (
        "כל מלבן הוא ריבוע.",
        False,
        "למלבן לא חייבות להיות 4 צלעות שוות. זה ההפך מהמשפט הנכון.",
    ),
    (
        "אם מספר מתחלק ב־4, הוא מתחלק גם ב־2.",
        True,
        "4 עצמו מתחלק ב־2, ולכן כל כפולה של 4 היא זוגית.",
    ),
    (
        "אם מספר מתחלק ב־2, הוא מתחלק גם ב־4.",
        False,
        "דוגמה נגדית: 6 מתחלק ב־2 אבל לא ב־4.",
    ),
    ("כל הכלבים הם חיות.", True, "כלב הוא סוג של חיה."),
    ("כל החיות הן כלבים.", False, "דוגמה נגדית: חתול הוא חיה ולא כלב."),
    (
        "יש מספר זוגי שהוא גם ראשוני.",
        True,
        "2 זוגי, ויש לו רק שני מחלקים: 1 ו־2.",
    ),
    (
        "סכום של שני מספרים אי־זוגיים הוא תמיד אי־זוגי.",
        False,
        "דוגמה נגדית: 3 ועוד 5 זה 8, מספר זוגי.",
    ),
    (
        "כל מעוין הוא מקבילית.",
        True,
        "במעוין שני זוגות של צלעות מקבילות, וזו ההגדרה של מקבילית.",
    ),
    (
        "כל מקבילית היא מעוין.",
        False,
        "במקבילית הצלעות לא חייבות להיות שוות, כמו במלבן 2 על 5.",
    ),
    ("אם היום יום שישי, אז מחר שבת.", True, "אחרי יום שישי תמיד בא שבת."),
    ("אם מחר שבת, אז היום יום ראשון.", False, "לפני שבת בא יום שישי."),
    (
        "מכפלה של מספר בעצמו לעולם לא שלילית.",
        True,
        "חיובי כפול חיובי חיובי, וגם שלילי כפול שלילי חיובי. ו־0 כפול 0 הוא 0.",
    ),
    (
        "כל מספר שמסתיים ב־5 מתחלק ב־5.",
        True,
        "מספר מתחלק ב־5 אם ספרת האחדות שלו 0 או 5.",
    ),
    (
        "כל מספר שמתחלק ב־3 מסתיים ב־3.",
        False,
        "דוגמה נגדית: 12 מתחלק ב־3 ומסתיים ב־2.",
    ),
)


@generator("logic.statements")
def statements(rng: random.Random, params: P, ctx: GenContext) -> Question:
    i = rng.randrange(len(STATEMENTS))
    text, truth, why = STATEMENTS[i]
    return true_false_question(
        ctx,
        item_id=f"logic.statements:{i}",
        prompt_he=f"נכון או לא נכון? {text}",
        prompt_en="True or false?",
        truth=truth,
        explanation_he=why,
        difficulty=0.0 + 0.4 * (not truth),
        wrong_tag="converse_error" if not truth else None,
    )
