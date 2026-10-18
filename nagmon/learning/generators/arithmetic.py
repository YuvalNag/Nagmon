"""Whole-number arithmetic generators (kindergarten to grade 6)."""

from __future__ import annotations

import random
from collections.abc import Mapping
from fractions import Fraction
from typing import Any

from nagmon.learning.generators.common import (
    GenContext,
    Opt,
    as_list,
    fmt,
    generator,
    ltr,
    money,
    numeric_question,
    options_question,
    scale,
    true_false_question,
)
from nagmon.learning.generators.names import NUMBER_WORDS_F, OBJECTS
from nagmon.learning.model import Figure, Question

PLACE_NAMES = (
    "אחדות",
    "עשרות",
    "מאות",
    "אלפים",
    "עשרות אלפים",
    "מאות אלפים",
    "מיליונים",
)
PLACE_DEF = (
    "האחדות",
    "העשרות",
    "המאות",
    "האלפים",
    "עשרות האלפים",
    "מאות האלפים",
    "המיליונים",
)
P = Mapping[str, Any]


def digits(n: int, width: int = 0) -> list[int]:
    """Digits from the ones place up."""
    s = str(n).zfill(width)
    return [int(c) for c in reversed(s)]


def from_digits(ds: list[int]) -> int:
    return sum(d * 10**i for i, d in enumerate(ds))


# --------------------------------------------------------------------------
# Counting and number sense
# --------------------------------------------------------------------------


@generator("arithmetic.count")
def count(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mx = int(params.get("max", 10))
    mn = max(2, int(params.get("min", 2)))
    code, _, plural = rng.choice(OBJECTS)
    n = rng.randint(mn, mx)
    seq = ", ".join(str(i) for i in range(1, n + 1))
    expl = f"סופרים כל אחד פעם אחת בלבד: {seq}. יש {n} {plural}."
    if len(expl) > 200:
        expl = f"סופרים כל אחד פעם אחת, ואפשר בקבוצות של 5. יש {n} {plural}."
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.count:{code}x{n}",
        prompt_he=f"כמה {plural} יש בתמונה?",
        prompt_en="How many are there?",
        answer=n,
        distractors=[
            (n - 1, "off_by_one"),
            (n + 1, "off_by_one"),
            (n + 2, None),
        ],
        explanation_he=expl,
        difficulty=0.9 * scale(n, mn, mx),
        figure=Figure("objects", {"emoji": code, "count": n}),
        calc=f"{n}",
        allow_negative=False,
    )


@generator("arithmetic.recognize")
def recognize(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mx = min(int(params.get("max", 10)), 10)
    n = rng.randint(0, mx)
    word = NUMBER_WORDS_F[n]
    mode = rng.choice(("digit", "word"))
    item_id = f"arithmetic.recognize:{mode}{n}"
    expl = (
        f'המספר {n} נקרא "{word}". סופרים: '
        + ", ".join(NUMBER_WORDS_F[1 : n + 1] or ["אפס"])
        + "."
    )
    if mode == "digit":
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=item_id,
            prompt_he=f"בחרו את המספר {word}",
            prompt_en=f"Choose the number {n}",
            answer=n,
            distractors=[
                (n + 1, "number_neighbor"),
                (n - 1, "number_neighbor"),
                ({6: 9, 9: 6}.get(n), "digit_shape"),
            ],
            explanation_he=expl,
            difficulty=0.8 * scale(n, 0, 10),
            calc=f"{n}",
            choice_only=True,
        )
    others = [i for i in (n - 1, n + 1, n + 2, n - 2) if 0 <= i <= 10]
    return options_question(
        rng,
        ctx,
        item_id=item_id,
        prompt_he=f"איך קוראים למספר {n}?",
        prompt_en=f"How do we say {n}?",
        correct=Opt(word),
        distractors=[
            Opt(NUMBER_WORDS_F[i], tag="number_neighbor") for i in others
        ],
        explanation_he=expl,
        difficulty=0.8 * scale(n, 0, 10) + 0.2,
    )


@generator("arithmetic.compare")
def compare(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mx = int(params.get("max", 10))
    a = rng.randint(0, mx)
    b = rng.randint(0, mx)
    while b == a:
        b = rng.randint(0, mx)
    if mx >= 20 and rng.random() < 0.3:
        # Different number of digits with a larger leading digit.
        small_hi = rng.randint(2, 9)
        big = rng.randint(10, min(mx, 19 + 10 * (mx >= 100)))
        a, b = small_hi, big
    want_big = rng.random() < 0.5
    right = max(a, b) if want_big else min(a, b)
    wrong = min(a, b) if want_big else max(a, b)
    word = "גדול" if want_big else "קטן"
    tag = None
    if len(str(wrong)) != len(str(right)) and str(wrong)[0] > str(right)[0]:
        tag = "compare_first_digit"
    if len(str(a)) != len(str(b)):
        why = (
            f"ל־{max(a, b)} יש יותר ספרות, ולכן הוא הגדול. "
            f"{min(a, b)} קטן ממנו."
        )
    else:
        if max(a, b) < 10:
            why = (
                f"{max(a, b)} בא אחרי {min(a, b)} בספירה, ולכן הוא גדול יותר."
            )
        else:
            why = (
                f"משווים קודם את הספרה השמאלית (הגבוהה): {max(a, b)} גדול "
                f"מ־{min(a, b)}."
            )
    first, second = (a, b) if rng.random() < 0.5 else (b, a)
    return options_question(
        rng,
        ctx,
        item_id=f"arithmetic.compare:{first},{second}:{word}",
        prompt_he=f"איזה מספר {word} יותר: {first} או {second}?",
        prompt_en=("Which is bigger" if want_big else "Which is smaller")
        + f": {first} or {second}?",
        correct=Opt(str(right)),
        distractors=[Opt(str(wrong), tag=tag)],
        explanation_he=f"{why} התשובה: {right}.",
        difficulty=-0.5
        + 0.6 * scale(min(a, b), 0, mx)
        + 0.5 * (abs(a - b) <= 2),
        calc=f"{right}",
        n=2,
        shuffle=False,
    )


@generator("arithmetic.neighbors")
def neighbors(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mx = int(params.get("max", 100))
    n = rng.randint(2, mx - 2)
    mode = rng.choice(("after", "before", "between"))
    if mode == "after":
        prompt, ans, wrong = f"איזה מספר בא מיד אחרי {n}?", n + 1, n - 1
        expl = (
            f"אחרי {n} בא המספר הגדול ממנו ב־1: {ltr(f'{n} + 1 = {n + 1}')}."
        )
    elif mode == "before":
        prompt, ans, wrong = f"איזה מספר בא מיד לפני {n}?", n - 1, n + 1
        expl = f"לפני {n} בא המספר הקטן ממנו ב־1: {ltr(f'{n} - 1 = {n - 1}')}."
    else:
        prompt, ans, wrong = f"איזה מספר נמצא בין {n - 1} ל־{n + 1}?", n, n + 2
        expl = f"סופרים: {n - 1}, {n}, {n + 1}. באמצע נמצא {n}."
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.neighbors:{mode}{n}",
        prompt_he=prompt,
        answer=ans,
        distractors=[
            (wrong, "before_after"),
            (ans + 10, "place_value_confusion"),
            (ans - 10, "place_value_confusion"),
            (ans + 2, "off_by_one"),
        ],
        explanation_he=expl,
        difficulty=-0.4 + 0.8 * scale(n, 0, mx) + 0.3 * (n % 10 in (0, 9)),
        calc=f"{ans}",
    )


# --------------------------------------------------------------------------
# Addition and subtraction
# --------------------------------------------------------------------------


def column_add(a: int, b: int) -> tuple[list[str], int, int]:
    """Steps text, number of carries, and the 'forgot to carry' value."""
    width = max(len(str(a)), len(str(b)))
    da, db = digits(a, width), digits(b, width)
    carry = 0
    steps = []
    carries = 0
    no_carry = []
    for i in range(width):
        s = da[i] + db[i] + carry
        expr = f"{da[i]} + {db[i]}" + (" + 1" if carry else "")
        name = PLACE_NAMES[i]
        no_carry.append((da[i] + db[i]) % 10)
        if s >= 10 and i < width - 1:
            steps.append(
                f"{name}: {ltr(f'{expr} = {s}')}, כותבים {s % 10} ומעבירים 1"
            )
            carries += 1
            carry = 1
        else:
            steps.append(f"{name}: {ltr(f'{expr} = {s}')}")
            if s >= 10:
                carries += 1
            carry = 0
    return steps, carries, from_digits(no_carry)


@generator("arithmetic.add")
def add(rng: random.Random, params: P, ctx: GenContext) -> Question:
    max_sum = int(params.get("max_sum", 10))
    min_sum = int(params.get("min_sum", 2))
    carry_rule = params.get("carry", "allowed")
    a = b = 1
    for _ in range(200):
        s = rng.randint(min_sum, max_sum)
        lo = 1 if max_sum <= 20 else 10 ** (len(str(max_sum)) - 2)
        if s - lo < lo:
            continue
        a = rng.randint(lo, s - lo)
        b = s - a
        _, carries, _ = column_add(a, b)
        if carry_rule == "none" and carries:
            continue
        if carry_rule == "required" and not carries:
            continue
        break
    s = a + b
    steps, carries, forgot = column_add(a, b)
    expr = ltr(f"{a} + {b}")
    if s <= 10:
        counted = ", ".join(str(i) for i in range(a + 1, s + 1))
        expl = f"מתחילים ב־{a} וסופרים עוד {b}: {counted}. התשובה {s}."
    elif s <= 20 and max(a, b) < 10:
        big, small = max(a, b), min(a, b)
        need = 10 - big
        expl = (
            f"משלימים לעשר: {ltr(f'{big} + {need} = 10')}, ונשאר "
            f"{small - need}. {ltr(f'10 + {small - need} = {s}')}."
        )
    else:
        expl = f"{expr} במאונך. " + ". ".join(steps) + f". התשובה {s}."
    figure = None
    if max_sum <= 10:
        code = OBJECTS[(a * 7 + b) % len(OBJECTS)][0]
        figure = Figure("objects", {"emoji": code, "groups": [a, b]})
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.add:{a}+{b}",
        prompt_he=f"כמה זה {expr}?",
        prompt_en=f"What is {a} + {b}?",
        answer=s,
        distractors=[
            (forgot if carries else None, "forgot_carry"),
            (abs(a - b), "sub_instead_of_add"),
            (s - 1, "off_by_one"),
            (s + 1, "off_by_one"),
            (s + 10, None),
        ],
        explanation_he=expl,
        difficulty=-0.8 + 0.45 * carries + 0.7 * s / max_sum,
        figure=figure,
        speak={"he": f"כמה זה {a} ועוד {b}?", "en": f"What is {a} plus {b}?"},
        calc={"expr": f"{a} + {b}", "a": a, "b": b},
    )


def column_sub(a: int, b: int) -> tuple[list[str], int, int, int]:
    """Steps, borrows, 'smaller from larger' value, 'borrow not reduced'."""
    width = len(str(a))
    da, db = digits(a, width), digits(b, width)
    steps = []
    borrows = 0
    work = da[:]
    not_reduced = []
    for i in range(width):
        name = PLACE_NAMES[i]
        if work[i] < db[i]:
            borrows += 1
            j = i + 1
            while work[j] == 0:
                work[j] = 9
                j += 1
            work[j] -= 1
            top = work[i] + 10
            steps.append(
                f"{name}: {work[i]} קטן מ־{db[i]}, פורטים: "
                f"{ltr(f'{top} - {db[i]} = {top - db[i]}')}"
            )
            not_reduced.append(top - db[i])
            work[i] = top
        else:
            res = work[i] - db[i]
            if i == width - 1 and res == 0 and width > 1:
                steps.append(f"{name}: {ltr(f'{work[i]} - {db[i]} = 0')}")
            elif work[i] or db[i] or i < width - 1:
                steps.append(f"{name}: {ltr(f'{work[i]} - {db[i]} = {res}')}")
            not_reduced.append(da[i] - db[i] if da[i] >= db[i] else res)
    smaller = from_digits([abs(x - y) for x, y in zip(da, db)])
    nr = from_digits(
        [
            (da[i] + 10 - db[i]) if da[i] < db[i] else da[i] - db[i]
            for i in range(width)
        ]
    )
    return steps, borrows, smaller, nr


@generator("arithmetic.sub")
def sub(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mx = int(params.get("max", 10))
    mn = int(params.get("min", 2))
    rule = params.get("borrow", "allowed")
    top = mx - 1 if mx >= 100 else mx
    a, b = 2, 1
    for _ in range(200):
        a = rng.randint(max(mn, 2), top)
        lo = 1 if mx <= 20 else 10 ** (len(str(mx)) - 2)
        if lo > a - 1:
            continue
        b = rng.randint(lo, a - 1)
        _, borrows, _, _ = column_sub(a, b)
        if rule == "none" and borrows:
            continue
        if rule == "required" and not borrows:
            continue
        break
    d = a - b
    steps, borrows, smaller, nr = column_sub(a, b)
    expr = ltr(f"{a} - {b}")
    if a <= 10:
        back = ", ".join(str(i) for i in range(a - 1, d - 1, -1))
        expl = f"מתחילים ב־{a} וסופרים {b} אחורה: {back}. התשובה {d}."
    elif a <= 20 and b < 10 and a - 10 < b:
        first = a - 10
        expl = (
            f"מורידים {first} ומגיעים ל־10, ואז עוד {b - first}: "
            f"{ltr(f'10 - {b - first} = {d}')}."
        )
    else:
        expl = f"{expr} במאונך. " + ". ".join(steps) + f". התשובה {d}."
        if len(expl) > 200:
            expl = (
                f"{expr}: בודקים בחיבור. {ltr(f'{b} + {d} = {a}')}, "
                f"ולכן התשובה {d}. " + ". ".join(steps[:2]) + "."
            )
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.sub:{a}-{b}",
        prompt_he=f"כמה זה {expr}?",
        prompt_en=f"What is {a} - {b}?",
        answer=d,
        distractors=[
            (smaller if borrows else None, "smaller_from_larger"),
            (nr if borrows and nr != smaller else None, "borrow_not_reduced"),
            (a + b, "add_instead_of_sub"),
            (d + 1, "off_by_one"),
            (d - 1, "off_by_one"),
        ],
        explanation_he=expl,
        difficulty=-0.7 + 0.5 * borrows + 0.7 * a / mx,
        speak={"he": f"כמה זה {a} פחות {b}?", "en": f"What is {a} minus {b}?"},
        calc={"expr": f"{a} - {b}", "a": a, "b": b},
    )


@generator("arithmetic.missing_addend")
def missing_addend(rng: random.Random, params: P, ctx: GenContext) -> Question:
    max_sum = int(params.get("max_sum", 10))
    c = rng.randint(3, max_sum)
    a = rng.randint(1, c - 1)
    x = c - a
    expr = ltr(f"{a} + __ = {c}")
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.missing_addend:{a}+?={c}",
        prompt_he=f"איזה מספר חסר? {expr}",
        prompt_en=f"What number is missing? {a} + __ = {c}",
        answer=x,
        distractors=[
            (a + c, "added_instead"),
            (x + 1, "off_by_one"),
            (x - 1, "off_by_one"),
            (c, None),
        ],
        explanation_he=(
            f"כמה צריך להוסיף ל־{a} כדי להגיע ל־{c}? "
            f"{ltr(f'{c} - {a} = {x}')}. בודקים: "
            f"{ltr(f'{a} + {x} = {c}')}."
        ),
        difficulty=-0.3 + 0.8 * c / max_sum,
        calc=f"{c} - {a}",
    )


@generator("arithmetic.even_odd")
def even_odd(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mx = int(params.get("max", 20))
    n = rng.randint(1, mx)
    even = n % 2 == 0
    right, wrong = ("זוגי", "אי־זוגי") if even else ("אי־זוגי", "זוגי")
    last = n % 10
    tag = None
    if n >= 10 and int(str(n)[0]) % 2 != last % 2:
        tag = "even_odd_first_digit"
    if n <= 10:
        why = (
            f"את {n} אפשר לחלק לזוגות בלי שארית."
            if even
            else f"כשמחלקים את {n} לזוגות, נשאר אחד בלי זוג."
        )
    else:
        why = (
            f"מסתכלים רק על ספרת האחדות: {last}. "
            f"{last} {'זוגי' if even else 'אי־זוגי'}."
        )
    return options_question(
        rng,
        ctx,
        item_id=f"arithmetic.even_odd:{n}",
        prompt_he=f"האם המספר {n} זוגי או אי־זוגי?",
        prompt_en=f"Is {n} even or odd?",
        correct=Opt(right, "even" if even else "odd"),
        distractors=[Opt(wrong, "odd" if even else "even", tag=tag)],
        explanation_he=f"{why} לכן {n} {right}.",
        difficulty=-0.6 + 0.8 * scale(n, 1, mx) + 0.4 * (tag is not None),
        n=2,
        shuffle=False,
    )


@generator("arithmetic.place_value")
def place_value(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mx = int(params.get("max", 99))
    mn = max(10, int(params.get("min", 10)))
    for _ in range(100):
        n = rng.randint(mn, mx)
        ds = digits(n)
        pos = rng.randrange(len(ds))
        d = ds[pos]
        if d != 0 and ds.count(d) == 1:
            break
    else:
        n, ds, pos, d = 47, [7, 4], 1, 4
    value = d * 10**pos
    mode = rng.choice(("value", "count")) if pos >= 1 else "value"
    parts = ", ".join(
        f"{x} {PLACE_NAMES[i]}" for i, x in reversed(list(enumerate(ds))) if x
    )
    if mode == "value":
        prompt = f"מה הערך של הספרה {d} במספר {fmt(n)}?"
        ans = value
        expl = (
            f"{fmt(n)} = {parts}. הספרה {d} במקום {PLACE_DEF[pos]}, "
            f"ולכן ערכה {fmt(value)}."
        )
        dis = [
            (d, "place_value_confusion"),
            (value * 10, "place_value_confusion"),
            (value // 10 if pos >= 2 else None, "place_value_confusion"),
        ]
    else:
        prompt = f"איזו ספרה נמצאת במקום {PLACE_DEF[pos]} במספר {fmt(n)}?"
        ans = d
        others = [x for x in ds if x != d]
        expl = f"{fmt(n)} = {parts}. במקום {PLACE_DEF[pos]} נמצאת הספרה {d}."
        dis = [(o, "place_value_confusion") for o in others[:3]]
    if len(expl) > 200:
        expl = (
            f"מונים מקומות מימין: אחדות, עשרות, מאות... "
            f"הספרה {d} במקום {PLACE_DEF[pos]}. התשובה {fmt(ans)}."
        )
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.place_value:{n}@{pos}:{mode}",
        prompt_he=prompt,
        answer=ans,
        distractors=dis,
        explanation_he=expl,
        difficulty=-0.4 + 0.25 * pos + 0.3 * (mode == "value"),
        calc=f"{ans}",
    )


@generator("arithmetic.rounding")
def rounding(rng: random.Random, params: P, ctx: GenContext) -> Question:
    tos = as_list(params.get("to"), [10])
    to = int(rng.choice(tos))
    mx = int(params.get("max", 1000))
    n = rng.randint(to + 1, mx)
    while n % to == 0:
        n = rng.randint(to + 1, mx)
    down = n - n % to
    up = down + to
    ans = up if n % to >= to // 2 else down
    names = {10: "עשרות", 100: "מאות", 1000: "אלפים", 10000: "עשרות אלפים"}
    digit = (n % to) // (to // 10)
    other = 10 if to != 10 else 100
    wrong_place = (n + other // 2) // other * other
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.rounding:{n}~{to}",
        prompt_he=f"עגלו את {fmt(n)} ל{names[to]} הקרובות.",
        prompt_en=f"Round {n} to the nearest {to}.",
        answer=ans,
        distractors=[
            (down if ans == up else None, "rounding_down_always"),
            (up if ans == down else None, "rounding_up_always"),
            (
                wrong_place if wrong_place != ans else None,
                "rounding_wrong_place",
            ),
            (ans + to, None),
        ],
        explanation_he=(
            f"{fmt(n)} נמצא בין {fmt(down)} ל־{fmt(up)}. הספרה "
            f"שקובעת היא {digit}: "
            + (
                "5 ומעלה, ולכן מעגלים למעלה"
                if digit >= 5
                else "פחות מ־5, ולכן מעגלים למטה"
            )
            + f". התשובה {fmt(ans)}."
        ),
        difficulty=-0.3 + 0.3 * len(str(to)) / 2 + 0.4 * (digit in (4, 5)),
        calc=f"{ans}",
        step=to,
    )


# --------------------------------------------------------------------------
# Multiplication and division
# --------------------------------------------------------------------------


def fact_difficulty(a: int, b: int) -> float:
    easy = {0: -1.4, 1: -1.4, 10: -1.1, 2: -0.9, 5: -0.7}
    if a in easy or b in easy:
        return min(easy.get(a, 0.0), easy.get(b, 0.0))
    d = -1.0 + 0.11 * (a + b)
    if a == b:
        d -= 0.3
    if 9 in (a, b):
        d -= 0.2
    return d


def fact_explanation(a: int, b: int) -> str:
    p = a * b
    if a == 1 or b == 1:
        return f"כל מספר כפול 1 שווה לעצמו: {ltr(f'{a} × {b} = {p}')}."
    if a == 10 or b == 10:
        o = b if a == 10 else a
        return f"כופלים ב־10: מוסיפים 0 בסוף. {ltr(f'{o} × 10 = {p}')}."
    if a == 2 or b == 2:
        o = b if a == 2 else a
        return f"פעמיים {o} זה {ltr(f'{o} + {o} = {p}')}."
    if a == 5 or b == 5:
        o = b if a == 5 else a
        return (
            f"{ltr(f'5 × {o}')} זה חצי מ־{ltr(f'10 × {o} = {10 * o}')}"
            f", כלומר {p}."
        )
    if a == 9 or b == 9:
        o = b if a == 9 else a
        return (
            f"{ltr(f'9 × {o} = 10 × {o} - {o}')} = "
            f"{ltr(f'{10 * o} - {o} = {p}')}."
        )
    return (
        f"{ltr(f'{a} × {b} = {a} × {b - 1} + {a}')} = "
        f"{ltr(f'{a * (b - 1)} + {a} = {p}')}."
    )


@generator("arithmetic.mul_facts")
def mul_facts(rng: random.Random, params: P, ctx: GenContext) -> Question:
    tables = [int(t) for t in as_list(params.get("tables"), range(2, 11))]
    max_factor = int(params.get("max_factor", 10))
    t = rng.choice(tables)
    o = rng.randint(1, max_factor)
    a, b = (t, o) if rng.random() < 0.5 else (o, t)
    p = a * b
    lo, hi = min(a, b), max(a, b)
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.mul_facts:{lo}x{hi}",
        prompt_he=f"כמה זה {ltr(f'{a} × {b}')}?",
        prompt_en=f"What is {a} × {b}?",
        answer=p,
        distractors=[
            (a * (b + 1), "table_neighbor"),
            (a * (b - 1) if b > 1 else None, "table_neighbor"),
            ((a + 1) * b, "table_neighbor"),
            (a + b, "add_instead_of_mul"),
        ],
        explanation_he=fact_explanation(a, b),
        difficulty=fact_difficulty(a, b),
        speak={"he": f"כמה זה {a} כפול {b}?", "en": f"What is {a} times {b}?"},
        calc={"expr": f"{a} * {b}", "a": a, "b": b},
    )


@generator("arithmetic.div_facts")
def div_facts(rng: random.Random, params: P, ctx: GenContext) -> Question:
    tables = [int(t) for t in as_list(params.get("tables"), range(2, 11))]
    d = rng.choice(tables)
    q = rng.randint(1, int(params.get("max_factor", 10)))
    n = d * q
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.div_facts:{n}/{d}",
        prompt_he=f"כמה זה {ltr(f'{n} : {d}')}?",
        prompt_en=f"What is {n} ÷ {d}?",
        answer=q,
        distractors=[
            (q + 1, "table_neighbor"),
            (q - 1, "table_neighbor"),
            (n - d, "div_sub_confusion"),
        ],
        explanation_he=(
            f"חילוק הוא הפוך לכפל: איזה מספר כפול {d} נותן {n}? "
            f"{ltr(f'{q} × {d} = {n}')}, ולכן "
            f"{ltr(f'{n} : {d} = {q}')}."
        ),
        difficulty=fact_difficulty(d, q) + 0.3,
        speak={"he": f"כמה זה {n} לחלק ל{d}?"},
        calc=f"{n} // {d}",
    )


def rand_digits(rng: random.Random, k: int) -> int:
    return rng.randint(10 ** (k - 1), 10**k - 1)


@generator("arithmetic.mul_multi")
def mul_multi(rng: random.Random, params: P, ctx: GenContext) -> Question:
    ka = int(params.get("a_digits", 2))
    kb = int(params.get("b_digits", 1))
    a = rand_digits(rng, ka)
    b = rand_digits(rng, kb) if kb > 1 else rng.randint(2, 9)
    p = a * b
    dis: list[tuple[int | None, str | None]] = []
    if kb == 1:
        da = digits(a)
        forgot = from_digits([(x * b) % 10 for x in da])
        concat = int("".join(str(x * b) for x in reversed(da)))
        dis += [(forgot, "forgot_carry"), (concat, "concat_products")]
        carry = 0
        parts = []
        for i, x in enumerate(da):
            s = x * b + carry
            plus = f" + {carry}" if carry else ""
            parts.append(f"{ltr(f'{x} × {b}{plus} = {s}')}")
            carry = s // 10
        expl = (
            "כופלים כל ספרה, מהאחדות: "
            + ", ".join(parts)
            + f" (כותבים את האחדות ומעבירים את השאר). התשובה {fmt(p)}."
        )
    else:
        tens, ones = (b // 10) * 10, b % 10
        dis += [
            (a * (b // 10) + a * ones, "partial_product_shift"),
            (a * tens, None),
        ]
        expl = (
            f"מפרקים: {ltr(f'{a} × {b} = {a} × {tens} + {a} × {ones}')}"
            f" = {ltr(f'{fmt(a * tens)} + {fmt(a * ones)} = {fmt(p)}')}."
        )
    dis += [(p + 10, None), (p - 10, None), (a + b, "add_instead_of_mul")]
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.mul_multi:{a}x{b}",
        prompt_he=f"כמה זה {ltr(f'{a} × {b}')}?",
        prompt_en=f"What is {a} × {b}?",
        answer=p,
        distractors=dis,
        explanation_he=expl,
        difficulty=-0.6 + 0.35 * (ka + kb - 3) + 0.6 * p / 10 ** (ka + kb),
        calc={"expr": f"{a} * {b}", "a": a, "b": b},
        step=10,
    )


@generator("arithmetic.div_remainder")
def div_remainder(rng: random.Random, params: P, ctx: GenContext) -> Question:
    d = rng.randint(2, int(params.get("max_divisor", 9)))
    q = rng.randint(1, int(params.get("max_quotient", 10)))
    r = rng.randint(1, d - 1)
    n = d * q + r
    mode = rng.choice(("full", "remainder"))
    expl = (
        f"הכפולה הגדולה של {d} שלא עוברת את {n} היא "
        f"{ltr(f'{q} × {d} = {d * q}')}. נשאר "
        f"{ltr(f'{n} - {d * q} = {r}')}. כלומר {q} ושארית {r}."
    )
    if mode == "remainder":
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=f"arithmetic.div_remainder:{n}/{d}:r",
            prompt_he=f"מה השארית כשמחלקים {n} ב־{d}?",
            prompt_en=f"What is the remainder of {n} ÷ {d}?",
            answer=r,
            distractors=[
                (q if q != r else None, "remainder_quotient_swap"),
                (d - r if d - r != r else None, None),
                (r + d, "remainder_too_big"),
            ],
            explanation_he=expl,
            difficulty=0.0 + 0.4 * scale(n, 3, 100),
            calc=f"{n} % {d}",
        )

    def text(qq: int, rr: int) -> str:
        return f"{qq} ושארית {rr}" if rr else f"{qq} בלי שארית"

    dis = [
        Opt(text(q, 0), tag="remainder_ignored"),
        Opt(text(q + 1, r), tag="off_by_one"),
    ]
    if q > 1:
        dis.append(Opt(text(q - 1, r + d), tag="remainder_too_big"))
    if r != q:
        dis.append(Opt(text(r, q), tag="remainder_quotient_swap"))
    return options_question(
        rng,
        ctx,
        item_id=f"arithmetic.div_remainder:{n}/{d}:full",
        prompt_he=f"כמה זה {ltr(f'{n} : {d}')}?",
        prompt_en=f"What is {n} ÷ {d}?",
        correct=Opt(text(q, r)),
        distractors=dis,
        explanation_he=expl,
        difficulty=0.2 + 0.4 * scale(n, 3, 100),
        calc=f"divmod({n}, {d})",
    )


@generator("arithmetic.div_long")
def div_long(rng: random.Random, params: P, ctx: GenContext) -> Question:
    k = int(params.get("dividend_digits", 3))
    lo, hi = 10 ** (k - 1), 10**k - 1
    for _ in range(200):
        d = rng.randint(2, 9)
        if rng.random() < 0.35:
            # Force a zero in the quotient.
            q = rng.randint(1, 9) * 100 + rng.randint(1, 9)
            if k == 3:
                q = rng.randint(1, 9) * 10 + 0 if rng.random() < 0.5 else q
        else:
            q = rng.randint(max(lo // d, 2), hi // d)
        n = d * q
        if lo <= n <= hi:
            break
    else:
        d, q, n = 4, 171, 684
    steps = []
    cur = 0
    started = False
    for ch in str(n):
        cur = cur * 10 + int(ch)
        if cur < d and not started:
            continue
        started = True
        qd, rem = divmod(cur, d)
        steps.append(
            f"{ltr(f'{cur} : {d} = {qd}')}"
            + (f" (שארית {rem})" if rem else "")
        )
        cur = rem
    expl = "מחלקים בשלבים משמאל: " + ", ".join(steps) + f". התשובה {q}."
    if len(expl) > 200:
        expl = (
            f"מחלקים בשלבים משמאל, ספרה אחר ספרה. בודקים: "
            f"{ltr(f'{q} × {d} = {n}')}. התשובה {q}."
        )
    no_zero = int(str(q).replace("0", "")) if "0" in str(q) else None
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.div_long:{n}/{d}",
        prompt_he=f"כמה זה {ltr(f'{n} : {d}')}?",
        prompt_en=f"What is {n} ÷ {d}?",
        answer=q,
        distractors=[
            (no_zero, "quotient_zero_dropped"),
            (q + 10, None),
            (q - 10, None),
            (q + 1, "off_by_one"),
        ],
        explanation_he=expl,
        difficulty=-0.3
        + 0.4 * (k - 3)
        + 0.5 * (no_zero is not None)
        + 0.03 * d,
        calc=f"{n} // {d}",
    )


@generator("arithmetic.order_ops")
def order_ops(rng: random.Random, params: P, ctx: GenContext) -> Question:
    level = int(params.get("level", 1))
    a, b, c = rng.randint(2, 9), rng.randint(2, 9), rng.randint(2, 9)
    form = rng.choice(
        ("a+b*c", "a*b+c", "a-b*c")
        if level == 1
        else ("(a+b)*c", "a*(b-c)", "a+b*c-d", "a:b+c*d")
    )
    d = rng.randint(2, 6)
    if form == "a-b*c":
        a = b * c + rng.randint(1, 20)
    if form == "a*(b-c)" and b <= c:
        b, c = c + 1, b
    if form == "a:b+c*d":
        a = b * rng.randint(2, 9)
    if form == "a+b*c-d":
        a = a + d
    shown = {
        "a+b*c": f"{a} + {b} × {c}",
        "a*b+c": f"{a} × {b} + {c}",
        "a-b*c": f"{a} - {b} × {c}",
        "(a+b)*c": f"({a} + {b}) × {c}",
        "a*(b-c)": f"{a} × ({b} - {c})",
        "a+b*c-d": f"{a} + {b} × {c} - {d}",
        "a:b+c*d": f"{a} : {b} + {c} × {d}",
    }[form]
    py = shown.replace("×", "*").replace(":", "//")
    ans = eval(py, {"__builtins__": {}})  # noqa: S307 (self-built)
    ltr_eval = None
    steps = ""
    if form == "a+b*c":
        ltr_eval = (a + b) * c
        steps = f"קודם כפל: {ltr(f'{b} × {c} = {b * c}')}, ואז {ltr(f'{a} + {b * c} = {ans}')}."
    elif form == "a*b+c":
        steps = f"קודם כפל: {ltr(f'{a} × {b} = {a * b}')}, ואז {ltr(f'{a * b} + {c} = {ans}')}."
        ltr_eval = a * (b + c)
    elif form == "a-b*c":
        ltr_eval = (a - b) * c
        steps = f"קודם כפל: {ltr(f'{b} × {c} = {b * c}')}, ואז {ltr(f'{a} - {b * c} = {ans}')}."
    elif form == "(a+b)*c":
        ltr_eval = a + b * c
        steps = f"קודם הסוגריים: {ltr(f'{a} + {b} = {a + b}')}, ואז {ltr(f'{a + b} × {c} = {ans}')}."
    elif form == "a*(b-c)":
        ltr_eval = a * b - c
        steps = f"קודם הסוגריים: {ltr(f'{b} - {c} = {b - c}')}, ואז {ltr(f'{a} × {b - c} = {ans}')}."
    elif form == "a+b*c-d":
        ltr_eval = (a + b) * c - d
        steps = (
            f"קודם כפל: {ltr(f'{b} × {c} = {b * c}')}. אחר כך משמאל "
            f"לימין: {ltr(f'{a} + {b * c} - {d} = {ans}')}."
        )
    else:
        ltr_eval = (a // b + c) * d
        steps = (
            f"קודם חילוק וכפל: {ltr(f'{a} : {b} = {a // b}')}, "
            f"{ltr(f'{c} × {d} = {c * d}')}. ואז "
            f"{ltr(f'{a // b} + {c * d} = {ans}')}."
        )
    tag = "parens_ignored" if "(" in form else "order_left_to_right"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.order_ops:{shown.replace(' ', '')}",
        prompt_he=f"כמה זה {ltr(shown)}?",
        prompt_en=f"What is {shown}?",
        answer=ans,
        distractors=[
            (ltr_eval, tag),
            (ans + 1, None),
            (ans - 1, None),
            (ans + 10, None),
        ],
        explanation_he=steps,
        difficulty=-0.3
        + 0.4 * (level - 1)
        + 0.3 * (form in ("a+b*c-d", "a:b+c*d")),
        calc=py,
    )


# --------------------------------------------------------------------------
# Money, time, patterns
# --------------------------------------------------------------------------

COINS = (1, 2, 5, 10)
SHOP = (
    ("מחברת", 3, 15),
    ("ספר", 20, 80),
    ("כדור", 15, 60),
    ("משחק קופסה", 40, 150),
    ("עוגה", 25, 90),
    ("זר פרחים", 20, 70),
    ("קלמר", 10, 40),
    ("בקבוק מים", 3, 12),
    ("פאזל", 25, 120),
    ("צבעים", 8, 35),
)


@generator("arithmetic.money_count")
def money_count(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mx = int(params.get("max", 20))
    coins: list[int] = []
    total = 0
    count_target = rng.randint(2, 5)
    while len(coins) < count_target:
        c = rng.choice([x for x in COINS if total + x <= mx] or [1])
        if total + c > mx:
            break
        coins.append(c)
        total += c
    coins.sort(reverse=True)
    expr = " + ".join(str(c) for c in coins)
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.money_count:{'+'.join(map(str, coins))}",
        prompt_he="כמה שקלים יש כאן בסך הכול?",
        prompt_en="How many shekels are there?",
        answer=total,
        distractors=[
            (
                len(coins) if len(coins) != total else None,
                "count_coins_not_value",
            ),
            (total - coins[-1], "off_by_one"),
            (total + 1, None),
        ],
        explanation_he=(
            f"מחברים את ערכי המטבעות, מהגדול לקטן: "
            f"{ltr(f'{expr} = {total}')} ₪."
        ),
        difficulty=-0.5 + 0.8 * total / mx + 0.1 * len(coins),
        figure=Figure("objects", {"coins": coins, "currency": "ILS"}),
        unit=" ₪",
        calc=expr,
    )


@generator("arithmetic.money_change")
def money_change(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mx = int(params.get("max", 100))
    agorot = bool(params.get("agorot", False))
    options = [s for s in SHOP if s[1] < mx]
    name, lo, hi = rng.choice(options)
    hi = min(hi, mx - 1)
    price: Fraction = Fraction(rng.randint(lo, hi))
    if agorot and rng.random() < 0.6:
        price += Fraction(rng.choice((10, 20, 50, 90)), 100)
    bills = [
        b for b in (10, 20, 50, 100, 200) if b > price and b <= max(mx, 20)
    ]
    paid = rng.choice(bills[:2]) if bills else 200
    change = paid - price
    style = "money" if agorot else "auto"
    pr = money(price)
    expr = f"{fmt(paid, style)} - {fmt(price, style)} = {fmt(change, style)}"
    smaller = None
    if price.denominator == 1 and change.denominator == 1:
        p_int = int(price)
        _, borrows, sm, _ = column_sub(paid, p_int)
        smaller = sm if borrows else None
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.money_change:{name}:{price}:{paid}",
        prompt_he=(
            f"{name} עולה {pr}. משלמים {money(paid)}. כמה עודף מקבלים?"
        ),
        prompt_en=f"It costs {float(price):g} ₪. You pay {paid} ₪. Change?",
        answer=change,
        distractors=[
            (paid + price, "change_added"),
            (smaller, "smaller_from_larger"),
            (change + 1, "off_by_one"),
            (change - 1, "off_by_one"),
        ],
        explanation_he=(
            f"עודף = מה ששילמנו פחות המחיר: {ltr(expr)} ₪. "
            f"בודקים: {ltr(f'{fmt(price, style)} + {fmt(change, style)} = {paid}')}."
        ),
        difficulty=-0.4
        + 0.6 * float(price) / mx
        + 0.5 * (price.denominator != 1),
        style=style,
        unit=" ₪",
        calc=f"{paid} - F({price.numerator}, {price.denominator})",
    )


@generator("arithmetic.clock")
def clock(rng: random.Random, params: P, ctx: GenContext) -> Question:
    step = int(params.get("step", 60))
    h = rng.randint(1, 12)
    m = rng.randrange(0, 60, step) if step < 60 else 0

    def t(hh: int, mm: int) -> str:
        hh = (hh - 1) % 12 + 1
        return f"{hh}:{mm:02d}"

    right = t(h, m)
    dis = []
    swapped_h, swapped_m = m // 5, (h % 12) * 5
    if swapped_h and (swapped_h, swapped_m) != (h, m) and m % 5 == 0:
        dis.append(Opt(t(swapped_h, swapped_m), tag="clock_hands_swapped"))
    dis.append(Opt(t(h + 1, m), tag="clock_hour_off" if m > 0 else None))
    dis.append(Opt(t(h - 1, m), tag=None))
    if step < 60:
        dis.append(Opt(t(h, (m + 5 * rng.choice((1, 2))) % 60)))
    else:
        dis.append(Opt(t(h, 30)))
    if m == 0:
        why = (
            f"המחוג הארוך על 12, כלומר שעה עגולה. המחוג הקצר על {h}. "
            f"השעה {right}."
        )
    elif m % 5 == 0:
        why = (
            f"המחוג הקצר אחרי {h} (לפני {h % 12 + 1}). המחוג הארוך על "
            f"{m // 5}, כלומר {ltr(f'{m // 5} × 5 = {m}')} דקות. "
            f"השעה {right}."
        )
    else:
        why = (
            f"המחוג הקצר אחרי {h}. המחוג הארוך {m % 5} שנתות אחרי "
            f"{m // 5 if m >= 5 else 12}: {m} דקות. השעה {right}."
        )
    return options_question(
        rng,
        ctx,
        item_id=f"arithmetic.clock:{right}",
        prompt_he="מה השעה בשעון?",
        prompt_en="What time is it?",
        correct=Opt(right),
        distractors=dis,
        explanation_he=why,
        difficulty={60: -0.6, 30: -0.2, 15: 0.1, 5: 0.4, 1: 0.8}.get(step, 0)
        + 0.2 * (m > 30),
        figure=Figure("clock", {"hour": h, "minute": m}),
    )


@generator("arithmetic.pattern")
def pattern(rng: random.Random, params: P, ctx: GenContext) -> Question:
    steps = [int(s) for s in as_list(params.get("steps"), [2, 5, 10])]
    kind = params.get("kind", "skip")
    step = rng.choice(steps)
    start = (
        step * rng.randint(0, 6) if rng.random() < 0.6 else rng.randint(1, 20)
    )
    if kind == "back":
        start += step * 6
        step = -step
    terms = [start + i * step for i in range(5)]
    ans = terms[-1]
    shown = ", ".join(str(x) for x in terms[:-1]) + ", ?"
    word = "מוסיפים" if step > 0 else "מורידים"
    sign = "+" if step > 0 else "-"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.pattern:{start}{step:+d}",
        prompt_he=f"מה המספר הבא? {shown}",
        prompt_en=f"What comes next? {shown}",
        answer=ans,
        distractors=[
            (ans + step, "sequence_off_step"),
            (ans - step // abs(step), "sequence_off_step"),
            (terms[-2] + 1, "sequence_off_step"),
        ],
        explanation_he=(
            f"בכל פעם {word} {abs(step)}: "
            f"{ltr(f'{terms[-2]} {sign} {abs(step)} = {ans}')}."
        ),
        difficulty=-0.4
        + 0.08 * abs(step)
        + 0.4 * (step < 0)
        + 0.3 * (start % abs(step) != 0),
        calc=f"{terms[-2]} + ({step})",
    )


@generator("arithmetic.divisibility")
def divisibility(rng: random.Random, params: P, ctx: GenContext) -> Question:
    divisors = [
        int(x) for x in as_list(params.get("divisors"), [2, 3, 5, 9, 10])
    ]
    d = rng.choice(divisors)
    truth = rng.random() < 0.5
    for _ in range(200):
        n = rng.randint(100, 9999)
        if (n % d == 0) == truth:
            break
    ds = [int(c) for c in str(n)]
    s = sum(ds)
    tag = None
    if d in (3, 9):
        why = (
            f"סכום הספרות: {ltr(' + '.join(map(str, ds)) + f' = {s}')}. "
            f"{s} {'מתחלק' if s % d == 0 else 'לא מתחלק'} ב־{d}"
        )
        if not truth and ds[-1] % d == 0 and ds[-1] != 0:
            tag = "divisibility_last_digit"
    elif d in (2, 5, 10):
        last = ds[-1]
        rule = {2: "זוגית", 5: "0 או 5", 10: "0"}[d]
        why = f"מתחלק ב־{d} אם ספרת האחדות {rule}. ספרת האחדות היא {last}"
    elif d == 4:
        two = n % 100
        why = (
            f"מתחלק ב־4 אם שתי הספרות האחרונות ({two}) מתחלקות ב־4: "
            f"{two} {'מתחלק' if two % 4 == 0 else 'לא מתחלק'}"
        )
        if not truth and ds[-1] % 2 == 0:
            tag = "divisibility_last_digit"
    else:  # 6
        why = f"מתחלק ב־6 אם הוא זוגי וגם סכום ספרותיו ({s}) מתחלק ב־3"
    return true_false_question(
        ctx,
        item_id=f"arithmetic.divisibility:{n}/{d}",
        prompt_he=f"האם {n} מתחלק ב־{d} בלי שארית?",
        prompt_en=f"Is {n} divisible by {d}?",
        truth=n % d == 0,
        explanation_he=f"{why}. לכן התשובה: {'כן' if n % d == 0 else 'לא'}.",
        difficulty={
            2: -0.8,
            10: -0.9,
            5: -0.6,
            3: 0.2,
            9: 0.3,
            4: 0.5,
            6: 0.6,
        }.get(d, 0.0),
        wrong_tag=tag,
        meta={"calc": {"divisible": n % d == 0}},
    )


@generator("arithmetic.average")
def average(rng: random.Random, params: P, ctx: GenContext) -> Question:
    k = rng.randint(3, int(params.get("count", 4)))
    mx = int(params.get("max", 20))
    mean = rng.randint(3, mx - 3)
    nums = [rng.randint(max(0, mean - 6), mean + 6) for _ in range(k - 1)]
    last = mean * k - sum(nums)
    if last < 0:
        nums = [mean] * (k - 1)
        last = mean
    nums.append(last)
    rng.shuffle(nums)
    total = sum(nums)
    middle = sorted(nums)[k // 2]
    listed = ", ".join(map(str, nums))
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"arithmetic.average:{','.join(map(str, nums))}",
        prompt_he=f"מה הממוצע של המספרים {listed}?",
        prompt_en=f"What is the mean of {listed}?",
        answer=mean,
        distractors=[
            (total, "avg_forgot_divide"),
            (middle if middle != mean else None, "avg_middle_value"),
            (mean + 1, None),
            (mean - 1, None),
        ],
        explanation_he=(
            f"מחברים: {ltr(' + '.join(map(str, nums)) + f' = {total}')}. "
            f"מחלקים במספר המספרים ({k}): "
            f"{ltr(f'{total} : {k} = {mean}')}."
        ),
        difficulty=-0.2 + 0.2 * (k - 3) + 0.4 * mx / 100,
        calc=f"F({'+'.join(map(str, nums))}, {k})",
    )
