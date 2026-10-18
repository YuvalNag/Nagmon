"""Fractions, decimals, percentages and ratios (grades 3-8)."""

from __future__ import annotations

import math
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
)
from nagmon.learning.model import Figure, Question

P = Mapping[str, Any]
UNIT_NAMES = {
    2: "חצי",
    3: "שליש",
    4: "רבע",
    5: "חמישית",
    6: "שישית",
    8: "שמינית",
    10: "עשירית",
}


def fr(n: int, d: int) -> str:
    return f"{n}/{d}"


def fexpr(text: str) -> str:
    return ltr(text)


# --------------------------------------------------------------------------
# Fractions
# --------------------------------------------------------------------------


@generator("fractions.identify")
def identify(rng: random.Random, params: P, ctx: GenContext) -> Question:
    max_den = int(params.get("max_den", 8))
    den = rng.randint(2, max_den)
    num = rng.randint(1, den - 1)
    shape = params.get("figure", "mixed")
    if shape == "mixed":
        shape = rng.choice(("pie", "bar_model"))
    value = Fraction(num, den)
    candidates = [
        (den - num, den, "fraction_complement"),
        (num, den - num, "fraction_part_over_rest"),
        (den, num, "fraction_inverted"),
        (num, den + 1, None),
        (num + 1, den, None),
    ]
    dis = []
    seen = {value}
    for n2, d2, tag in candidates:
        if d2 <= 1 or n2 <= 0 or n2 == d2:
            continue
        v = Fraction(n2, d2)
        if v in seen:
            continue
        seen.add(v)
        dis.append(Opt(fr(n2, d2), tag=tag))
    q = options_question(
        rng,
        ctx,
        item_id=f"fractions.identify:{num}/{den}:{shape}",
        prompt_he="איזה חלק מהצורה צבוע?",
        prompt_en="What fraction is shaded?",
        correct=Opt(fr(num, den)),
        distractors=dis,
        explanation_he=(
            f"הצורה מחולקת ל־{den} חלקים שווים: זה המכנה. "
            + ("חלק אחד צבוע" if num == 1 else f"{num} חלקים צבועים")
            + f": זה המונה. לכן {fr(num, den)}."
        ),
        difficulty=-0.6 + 0.12 * den + 0.2 * (num > 1),
        figure=Figure(shape, {"parts": den, "shaded": num}),
        calc=f"F({num}, {den})",
    )
    return q


@generator("fractions.compare")
def compare(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mode = params.get("mode", "mixed")
    if mode == "mixed":
        mode = rng.choice(("same_den", "same_num", "different"))
    for _ in range(100):
        if mode == "same_den":
            d = rng.randint(3, 12)
            a, b = rng.sample(range(1, d), 2)
            x, y = Fraction(a, d), Fraction(b, d)
            fx, fy = (a, d), (b, d)
        elif mode == "same_num":
            n = rng.randint(1, 4)
            d1, d2 = rng.sample(range(n + 1, 13), 2)
            x, y = Fraction(n, d1), Fraction(n, d2)
            fx, fy = (n, d1), (n, d2)
        else:
            d1, d2 = rng.sample(range(2, 11), 2)
            a, b = rng.randint(1, d1 - 1), rng.randint(1, d2 - 1)
            x, y = Fraction(a, d1), Fraction(b, d2)
            fx, fy = (a, d1), (b, d2)
        if x != y:
            break
    big, small = (fx, fy) if x > y else (fy, fx)
    tb, ts = fr(*big), fr(*small)
    if mode == "same_den":
        why = (
            f"המכנה זהה, אז משווים מונים: המונה {big[0]} גדול מ־{small[0]},"
            f" כלומר יותר חלקים. לכן {tb} גדול יותר."
        )
        tag = None
    elif mode == "same_num":
        why = (
            f"המונה זהה. מכנה קטן יותר אומר חלקים גדולים יותר, ולכן "
            f"{tb} גדול מ־{ts}."
        )
        tag = "fraction_bigger_den_bigger"
    else:
        common = math.lcm(big[1], small[1])
        cb = big[0] * common // big[1]
        cs = small[0] * common // small[1]
        why = (
            f"מכנה משותף {common}: {tb} = {fr(cb, common)}, "
            f"{ts} = {fr(cs, common)}. לכן {tb} גדול יותר."
        )
        tag = "fraction_bigger_den_bigger" if small[1] > big[1] else None
    first, second = (fx, fy) if rng.random() < 0.5 else (fy, fx)
    return options_question(
        rng,
        ctx,
        item_id=f"fractions.compare:{fr(*first)}|{fr(*second)}",
        prompt_he=f"איזה שבר גדול יותר: {fr(*first)} או {fr(*second)}?",
        prompt_en=f"Which is bigger: {fr(*first)} or {fr(*second)}?",
        correct=Opt(tb),
        distractors=[Opt(ts, tag=tag)],
        explanation_he=why,
        difficulty={"same_den": -0.7, "same_num": 0.0, "different": 0.6}[mode]
        + 0.3 * (abs(x - y) < Fraction(1, 8)),
        calc=f"max(F({fx[0]}, {fx[1]}), F({fy[0]}, {fy[1]}))",
        n=2,
        shuffle=False,
    )


@generator("fractions.equivalent")
def equivalent(rng: random.Random, params: P, ctx: GenContext) -> Question:
    max_den = int(params.get("max_den", 10))
    modes = as_list(params.get("modes"), ["pick", "missing", "simplify"])
    mode = rng.choice(modes)
    d = rng.randint(2, max_den)
    n = rng.randint(1, d - 1)
    while math.gcd(n, d) != 1:
        n = rng.randint(1, d - 1)
    k = rng.randint(2, 5)
    base = fr(n, d)
    big = fr(n * k, d * k)
    if mode == "pick":
        dis = [
            Opt(fr(n + k, d + k), tag="fraction_add_same"),
            Opt(fr(n, d * k), tag="fraction_mul_one_part"),
            Opt(fr(n * k, d), tag="fraction_mul_one_part"),
            Opt(fr(d, n), tag="fraction_inverted")
            if n != 1
            else Opt(fr(n + 1, d * k)),
        ]
        dis = [
            o
            for o in dis
            if Fraction(*map(int, o.text_he.split("/"))) != Fraction(n, d)
        ]
        return options_question(
            rng,
            ctx,
            item_id=f"fractions.equivalent:pick:{base}x{k}",
            prompt_he=f"איזה שבר שווה ל־{base}?",
            prompt_en=f"Which fraction equals {base}?",
            correct=Opt(big),
            distractors=dis,
            explanation_he=(
                f"כופלים את המונה ואת המכנה באותו מספר ({k}): "
                f"{fexpr(f'{base} = {big}')}. השבר לא משתנה."
            ),
            difficulty=-0.1 + 0.08 * k,
            calc=f"F({n * k}, {d * k})",
        )
    if mode == "missing":
        prompt = f"מה המונה החסר? {fexpr(f'{base} = ?/{d * k}')}"
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=f"fractions.equivalent:missing:{base}x{k}",
            prompt_he=prompt,
            prompt_en=f"Missing numerator: {base} = ?/{d * k}",
            answer=n * k,
            distractors=[
                (n + (d * k - d), "fraction_add_same"),
                (n, "fraction_mul_one_part"),
                (n * k + 1, None),
            ],
            explanation_he=(
                f"המכנה גדל פי {k} ({fexpr(f'{d} × {k} = {d * k}')}"
                f"), אז גם המונה: {fexpr(f'{n} × {k} = {n * k}')}."
            ),
            difficulty=0.1 + 0.08 * k,
            calc=f"{n} * {k}",
        )
    g = k
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"fractions.equivalent:simplify:{big}",
        prompt_he=f"צמצמו את השבר {big} ככל האפשר.",
        prompt_en=f"Simplify {big} fully.",
        answer=Fraction(n, d),
        distractors=[
            (Fraction(n * k // 1, d * k), None),
            (Fraction(n + 1, d), None),
            (Fraction(n, d + 1), None),
            (Fraction(d, n) if n > 1 else None, "fraction_inverted"),
        ],
        explanation_he=(
            f"מחלקים את המונה ואת המכנה במחלק המשותף הגדול "
            f"({g}): {fexpr(f'{n * k} : {g} = {n}')}, "
            f"{fexpr(f'{d * k} : {g} = {d}')}. התשובה {base}."
        ),
        difficulty=0.3 + 0.06 * k * d / 4,
        style="fraction",
        meta={"fraction_form": "simplest"},
        calc=f"F({n * k}, {d * k})",
    )


@generator("fractions.of_quantity")
def of_quantity(rng: random.Random, params: P, ctx: GenContext) -> Question:
    max_den = int(params.get("max_den", 10))
    d = rng.randint(2, max_den)
    n = rng.randint(1, d - 1) if rng.random() < 0.7 else 1
    unit = rng.randint(2, 12)
    total = d * unit
    ans = n * unit
    first = f"{fr(1, d)} מ־{total} זה {fexpr(f'{total} : {d} = {unit}')}."
    rest = f" {fr(n, d)} זה {fexpr(f'{n} × {unit} = {ans}')}." if n > 1 else ""
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"fractions.of_quantity:{n}/{d}of{total}",
        prompt_he=f"כמה זה {fr(n, d)} מ־{total}?",
        prompt_en=f"What is {fr(n, d)} of {total}?",
        answer=ans,
        distractors=[
            (unit if n > 1 else None, "fraction_divide_only"),
            (
                total * n if n > 1 else None,
                "fraction_mul_only",
            ),
            (total - ans, "fraction_complement"),
            (ans + unit, None),
        ],
        explanation_he=first + rest,
        difficulty=-0.2 + 0.25 * (n > 1) + 0.6 * total / 120,
        calc=f"F({n}, {d}) * {total}",
    )


@generator("fractions.addsub")
def addsub(rng: random.Random, params: P, ctx: GenContext) -> Question:
    same = bool(params.get("same_den", True))
    ops = as_list(params.get("op"), ["+", "-"])
    op = rng.choice(ops)
    for _ in range(200):
        if same:
            d1 = d2 = rng.randint(3, 12)
        else:
            d1, d2 = rng.sample(range(2, 11), 2)
        a, b = rng.randint(1, d1 - 1), rng.randint(1, d2 - 1)
        x, y = Fraction(a, d1), Fraction(b, d2)
        if op == "-" and x <= y:
            continue
        if op == "+" and x + y > 2:
            continue
        break
    res = x + y if op == "+" else x - y
    shown = f"{fr(a, d1)} {op} {fr(b, d2)}"
    if same:
        top = a + b if op == "+" else a - b
        expl = (
            f"המכנה זהה, ולכן {'מחברים' if op == '+' else 'מחסרים'} רק "
            f"את המונים: {fexpr(f'{a} {op} {b} = {top}')}. "
            f"{fexpr(f'{shown} = {fr(top, d1)}')}"
        )
        if Fraction(top, d1).denominator != d1:
            expl += f", ובצמצום {fmt(res, 'fraction')}"
        expl += "."
        dis = [
            (
                Fraction(top, d1 + d2) if op == "+" else None,
                "fraction_add_across",
            )
        ]
    else:
        common = math.lcm(d1, d2)
        ca, cb = a * common // d1, b * common // d2
        top = ca + cb if op == "+" else ca - cb
        expl = (
            f"מכנה משותף {common}: {fr(a, d1)} = {fr(ca, common)}, "
            f"{fr(b, d2)} = {fr(cb, common)}. "
            f"{fexpr(f'{fr(ca, common)} {op} {fr(cb, common)} = {fr(top, common)}')}"
            + (
                f" = {fmt(res, 'fraction')}."
                if Fraction(top, common).denominator != common
                else "."
            )
        )
        across = (
            Fraction(a + b, d1 + d2)
            if op == "+"
            else (Fraction(a - b, d1 - d2) if a > b and d1 > d2 else None)
        )
        dis = [
            (across, "fraction_add_across"),
            (
                Fraction(a + b if op == "+" else abs(a - b), max(d1, d2)),
                "fraction_den_kept_wrong",
            ),
        ]
    dis += [
        (res + Fraction(1, res.denominator), None),
        (res - Fraction(1, res.denominator), None),
    ]
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"fractions.addsub:{shown.replace(' ', '')}",
        prompt_he=f"כמה זה {fexpr(shown)}?",
        prompt_en=f"What is {shown}?",
        answer=res,
        distractors=dis,
        explanation_he=expl,
        difficulty=(-0.5 if same else 0.4)
        + 0.2 * (op == "-")
        + 0.3 * (res.denominator != (d1 if same else math.lcm(d1, d2))),
        style="fraction",
        step=Fraction(1, math.lcm(d1, d2)),
        calc=f"F({a}, {d1}) {op} F({b}, {d2})",
    )


@generator("fractions.mul_whole")
def mul_whole(rng: random.Random, params: P, ctx: GenContext) -> Question:
    d = rng.randint(2, 10)
    n = rng.randint(1, d - 1)
    w = rng.randint(2, 9)
    res = Fraction(n * w, d)
    shown = f"{w} × {fr(n, d)}"
    expl = (
        f"כופלים רק את המונה: {fexpr(f'{w} × {n} = {n * w}')}, "
        f"ולכן {fexpr(f'{shown} = {fr(n * w, d)}')}"
    )
    if res.denominator != d:
        expl += f" = {fmt(res, 'fraction')}"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"fractions.mul_whole:{w}x{n}/{d}",
        prompt_he=f"כמה זה {fexpr(shown)}?",
        prompt_en=f"What is {shown}?",
        answer=res,
        distractors=[
            (Fraction(n * w, d * w), "fraction_mul_den"),
            (Fraction(n + w, d), "add_instead_of_mul"),
            (res + 1, None),
        ],
        explanation_he=expl + ".",
        difficulty=0.0 + 0.3 * (res > 1),
        style="fraction",
        calc=f"{w} * F({n}, {d})",
    )


# --------------------------------------------------------------------------
# Decimals
# --------------------------------------------------------------------------


def dec(value: Fraction) -> str:
    return fmt(value, "decimal")


def rand_dec(
    rng: random.Random, places: int, lo: int = 0, hi: int = 20
) -> Fraction:
    scale_ = 10**places
    return Fraction(rng.randint(lo * scale_ + 1, hi * scale_), scale_)


@generator("decimals.compare")
def dec_compare(rng: random.Random, params: P, ctx: GenContext) -> Question:
    whole = rng.randint(0, 9)
    trap = rng.random() < 0.6
    if trap:
        # 0.5 vs 0.25: the longer one looks bigger but isn't.
        a = Fraction(rng.randint(2, 9), 10)
        b = Fraction(rng.randint(10, int(a * 100) - 1), 100)
        if b * 100 % 10 == 0:
            b += Fraction(1, 100)
        x, y = whole + a, whole + b
    else:
        x = whole + Fraction(rng.randint(1, 99), 100)
        y = whole + Fraction(rng.randint(1, 99), 100)
        while y == x:
            y = whole + Fraction(rng.randint(1, 99), 100)
    big, small = max(x, y), min(x, y)
    tag = "decimal_longer_bigger" if len(dec(small)) > len(dec(big)) else None
    pad = lambda v: fmt(v, "money")  # noqa: E731 - 2 decimal places
    first, second = (x, y) if rng.random() < 0.5 else (y, x)
    return options_question(
        rng,
        ctx,
        item_id=f"decimals.compare:{dec(first)}|{dec(second)}",
        prompt_he=f"איזה מספר גדול יותר: {dec(first)} או {dec(second)}?",
        prompt_en=f"Which is bigger: {dec(first)} or {dec(second)}?",
        correct=Opt(dec(big)),
        distractors=[Opt(dec(small), tag=tag)],
        explanation_he=(
            f"משלימים לאותו מספר ספרות: {pad(big)} ו־{pad(small)}."
            f" משווים ספרה אחר ספרה: {dec(big)} גדול יותר."
        ),
        difficulty=-0.3 + 0.6 * trap,
        calc=f"max(F({x.numerator}, {x.denominator}), "
        f"F({y.numerator}, {y.denominator}))",
        n=2,
        shuffle=False,
    )


@generator("decimals.addsub")
def dec_addsub(rng: random.Random, params: P, ctx: GenContext) -> Question:
    op = rng.choice(as_list(params.get("op"), ["+", "-"]))
    pa, pb = rng.choice(((1, 2), (2, 1), (1, 1), (2, 2)))
    a, b = rand_dec(rng, pa, 0, 30), rand_dec(rng, pb, 0, 20)
    if op == "-" and a < b:
        a, b = b, a
        pa, pb = pb, pa
    res = a + b if op == "+" else a - b
    mp = max(pa, pb)
    misalign = None
    if pa != pb and op == "+":
        fa = int((a - int(a)) * 10**pa)
        fb = int((b - int(b)) * 10**pb)
        misalign = int(a) + int(b) + Fraction(fa + fb, 10**mp)
    padded_a = fmt(a, "money") if mp == 2 else dec(a)
    padded_b = fmt(b, "money") if mp == 2 else dec(b)
    shown = f"{dec(a)} {op} {dec(b)}"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"decimals.addsub:{dec(a)}{op}{dec(b)}",
        prompt_he=f"כמה זה {ltr(shown)}?",
        prompt_en=f"What is {shown}?",
        answer=res,
        distractors=[
            (misalign, "decimal_misalign"),
            (res + Fraction(1, 10), None),
            (res - Fraction(1, 10), None),
            (res + 1, None),
        ],
        explanation_he=(
            f"מיישרים את הנקודות זו מתחת לזו: "
            f"{ltr(f'{padded_a} {op} {padded_b}')}. "
            f"{'מחברים' if op == '+' else 'מחסרים'} כרגיל משמאל"
            f" לנקודה ומימינה: {dec(res)}."
        ),
        difficulty=-0.2 + 0.4 * (pa != pb) + 0.2 * (op == "-"),
        style="decimal",
        step=Fraction(1, 10),
        calc=f"F({a.numerator}, {a.denominator}) {op} "
        f"F({b.numerator}, {b.denominator})",
    )


@generator("decimals.mul_pow10")
def mul_pow10(rng: random.Random, params: P, ctx: GenContext) -> Question:
    x = rand_dec(rng, rng.choice((1, 2)), 0, 50)
    p = rng.choice((10, 100, 1000))
    zeros = len(str(p)) - 1
    op = rng.choice(("×", ":"))
    res = x * p if op == "×" else x / p
    wrong_way = x / p if op == "×" else x * p
    wrong_count = (
        x * (p // 10 if p > 10 else 100)
        if op == "×"
        else (x / (p // 10 if p > 10 else 100))
    )
    side = "ימינה" if op == "×" else "שמאלה"
    shown = f"{dec(x)} {op} {p}"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"decimals.mul_pow10:{dec(x)}{op}{p}",
        prompt_he=f"כמה זה {ltr(shown)}?",
        prompt_en=f"What is {shown}?",
        answer=res,
        distractors=[
            (wrong_way, "decimal_shift_wrong_way"),
            (wrong_count, "decimal_shift_count"),
        ],
        explanation_he=(
            f"{'כפל' if op == '×' else 'חילוק'} ב־{p}: מזיזים את "
            f"הנקודה {'מקום אחד' if zeros == 1 else f'{zeros} מקומות'} "
            f"{side}. "
            f"{ltr(f'{shown} = {dec(res)}')}."
        ),
        difficulty=-0.2 + 0.2 * zeros + 0.3 * (op == ":"),
        style="decimal",
        step=res / 10 if res else Fraction(1, 10),
        calc=f"F({x.numerator}, {x.denominator}) "
        + ("*" if op == "×" else "/")
        + f" {p}",
    )


@generator("decimals.muldiv")
def dec_muldiv(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mode = rng.choice(("dec_x_whole", "dec_x_dec", "dec_div_whole"))
    if mode == "dec_x_whole":
        a = Fraction(rng.randint(2, 99), 10)
        b = Fraction(rng.randint(2, 9))
        res = a * b
        places = 1
        shown = f"{dec(a)} × {dec(b)}"
        wrong = res * 10
        why = (
            f"מתעלמים מהנקודה: {ltr(f'{int(a * 10)} × {int(b)} = {int(res * 10)}')}."
            f" בתרגיל ספרה אחת אחרי הנקודה, ולכן {dec(res)}."
        )
    elif mode == "dec_x_dec":
        a = Fraction(rng.randint(1, 9), 10)
        b = Fraction(rng.randint(2, 9), 10)
        res = a * b
        places = 2
        shown = f"{dec(a)} × {dec(b)}"
        wrong = res * 10
        why = (
            f"{ltr(f'{int(a * 10)} × {int(b * 10)} = {int(res * 100)}')}. "
            f"בתרגיל שתי ספרות אחרי הנקודה (אחת בכל מספר), ולכן {dec(res)}."
        )
    else:
        b = Fraction(rng.randint(2, 9))
        res = Fraction(rng.randint(2, 30), 10)
        a = res * b
        places = 1
        shown = f"{dec(a)} : {dec(b)}"
        wrong = res * 10
        why = (
            f"{ltr(f'{int(a * 10)} : {int(b)} = {int(res * 10)}')}, "
            f"ומחזירים את הנקודה: {dec(res)}. בודקים: "
            f"{ltr(f'{dec(res)} × {int(b)} = {dec(a)}')}."
        )
    py = shown.replace("×", "*").replace(":", "/")
    py_terms = [
        f"F({Fraction(t).numerator}, {Fraction(t).denominator})"
        if t not in "*/"
        else t
        for t in py.split()
    ]
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"decimals.muldiv:{shown.replace(' ', '')}",
        prompt_he=f"כמה זה {ltr(shown)}?",
        prompt_en=f"What is {shown}?",
        answer=res,
        distractors=[
            (wrong, "decimal_places_count"),
            (res / 10, "decimal_places_count"),
            (res + Fraction(1, 10**places), None),
        ],
        explanation_he=why,
        difficulty={
            "dec_x_whole": -0.2,
            "dec_x_dec": 0.5,
            "dec_div_whole": 0.3,
        }[mode],
        style="decimal",
        calc=" ".join(py_terms),
    )


# --------------------------------------------------------------------------
# Percent and ratio
# --------------------------------------------------------------------------

PCTS = (10, 20, 25, 50, 75, 5, 15, 30, 40, 60)
ITEMS = (
    "חולצה",
    "משחק",
    "ספר",
    "זוג נעליים",
    "תיק",
    "שמיכה",
    "מנורה",
    "אופניים",
)


@generator("percent.of")
def pct_of(rng: random.Random, params: P, ctx: GenContext) -> Question:
    pct = rng.choice(PCTS)
    base = rng.choice([x for x in range(20, 601, 10) if x * pct % 100 == 0])
    ans = base * pct // 100
    if pct % 10 == 0:
        tenth = base // 10
        why = f"10% מ־{base} זה {ltr(f'{base} : 10 = {tenth}')}."
        if pct != 10:
            why += (
                f" {pct}% זה פי {pct // 10}: "
                f"{ltr(f'{pct // 10} × {tenth} = {ans}')}."
            )
    else:
        why = f"{pct}% זה {pct}/100. {ltr(f'{base} × {pct} : 100 = {ans}')}."
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"percent.of:{pct}%{base}",
        prompt_he=f"כמה זה {pct}% מ־{base}?",
        prompt_en=f"What is {pct}% of {base}?",
        answer=ans,
        distractors=[
            (pct, "percent_as_number"),
            (base - ans, "percent_complement"),
            (base - pct, "percent_as_number"),
            (ans * 10, None),
        ],
        explanation_he=why,
        difficulty=-0.4 + 0.5 * (pct % 10 != 0) + 0.3 * base / 600,
        calc=f"F({base} * {pct}, 100)",
    )


@generator("percent.discount")
def pct_discount(rng: random.Random, params: P, ctx: GenContext) -> Question:
    pct = rng.choice((10, 20, 25, 50, 30, 40, 15))
    price = rng.choice([x for x in range(20, 401, 10) if x * pct % 100 == 0])
    off = price * pct // 100
    ans = price - off
    item = rng.choice(ITEMS)
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"percent.discount:{item}:{price}-{pct}%",
        prompt_he=(
            f"{item} עולה {money(price)}. יש הנחה של {pct}%. "
            f"כמה משלמים אחרי ההנחה?"
        ),
        prompt_en=f"Costs {price} ₪ with {pct}% off. What do you pay?",
        answer=ans,
        distractors=[
            (off, "discount_not_subtracted"),
            (price - pct, "percent_as_number"),
            (price + off, "change_added"),
            (ans - 10, None),
        ],
        explanation_he=(
            f"ההנחה: {pct}% מ־{price} = {off} ₪. משלמים "
            f"{ltr(f'{price} - {off} = {ans}')} ₪."
        ),
        difficulty=0.0 + 0.3 * (pct % 10 != 0) + 0.2 * price / 400,
        unit=" ₪",
        calc=f"{price} - F({price} * {pct}, 100)",
    )


@generator("percent.change")
def pct_change(rng: random.Random, params: P, ctx: GenContext) -> Question:
    up = rng.random() < 0.6
    for _ in range(200):
        pct = rng.choice((10, 20, 25, 50, 40, 60, 75, 100))
        if not up and pct >= 100:
            continue
        base = rng.choice(
            [x for x in range(20, 401, 10) if x * pct % 100 == 0]
        )
        diff = base * pct // 100
        new = base + diff if up else base - diff
        break
    wrong_base = Fraction(diff * 100, new)
    ratio = fmt(Fraction(diff, base), "decimal")
    word = "עלה" if up else "ירד"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"percent.change:{base}->{new}",
        prompt_he=f"מחיר {word} מ־{base} ₪ ל־{new} ₪. בכמה אחוזים {word}?",
        prompt_en=f"A price went from {base} to {new}. Percent change?",
        answer=pct,
        distractors=[
            (
                wrong_base if wrong_base.denominator == 1 else None,
                "percent_change_base",
            ),
            (diff, "percent_as_number"),
            (pct + 5, None),
        ],
        explanation_he=(
            f"השינוי: {diff} ₪. מחלקים במחיר המקורי: "
            f"{ltr(f'{diff} : {base} = {ratio}')}"
            f", כלומר {pct}%."
        ),
        difficulty=0.3 + 0.3 * (not up),
        unit="%",
        calc=f"F({diff} * 100, {base})",
    )


RATIO_CONTEXTS = (
    ("בשקית יש גולות אדומות וכחולות", "גולות אדומות", "גולות כחולות", "גולות"),
    ("במתכון יש קמח וסוכר", "כוסות קמח", "כוסות סוכר", "כוסות"),
    ("בגינה יש עגבניות ומלפפונים", "עגבניות", "מלפפונים", "ירקות"),
    ("בקופסה יש עפרונות וטושים", "עפרונות", "טושים", "כלי כתיבה"),
)


@generator("ratio.share")
def ratio_share(rng: random.Random, params: P, ctx: GenContext) -> Question:
    intro, first, second, total_word = rng.choice(RATIO_CONTEXTS)
    a, b = rng.randint(1, 5), rng.randint(1, 5)
    while a == b or math.gcd(a, b) != 1:
        a, b = rng.randint(1, 5), rng.randint(1, 5)
    unit = rng.randint(2, 12)
    total = (a + b) * unit
    ask_second = rng.random() < 0.5
    ans = (b if ask_second else a) * unit
    other = (a if ask_second else b) * unit
    asked = second if ask_second else first
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"ratio.share:{a}:{b}:{total}:{int(ask_second)}",
        prompt_he=(
            f"{intro} ביחס {ltr(f'{a}:{b}')}. בסך הכול {total} "
            f"{total_word}. כמה {asked}?"
        ),
        prompt_en=f"Ratio {a}:{b}, total {total}. How many?",
        answer=ans,
        distractors=[
            (other, "ratio_reversed"),
            (unit, "ratio_one_part"),
            (total - (b if ask_second else a), None),
        ],
        explanation_he=(
            f"יש {ltr(f'{a} + {b} = {a + b}')} חלקים. כל חלק: "
            f"{ltr(f'{total} : {a + b} = {unit}')}. "
            f"{asked}: {ltr(f'{b if ask_second else a} × {unit} = {ans}')}."
        ),
        difficulty=0.0 + 0.4 * scale(total, 6, 120),
        calc=f"F({total} * {b if ask_second else a}, {a + b})",
    )
