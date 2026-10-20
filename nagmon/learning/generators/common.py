"""Shared helpers for generators: context, formatting and builders.

Every generator has the signature ``(rng, params, ctx) -> Question`` and
is deterministic given ``rng``. A generator first decides the *item*
(its operands, hence its ``item_id``) and only then calls a builder,
which may consume more randomness to pick the answer kind and order the
choices. That keeps ``item_id`` stable whatever the context.
"""

from __future__ import annotations

import random
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from fractions import Fraction
from typing import Any

from nagmon.learning.model import (
    FALSE_ID,
    TRUE_ID,
    Choice,
    Figure,
    Question,
    format_number,
    true_false_choices,
)

Generator = Callable[
    [random.Random, Mapping[str, Any], "GenContext"], Question
]
GENERATORS: dict[str, Generator] = {}
CHOICE_IDS = "abcdef"

# Math expressions are wrapped in Unicode LTR isolates (U+2066 ... U+2069)
# so that "12 - 5" is not reordered inside a right-to-left paragraph.
# Renderers that cannot handle isolates may simply strip them.
LRI = "\u2066"
PDI = "\u2069"
BIDI_ISOLATE = True


def generator(name: str) -> Callable[[Generator], Generator]:
    def register(fn: Generator) -> Generator:
        GENERATORS[name] = fn
        fn.generator_name = name  # type: ignore[attr-defined]
        return fn

    return register


@dataclass(frozen=True)
class GenContext:
    skill_id: str = ""
    subject: str = "math"
    grade: int = 0
    age: int | None = None
    max_choices: int | None = None
    prefer_kind: str | None = None  # "choice" | "number" | None


@dataclass(frozen=True)
class Opt:
    """A choice before it gets an id. ``tag`` = misconception if chosen."""

    text_he: str
    text_en: str | None = None
    image: str | None = None
    tag: str | None = None


# --------------------------------------------------------------------------
# Formatting
# --------------------------------------------------------------------------


def ltr(text: str) -> str:
    return f"{LRI}{text}{PDI}" if BIDI_ISOLATE else text


def fmt(value: Fraction | int | float, style: str = "auto") -> str:
    """Display a number: thousands separators from 10,000, isolated minus.

    ``style``: auto | int | decimal | fraction | money (2 decimals).
    """
    v = Fraction(value)
    if style == "money" and v.denominator != 1:
        whole = abs(v.numerator) // v.denominator
        cents = round((abs(v) - whole) * 100)
        body = f"{whole}.{cents:02d}"
    else:
        body = format_number(
            abs(v), style="fraction" if style == "fraction" else "auto"
        )
        if "." not in body and "/" not in body and abs(v) >= 10000:
            body = f"{int(abs(v)):,}"
    if v < 0:
        return ltr(f"-{body}")
    return body


def money(value: Fraction | int) -> str:
    return f"{fmt(value, 'money')} ₪"


def key(value: Fraction | int, style: str = "auto") -> str:
    """Canonical answer text for a number question (keeps fraction form)."""
    return format_number(
        Fraction(value), style="fraction" if style == "fraction" else "auto"
    )


def choose_kind_choice(
    rng: random.Random, ctx: GenContext, params: Mapping[str, Any]
) -> bool:
    mode = params.get("kind", "auto")
    if mode == "choice":
        return True
    if mode == "number":
        return False
    if ctx.prefer_kind == "number":
        return False
    if ctx.prefer_kind == "choice" or ctx.max_choices:
        return True
    young = ctx.age <= 7 if ctx.age is not None else ctx.grade <= 1
    if young:
        return True
    return rng.random() < 0.6


def n_options(ctx: GenContext) -> int:
    young = ctx.age <= 6 if ctx.age is not None else ctx.grade == 0
    n = 3 if young else 4
    if ctx.max_choices:
        n = min(n, ctx.max_choices)
    return max(2, n)


def _base(
    ctx: GenContext,
    item_id: str,
    prompt_he: str,
    explanation_he: str,
    difficulty: float,
    prompt_en: str | None,
    explanation_en: str | None,
    figure: Figure | None,
    speak: Mapping[str, str] | None,
    meta: dict[str, Any],
) -> dict[str, Any]:
    return {
        "item_id": item_id,
        "skill_id": ctx.skill_id,
        "subject": ctx.subject,
        "prompt_he": prompt_he,
        "prompt_en": prompt_en,
        "explanation_he": explanation_he,
        "explanation_en": explanation_en,
        "difficulty": round(max(-3.0, min(3.0, difficulty)), 3),
        "figure": figure,
        "speak": dict(speak) if speak else {"he": prompt_he},
        "meta": meta,
    }


# --------------------------------------------------------------------------
# Builders
# --------------------------------------------------------------------------


def numeric_question(
    rng: random.Random,
    ctx: GenContext,
    params: Mapping[str, Any],
    *,
    item_id: str,
    prompt_he: str,
    answer: Fraction | int,
    distractors: Sequence[tuple[Any, str | None]] = (),
    explanation_he: str,
    difficulty: float,
    prompt_en: str | None = None,
    explanation_en: str | None = None,
    figure: Figure | None = None,
    style: str = "auto",
    unit: str = "",
    allow_negative: bool | None = None,
    speak: Mapping[str, str] | None = None,
    calc: str | Mapping[str, Any] | None = None,
    meta: Mapping[str, Any] | None = None,
    choice_only: bool = False,
    step: Fraction | int | None = None,
) -> Question:
    """A question whose answer is a number: open answer or choices.

    ``distractors`` are (value, misconception tag or None), most
    important first. Numeric choices are shown in ascending order.
    """
    ans = Fraction(answer)
    if allow_negative is None:
        allow_negative = ans < 0
    md: dict[str, Any] = dict(meta or {})
    if calc is not None:
        md["calc"] = {"expr": calc} if isinstance(calc, str) else dict(calc)
    as_choice = choice_only or choose_kind_choice(rng, ctx, params)
    seen = {ans}
    cands: list[tuple[Fraction, str | None]] = []
    for value, tag in distractors:
        if value is None:
            continue
        v = Fraction(value)
        if v in seen or (v < 0 and not allow_negative):
            continue
        if style in ("int",) and v.denominator != 1:
            continue
        if style == "money" and (v * 100).denominator != 1:
            continue
        seen.add(v)
        cands.append((v, tag))
    base = _base(
        ctx,
        item_id,
        prompt_he,
        explanation_he,
        difficulty,
        prompt_en,
        explanation_en,
        figure,
        speak,
        md,
    )
    if not as_choice:
        mis = {key(v, style): t for v, t in cands if t}
        return Question(
            kind="number", answer=key(ans, style), misconceptions=mis, **base
        )
    n = n_options(ctx)
    tagged = [c for c in cands if c[1]]
    plain = [c for c in cands if not c[1]]
    if len(tagged) > n - 1:
        tagged = rng.sample(tagged, n - 1)
    rng.shuffle(plain)
    picked = tagged + plain[: n - 1 - len(tagged)]
    if step is None:
        step = 1 if ans.denominator == 1 else Fraction(1, ans.denominator)
    step = Fraction(step)
    k = 1
    while len(picked) < n - 1 and k < 200:
        for v in (ans + k * step, ans - k * step):
            if len(picked) >= n - 1:
                break
            if v in seen or (v < 0 and not allow_negative):
                continue
            seen.add(v)
            picked.append((v, None))
        k += 1
    opts = sorted([(ans, None), *picked], key=lambda c: c[0])
    choices = []
    mis = {}
    answer_id = "a"
    for i, (v, tag) in enumerate(opts):
        cid = CHOICE_IDS[i]
        choices.append(Choice(cid, f"{fmt(v, style)}{unit}"))
        if v == ans:
            answer_id = cid
        elif tag:
            mis[cid] = tag
    return Question(
        kind="choice",
        answer=answer_id,
        choices=tuple(choices),
        misconceptions=mis,
        **base,
    )


def options_question(
    rng: random.Random,
    ctx: GenContext,
    *,
    item_id: str,
    prompt_he: str,
    correct: Opt,
    distractors: Sequence[Opt],
    explanation_he: str,
    difficulty: float,
    prompt_en: str | None = None,
    explanation_en: str | None = None,
    figure: Figure | None = None,
    speak: Mapping[str, str] | None = None,
    meta: Mapping[str, Any] | None = None,
    calc: str | None = None,
    n: int | None = None,
    shuffle: bool = True,
    answer_text: str | None = None,
) -> Question:
    """A choice question from text options (shapes, times, words...).

    ``answer_text``: if the context prefers open answers and the answer
    can be typed (a number or short word), pass it to allow kind=number.
    """
    md: dict[str, Any] = dict(meta or {})
    if calc is not None:
        md["calc"] = {"expr": calc}
    base = _base(
        ctx,
        item_id,
        prompt_he,
        explanation_he,
        difficulty,
        prompt_en,
        explanation_en,
        figure,
        speak,
        md,
    )
    limit = n if n is not None else n_options(ctx)
    if ctx.max_choices:
        limit = min(limit, ctx.max_choices)
    limit = max(2, limit)
    seen = {correct.text_he}
    uniq = []
    for d in distractors:
        if d.text_he in seen:
            continue
        seen.add(d.text_he)
        uniq.append(d)
    tagged = [d for d in uniq if d.tag]
    plain = [d for d in uniq if not d.tag]
    if len(tagged) > limit - 1:
        tagged = rng.sample(tagged, limit - 1)
    rest = rng.sample(plain, min(len(plain), limit - 1 - len(tagged)))
    opts = [correct, *tagged, *rest]
    if shuffle:
        rng.shuffle(opts)
    choices = []
    mis = {}
    answer_id = "a"
    for i, o in enumerate(opts):
        cid = CHOICE_IDS[i]
        choices.append(Choice(cid, o.text_he, o.text_en, o.image))
        if o is correct:
            answer_id = cid
        elif o.tag:
            mis[cid] = o.tag
    return Question(
        kind="choice",
        answer=answer_id,
        choices=tuple(choices),
        misconceptions=mis,
        **base,
    )


def true_false_question(
    ctx: GenContext,
    *,
    item_id: str,
    prompt_he: str,
    truth: bool,
    explanation_he: str,
    difficulty: float,
    wrong_tag: str | None = None,
    prompt_en: str | None = None,
    explanation_en: str | None = None,
    figure: Figure | None = None,
    meta: Mapping[str, Any] | None = None,
) -> Question:
    base = _base(
        ctx,
        item_id,
        prompt_he,
        explanation_he,
        difficulty,
        prompt_en,
        explanation_en,
        figure,
        None,
        dict(meta or {}),
    )
    answer = TRUE_ID if truth else FALSE_ID
    wrong = FALSE_ID if truth else TRUE_ID
    mis = {wrong: wrong_tag} if wrong_tag else {}
    return Question(
        kind="true_false",
        answer=answer,
        choices=true_false_choices(),
        misconceptions=mis,
        **base,
    )


# --------------------------------------------------------------------------
# Small utilities
# --------------------------------------------------------------------------


def scale(x: float, lo: float, hi: float) -> float:
    """Map ``x`` in [lo, hi] to [-1, 1]."""
    if hi <= lo:
        return 0.0
    return max(-1.0, min(1.0, 2.0 * (x - lo) / (hi - lo) - 1.0))


def as_list(value: Any, default: Sequence[Any]) -> list[Any]:
    if value is None:
        return list(default)
    if isinstance(value, (list, tuple)):
        return list(value)
    return [value]


def g(gender: str, male: str, female: str) -> str:
    """Pick a verb form by the subject's grammatical gender."""
    return female if gender == "f" else male


def emoji(code: str) -> str:
    return f"emoji:{code}"
