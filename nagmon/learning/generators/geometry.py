"""Geometry generators: figures are specs only, the UI draws them."""

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
    emoji,
    fmt,
    generator,
    ltr,
    numeric_question,
    options_question,
    scale,
)
from nagmon.learning.model import Figure, Question

P = Mapping[str, Any]
CM = ' ס"מ'
CM2 = ' סמ"ר'
CM3 = ' סמ"ק'
PI = Fraction(314, 100)


def regular(n: int, r: float = 3.0, rot: float = 90.0) -> list[list[float]]:
    pts = []
    for i in range(n):
        a = math.radians(rot + 360.0 * i / n)
        pts.append([round(r * math.cos(a), 2), round(r * math.sin(a), 2)])
    return pts


def tri_points(a: float, b: float, c: float) -> list[list[float]]:
    """Triangle with sides a=BC, b=CA, c=AB."""
    x = (b * b + c * c - a * a) / (2 * c)
    y = math.sqrt(max(b * b - x * x, 0.0))
    return [[0.0, 0.0], [round(c, 2), 0.0], [round(x, 2), round(y, 2)]]


def tri_from_angles(alpha: float, beta: float) -> list[list[float]]:
    gamma = 180 - alpha - beta
    c = 5.0
    a = c * math.sin(math.radians(alpha)) / math.sin(math.radians(gamma))
    b = c * math.sin(math.radians(beta)) / math.sin(math.radians(gamma))
    return tri_points(a, b, c)


SHAPES: dict[str, tuple[str, Figure]] = {
    "triangle": (
        "משולש",
        Figure(
            "polygon", {"points": [[0, 0], [4, 0], [2, 3]], "name": "triangle"}
        ),
    ),
    "square": (
        "ריבוע",
        Figure(
            "polygon",
            {"points": [[0, 0], [3, 0], [3, 3], [0, 3]], "name": "square"},
        ),
    ),
    "rectangle": (
        "מלבן",
        Figure(
            "polygon",
            {"points": [[0, 0], [5, 0], [5, 3], [0, 3]], "name": "rectangle"},
        ),
    ),
    "circle": ("עיגול", Figure("circle", {"r": 3, "name": "circle"})),
    "pentagon": (
        "מחומש",
        Figure("polygon", {"points": regular(5), "name": "pentagon"}),
    ),
    "hexagon": (
        "משושה",
        Figure("polygon", {"points": regular(6), "name": "hexagon"}),
    ),
    "rhombus": (
        "מעוין",
        Figure(
            "polygon",
            {"points": [[0, 0], [3, 2], [6, 0], [3, -2]], "name": "rhombus"},
        ),
    ),
    "trapezoid": (
        "טרפז",
        Figure(
            "polygon",
            {
                "points": [[0, 0], [6, 0], [4.5, 3], [1.5, 3]],
                "name": "trapezoid",
            },
        ),
    ),
}
SHAPE_EN = {
    "triangle": "triangle",
    "square": "square",
    "rectangle": "rectangle",
    "circle": "circle",
    "pentagon": "pentagon",
    "hexagon": "hexagon",
    "rhombus": "rhombus",
    "trapezoid": "trapezoid",
}
SHAPE_WHY = {
    "triangle": "יש לו 3 צלעות ו־3 קודקודים",
    "square": "יש לו 4 צלעות שוות ו־4 פינות ישרות",
    "rectangle": "יש לו 4 פינות ישרות, ושתי צלעות ארוכות ושתיים קצרות",
    "circle": "הוא עגול לגמרי, בלי צלעות ובלי פינות",
    "pentagon": "יש לו 5 צלעות",
    "hexagon": "יש לו 6 צלעות",
    "rhombus": "יש לו 4 צלעות שוות, בלי פינות ישרות",
    "trapezoid": "יש לו 4 צלעות, ורק שתיים מהן מקבילות",
}
CONFUSABLE = {
    ("square", "rectangle"),
    ("rectangle", "square"),
    ("square", "rhombus"),
    ("rhombus", "square"),
    ("pentagon", "hexagon"),
    ("hexagon", "pentagon"),
}

ANIMALS = (
    ("נמלה", "1f41c", 1),
    ("דבורה", "1f41d", 2),
    ("עכבר", "1f401", 3),
    ("ארנב", "1f407", 4),
    ("חתול", "1f408", 5),
    ("כלב", "1f415", 6),
    ("כבשה", "1f411", 7),
    ("סוס", "1f40e", 8),
    ("פיל", "1f418", 10),
    ("לווייתן", "1f40b", 12),
)


@generator("geometry.size_compare")
def size_compare(rng: random.Random, params: P, ctx: GenContext) -> Question:
    for _ in range(100):
        picks = rng.sample(ANIMALS, 3)
        sizes = sorted(p[2] for p in picks)
        if sizes[1] - sizes[0] >= 2 and sizes[2] - sizes[1] >= 2:
            break
    big = rng.random() < 0.5
    target = (
        max(picks, key=lambda p: p[2])
        if big
        else min(picks, key=lambda p: p[2])
    )
    word = "גדול" if big else "קטן"
    others = [p for p in picks if p is not target]
    order = sorted(picks, key=lambda p: p[2], reverse=big)
    return options_question(
        rng,
        ctx,
        item_id=f"geometry.size_compare:{word}:"
        + ",".join(sorted(p[0] for p in picks)),
        prompt_he=f"מי הכי {word}?",
        prompt_en="Which is the biggest?" if big else "Which is the smallest?",
        correct=Opt(target[0], image=emoji(target[1])),
        distractors=[Opt(p[0], image=emoji(p[1])) for p in others],
        explanation_he=(
            f"מסדרים מה{'גדול' if big else 'קטן'}: "
            + ", ".join(p[0] for p in order)
            + f". הכי {word}: {target[0]}."
        ),
        difficulty=-0.5 + 0.1 * (sizes[1] - sizes[0] < 3),
        n=3,
    )


@generator("geometry.shape_identify")
def shape_identify(rng: random.Random, params: P, ctx: GenContext) -> Question:
    names = as_list(
        params.get("shapes"), ["triangle", "square", "rectangle", "circle"]
    )
    shape = rng.choice(names)
    he, fig = SHAPES[shape]
    dis = [
        Opt(
            SHAPES[s][0],
            SHAPE_EN[s],
            tag="shape_confusion" if (shape, s) in CONFUSABLE else None,
        )
        for s in names
        if s != shape
    ]
    return options_question(
        rng,
        ctx,
        item_id=f"geometry.shape_identify:{shape}",
        prompt_he="איזו צורה זו?",
        prompt_en="What shape is this?",
        correct=Opt(he, SHAPE_EN[shape]),
        distractors=dis,
        explanation_he=f"זה {he}: {SHAPE_WHY[shape]}.",
        difficulty=-0.8
        + 0.25 * names.index(shape) / max(1, len(names) - 1)
        + 0.3 * (shape in ("rectangle", "rhombus", "trapezoid")),
        figure=fig,
    )


POLY_NAMES = {
    3: "משולש",
    4: "מרובע",
    5: "מחומש",
    6: "משושה",
    7: "משובע",
    8: "מתומן",
    10: "מעושר",
    12: "מתריסר",
}


@generator("geometry.polygon_count")
def polygon_count(rng: random.Random, params: P, ctx: GenContext) -> Question:
    what = params.get("what", "mixed")
    if what == "mixed":
        what = rng.choice(("sides", "vertices", "name"))
    n = rng.choice([k for k in POLY_NAMES if k <= int(params.get("max", 8))])
    fig = Figure("polygon", {"points": regular(n), "name": POLY_NAMES[n]})
    if what == "name":
        dis = [
            Opt(
                POLY_NAMES[k],
                tag="shape_confusion" if abs(k - n) == 1 else None,
            )
            for k in POLY_NAMES
            if k != n and k <= 8
        ]
        return options_question(
            rng,
            ctx,
            item_id=f"geometry.polygon_count:name{n}",
            prompt_he=f"איך קוראים למצולע עם {n} צלעות?",
            prompt_en=f"What is a polygon with {n} sides called?",
            correct=Opt(POLY_NAMES[n]),
            distractors=dis,
            explanation_he=(
                f"מצולע עם {n} צלעות ו־{n} קודקודים נקרא {POLY_NAMES[n]}."
            ),
            difficulty=-0.2 + 0.1 * n,
            figure=fig,
        )
    word = "צלעות" if what == "sides" else "קודקודים"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.polygon_count:{what}{n}",
        prompt_he=f"כמה {word} יש למצולע?",
        prompt_en=f"How many {'sides' if what == 'sides' else 'vertices'}?",
        answer=n,
        distractors=[
            (n + 1, "off_by_one"),
            (n - 1, "off_by_one"),
            (2 * n, "vertices_sides_confusion"),
        ],
        explanation_he=(
            f"סופרים מסביב ומסמנים מאיפה התחלנו: {n} {word}. "
            f"במצולע מספר הצלעות שווה למספר הקודקודים."
        ),
        difficulty=-0.8 + 0.15 * n,
        figure=fig,
        calc=f"{n}",
    )


@generator("geometry.triangle_classify")
def triangle_classify(
    rng: random.Random, params: P, ctx: GenContext
) -> Question:
    by = params.get("by", "mixed")
    if by == "mixed":
        by = rng.choice(("sides", "angles"))
    if by == "sides":
        kind = rng.choice(("equi", "iso", "scalene"))
        if kind == "equi":
            a = rng.randint(3, 9)
            sides = (a, a, a)
        elif kind == "iso":
            a = rng.randint(3, 9)
            b = rng.randint(2, 2 * a - 1)
            while b == a:
                b = rng.randint(2, 2 * a - 1)
            sides = (a, a, b)
        else:
            while True:
                s = sorted(rng.sample(range(3, 13), 3))
                if s[0] + s[1] > s[2]:
                    break
            sides = tuple(s)
        names = {
            "equi": "שווה צלעות",
            "iso": "שווה שוקיים",
            "scalene": "שונה צלעות",
        }
        why = {
            "equi": "כל שלוש הצלעות שוות",
            "iso": "שתי צלעות שוות זו לזו",
            "scalene": "כל הצלעות באורכים שונים",
        }[kind]
        pts = tri_points(sides[0], sides[1], sides[2])
        labels = {
            f"side_{i}": f"{s}"
            for i, s in enumerate((sides[2], sides[0], sides[1]))
        }
        fig = Figure("polygon", {"points": pts, "labels": labels})
        dis = [
            Opt(v, tag="triangle_type_confusion")
            for k, v in names.items()
            if k != kind
        ]
        listed = ", ".join(str(s) for s in sides)
        return options_question(
            rng,
            ctx,
            item_id=f"geometry.triangle_classify:sides{sides}",
            prompt_he=f'אורכי הצלעות של משולש: {listed} ס"מ. איזה משולש זה?',
            prompt_en=f"A triangle has sides {listed}. Which type?",
            correct=Opt(names[kind]),
            distractors=dis,
            explanation_he=f"{why}, ולכן זה משולש {names[kind]}.",
            difficulty={"equi": -0.5, "iso": 0.0, "scalene": -0.2}[kind],
            figure=fig,
        )
    kind = rng.choice(("acute", "right", "obtuse"))
    if kind == "right":
        a = rng.randrange(20, 71, 5)
        angles = (90, a, 90 - a)
    elif kind == "obtuse":
        big = rng.randrange(100, 161, 5)
        a = rng.randrange(5, 180 - big - 4, 5)
        angles = (big, a, 180 - big - a)
    else:
        while True:
            a = rng.randrange(35, 86, 5)
            b = rng.randrange(35, 86, 5)
            c = 180 - a - b
            if 0 < c < 90:
                break
        angles = (a, b, c)
    angles = tuple(rng.sample(angles, 3))
    names = {"acute": "חד־זווית", "right": "ישר־זווית", "obtuse": "קהה־זווית"}
    mx = max(angles)
    why = {
        "acute": "כל הזוויות קטנות מ־90°",
        "right": "יש זווית של 90°",
        "obtuse": f"יש זווית גדולה מ־90° ({mx}°)",
    }[kind]
    pts = tri_from_angles(angles[0], angles[1])
    fig = Figure(
        "polygon",
        {
            "points": pts,
            "labels": {f"angle_{i}": f"{v}°" for i, v in enumerate(angles)},
        },
    )
    listed = ", ".join(f"{v}°" for v in angles)
    return options_question(
        rng,
        ctx,
        item_id=f"geometry.triangle_classify:angles{angles}",
        prompt_he=f"הזוויות של משולש: {listed}. איזה משולש זה?",
        prompt_en=f"A triangle has angles {listed}. Which type?",
        correct=Opt(names[kind]),
        distractors=[
            Opt(v, tag="triangle_type_confusion")
            for k, v in names.items()
            if k != kind
        ],
        explanation_he=f"{why}, ולכן זה משולש {names[kind]}.",
        difficulty={"acute": 0.2, "right": -0.4, "obtuse": 0.0}[kind],
        figure=fig,
    )


QUADS = {
    "square": ("ריבוע", "4 צלעות שוות ו־4 זוויות ישרות"),
    "rectangle": ("מלבן", "4 זוויות ישרות, וצלעות נגדיות שוות (לא כולן)"),
    "rhombus": ("מעוין", "4 צלעות שוות, בלי זוויות ישרות"),
    "parallelogram": (
        "מקבילית",
        "2 זוגות צלעות מקבילות, בלי זוויות ישרות, והצלעות לא כולן שוות",
    ),
    "trapezoid": ("טרפז", "רק זוג אחד של צלעות מקבילות"),
    "kite": ("דלתון", "2 זוגות של צלעות סמוכות שוות"),
}
QUAD_PTS = {
    "square": [[0, 0], [3, 0], [3, 3], [0, 3]],
    "rectangle": [[0, 0], [5, 0], [5, 3], [0, 3]],
    "rhombus": [[0, 0], [3, 2], [6, 0], [3, -2]],
    "parallelogram": [[0, 0], [5, 0], [6.5, 2.5], [1.5, 2.5]],
    "trapezoid": [[0, 0], [6, 0], [4.5, 3], [1.5, 3]],
    "kite": [[0, 0], [2, 2], [0, 5], [-2, 2]],
}
QUAD_HIER = {
    ("square", "rectangle"),
    ("square", "rhombus"),
    ("rectangle", "parallelogram"),
    ("rhombus", "parallelogram"),
    ("square", "parallelogram"),
    ("rhombus", "kite"),
}


@generator("geometry.quad_classify")
def quad_classify(rng: random.Random, params: P, ctx: GenContext) -> Question:
    kind = rng.choice(list(QUADS))
    name, props = QUADS[kind]
    dis = [
        Opt(
            v[0],
            tag="quad_hierarchy"
            if (kind, k) in QUAD_HIER or (k, kind) in QUAD_HIER
            else None,
        )
        for k, v in QUADS.items()
        if k != kind
    ]
    return options_question(
        rng,
        ctx,
        item_id=f"geometry.quad_classify:{kind}",
        prompt_he=f"למרובע יש {props}. מה הוא?",
        prompt_en="Which quadrilateral is it?",
        correct=Opt(name),
        distractors=dis,
        explanation_he=f"{name}: {props}.",
        difficulty={
            "square": -0.6,
            "rectangle": -0.4,
            "rhombus": 0.2,
            "parallelogram": 0.5,
            "trapezoid": 0.2,
            "kite": 0.4,
        }[kind],
        figure=Figure("polygon", {"points": QUAD_PTS[kind], "name": kind}),
    )


ANGLE_NAMES = {
    "acute": "חדה",
    "right": "ישרה",
    "obtuse": "קהה",
    "straight": "שטוחה",
}


@generator("geometry.angle_type")
def angle_type(rng: random.Random, params: P, ctx: GenContext) -> Question:
    straight = bool(params.get("include_straight", False))
    kinds = ["acute", "right", "obtuse"] + (["straight"] if straight else [])
    kind = rng.choice(kinds)
    deg = {
        "acute": rng.randrange(15, 81, 5),
        "right": 90,
        "obtuse": rng.randrange(100, 171, 5),
        "straight": 180,
    }[kind]
    rot = rng.randrange(0, 360, 30)
    why = {
        "acute": "קטנה מזווית ישרה (פחות מ־90°)",
        "right": "בדיוק כמו פינה של דף: 90°",
        "obtuse": "גדולה מזווית ישרה וקטנה מקו ישר (בין 90° ל־180°)",
        "straight": "שתי הקרניים יוצרות קו ישר: 180°",
    }[kind]
    return options_question(
        rng,
        ctx,
        item_id=f"geometry.angle_type:{deg}@{rot}",
        prompt_he="איזו זווית זו?",
        prompt_en="What kind of angle is this?",
        correct=Opt(ANGLE_NAMES[kind]),
        distractors=[
            Opt(
                ANGLE_NAMES[k],
                tag="angle_type_confusion" if abs(deg - 90) <= 20 else None,
            )
            for k in kinds
            if k != kind
        ],
        explanation_he=f"הזווית {ANGLE_NAMES[kind]}: היא {why}.",
        difficulty=-0.5 + 0.6 * (abs(deg - 90) <= 15 and kind != "right"),
        figure=Figure("angle", {"degrees": deg, "rotation": rot}),
    )


@generator("geometry.angle_pair")
def angle_pair(rng: random.Random, params: P, ctx: GenContext) -> Question:
    kinds = as_list(params.get("kind"), ["right", "supplementary", "vertical"])
    kind = rng.choice(kinds)
    if kind == "right":
        a = rng.randrange(10, 81, 5)
        ans = 90 - a
        prompt = (
            f"זווית ישרה מחולקת לשתי זוויות. אחת מהן {a}°. מה גודל השנייה?"
        )
        expl = f"זווית ישרה היא 90°: {ltr(f'90 - {a} = {ans}')}°."
        dis = [(180 - a, "used_180_not_90")]
    elif kind == "supplementary":
        a = rng.randrange(20, 161, 5)
        ans = 180 - a
        prompt = f"שתי זוויות צמודות. אחת מהן {a}°. מה גודל השנייה?"
        expl = (
            f"סכום זוויות צמודות הוא 180° (קו ישר): "
            f"{ltr(f'180 - {a} = {ans}')}°."
        )
        dis = [
            (90 - a if a < 90 else None, "used_90_not_180"),
            (360 - a, "used_360"),
        ]
    else:
        a = rng.randrange(20, 161, 5)
        ans = a
        prompt = (
            f"שני ישרים נחתכים. אחת הזוויות {a}°. מה גודל הזווית הקודקודית לה?"
        )
        expl = f"זוויות קודקודיות שוות זו לזו, ולכן גם היא {a}°."
        dis = [(180 - a, "vertical_as_supplementary")]
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.angle_pair:{kind}{a}",
        prompt_he=prompt,
        answer=ans,
        distractors=[*dis, (ans + 10, None), (ans - 10, None)],
        explanation_he=expl,
        difficulty={"right": -0.3, "supplementary": 0.0, "vertical": 0.2}[
            kind
        ],
        figure=Figure("angle", {"degrees": a, "pair": kind}),
        unit="°",
        step=5,
        calc=f"{ans}"
        if kind == "vertical"
        else (f"90 - {a}" if kind == "right" else f"180 - {a}"),
    )


@generator("geometry.triangle_sum")
def triangle_sum(rng: random.Random, params: P, ctx: GenContext) -> Question:
    a = rng.randrange(20, 121, 5)
    b = rng.randrange(15, 160 - a, 5)
    c = 180 - a - b
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.triangle_sum:{a},{b}",
        prompt_he=f"שתי זוויות במשולש הן {a}° ו־{b}°. מה גודל הזווית השלישית?",
        prompt_en=f"Two angles of a triangle are {a}° and {b}°. The third?",
        answer=c,
        distractors=[
            (360 - a - b, "used_360"),
            (90 - a - b if a + b < 90 else None, "used_90_not_180"),
            (a + b, None),
            (c + 10, None),
        ],
        explanation_he=(
            f"סכום הזוויות במשולש הוא 180°: {ltr(f'180 - {a} - {b} = {c}')}°."
        ),
        difficulty=-0.2 + 0.2 * (a % 10 != 0 or b % 10 != 0),
        figure=Figure(
            "polygon",
            {
                "points": tri_from_angles(a, b),
                "labels": {
                    "angle_0": f"{a}°",
                    "angle_1": f"{b}°",
                    "angle_2": "?",
                },
            },
        ),
        unit="°",
        step=5,
        calc=f"180 - {a} - {b}",
    )


@generator("geometry.polygon_angle_sum")
def polygon_angle_sum(
    rng: random.Random, params: P, ctx: GenContext
) -> Question:
    mode = rng.choice(("sum", "each"))
    if mode == "sum":
        n = rng.randint(4, 12)
        ans = (n - 2) * 180
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=f"geometry.polygon_angle_sum:sum{n}",
            prompt_he=f"מה סכום הזוויות הפנימיות במצולע עם {n} צלעות?",
            prompt_en=f"Sum of interior angles of a {n}-gon?",
            answer=ans,
            distractors=[
                (n * 180, "polygon_n_times_180"),
                (360, None),
                ((n - 1) * 180, "off_by_one"),
            ],
            explanation_he=(
                f"מחלקים את המצולע ל־{n - 2} משולשים מקודקוד אחד: "
                f"{ltr(f'({n} - 2) × 180 = {ans}')}°."
            ),
            difficulty=0.0 + 0.05 * n,
            figure=Figure("polygon", {"points": regular(n)}),
            unit="°",
            step=180,
            calc=f"({n} - 2) * 180",
        )
    n = rng.choice((3, 4, 5, 6, 8, 9, 10, 12))
    ans = (n - 2) * 180 // n
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.polygon_angle_sum:each{n}",
        prompt_he=f"מה גודל כל זווית פנימית במצולע משוכלל עם {n} צלעות?",
        prompt_en=f"Each interior angle of a regular {n}-gon?",
        answer=ans,
        distractors=[
            (
                180 // n * 2 if 360 % n == 0 else None,
                "polygon_exterior_interior",
            ),
            (180 * n // n, None),
            (ans + 10, None),
        ],
        explanation_he=(
            f"הסכום: {ltr(f'({n} - 2) × 180 = {(n - 2) * 180}')}°. "
            f"מחלקים ל־{n} זוויות שוות: "
            f"{ltr(f'{(n - 2) * 180} : {n} = {ans}')}°."
        ),
        difficulty=0.4,
        figure=Figure("polygon", {"points": regular(n)}),
        unit="°",
        step=5,
        calc=f"({n} - 2) * 180 // {n}",
    )


def polyomino(rng: random.Random, mx: int) -> tuple[list[list[int]], int, int]:
    w, h = rng.randint(2, mx), rng.randint(2, max(2, mx - 2))
    cells = {(x, y) for x in range(w) for y in range(h)}
    if rng.random() < 0.5 and w > 2 and h > 2:
        cw, ch = rng.randint(1, w - 1), rng.randint(1, h - 1)
        corner = rng.choice(
            ((0, 0), (w - cw, 0), (0, h - ch), (w - cw, h - ch))
        )
        for x in range(corner[0], corner[0] + cw):
            for y in range(corner[1], corner[1] + ch):
                cells.discard((x, y))
    return sorted([list(c) for c in cells]), w, h


def perimeter_of(cells: list[list[int]]) -> int:
    s = {tuple(c) for c in cells}
    per = 0
    for x, y in s:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if (x + dx, y + dy) not in s:
                per += 1
    return per


@generator("geometry.grid_area")
def grid_area(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mx = int(params.get("max", 6))
    cells, w, h = polyomino(rng, mx)
    area = len(cells)
    per = perimeter_of(cells)
    full = w * h
    if area == full:
        expl = (
            f"זה מלבן של {w} על {h} משבצות: "
            f"{ltr(f'{w} × {h} = {area}')} משבצות."
        )
    else:
        expl = (
            f"משלימים למלבן {ltr(f'{w} × {h} = {full}')} ומורידים את "
            f"החסר ({full - area}): {ltr(f'{full} - {full - area} = {area}')}"
            " משבצות."
        )
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.grid_area:{w}x{h}:{area}:{hash(tuple(map(tuple, cells))) % 9973}",
        prompt_he="מה השטח של הצורה? (כל משבצת = יחידת שטח אחת)",
        prompt_en="What is the area in squares?",
        answer=area,
        distractors=[
            (per if per != area else None, "area_perimeter_confusion"),
            (full if full != area else None, None),
            (area + 1, "off_by_one"),
            (w + h, None),
        ],
        explanation_he=expl,
        difficulty=-0.5 + 0.5 * (area != full) + 0.4 * area / (mx * mx),
        figure=Figure(
            "grid_area",
            {
                "width": w + 2,
                "height": h + 2,
                "cells": [[x + 1, y + 1] for x, y in cells],
            },
        ),
        calc=f"{area}",
    )


@generator("geometry.grid_perimeter")
def grid_perimeter(rng: random.Random, params: P, ctx: GenContext) -> Question:
    mx = int(params.get("max", 6))
    cells, w, h = polyomino(rng, mx)
    area = len(cells)
    per = perimeter_of(cells)
    if area == w * h:
        expl = (
            f"מלבן {w} על {h}: מחברים את כל הצלעות: "
            f"{ltr(f'{w} + {h} + {w} + {h} = {per}')} יחידות."
        )
    else:
        expl = (
            f"סופרים את צלעות המשבצות שעל הגבול, מסביב לצורה. "
            f"כאן הגבול זהה למלבן {w} על {h}: "
            f"{ltr(f'2 × ({w} + {h}) = {per}')} יחידות."
        )
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.grid_perimeter:{w}x{h}:{area}:{hash(tuple(map(tuple, cells))) % 9973}",
        prompt_he="מה ההיקף של הצורה? (צלע של משבצת = יחידה אחת)",
        prompt_en="What is the perimeter in units?",
        answer=per,
        distractors=[
            (area if area != per else None, "area_perimeter_confusion"),
            (w + h, "half_perimeter"),
            (per - 2, None),
        ],
        explanation_he=expl,
        difficulty=-0.3 + 0.3 * (area != w * h) + 0.3 * per / (4 * mx),
        figure=Figure(
            "grid_area",
            {
                "width": w + 2,
                "height": h + 2,
                "cells": [[x + 1, y + 1] for x, y in cells],
            },
        ),
        calc=f"{per}",
    )


@generator("geometry.perimeter")
def perimeter(rng: random.Random, params: P, ctx: GenContext) -> Question:
    shapes = as_list(
        params.get("shape"),
        ["rectangle", "square", "triangle", "regular", "missing_side"],
    )
    shape = rng.choice(shapes)
    fig = None
    if shape == "rectangle":
        a, b = rng.randint(2, 20), rng.randint(2, 20)
        while a == b:
            b = rng.randint(2, 20)
        ans = 2 * (a + b)
        prompt = f'מלבן שאורכו {a} ס"מ ורוחבו {b} ס"מ. מה ההיקף שלו?'
        expl = f'היקף = סכום כל הצלעות: {ltr(f"{a} + {b} + {a} + {b} = {ans}")} ס"מ.'
        dis = [(a + b, "half_perimeter"), (a * b, "area_perimeter_confusion")]
        fig = Figure(
            "polygon",
            {
                "points": [[0, 0], [a, 0], [a, b], [0, b]],
                "labels": {"side_0": str(a), "side_1": str(b)},
            },
        )
        key = f"rect{a}x{b}"
        calc = f"2 * ({a} + {b})"
    elif shape == "square":
        a = rng.randint(2, 25)
        ans = 4 * a
        prompt = f'ריבוע שאורך צלעו {a} ס"מ. מה ההיקף שלו?'
        expl = f'לריבוע 4 צלעות שוות: {ltr(f"4 × {a} = {ans}")} ס"מ.'
        dis = [(2 * a, "half_perimeter"), (a * a, "area_perimeter_confusion")]
        key, calc = f"sq{a}", f"4 * {a}"
    elif shape == "triangle":
        while True:
            s = sorted(rng.sample(range(3, 20), 3))
            if s[0] + s[1] > s[2]:
                break
        ans = sum(s)
        listed = ", ".join(map(str, s))
        prompt = f'אורכי הצלעות של משולש: {listed} ס"מ. מה ההיקף שלו?'
        expl = f'מחברים את שלוש הצלעות: {ltr(" + ".join(map(str, s)) + f" = {ans}")} ס"מ.'
        dis = [(s[0] + s[1], None), (ans + 1, None)]
        key, calc = f"tri{s}", " + ".join(map(str, s))
    elif shape == "regular":
        n = rng.choice((5, 6, 8))
        a = rng.randint(2, 15)
        ans = n * a
        prompt = f'ל{ ({5: "מחומש", 6: "משושה", 8: "מתומן"}[n]) } משוכלל צלע של {a} ס"מ. מה ההיקף שלו?'
        expl = f'יש {n} צלעות שוות: {ltr(f"{n} × {a} = {ans}")} ס"מ.'
        dis = [(4 * a, "shape_confusion"), ((n - 1) * a, "off_by_one")]
        key, calc = f"reg{n}x{a}", f"{n} * {a}"
    else:
        a, b = rng.randint(2, 20), rng.randint(2, 20)
        per = 2 * (a + b)
        ans = b
        prompt = f'היקף מלבן הוא {per} ס"מ ואורכו {a} ס"מ. מה הרוחב שלו?'
        expl = (
            f"חצי היקף = אורך + רוחב: {ltr(f'{per} : 2 = {a + b}')}. "
            f'הרוחב: {ltr(f"{a + b} - {a} = {b}")} ס"מ.'
        )
        dis = [
            (per - a, "half_perimeter"),
            (per - 2 * a, "half_perimeter"),
            (
                Fraction(per, a) if per % a == 0 else None,
                "area_perimeter_confusion",
            ),
        ]
        key, calc = f"miss{per}-{a}", f"{per} // 2 - {a}"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.perimeter:{key}",
        prompt_he=prompt,
        answer=ans,
        distractors=[*dis, (ans + 2, None)],
        explanation_he=expl,
        difficulty={
            "rectangle": -0.2,
            "square": -0.4,
            "triangle": -0.3,
            "regular": 0.0,
            "missing_side": 0.6,
        }[shape],
        figure=fig,
        unit=CM,
        calc=calc,
    )


@generator("geometry.area")
def area(rng: random.Random, params: P, ctx: GenContext) -> Question:
    shapes = as_list(params.get("shape"), ["rectangle"])
    shape = rng.choice(shapes)
    style = "auto"
    if shape == "rectangle":
        a, b = rng.randint(2, 15), rng.randint(2, 15)
        while a == b:
            b = rng.randint(2, 15)
        ans = a * b
        prompt = f'מלבן שאורכו {a} ס"מ ורוחבו {b} ס"מ. מה השטח שלו?'
        expl = f'שטח מלבן = אורך × רוחב: {ltr(f"{a} × {b} = {ans}")} סמ"ר.'
        dis = [(2 * (a + b), "area_perimeter_confusion"), (a + b, None)]
        fig = Figure(
            "polygon",
            {
                "points": [[0, 0], [a, 0], [a, b], [0, b]],
                "labels": {"side_0": str(a), "side_1": str(b)},
            },
        )
        key, calc = f"rect{a}x{b}", f"{a} * {b}"
    elif shape == "square":
        a = rng.randint(2, 15)
        ans = a * a
        prompt = f'ריבוע שאורך צלעו {a} ס"מ. מה השטח שלו?'
        expl = f'שטח ריבוע = צלע × צלע: {ltr(f"{a} × {a} = {ans}")} סמ"ר.'
        dis = [(4 * a, "area_perimeter_confusion"), (2 * a, None)]
        fig = Figure("polygon", {"points": [[0, 0], [a, 0], [a, a], [0, a]]})
        key, calc = f"sq{a}", f"{a} * {a}"
    elif shape == "triangle":
        base, h = rng.randint(2, 16), rng.randint(2, 14)
        if base * h % 2:
            base += 1
        ans = base * h // 2
        prompt = f'משולש שבסיסו {base} ס"מ והגובה אליו {h} ס"מ. מה השטח שלו?'
        expl = (
            f"שטח משולש = בסיס × גובה : 2. "
            f'{ltr(f"{base} × {h} : 2 = {base * h} : 2 = {ans}")} סמ"ר.'
        )
        dis = [(base * h, "triangle_area_no_half"), (base + h, None)]
        apex = rng.randint(0, base)
        fig = Figure(
            "polygon",
            {
                "points": [[0, 0], [base, 0], [apex, h]],
                "height": [[apex, 0], [apex, h]],
                "labels": {"side_0": str(base), "height": str(h)},
            },
        )
        key, calc = f"tri{base}x{h}", f"{base} * {h} // 2"
    elif shape == "parallelogram":
        base, h = rng.randint(3, 15), rng.randint(2, 10)
        side = h + rng.randint(1, 4)
        ans = base * h
        prompt = (
            f'מקבילית: בסיס {base} ס"מ, צלע משופעת {side} ס"מ, '
            f'וגובה {h} ס"מ. מה השטח?'
        )
        expl = (
            f"שטח מקבילית = בסיס × גובה (לא הצלע המשופעת): "
            f'{ltr(f"{base} × {h} = {ans}")} סמ"ר.'
        )
        dis = [
            (base * side, "slanted_side_as_height"),
            (
                base * h // 2 if base * h % 2 == 0 else None,
                "triangle_area_no_half",
            ),
            (2 * (base + side), "area_perimeter_confusion"),
        ]
        shift = round(math.sqrt(side * side - h * h), 2)
        fig = Figure(
            "polygon",
            {
                "points": [[0, 0], [base, 0], [base + shift, h], [shift, h]],
                "labels": {
                    "side_0": str(base),
                    "side_1": str(side),
                    "height": str(h),
                },
            },
        )
        key, calc = f"par{base}x{h}s{side}", f"{base} * {h}"
    elif shape == "trapezoid":
        a, b, h = rng.randint(2, 12), rng.randint(2, 12), rng.randint(2, 10)
        while a == b:
            b = rng.randint(2, 12)
        if (a + b) * h % 2:
            h += 1
        ans = (a + b) * h // 2
        prompt = (
            f'טרפז: הבסיסים {a} ס"מ ו־{b} ס"מ, והגובה {h} ס"מ. מה השטח שלו?'
        )
        expl = (
            f"שטח טרפז = (בסיס + בסיס) × גובה : 2. "
            f'{ltr(f"({a} + {b}) × {h} : 2 = {ans}")} סמ"ר.'
        )
        dis = [
            ((a + b) * h, "triangle_area_no_half"),
            (a * b * h // 2 if a * b * h % 2 == 0 else None, None),
        ]
        fig = Figure(
            "polygon",
            {
                "points": [
                    [0, 0],
                    [max(a, b), 0],
                    [max(a, b) - (max(a, b) - min(a, b)) / 2, h],
                    [(max(a, b) - min(a, b)) / 2, h],
                ],
                "labels": {
                    "side_0": str(max(a, b)),
                    "side_2": str(min(a, b)),
                    "height": str(h),
                },
            },
        )
        key, calc = f"trap{a},{b}x{h}", f"({a} + {b}) * {h} // 2"
    else:  # circle
        r = rng.randint(1, 10)
        given_d = rng.random() < 0.4
        ans = PI * r * r
        style = "decimal"
        if given_d:
            prompt = f'קוטר העיגול {2 * r} ס"מ. מה השטח שלו? (π = 3.14)'
            expl = (
                f"הרדיוס הוא חצי מהקוטר: {r}. שטח = π × r × r = "
                f'{ltr(f"3.14 × {r} × {r} = {fmt(ans)}")} סמ"ר.'
            )
        else:
            prompt = f'רדיוס העיגול {r} ס"מ. מה השטח שלו? (π = 3.14)'
            expl = (
                f"שטח עיגול = π × r × r = "
                f'{ltr(f"3.14 × {r} × {r} = {fmt(ans)}")} סמ"ר.'
            )
        dis = [
            (PI * 2 * r, "circle_area_circumference"),
            (PI * 4 * r * r if given_d else None, "circle_radius_diameter"),
            (PI * r * 2 * 2 if not given_d else None, None),
            (Fraction(ans) + 1, None),
        ]
        fig = Figure(
            "circle",
            {
                "r": r,
                "show": "diameter" if given_d else "radius",
                "label": str(2 * r if given_d else r),
            },
        )
        key = f"circ{'d' if given_d else 'r'}{r}"
        calc = f"F(314, 100) * {r} * {r}"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.area:{key}",
        prompt_he=prompt,
        answer=ans,
        distractors=dis,
        explanation_he=expl,
        difficulty={
            "rectangle": -0.3,
            "square": -0.5,
            "triangle": 0.2,
            "parallelogram": 0.3,
            "trapezoid": 0.5,
            "circle": 0.6,
        }[shape]
        + 0.3 * scale(float(ans), 4, 200),
        figure=fig,
        style=style,
        unit=CM2,
        calc=calc,
    )


@generator("geometry.circumference")
def circumference(rng: random.Random, params: P, ctx: GenContext) -> Question:
    r = rng.randint(1, 15)
    given_d = rng.random() < 0.5
    ans = 2 * PI * r
    if given_d:
        prompt = f'קוטר מעגל {2 * r} ס"מ. מה ההיקף שלו? (π = 3.14)'
        expl = (
            f'היקף מעגל = π × קוטר: {ltr(f"3.14 × {2 * r} = {fmt(ans)}")} ס"מ.'
        )
    else:
        prompt = f'רדיוס מעגל {r} ס"מ. מה ההיקף שלו? (π = 3.14)'
        expl = (
            f"היקף מעגל = 2 × π × רדיוס: "
            f'{ltr(f"2 × 3.14 × {r} = {fmt(ans)}")} ס"מ.'
        )
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.circumference:{'d' if given_d else 'r'}{r}",
        prompt_he=prompt,
        answer=ans,
        distractors=[
            (PI * r * r, "circle_area_circumference"),
            (PI * r if not given_d else PI * 4 * r, "circle_radius_diameter"),
            (ans + 1, None),
        ],
        explanation_he=expl,
        difficulty=0.2 + 0.3 * given_d,
        figure=Figure(
            "circle", {"r": r, "show": "diameter" if given_d else "radius"}
        ),
        style="decimal",
        unit=CM,
        calc=f"2 * F(314, 100) * {r}",
    )


@generator("geometry.volume")
def volume(rng: random.Random, params: P, ctx: GenContext) -> Question:
    shapes = as_list(params.get("shape"), ["box", "cube"])
    shape = rng.choice(shapes)
    if shape == "cube":
        a = rng.randint(2, 10)
        dims = (a, a, a)
        prompt = f'מה הנפח של קובייה שאורך צלעה {a} ס"מ?'
    else:
        dims = (rng.randint(2, 12), rng.randint(2, 10), rng.randint(2, 8))
        prompt = (
            f'תיבה שמידותיה {dims[0]} ס"מ, {dims[1]} ס"מ ו־{dims[2]} '
            f'ס"מ. מה הנפח שלה?'
        )
    l_, w, h = dims
    ans = l_ * w * h
    surface = 2 * (l_ * w + l_ * h + w * h)
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.volume:{shape}{dims}",
        prompt_he=prompt,
        answer=ans,
        distractors=[
            (l_ + w + h, "volume_add_dims"),
            (surface, "volume_surface_confusion"),
            (l_ * w, "volume_base_only"),
        ],
        explanation_he=(
            f"נפח = אורך × רוחב × גובה: "
            f'{ltr(f"{l_} × {w} × {h} = {ans}")} סמ"ק.'
        ),
        difficulty=0.0 + 0.4 * scale(ans, 8, 960),
        figure=Figure("solid", {"name": shape, "dims": list(dims)}),
        unit=CM3,
        calc=f"{l_} * {w} * {h}",
    )


SYMMETRY = (
    ("ריבוע", "4", "square", "4"),
    ("מלבן", "2", "rectangle", "4"),
    ("משולש שווה צלעות", "3", "equilateral", "1"),
    ("משולש שווה שוקיים", "1", "isosceles", "3"),
    ("משולש שונה צלעות", "0", "scalene", "1"),
    ("עיגול", "אינסוף", "circle", "1"),
    ("מחומש משוכלל", "5", "pentagon", "0"),
    ("משושה משוכלל", "6", "hexagon", "3"),
    ("מעוין", "2", "rhombus", "4"),
    ("מקבילית", "0", "parallelogram", "2"),
    ("דלתון", "1", "kite", "2"),
    ("טרפז שווה שוקיים", "1", "isosceles_trapezoid", "2"),
)


@generator("geometry.symmetry")
def symmetry(rng: random.Random, params: P, ctx: GenContext) -> Question:
    name, ans, code, trap = rng.choice(SYMMETRY)
    pool = ["0", "1", "2", "3", "4", "5", "6", "אינסוף"]
    trap_tag = (
        "symmetry_diagonal"
        if code in ("rectangle", "rhombus", "parallelogram")
        else "symmetry_count"
    )
    dis = [Opt(trap, tag=trap_tag)] if trap != ans else []
    dis += [Opt(x) for x in pool if x not in (ans, trap)]
    why = {
        "square": "2 אלכסונים ו־2 קווים דרך אמצעי הצלעות",
        "rectangle": "רק 2 קווים דרך אמצעי הצלעות. האלכסונים לא צירי סימטריה",
        "equilateral": "קו מכל קודקוד לאמצע הצלע שמולו",
        "isosceles": "רק הקו מקודקוד הראש לאמצע הבסיס",
        "scalene": "אין קו שמחלק אותו לשני חצאים זהים",
        "circle": "כל קו שעובר דרך המרכז",
        "pentagon": "קו מכל קודקוד לאמצע הצלע שמולו",
        "hexagon": "3 קווים בין קודקודים נגדיים ו־3 בין אמצעי צלעות",
        "rhombus": "2 האלכסונים",
        "parallelogram": "אם מקפלים אותה, החצאים לא מתלכדים",
        "kite": "רק האלכסון שעובר בין הצלעות השוות",
        "isosceles_trapezoid": "רק הקו דרך אמצעי שני הבסיסים",
    }[code]
    return options_question(
        rng,
        ctx,
        item_id=f"geometry.symmetry:{code}",
        prompt_he=f"כמה צירי סימטריה יש ל{name}?",
        prompt_en="How many lines of symmetry?",
        correct=Opt(ans),
        distractors=dis,
        explanation_he=f"ל{name} {'אינסוף' if ans == 'אינסוף' else ans} צירי סימטריה: {why}.",
        difficulty={
            "square": 0.0,
            "rectangle": 0.4,
            "circle": 0.2,
            "parallelogram": 0.6,
            "rhombus": 0.3,
        }.get(code, 0.0),
        figure=Figure("symmetry", {"shape": code}),
    )


SOLIDS = {
    "cube": "קובייה",
    "box": "תיבה",
    "cylinder": "גליל",
    "cone": "חרוט",
    "sphere": "כדור",
    "pyramid": "פירמידה",
    "prism": "מנסרה משולשת",
}
SOLID_EXAMPLES = (
    ("פחית שתייה", "cylinder"),
    ("כדורגל", "sphere"),
    ("קופסת נעליים", "box"),
    ("גביע גלידה", "cone"),
    ("קוביית משחק", "cube"),
    ("תפוז", "sphere"),
    ("גליל נייר", "cylinder"),
    ("קרטון חלב", "box"),
    ("כובע ליצן", "cone"),
)


@generator("geometry.solid_identify")
def solid_identify(rng: random.Random, params: P, ctx: GenContext) -> Question:
    if rng.random() < 0.5:
        thing, solid = rng.choice(SOLID_EXAMPLES)
        prompt = f"לאיזה גוף דומה {thing}?"
        key = f"ex:{thing}"
        fig = None
    else:
        solid = rng.choice(list(SOLIDS))
        thing = None
        prompt = "איזה גוף זה?"
        key = f"fig:{solid}"
        fig = Figure("solid", {"name": solid})
    why = {
        "cube": "6 פאות ריבועיות שוות",
        "box": "6 פאות מלבניות",
        "cylinder": "שני בסיסים עגולים ומעטפת מעוגלת",
        "cone": "בסיס עגול אחד וקודקוד אחד",
        "sphere": "עגול לגמרי מכל הכיוונים, בלי פאות",
        "pyramid": "בסיס, ופאות משולשות שנפגשות בקודקוד",
        "prism": "שני בסיסים משולשים ושלוש פאות מלבניות",
    }[solid]
    lead = f"{thing} דומה ל{SOLIDS[solid]}" if thing else SOLIDS[solid]
    confusable = {
        ("cube", "box"),
        ("box", "cube"),
        ("cone", "pyramid"),
        ("pyramid", "cone"),
        ("cylinder", "prism"),
    }
    return options_question(
        rng,
        ctx,
        item_id=f"geometry.solid_identify:{key}",
        prompt_he=prompt,
        correct=Opt(SOLIDS[solid]),
        distractors=[
            Opt(v, tag="shape_confusion" if (solid, k) in confusable else None)
            for k, v in SOLIDS.items()
            if k != solid
        ],
        explanation_he=f"{lead}: {why}.",
        difficulty=-0.4 + 0.3 * (solid in ("prism", "pyramid", "cone")),
        figure=fig,
    )


POLY_PRISM = {3: "משולשת", 4: "מרובעת", 5: "מחומשת", 6: "משושה"}


def solid_counts(kind: str, n: int) -> tuple[int, int, int]:
    if kind == "prism":
        return n + 2, 3 * n, 2 * n
    return n + 1, 2 * n, n + 1


@generator("geometry.solid_count")
def solid_count(rng: random.Random, params: P, ctx: GenContext) -> Question:
    kind = rng.choice(("prism", "pyramid", "cube"))
    n = 4 if kind == "cube" else rng.choice(list(POLY_PRISM))
    base_kind = "prism" if kind != "pyramid" else "pyramid"
    f, e, v = solid_counts(base_kind, n)
    if kind == "cube":
        name = "קובייה"
    elif kind == "prism":
        name = f"מנסרה {POLY_PRISM[n]}"
    else:
        name = f"פירמידה {POLY_PRISM[n]}"
    what = rng.choice(("faces", "edges", "vertices"))
    word = {"faces": "פאות", "edges": "מקצועות", "vertices": "קודקודים"}[what]
    ans = {"faces": f, "edges": e, "vertices": v}[what]
    others = [x for x in (f, e, v) if x != ans]
    if base_kind == "prism":
        why = {
            "faces": f"2 בסיסים ועוד {n} פאות צדדיות: {f}",
            "edges": f"{n} בכל בסיס ועוד {n} לאורך: {ltr(f'3 × {n} = {e}')}",
            "vertices": f"{n} בכל בסיס: {ltr(f'2 × {n} = {v}')}",
        }[what]
    else:
        why = {
            "faces": f"בסיס אחד ועוד {n} פאות משולשות: {f}",
            "edges": f"{n} בבסיס ועוד {n} אל הקודקוד: {e}",
            "vertices": f"{n} בבסיס ועוד הקודקוד העליון: {v}",
        }[what]
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.solid_count:{kind}{n}:{what}",
        prompt_he=f"כמה {word} יש ל{name}?",
        prompt_en=f"How many {what} does it have?",
        answer=ans,
        distractors=[(o, "faces_edges_confusion") for o in others]
        + [(ans + 1, None)],
        explanation_he=f"ל{name}: {why}.",
        difficulty=-0.2 + 0.1 * n + 0.3 * (what == "edges"),
        figure=Figure(
            "solid", {"name": "cube" if kind == "cube" else f"{base_kind}_{n}"}
        ),
        calc=f"{ans}",
    )


@generator("geometry.euler")
def euler(rng: random.Random, params: P, ctx: GenContext) -> Question:
    kind = rng.choice(("prism", "pyramid"))
    n = rng.randint(3, 10)
    f, e, v = solid_counts(kind, n)
    find = rng.choice(("faces", "edges", "vertices"))
    if find == "edges":
        prompt = f"לגוף יש {f} פאות ו־{v} קודקודים. כמה מקצועות יש לו?"
        ans, py = e, f"{f} + {v} - 2"
        step = f"{f} + {v} - 2 = {e}"
        wrong = f + v
    elif find == "faces":
        prompt = f"לגוף יש {v} קודקודים ו־{e} מקצועות. כמה פאות יש לו?"
        ans, py = f, f"2 + {e} - {v}"
        step = f"2 + {e} - {v} = {f}"
        wrong = e - v
    else:
        prompt = f"לגוף יש {f} פאות ו־{e} מקצועות. כמה קודקודים יש לו?"
        ans, py = v, f"2 + {e} - {f}"
        step = f"2 + {e} - {f} = {v}"
        wrong = e - f
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.euler:{kind}{n}:{find}",
        prompt_he=prompt,
        answer=ans,
        distractors=[
            (wrong, "euler_forgot_2"),
            (ans + 2, "euler_forgot_2"),
            (ans + 1, None),
        ],
        explanation_he=(
            f"נוסחת אוילר: פאות + קודקודים \u2212 מקצועות = 2. {ltr(step)}."
        ),
        difficulty=0.3 + 0.03 * n,
        calc=py,
    )


@generator("geometry.coordinates")
def coordinates(rng: random.Random, params: P, ctx: GenContext) -> Question:
    kind = rng.choice(as_list(params.get("kind"), ["read"]))
    if kind == "read":
        x, y = rng.randint(0, 8), rng.randint(0, 8)
        while x == y:
            y = rng.randint(0, 8)
        rngmax = 8
        dis = [
            Opt(ltr(f"({y}, {x})"), tag="coordinate_swap"),
            Opt(ltr(f"({x + 1}, {y})")),
            Opt(ltr(f"({x}, {y + 1})")),
            Opt(ltr(f"({max(x - 1, 0)}, {y})")),
        ]
        return options_question(
            rng,
            ctx,
            item_id=f"geometry.coordinates:read({x},{y})",
            prompt_he="מה השיעורים של הנקודה A?",
            prompt_en="What are the coordinates of A?",
            correct=Opt(ltr(f"({x}, {y})")),
            distractors=dis,
            explanation_he=(
                f"קודם x (ימינה על הציר האופקי): {x}. אחר כך y "
                f"(למעלה): {y}. לכן A = {ltr(f'({x}, {y})')}."
            ),
            difficulty=-0.2,
            figure=Figure(
                "coordinate",
                {
                    "range": rngmax,
                    "quadrants": 1,
                    "points": [{"x": x, "y": y, "label": "A"}],
                },
            ),
        )
    if kind == "quadrant":
        x = nzr(rng)
        y = nzr(rng)
        q = {
            (True, True): 1,
            (False, True): 2,
            (False, False): 3,
            (True, False): 4,
        }[(x > 0, y > 0)]
        names = {
            1: "רביע ראשון",
            2: "רביע שני",
            3: "רביע שלישי",
            4: "רביע רביעי",
        }
        mirror = {1: 2, 2: 1, 3: 4, 4: 3}[q]
        sx = "חיובי" if x > 0 else "שלילי"
        sy = "חיובי" if y > 0 else "שלילי"
        return options_question(
            rng,
            ctx,
            item_id=f"geometry.coordinates:quad({x},{y})",
            prompt_he=f"באיזה רביע נמצאת הנקודה {ltr(f'({x}, {y})')}?",
            prompt_en=f"Which quadrant is ({x}, {y}) in?",
            correct=Opt(names[q]),
            distractors=[Opt(names[mirror], tag="quadrant_confusion")]
            + [Opt(names[k]) for k in names if k not in (q, mirror)],
            explanation_he=(
                f"x {sx} ו־y {sy}. הרביעים ממוספרים נגד כיוון "
                f"השעון, מהרביע הימני העליון. לכן {names[q]}."
            ),
            difficulty=0.1,
            figure=Figure(
                "coordinate",
                {
                    "range": 8,
                    "quadrants": 4,
                    "points": [{"x": x, "y": y, "label": "A"}],
                },
            ),
        )
    horiz = rng.random() < 0.5
    a, b = rng.randint(-8, 8), rng.randint(-8, 8)
    while a == b:
        b = rng.randint(-8, 8)
    c = rng.randint(-6, 6)
    p1, p2 = ((a, c), (b, c)) if horiz else ((c, a), (c, b))
    dist = abs(a - b)
    wrong = abs(abs(a) - abs(b))
    axis = "x" if horiz else "y"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.coordinates:dist{p1}{p2}",
        prompt_he=(
            f"מה המרחק בין הנקודות {ltr(f'({p1[0]}, {p1[1]})')} ו־"
            f"{ltr(f'({p2[0]}, {p2[1]})')}?"
        ),
        prompt_en=f"Distance between {p1} and {p2}?",
        answer=dist,
        distractors=[
            (wrong if wrong != dist else None, "negative_sign_error"),
            (dist + 1, "off_by_one"),
            (abs(a) + abs(b) + 1, None),
        ],
        explanation_he=(
            f"הנקודות על אותו קו, ושיעור ה־{axis} שונה. המרחק: "
            f"{ltr(f'|{max(a, b)} - ({min(a, b)})| = {dist}')}."
        ),
        difficulty=0.0 + 0.4 * (a * b < 0),
        figure=Figure(
            "coordinate",
            {
                "range": 8,
                "quadrants": 4,
                "points": [
                    {"x": p1[0], "y": p1[1], "label": "A"},
                    {"x": p2[0], "y": p2[1], "label": "B"},
                ],
            },
        ),
        calc=f"abs({a} - ({b}))",
    )


def nzr(rng: random.Random) -> int:
    v = 0
    while v == 0:
        v = rng.randint(-8, 8)
    return v


TRIPLES = (
    (3, 4, 5),
    (5, 12, 13),
    (8, 15, 17),
    (7, 24, 25),
    (20, 21, 29),
    (9, 40, 41),
)


@generator("geometry.pythagoras")
def pythagoras(rng: random.Random, params: P, ctx: GenContext) -> Question:
    find = rng.choice(as_list(params.get("find"), ["hyp"]))
    a, b, c = rng.choice(TRIPLES)
    k = rng.randint(1, 3) if (a, b, c) == (3, 4, 5) else 1
    a, b, c = a * k, b * k, c * k
    if rng.random() < 0.5:
        a, b = b, a
    fig = Figure(
        "polygon",
        {
            "points": [[0, 0], [a, 0], [0, b]],
            "right_angle": 0,
            "labels": {
                "side_0": str(a),
                "side_2": str(b) if find == "hyp" else "?",
                "side_1": "?" if find == "hyp" else str(c),
            },
        },
    )
    if find == "hyp":
        prompt = f"במשולש ישר־זווית הניצבים {a} ו־{b}. מה אורך היתר?"
        expl = (
            f"{ltr(f'{a}² + {b}² = {a * a} + {b * b} = {c * c}')}. "
            f"היתר: {ltr(f'√{c * c} = {c}')}."
        )
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=f"geometry.pythagoras:hyp{a},{b}",
            prompt_he=prompt,
            answer=c,
            distractors=[
                (a + b, "pythagoras_add_sides"),
                (c * c, "pythagoras_no_root"),
                (c + 1, None),
            ],
            explanation_he=expl,
            difficulty=0.0 + 0.2 * (c > 20),
            figure=fig,
            calc=f"sqrt({a}**2 + {b}**2)",
        )
    prompt = f"במשולש ישר־זווית היתר {c} וניצב אחד {a}. מה אורך הניצב השני?"
    expl = (
        f"{ltr(f'{c}² - {a}² = {c * c} - {a * a} = {b * b}')}. "
        f"הניצב: {ltr(f'√{b * b} = {b}')}."
    )
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.pythagoras:leg{c},{a}",
        prompt_he=prompt,
        answer=b,
        distractors=[
            (c - a, "pythagoras_add_sides"),
            (b * b, "pythagoras_no_root"),
            (b + 1, None),
        ],
        explanation_he=expl,
        difficulty=0.4 + 0.2 * (c > 20),
        figure=fig,
        calc=f"sqrt({c}**2 - {a}**2)",
    )


UNITS = {
    "length": (
        ("מטר", "מטרים", "סנטימטרים", 100),
        ('ס"מ', 'ס"מ', "מילימטרים", 10),
        ("קילומטר", "קילומטרים", "מטרים", 1000),
    ),
    "mass": (("קילוגרם", "קילוגרמים", "גרמים", 1000),),
    "volume": (("ליטר", "ליטרים", "מיליליטרים", 1000),),
    "time": (("שעה", "שעות", "דקות", 60), ("דקה", "דקות", "שניות", 60)),
}


@generator("geometry.units")
def units(rng: random.Random, params: P, ctx: GenContext) -> Question:
    kinds = as_list(params.get("kind"), ["length", "mass", "volume", "time"])
    kind = rng.choice(kinds)
    big_s, big_p, small, factor = rng.choice(UNITS[kind])
    allow_dec = bool(params.get("decimals", False))
    to_small = rng.random() < 0.6 or not allow_dec
    if to_small:
        n = rng.randint(2, 12)
        ans = n * factor
        prompt = f"{n} {big_p} = כמה {small}?"
        expl = f"ב{big_s} אחד יש {factor} {small}: {ltr(f'{n} × {factor} = {fmt(ans)}')}."
        wrong = [
            (
                n * (factor // 10 if factor in (100, 1000) else 100),
                "units_factor",
            ),
            (n * factor * 10 if factor != 60 else n * 100, "units_factor"),
            (n + factor, None),
        ]
        key = f"{n}{big_s}->{small}"
        calc = f"{n} * {factor}"
    else:
        ans = (
            Fraction(rng.randint(1, 9 * factor // 10), factor // 10) / 10 * 10
        )
        ans = Fraction(rng.randint(11, 99), 10)
        m = ans * factor
        prompt = f"{fmt(m)} {small} = כמה {big_p}?"
        expl = (
            f"מחלקים ב־{factor}: {ltr(f'{fmt(m)} : {factor} = {fmt(ans)}')}."
        )
        wrong = [
            (m / (factor // 10), "units_factor"),
            (m * factor, "units_factor"),
            (ans * 10, None),
        ]
        key = f"{m}{small}->{big_s}"
        calc = f"F({m.numerator}, {m.denominator}) / {factor}"
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.units:{key}",
        prompt_he=prompt,
        answer=ans,
        distractors=wrong,
        explanation_he=expl,
        difficulty=-0.3 + 0.5 * (not to_small) + 0.2 * (factor == 60),
        style="decimal",
        calc=calc,
    )


@generator("geometry.similarity")
def similarity(rng: random.Random, params: P, ctx: GenContext) -> Question:
    find = rng.choice(as_list(params.get("find"), ["side", "area"]))
    k = rng.randint(2, 5)
    if find == "side":
        s = rng.randint(2, 12)
        ans = s * k
        return numeric_question(
            rng,
            ctx,
            params,
            item_id=f"geometry.similarity:side{s}x{k}",
            prompt_he=(
                f"שני משולשים דומים ביחס דמיון {k}. צלע במשולש הקטן "
                f'{s} ס"מ. מה אורך הצלע המתאימה בגדול?'
            ),
            answer=ans,
            distractors=[
                (s + k, "similarity_add"),
                (s * k * k, None),
                (ans + 1, None),
            ],
            explanation_he=(
                f"במשולשים דומים כל הצלעות גדלות פי {k}: "
                f'{ltr(f"{s} × {k} = {ans}")} ס"מ.'
            ),
            difficulty=-0.2,
            unit=CM,
            calc=f"{s} * {k}",
        )
    a = rng.randint(2, 15)
    ans = a * k * k
    return numeric_question(
        rng,
        ctx,
        params,
        item_id=f"geometry.similarity:area{a}x{k}",
        prompt_he=(
            f'שני משולשים דומים ביחס דמיון {k}. שטח הקטן {a} סמ"ר. '
            f"מה שטח הגדול?"
        ),
        answer=ans,
        distractors=[
            (a * k, "area_ratio_linear"),
            (a + k, "similarity_add"),
            (ans + k, None),
        ],
        explanation_he=(
            f"יחס השטחים הוא ריבוע יחס הדמיון: "
            f"{ltr(f'{k}² = {k * k}')}. השטח: "
            f'{ltr(f"{a} × {k * k} = {ans}")} סמ"ר.'
        ),
        difficulty=0.5,
        unit=CM2,
        calc=f"{a} * {k} ** 2",
    )
