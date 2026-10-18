"""Word problems with Hebrew names and family-friendly contexts."""

from __future__ import annotations

import random
from collections.abc import Callable, Mapping
from typing import Any

from nagmon.learning.generators.common import (
    GenContext,
    as_list,
    g,
    generator,
    ltr,
    numeric_question,
)
from nagmon.learning.generators.names import NAMES, WP_THINGS
from nagmon.learning.model import Question

P = Mapping[str, Any]
# A template returns: (key, prompt, answer, distractors, explanation, calc)
Template = Callable[[random.Random, int], tuple]


def _person(rng: random.Random) -> tuple[str, str]:
    return rng.choice(NAMES)


def t_add_got(rng: random.Random, mx: int) -> tuple:
    name, sex = _person(rng)
    thing = rng.choice(WP_THINGS)
    a = rng.randint(2, mx - 2)
    b = rng.randint(1, mx - a)
    s = a + b
    prompt = (
        f"ל{name} יש {a} {thing}. {name} {g(sex, 'קיבל', 'קיבלה')} "
        f"עוד {b}. כמה {thing} יש ל{name} עכשיו?"
    )
    expl = (
        f"{g(sex, 'קיבל', 'קיבלה')} עוד, ולכן מחברים: "
        f"{ltr(f'{a} + {b} = {s}')}. עכשיו יש {s} {thing}."
    )
    return (
        f"got:{name}:{thing}:{a}+{b}",
        prompt,
        s,
        [(abs(a - b), "wrong_operation")],
        expl,
        f"{a} + {b}",
    )


def t_add_pages(rng: random.Random, mx: int) -> tuple:
    name, sex = _person(rng)
    a = rng.randint(2, mx - 2)
    b = rng.randint(1, mx - a)
    s = a + b
    read = g(sex, "קרא", "קראה")
    prompt = (
        f"{name} {read} {a} עמודים בבוקר ו־{b} עמודים בערב. "
        f"כמה עמודים {read} בסך הכול?"
    )
    expl = f"בסך הכול = מחברים: {ltr(f'{a} + {b} = {s}')} עמודים."
    return (
        f"pages:{name}:{a}+{b}",
        prompt,
        s,
        [(abs(a - b), "wrong_operation")],
        expl,
        f"{a} + {b}",
    )


def t_sub_gave(rng: random.Random, mx: int) -> tuple:
    name, sex = _person(rng)
    thing = rng.choice(WP_THINGS)
    a = rng.randint(3, mx)
    b = rng.randint(1, a - 1)
    d = a - b
    prompt = (
        f"ל{name} היו {a} {thing}. {name} {g(sex, 'נתן', 'נתנה')} "
        f"{b} לחברים. כמה {thing} נשארו?"
    )
    expl = (
        f"{g(sex, 'נתן', 'נתנה')} חלק, ולכן מחסרים: "
        f"{ltr(f'{a} - {b} = {d}')}. נשארו {d}."
    )
    return (
        f"gave:{name}:{thing}:{a}-{b}",
        prompt,
        d,
        [(a + b, "wrong_operation")],
        expl,
        f"{a} - {b}",
    )


def t_sub_library(rng: random.Random, mx: int) -> tuple:
    name, sex = _person(rng)
    a = rng.randint(3, mx)
    b = rng.randint(1, a - 1)
    d = a - b
    prompt = (
        f"בספריית הכיתה היו {a} ספרים. {name} "
        f"{g(sex, 'לקח', 'לקחה')} {b} ספרים הביתה. "
        f"כמה ספרים נשארו בספרייה?"
    )
    expl = f"ספרים יצאו מהספרייה, ולכן מחסרים: {ltr(f'{a} - {b} = {d}')}."
    return (
        f"library:{name}:{a}-{b}",
        prompt,
        d,
        [(a + b, "wrong_operation")],
        expl,
        f"{a} - {b}",
    )


def t_compare(rng: random.Random, mx: int) -> tuple:
    (n1, _), (n2, _) = rng.sample(NAMES, 2)
    thing = rng.choice(WP_THINGS)
    a = rng.randint(3, mx)
    b = rng.randint(1, a - 1)
    d = a - b
    prompt = (
        f"ל{n1} יש {a} {thing} ול{n2} יש {b}. "
        f"כמה {thing} יש ל{n1} יותר מאשר ל{n2}?"
    )
    expl = f'"כמה יותר" = ההפרש. מחסרים: {ltr(f"{a} - {b} = {d}")}.'
    return (
        f"compare:{n1}:{n2}:{a}-{b}",
        prompt,
        d,
        [(a + b, "wrong_operation")],
        expl,
        f"{a} - {b}",
    )


def t_mul_boxes(rng: random.Random, mx: int) -> tuple:
    a = rng.randint(2, 10)
    b = rng.randint(2, max(2, min(10, mx // a)))
    p = a * b
    thing = rng.choice(("עפרונות", "עוגיות", "צבעים", "כדורים"))
    prompt = (
        f"בכל קופסה יש {a} {thing}. יש {b} קופסאות. כמה {thing} יש בסך הכול?"
    )
    expl = f"{b} קבוצות של {a}: כופלים: {ltr(f'{b} × {a} = {p}')}."
    return (
        f"boxes:{a}x{b}:{thing}",
        prompt,
        p,
        [(a + b, "wrong_operation")],
        expl,
        f"{a} * {b}",
    )


def t_mul_garden(rng: random.Random, mx: int) -> tuple:
    name, sex = _person(rng)
    a = rng.randint(2, 10)
    b = rng.randint(2, max(2, min(10, mx // a)))
    p = a * b
    planted = g(sex, "שתל", "שתלה")
    prompt = (
        f"{name} {planted} בגינה {b} שורות, ובכל שורה {a} פרחים. "
        f"כמה פרחים {planted}?"
    )
    expl = f"{b} שורות של {a}: {ltr(f'{b} × {a} = {p}')} פרחים."
    return (
        f"garden:{name}:{a}x{b}",
        prompt,
        p,
        [(a + b, "wrong_operation")],
        expl,
        f"{a} * {b}",
    )


def t_div_share(rng: random.Random, mx: int) -> tuple:
    k = rng.randint(2, 8)
    q = rng.randint(2, max(2, min(10, mx // k)))
    n = k * q
    prompt = (
        f"מחלקים {n} עוגיות שווה בשווה בין {k} ילדים. כמה עוגיות מקבל כל אחד?"
    )
    expl = (
        f"מחלקים שווה בשווה: {ltr(f'{n} : {k} = {q}')}. בודקים: "
        f"{ltr(f'{k} × {q} = {n}')}."
    )
    return (
        f"share:{n}/{k}",
        prompt,
        q,
        [(n - k, "wrong_operation"), (n * k, "wrong_operation")],
        expl,
        f"{n} // {k}",
    )


def t_div_tables(rng: random.Random, mx: int) -> tuple:
    k = rng.randint(2, 8)
    q = rng.randint(2, max(2, min(10, mx // k)))
    n = k * q
    prompt = (
        f"בחוג יש {n} ילדים. ליד כל שולחן יושבים {k} ילדים. כמה שולחנות צריך?"
    )
    expl = f"כמה קבוצות של {k} יש ב־{n}? {ltr(f'{n} : {k} = {q}')} שולחנות."
    return (
        f"tables:{n}/{k}",
        prompt,
        q,
        [(n - k, "wrong_operation")],
        expl,
        f"{n} // {k}",
    )


def t_two_step_shop(rng: random.Random, mx: int) -> tuple:
    name, sex = _person(rng)
    k = rng.randint(2, 5)
    p = rng.randint(2, 12)
    cost = k * p
    paid = next(b for b in (20, 50, 100, 200) if b > cost)
    ch = paid - cost
    prompt = (
        f"{name} {g(sex, 'קנה', 'קנתה')} {k} מחברות, כל אחת ב־{p} ₪, "
        f"{g(sex, 'ושילם', 'ושילמה')} {paid} ₪. כמה עודף "
        f"{g(sex, 'קיבל', 'קיבלה')}?"
    )
    expl = (
        f"שלב 1: המחיר {ltr(f'{k} × {p} = {cost}')} ₪. שלב 2: העודף "
        f"{ltr(f'{paid} - {cost} = {ch}')} ₪."
    )
    return (
        f"shop:{name}:{k}x{p}/{paid}",
        prompt,
        ch,
        [(paid - p, "wrong_operation"), (cost, "wrong_operation")],
        expl,
        f"{paid} - {k} * {p}",
    )


def t_two_step_harvest(rng: random.Random, mx: int) -> tuple:
    r = rng.randint(2, 6)
    c = rng.randint(3, 9)
    tot = r * c
    p = rng.randint(1, tot - 1)
    left = tot - p
    prompt = (
        f"בגינה המשפחתית {r} שורות עגבניות, ובכל שורה {c} עגבניות. "
        f"קטפו {p} לסלט. כמה עגבניות נשארו?"
    )
    expl = (
        f"שלב 1: {ltr(f'{r} × {c} = {tot}')} עגבניות. שלב 2: "
        f"{ltr(f'{tot} - {p} = {left}')} נשארו."
    )
    return (
        f"harvest:{r}x{c}-{p}",
        prompt,
        left,
        [
            (r + c - p if r + c > p else None, "wrong_operation"),
            (tot + p, "wrong_operation"),
        ],
        expl,
        f"{r} * {c} - {p}",
    )


def t_percent_sale(rng: random.Random, mx: int) -> tuple:
    pct = rng.choice((10, 20, 25, 50))
    price = rng.choice([x for x in range(40, 301, 20) if x * pct % 100 == 0])
    off = price * pct // 100
    pay = price - off
    item = rng.choice(("משחק קופסה", "כדור כדורסל", "ספר הרפתקאות", "פאזל"))
    prompt = (
        f"{item} עולה {price} ₪, ובמבצע יש {pct}% הנחה. כמה עולה {item} במבצע?"
    )
    expl = (
        f"ההנחה: {pct}% מ־{price} = {off} ₪. המחיר: "
        f"{ltr(f'{price} - {off} = {pay}')} ₪."
    )
    return (
        f"sale:{price}-{pct}%",
        prompt,
        pay,
        [(off, "discount_not_subtracted"), (price - pct, "percent_as_number")],
        expl,
        f"{price} - {price} * {pct} // 100",
    )


TEMPLATES: dict[str, tuple[Template, ...]] = {
    "add": (t_add_got, t_add_pages),
    "sub": (t_sub_gave, t_sub_library, t_compare),
    "mul": (t_mul_boxes, t_mul_garden),
    "div": (t_div_share, t_div_tables),
    "two_step": (t_two_step_shop, t_two_step_harvest),
    "percent": (t_percent_sale,),
}
DIFFICULTY = {
    "add": -0.6,
    "sub": -0.3,
    "mul": 0.0,
    "div": 0.2,
    "two_step": 0.6,
    "percent": 0.5,
}


@generator("word.problem")
def word_problem(rng: random.Random, params: P, ctx: GenContext) -> Question:
    ops = as_list(params.get("ops"), ["add", "sub"])
    mx = int(params.get("max", 20))
    op = rng.choice(ops)
    template = rng.choice(TEMPLATES[op])
    key, prompt, ans, dis, expl, calc = template(rng, mx)
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"word.problem:{op}:{key}",
        prompt_he=prompt,
        answer=ans,
        distractors=[*dis, (ans + 1, "off_by_one"), (ans - 1, "off_by_one")],
        explanation_he=expl,
        difficulty=DIFFICULTY[op] + 0.4 * min(1.0, ans / max(mx, 1)),
        calc=calc,
    )
