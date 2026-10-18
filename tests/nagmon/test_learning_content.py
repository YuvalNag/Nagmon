"""C1-C7: content library loading and validation."""

import random
import textwrap
from collections import Counter

import pytest

from nagmon.learning.content import ContentError, ContentLibrary
from nagmon.learning.generators.common import GenContext
from nagmon.learning.model import check_answer


def write(tmp_path, rel, text):
    p = tmp_path / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(textwrap.dedent(text), encoding="utf-8")
    return p


GOOD = """
subject: math
skills:
  - id: math.add.a
    grade: 1
    title_he: חיבור
    title_en: Addition
    prereq: []
    generator: arithmetic.add
    params: {max_sum: 10}
  - id: math.add.b
    grade: 1
    title_he: חיבור עד 20
    title_en: Addition to 20
    prereq: [math.add.a]
    generator: arithmetic.add
    params: {max_sum: 20}
"""


def test_c1_real_content(library):
    counts = Counter(s.subject for s in library.skills.values())
    assert counts["math"] >= 55
    assert counts["geometry"] >= 28
    assert counts["logic"] >= 12
    grades = {s.grade for s in library.skills.values()}
    assert grades >= set(range(10))
    for subject in ("math", "geometry"):
        g = {s.grade for s in library.skills.values() if s.subject == subject}
        assert g >= set(range(10)), subject


def test_good_tmp_content(tmp_path):
    write(tmp_path, "skills/math.yaml", GOOD)
    lib = ContentLibrary.load(tmp_path)
    assert set(lib.skills) == {"math.add.a", "math.add.b"}
    assert lib.skill("math.add.b").prereq == ("math.add.a",)
    assert lib.skill("math.add.a").mastery.min_attempts == 12


def expect_error(tmp_path, text, needle):
    write(tmp_path, "skills/math.yaml", text)
    with pytest.raises(ContentError) as exc:
        ContentLibrary.load(tmp_path)
    assert any(needle in e for e in exc.value.errors), exc.value.errors


def test_c2_duplicate_id(tmp_path):
    bad = GOOD.replace("id: math.add.b", "id: math.add.a")
    expect_error(tmp_path, bad, "duplicate")


def test_c3_unknown_generator(tmp_path):
    bad = GOOD.replace(
        "generator: arithmetic.add\n    params: {max_sum: 20}",
        "generator: arithmetic.nope\n    params: {}",
    )
    expect_error(tmp_path, bad, "unknown generator")


def test_c4_missing_prereq(tmp_path):
    bad = GOOD.replace("prereq: [math.add.a]", "prereq: [math.add.zzz]")
    expect_error(tmp_path, bad, "missing prereq")


def test_c5_cycle(tmp_path):
    bad = GOOD.replace("prereq: []", "prereq: [math.add.b]")
    expect_error(tmp_path, bad, "cycle")


def test_bad_grade_and_subject(tmp_path):
    bad = GOOD.replace(
        "grade: 1\n    title_he: חיבור\n", "grade: 12\n    title_he: חיבור\n"
    )
    expect_error(tmp_path, bad, "grade")
    bad2 = GOOD.replace("id: math.add.a", "id: geometry.add.a").replace(
        "prereq: [math.add.a]", "prereq: [geometry.add.a]"
    )
    expect_error(tmp_path, bad2, "subject")


BANK_SKILLS = """
subject: science
skills:
  - id: science.living.basic
    grade: 1
    title_he: חי, צומח ודומם
    title_en: Living things
    prereq: []
    generator: bank
    params: {bank: science/living.yaml}
"""

BANK = """
skill: science.living.basic
items:
  - id: sci.living.001
    kind: choice
    grade: 1
    difficulty: 0.0
    prompt_he: מה מהבאים הוא יצור חי?
    prompt_en: Which of these is a living thing?
    choices:
      - {he: חתול, en: cat, emoji: 1f408}
      - {he: אבן, en: stone, emoji: 1faa8}
      - {he: כיסא, en: chair, emoji: 1fa91}
    answer: 0
    explanation_he: חתול נושם, אוכל, גדל ומתרבה. אבן וכיסא לא.
  - id: sci.living.002
    kind: true_false
    grade: 1
    prompt_he: עץ הוא יצור חי.
    answer: true
    explanation_he: עץ גדל, ניזון ומתרבה, ולכן הוא חי.
  - id: sci.living.003
    kind: order
    grade: 2
    prompt_he: סדרו מהקטן לגדול
    choices: [{he: זרע}, {he: שתיל}, {he: עץ}]
    answer: [0, 1, 2]
    explanation_he: מזרע צומח שתיל, ומשתיל גדל עץ.
"""


def test_c6_bank(tmp_path):
    write(tmp_path, "skills/science.yaml", BANK_SKILLS)
    write(tmp_path, "science/living.yaml", BANK)
    lib = ContentLibrary.load(tmp_path)
    seen = {}
    for seed in range(60):
        q = lib.generate("science.living.basic", random.Random(seed))
        seen[q.item_id] = q
        assert q.source == "bank"
    assert set(seen) == {"sci.living.001", "sci.living.002", "sci.living.003"}
    tf = seen["sci.living.002"]
    assert tf.kind == "true_false"
    assert [c.text_he for c in tf.choices] == ["נכון", "לא נכון"]
    assert check_answer(tf, "נכון").correct
    ch = seen["sci.living.001"]
    assert check_answer(ch, ch.answer).correct
    assert any(c.image == "emoji:1f408" for c in ch.choices)
    order = seen["sci.living.003"]
    texts = {c.id: c.text_he for c in order.choices}
    assert [texts[i] for i in order.answer] == ["זרע", "שתיל", "עץ"]


@pytest.mark.parametrize(
    ("old", "new", "needle"),
    [
        ("answer: 0\n", "answer: 5\n", "answer"),
        (
            "{he: אבן, en: stone, emoji: 1faa8}",
            "{he: חתול, en: stone}",
            "duplicate choice",
        ),
        ("id: sci.living.002", "id: sci.living.001", "duplicate"),
        ("answer: true", "answer: 3", "true_false"),
        ("prompt_he: עץ הוא יצור חי.", "prompt_he: " + "א" * 141, "prompt_he"),
        ("prompt_he: עץ הוא יצור חי.", "prompt_he: ע\u05b5ץ", "niqqud"),
    ],
)
def test_c6_bank_errors(tmp_path, old, new, needle):
    assert old in BANK
    write(tmp_path, "skills/science.yaml", BANK_SKILLS)
    write(tmp_path, "science/living.yaml", BANK.replace(old, new, 1))
    with pytest.raises(ContentError) as exc:
        ContentLibrary.load(tmp_path)
    assert any(needle in e for e in exc.value.errors), exc.value.errors


def test_c6_missing_bank_file(tmp_path):
    write(tmp_path, "skills/science.yaml", BANK_SKILLS)
    with pytest.raises(ContentError):
        ContentLibrary.load(tmp_path)


def test_c7_every_skill_generates(library):
    for skill in library.skills.values():
        for seed in range(40):
            for ctx in (
                GenContext(skill.id, skill.subject, grade=skill.grade, age=7),
                GenContext(skill.id, skill.subject, grade=skill.grade, age=11),
            ):
                q = library.generate(skill.id, random.Random(seed), ctx)
                assert q.skill_id == skill.id
                assert q.subject == skill.subject
                assert check_answer(q, q.answer).correct, (skill.id, q)


def test_every_generator_used(library):
    used = {s.generator for s in library.skills.values()}
    registered = set(library.registry.names()) - {"bank"}
    assert registered <= used, registered - used
