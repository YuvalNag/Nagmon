"""Negative numbers, powers and roots, equations and functions (7-9)."""

from __future__ import annotations

import random
from collections.abc import Mapping
from fractions import Fraction
from typing import Any

from nagmon.learning.generators.common import (
    GenContext,
    Opt,
    fmt,
    generator,
    ltr,
    numeric_question,
    options_question,
)
from nagmon.learning.model import Figure, Question

P = Mapping[str, Any]
SUP = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")


def sup(n: int) -> str:
    return str(n).translate(SUP)


def paren(n: int) -> str:
    """Signed operand: negatives in parentheses, e.g. (-3)."""
    return f"({n})" if n < 0 else str(n)


def nz(rng: random.Random, lo: int, hi: int) -> int:
    v = 0
    while v == 0:
        v = rng.randint(lo, hi)
    return v


@generator("algebra.negative")
def negative(rng: random.Random, params: P, ctx: GenContext) -> Question:
    op = params.get("op", "addsub")
    if op == "compare":
        a, b = rng.sample([x for x in range(-12, 13) if x], 2)
        if rng.random() < 0.6:
            a, b = -abs(a), -abs(b)
            if a == b:
                b = a - 1
        big, small = max(a, b), min(a, b)
        tag = "negative_sign_error" if abs(small) > abs(big) else None
        return options_question(
            rng,
            ctx,
            item_id=f"algebra.negative:cmp{a},{b}",
            prompt_he=f"איזה מספר גדול יותר: {fmt(a)} או {fmt(b)}?",
            prompt_en=f"Which is bigger: {a} or {b}?",
            correct=Opt(fmt(big)),
            distractors=[Opt(fmt(small), tag=tag)],
            explanation_he=(
                f"על ציר המספרים, מספר שנמצא ימינה יותר גדול יותר."
                f" {fmt(big)} נמצא מימין ל־{fmt(small)}."
            ),
            difficulty=-0.3 + 0.6 * (a < 0 and b < 0),
            figure=Figure(
                "number_line", {"min": -12, "max": 12, "marks": [a, b]}
            ),
            calc=f"max({a}, {b})",
            n=2,
            shuffle=False,
        )
    if op == "addsub":
        while True:
            a, b = nz(rng, -15, 15), nz(rng, -15, 15)
            sign = rng.choice("+-")
            res = a + b if sign == "+" else a - b
            if a < 0 or b < 0 or res < 0:
                break
        shown = f"{a} {sign} {paren(b)}"
        if sign == "-" and b < 0:
            why = (
                f"חיסור של מספר שלילי הוא כמו חיבור: "
                f"{ltr(f'{shown} = {a} + {-b} = {res}')}."
            )
        elif sign == "+" and b < 0:
            why = (
                f"חיבור של מספר שלילי הוא כמו חיסור: "
                f"{ltr(f'{shown} = {a} - {-b} = {res}')}."
            )
        else:
            move = b if sign == "+" else -b
            side = "ימינה" if move > 0 else "שמאלה"
            why = (
                f"על ציר המספרים: מתחילים ב־{fmt(a)} וזזים {abs(move)} "
                f"{side}. מגיעים ל־{fmt(res)}."
            )
        wrong = a - b if sign == "+" else a + b
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=f"algebra.negative:{shown.replace(' ', '')}",
            prompt_he=f"כמה זה {ltr(shown)}?",
            prompt_en=f"What is {shown}?",
            answer=res,
            distractors=[
                (-res if res else None, "negative_sign_error"),
                (wrong, "negative_sign_error"),
                (res + 1, None),
                (res - 1, None),
            ],
            explanation_he=why,
            difficulty=-0.2 + 0.3 * (b < 0) + 0.2 * (a < 0),
            allow_negative=True,
            calc=f"{a} {sign} ({b})",
        )
    a, b = nz(rng, -10, 10), nz(rng, -10, 10)
    if a > 0 and b > 0:
        a = -a
    if rng.random() < 0.5:
        res = a * b
        shown = f"{paren(a)} × {paren(b)}"
        py = f"({a}) * ({b})"
    else:
        res = a
        a = a * b
        shown = f"{paren(a)} : {paren(b)}"
        py = f"({a}) // ({b})"
    same = (a < 0) == (b < 0)
    why = (
        "שני הסימנים זהים, ולכן התוצאה חיובית"
        if same
        else "הסימנים שונים, ולכן התוצאה שלילית"
    )
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"algebra.negative:{shown.replace(' ', '')}",
        prompt_he=f"כמה זה {ltr(shown)}?",
        prompt_en=f"What is {shown}?",
        answer=res,
        distractors=[
            (-res, "neg_times_neg" if same else "negative_sign_error"),
            (res + (1 if res > 0 else -1), None),
        ],
        explanation_he=f"{why}: {ltr(f'{shown} = {res}')}.",
        difficulty=0.0 + 0.3 * same,
        allow_negative=True,
        calc=py,
    )


@generator("algebra.powers")
def powers(rng: random.Random, params: P, ctx: GenContext) -> Question:
    kind = params.get("kind", "power")
    if kind == "power":
        base = rng.randint(2, 10)
        exp = rng.randint(2, 3 if base > 5 else 5)
        if base == 10:
            exp = rng.randint(2, 6)
        val = base**exp
        chain = " × ".join([str(base)] * exp)
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=f"algebra.powers:{base}^{exp}",
            prompt_he=f"כמה זה {base} בחזקת {exp}?",
            prompt_en=f"What is {base} to the power of {exp}?",
            answer=val,
            distractors=[
                (base * exp, "power_as_multiply"),
                (base + exp, None),
                (base ** (exp - 1), None),
                (exp**base if exp**base < 10**7 else None, "power_base_swap"),
            ],
            explanation_he=(
                f"{base} בחזקת {exp} זה {base} כפול עצמו {exp} "
                f"פעמים: {ltr(f'{chain} = {fmt(val)}')}."
            ),
            difficulty=-0.4 + 0.15 * exp + 0.05 * base,
            calc=f"{base} ** {exp}",
        )
    if kind == "sqrt":
        r = rng.randint(2, 15)
        n = r * r
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=f"algebra.powers:sqrt{n}",
            prompt_he=f"כמה זה {ltr(f'√{n}')}?",
            prompt_en=f"What is √{n}?",
            answer=r,
            distractors=[
                (n // 2 if n % 2 == 0 else None, "sqrt_half"),
                (r + 1, None),
                (r - 1, None),
            ],
            explanation_he=(
                f"מחפשים מספר שכפול עצמו נותן {n}: "
                f"{ltr(f'{r} × {r} = {n}')}. לכן "
                f"{ltr(f'√{n} = {r}')}."
            ),
            difficulty=-0.5 + 0.1 * r,
            calc=f"sqrt({n})",
        )
    if kind == "laws":
        base = rng.randint(2, 9)
        m, n = rng.randint(2, 8), rng.randint(2, 6)
        law = rng.choice(("mul", "div", "pow"))
        if law == "mul":
            shown, ans = f"{base}{sup(m)} × {base}{sup(n)}", m + n
            wrong, tag = m * n, "exponent_multiply"
            why = f"בכפל חזקות עם אותו בסיס מחברים מעריכים: {m} + {n} = {ans}."
        elif law == "div":
            m = m + n
            shown, ans = f"{base}{sup(m)} : {base}{sup(n)}", m - n
            wrong = m // n if m % n == 0 else m + n
            tag = "exponent_multiply"
            why = (
                f"בחילוק חזקות עם אותו בסיס מחסרים מעריכים: {m} - {n} = {ans}."
            )
        else:
            shown, ans = f"({base}{sup(m)}){sup(n)}", m * n
            wrong, tag = m + n, "exponent_add"
            why = f"בחזקה של חזקה כופלים מעריכים: {m} × {n} = {ans}."
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=f"algebra.powers:law:{shown}",
            prompt_he=f"{ltr(f'{shown} = {base}^?')} מה המעריך החסר?",
            prompt_en=f"{shown} = {base}^? Find the exponent.",
            answer=ans,
            distractors=[(wrong, tag), (ans + 1, None), (ans - 1, None)],
            explanation_he=why,
            difficulty=0.0 + 0.3 * (law != "mul"),
            calc={
                "mul": f"{m} + {n}",
                "div": f"{m} - {n}",
                "pow": f"{m} * {n}",
            }[law],
        )
    # scientific notation: n = a.bc x 10^k
    k = rng.randint(3, 8)
    mant = Fraction(rng.randint(11, 99), 10)
    n = int(mant * 10**k)
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"algebra.powers:sci{n}",
        prompt_he=(
            f"כותבים את {fmt(n)} בכתיב מדעי: "
            f"{ltr(f'{fmt(mant)} × 10^?')} מה המעריך?"
        ),
        prompt_en=f"Write {n} as {fmt(mant)} × 10^?",
        answer=k,
        distractors=[
            (k + 1, "decimal_shift_count"),
            (k - 1, "decimal_shift_count"),
            (len(str(n)), "decimal_shift_count"),
        ],
        explanation_he=(
            f"מזיזים את הנקודה מסוף {fmt(n)} עד אחרי הספרה "
            f"הראשונה: {k} מקומות. לכן "
            f"{ltr(f'{fmt(n)} = {fmt(mant)} × 10{sup(k)}')}."
        ),
        difficulty=0.2 + 0.05 * k,
        calc=f"{k}",
    )


@generator("algebra.root_estimate")
def root_estimate(rng: random.Random, params: P, ctx: GenContext) -> Question:
    r = rng.randint(2, 14)
    n = rng.randint(r * r + 1, (r + 1) ** 2 - 1)

    def between(lo: int) -> str:
        return f"בין {lo} ל־{lo + 1}"

    dis = [Opt(between(r - 1)), Opt(between(r + 1))]
    if n // 2 > r + 2:
        dis.append(Opt(between(n // 2), tag="sqrt_half"))
    else:
        dis.append(Opt(between(r + 2)))
    return options_question(
        rng,
        ctx,
        item_id=f"algebra.root_estimate:{n}",
        prompt_he=f"בין אילו שני מספרים שלמים נמצא {ltr(f'√{n}')}?",
        prompt_en=f"Between which whole numbers is √{n}?",
        correct=Opt(between(r)),
        distractors=dis,
        explanation_he=(
            f"{ltr(f'{r}² = {r * r}')} ו־"
            f"{ltr(f'{r + 1}² = {(r + 1) ** 2}')}. {n} ביניהם, "
            f"ולכן {ltr(f'√{n}')} בין {r} ל־{r + 1}."
        ),
        difficulty=0.0 + 0.05 * r,
    )


@generator("algebra.equation")
def equation(rng: random.Random, params: P, ctx: GenContext) -> Question:
    kind = params.get("kind", "two_step")
    neg = bool(params.get("negatives", False))
    lo = -9 if neg else 1
    x = rng.randint(lo, 12)
    while x == 0:
        x = rng.randint(lo, 12)
    if kind == "one_step":
        form = rng.choice(("x+a", "x-a", "ax", "x:a"))
        a = rng.randint(2, 12)
        if form == "x+a":
            c = x + a
            shown, why = f"x + {a} = {c}", f"מחסירים {a} משני האגפים"
            wrong, py = c + a, f"{c} - {a}"
        elif form == "x-a":
            c = x - a
            shown, why = f"x - {a} = {c}", f"מוסיפים {a} לשני האגפים"
            wrong, py = c - a, f"{c} + {a}"
        elif form == "ax":
            c = a * x
            shown, why = f"{a}x = {c}", f"מחלקים את שני האגפים ב־{a}"
            wrong, py = c - a, f"{c} // {a}"
        else:
            x = a * rng.randint(1, 9)
            c = x // a
            shown, why = f"x : {a} = {c}", f"כופלים את שני האגפים ב־{a}"
            wrong, py = c, f"{c} * {a}"
            wrong = None
        expl = f"{why}: {ltr(f'x = {x}')}. בודקים: מציבים {x} ומקבלים {c}."
        diff = -0.5 + 0.2 * (form in ("ax", "x:a"))
        tag = "equation_inverse_op"
    elif kind == "two_step":
        a = rng.randint(2, 9)
        b = rng.randint(1, 20) * rng.choice((1, -1) if neg else (1,))
        c = a * x + b
        bs = f"+ {b}" if b >= 0 else f"- {-b}"
        shown = f"{a}x {bs} = {c}"
        py = f"({c} - ({b})) // {a}"
        step1 = f"{a}x = {c - b}"
        expl = (
            f"קודם מבטלים את ה־{abs(b)}: {ltr(step1)}. אחר כך מחלקים ב־{a}:"
            f" {ltr(f'x = {x}')}. בודקים: "
            f"{ltr(f'{a} × {paren(x)} {bs} = {c}')}."
        )
        wrong = Fraction(c + b, a)
        wrong = wrong if wrong.denominator == 1 else None
        alt = Fraction(c, a) - b
        diff = 0.0 + 0.3 * neg
        tag = "equation_inverse_op"
        dis_extra = [
            (alt if alt.denominator == 1 else None, "equation_divide_first")
        ]
    else:  # both sides: ax + b = cx + d
        a = rng.randint(3, 9)
        c2 = rng.randint(1, a - 1)
        b = rng.randint(-10, 10)
        d = (a - c2) * x + b
        bs = f"+ {b}" if b >= 0 else f"- {-b}"
        ds = f"+ {d}" if d >= 0 else f"- {-d}"
        cx = "x" if c2 == 1 else f"{c2}x"
        shown = f"{a}x {bs} = {cx} {ds}"
        py = f"({d} - ({b})) // ({a} - {c2})"
        expl = (
            f"מעבירים את ה־x לאגף אחד: {ltr(f'{a - c2}x = {d - b}')}. "
            f"מחלקים ב־{a - c2}: {ltr(f'x = {x}')}."
        )
        w = Fraction(d - b, a + c2)
        wrong = w if w.denominator == 1 else None
        diff = 0.4
        tag = "equation_inverse_op"
        dis_extra = [
            (
                Fraction(d + b, a - c2) if (d + b) % (a - c2) == 0 else None,
                "equation_inverse_op",
            )
        ]
    if kind == "one_step":
        dis_extra = []
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"algebra.equation:{shown.replace(' ', '')}",
        prompt_he=f"פתרו את המשוואה: {ltr(shown)}. כמה זה x?",
        prompt_en=f"Solve: {shown}. What is x?",
        answer=x,
        distractors=[
            (wrong, tag),
            *dis_extra,
            (-x, "negative_sign_error"),
            (x + 1, None),
        ],
        explanation_he=expl,
        difficulty=diff,
        allow_negative=neg,
        calc=py,
    )


@generator("algebra.substitute")
def substitute(rng: random.Random, params: P, ctx: GenContext) -> Question:
    v = rng.choice("abnxy")
    val = rng.randint(2, 9)
    form = rng.choice(("ax+b", "a(x+b)", "x2+b", "ax-b"))
    a, b = rng.randint(2, 9), rng.randint(1, 12)
    if form == "ax+b":
        shown, res = f"{a}{v} + {b}", a * val + b
        wrong, tag = int(f"{a}{val}") + b, "substitute_concat"
        step = f"{a} × {val} + {b} = {a * val} + {b} = {res}"
    elif form == "ax-b":
        b = min(b, a * val)
        shown, res = f"{a}{v} - {b}", a * val - b
        wrong, tag = int(f"{a}{val}") - b, "substitute_concat"
        step = f"{a} × {val} - {b} = {a * val} - {b} = {res}"
    elif form == "a(x+b)":
        shown, res = f"{a}({v} + {b})", a * (val + b)
        wrong, tag = a * val + b, "parens_ignored"
        step = f"{a} × ({val} + {b}) = {a} × {val + b} = {res}"
    else:
        shown, res = f"{v}² + {b}", val * val + b
        wrong, tag = 2 * val + b, "power_as_multiply"
        step = f"{val} × {val} + {b} = {val * val} + {b} = {res}"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"algebra.substitute:{shown.replace(' ', '')}@{val}",
        prompt_he=f"מה הערך של {ltr(shown)} כאשר {ltr(f'{v} = {val}')}?",
        prompt_en=f"Evaluate {shown} when {v} = {val}.",
        answer=res,
        distractors=[(wrong, tag), (res + 1, None), (res - a, None)],
        explanation_he=f"מציבים {val} במקום {v}: {ltr(step)}.",
        difficulty=-0.2 + 0.3 * (form in ("a(x+b)", "x2+b")),
        calc=step.split("=")[0].replace("×", "*"),
    )


@generator("algebra.linear")
def linear(rng: random.Random, params: P, ctx: GenContext) -> Question:
    kind = params.get("kind", "value")
    if kind == "mixed":
        kind = rng.choice(("value", "slope", "intercept", "two_points"))
    m = nz(rng, -5, 6)
    b = rng.randint(-9, 9)
    bs = "" if b == 0 else (f" + {b}" if b > 0 else f" - {-b}")
    mx = "x" if m == 1 else ("-x" if m == -1 else f"{m}x")
    rule = f"y = {mx}{bs}"
    if kind == "value":
        x = rng.randint(-4, 6)
        y = m * x + b
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=f"algebra.linear:value:{rule}@{x}",
            prompt_he=(
                f"נתונה הפונקציה {ltr(f'f(x) = {mx}{bs}')}. "
                f"כמה זה {ltr(f'f({x})')}?"
            ),
            prompt_en=f"f(x) = {mx}{bs}. What is f({x})?",
            answer=y,
            distractors=[
                (m + x + b, "add_instead_of_mul"),
                (-y if y else None, "negative_sign_error"),
                (m * x, None),
            ],
            explanation_he=(
                f"מציבים {fmt(x)} במקום x: "
                f"{ltr(f'{m} × {paren(x)}{bs} = {m * x}{bs} = {y}')}."
            ),
            difficulty=-0.2 + 0.3 * (x < 0 or m < 0),
            allow_negative=True,
            calc=f"{m} * ({x}) + ({b})",
        )
    if kind in ("slope", "intercept"):
        ans = m if kind == "slope" else b
        other = b if kind == "slope" else m
        word = "השיפוע" if kind == "slope" else "נקודת החיתוך עם ציר y"
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=f"algebra.linear:{kind}:{rule}",
            prompt_he=f"מה {word} של הישר {ltr(rule)}?",
            prompt_en=f"What is the {kind} of {rule}?",
            answer=ans,
            distractors=[
                (other if other != ans else None, "slope_intercept_swap"),
                (-ans if ans else None, "negative_sign_error"),
                (ans + 1, None),
            ],
            explanation_he=(
                f"בישר {ltr('y = mx + b')}, המספר שליד x הוא "
                f"השיפוע ({fmt(m)}), והמספר החופשי הוא נקודת "
                f"החיתוך עם ציר y ({fmt(b)})."
            ),
            difficulty=-0.1,
            allow_negative=True,
            calc=f"{ans}",
        )
    x1 = rng.randint(-3, 3)
    x2 = x1 + rng.randint(1, 4)
    y1, y2 = m * x1 + b, m * x2 + b
    swapped = Fraction(x2 - x1, y2 - y1) if y2 != y1 else None
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"algebra.linear:pts:({x1},{y1})({x2},{y2})",
        prompt_he=(
            f"ישר עובר בנקודות {ltr(f'({x1}, {y1})')} ו־"
            f"{ltr(f'({x2}, {y2})')}. מה השיפוע שלו?"
        ),
        prompt_en=f"Slope through ({x1}, {y1}) and ({x2}, {y2})?",
        answer=m,
        distractors=[
            (
                swapped if swapped and swapped.denominator == 1 else None,
                "slope_intercept_swap",
            ),
            (-m, "negative_sign_error"),
            (y2 - y1, None),
        ],
        explanation_he=(
            f"שיפוע = שינוי ב־y חלקי שינוי ב־x: "
            f"{ltr(f'({y2} - {paren(y1)}) : ({x2} - {paren(x1)})')}"
            f" = {ltr(f'{y2 - y1} : {x2 - x1} = {m}')}."
        ),
        difficulty=0.5,
        allow_negative=True,
        calc=f"F({y2} - ({y1}), {x2} - ({x1}))",
    )
