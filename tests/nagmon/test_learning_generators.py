"""G1-G4: every generator over many seeds produces valid questions."""

import math
import random
import re
from fractions import Fraction

import pytest

from nagmon.learning.generators.common import GenContext
from nagmon.learning.generators.misconceptions import MISCONCEPTIONS
from nagmon.learning.model import check_answer, parse_number

NIQQUD = re.compile("[֑-ׇ]")
FIGURE_KINDS = {
    "polygon", "angle", "grid_area", "circle", "solid", "number_line",
    "clock", "bar_model", "objects", "pie", "grid_path", "coordinate",
    "symmetry", "pattern", "grid_numbers",
}
KINDS = {"choice", "number", "true_false", "order", "tap_figure", "letters"}
SEEDS = range(200)
CONTEXTS = [
    {"age": 6},
    {"age": 10},
    {"age": 10, "max_choices": 3},
    {"age": 12, "prefer_kind": "number"},
]


def all_texts(q):
    yield q.prompt_he
    yield q.explanation_he
    for c in q.choices:
        yield c.text_he


def make(library, skill, seed, extra):
    ctx = GenContext(skill.id, skill.subject, grade=skill.grade, **extra)
    return library.generate(skill.id, random.Random(seed), ctx)


def validate(q):
    assert q.kind in KINDS
    assert q.item_id and ":" in q.item_id
    assert 0 < len(q.prompt_he) <= 140, q.prompt_he
    assert q.explanation_he.strip(), q.item_id
    assert len(q.explanation_he) <= 200, (len(q.explanation_he), q.explanation_he)
    assert math.isfinite(q.difficulty) and -3.5 <= q.difficulty <= 3.5
    for text in all_texts(q):
        assert not NIQQUD.search(text), text
    if q.figure is not None:
        assert q.figure.kind in FIGURE_KINDS, q.figure.kind
    for tag in q.misconceptions.values():
        assert tag in MISCONCEPTIONS, tag
    if q.kind in ("choice", "true_false", "order", "tap_figure"):
        ids = [c.id for c in q.choices]
        assert 2 <= len(ids) <= 6
        assert len(set(ids)) == len(ids)
        texts = [c.text_he for c in q.choices]
        assert len(set(texts)) == len(texts), texts
        assert all(0 < len(t) <= 40 for t in texts), texts
        if q.kind == "order":
            assert sorted(q.answer) == sorted(ids)
        else:
            assert q.answer in ids
        for key in q.misconceptions:
            assert key in ids and key != q.answer
    if q.kind == "number":
        assert parse_number(q.answer) is not None, q.answer
        for key in q.misconceptions:
            assert parse_number(key) is not None
            assert parse_number(key) != parse_number(q.answer)
    assert check_answer(q, q.answer).correct


def answer_text(q):
    if q.kind == "number":
        return q.answer
    return next(c.text_he for c in q.choices if c.id == q.answer)


NUM_TOKEN = re.compile(r"-?\d+(?:\.\d+)?(?:/\d+)?")


def numbers_in(text):
    text = text.replace(",", "")
    return [parse_number(t) for t in NUM_TOKEN.findall(text)]


def recompute(expr):
    def sqrt(x):
        r = math.isqrt(int(x))
        assert r * r == x
        return r

    env = {"F": Fraction, "sqrt": sqrt, "divmod": divmod, "abs": abs,
           "round": round, "max": max, "min": min, "__builtins__": {}}
    return eval(expr, env)  # noqa: S307 (test-only, generator-built)


def test_g1_g2_all_skills(library):
    checked_calc = 0
    for skill in library.skills.values():
        if skill.generator == "bank":
            continue
        for extra in CONTEXTS:
            for seed in SEEDS:
                q = make(library, skill, seed, extra)
                validate(q)
                if "max_choices" in extra and q.choices and q.kind == "choice":
                    assert len(q.choices) <= extra["max_choices"]
                calc = q.meta.get("calc")
                if calc is not None and "expr" in calc:
                    expected = recompute(calc["expr"])
                    got = numbers_in(answer_text(q))
                    if isinstance(expected, tuple):
                        assert tuple(got[: len(expected)]) == expected, q
                    else:
                        assert got and got[0] == Fraction(expected), (
                            skill.id, calc, answer_text(q))
                    checked_calc += 1
    assert checked_calc > 10000


def test_g3_deterministic(library):
    for skill in library.skills.values():
        for seed in (1, 7, 99):
            a = make(library, skill, seed, {"age": 9})
            b = make(library, skill, seed, {"age": 9})
            assert a == b
            c = make(library, skill, seed, {"age": 9, "max_choices": 2})
            assert c.item_id == a.item_id, skill.id


def test_g4_borrow_misconception(library):
    found_num = found_choice = 0
    for seed in range(100):
        q = make(library, library.skill("math.sub.within_100"), seed,
                 {"age": 9})
        calc = q.meta["calc"]
        a, b = calc["a"], calc["b"]
        wrong = int("".join(
            str(abs(int(x) - int(y)))
            for x, y in zip(f"{a:02d}", f"{b:02d}")
        ))
        tags = q.misconceptions
        if q.kind == "number":
            assert tags.get(str(wrong)) == "smaller_from_larger"
            found_num += 1
        else:
            texts = {c.id: c.text_he for c in q.choices}
            tagged = [texts[k] for k, v in tags.items()
                      if v == "smaller_from_larger"]
            if tagged:
                assert tagged == [str(wrong)]
                found_choice += 1
    assert found_num and found_choice


def test_word_problem_names(library):
    from nagmon.learning.generators.names import NAMES

    names = {n for n, _ in NAMES}
    for seed in range(50):
        q = make(library, library.skill("math.wp.add_sub_20"), seed,
                 {"age": 7})
        assert any(n in q.prompt_he for n in names), q.prompt_he


def test_figures_present(library):
    expect = {
        "math.time.hours": "clock",
        "math.fraction.identify": None,
        "geometry.angle.types": "angle",
        "geometry.area.grid": "grid_area",
        "logic.robot.path_end": "grid_path",
        "math.count.objects_10": "objects",
    }
    for sid, kind in expect.items():
        q = make(library, library.skill(sid), 3, {"age": 9})
        assert q.figure is not None, sid
        if kind:
            assert q.figure.kind == kind


def test_kind_preferences(library):
    skill = library.skill("math.add.within_20")
    kinds = {make(library, skill, s, {"age": 12, "prefer_kind": "number"}).kind
             for s in range(20)}
    assert kinds == {"number"}
    kinds = {make(library, skill, s, {"age": 12, "max_choices": 4}).kind
             for s in range(20)}
    assert kinds == {"choice"}
    young = make(library, skill, 1, {"age": 5})
    assert young.kind == "choice" and len(young.choices) == 3


@pytest.mark.parametrize("tag", sorted(MISCONCEPTIONS))
def test_misconception_catalog(tag):
    entry = MISCONCEPTIONS[tag]
    assert entry.parent_he and entry.hint_he
    assert not NIQQUD.search(entry.parent_he + entry.hint_he)
    assert len(entry.hint_he) <= 120
