"""M1-M10: question model and answer checking."""

from fractions import Fraction

import pytest

from nagmon.learning.model import (
    Choice,
    Question,
    check_answer,
    display_answer,
    normalize_number,
    normalize_text,
    parse_number,
    true_false_choices,
)


def num_q(answer: str, **kw) -> Question:
    return Question(
        item_id="t:1",
        skill_id="math.test",
        subject="math",
        kind="number",
        prompt_he="כמה זה?",
        prompt_en=None,
        answer=answer,
        **kw,
    )


def choice_q() -> Question:
    return Question(
        item_id="t:2",
        skill_id="math.test",
        subject="math",
        kind="choice",
        prompt_he="איזה פרי?",
        prompt_en="Which fruit?",
        answer="b",
        choices=(
            Choice("a", "כלב", "dog"),
            Choice("b", "תפוח", "Apple"),
            Choice("c", "כיסא", "chair"),
        ),
        misconceptions={"a": "animal_not_fruit"},
    )


@pytest.mark.parametrize("given", ["7", "07", " 7 ", "+7", "7.0", "\u200f7"])
def test_m1_integer_normalization(given):
    res = check_answer(num_q("7"), given)
    assert res.correct
    assert res.normalized == "7"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("3.50", "3.5"),
        ("3,5", "3.5"),
        ("1,000", "1000"),
        ("12,500", "12500"),
        ("\u22123", "-3"),
        ("-0", "0"),
        (".5", "0.5"),
        ("12 ₪", "12"),
        ("40°", "40"),
        ("25%", "25"),
        ("2/4", "2/4"),
        ("1 1/2", "3/2"),
    ],
)
def test_m2_normalize_number(raw, expected):
    assert normalize_number(raw) == expected


def test_m2_decimal_equal():
    assert check_answer(num_q("3.5"), "3.50").correct
    assert check_answer(num_q("1000"), "1,000").correct
    assert check_answer(num_q("-3"), "\u22123").correct


def test_m3_fraction_value_policy():
    q = num_q("1/2")
    assert check_answer(q, "2/4").correct
    assert check_answer(q, "0.5").correct
    assert check_answer(q, "1/2").correct
    assert not check_answer(q, "1/3").correct


def test_m4_fraction_simplest_policy():
    q = num_q("1/2", meta={"fraction_form": "simplest"})
    res = check_answer(q, "2/4")
    assert not res.correct
    assert res.misconception == "not_simplified"
    assert check_answer(q, "1/2").correct


def test_m5_mixed_number():
    assert check_answer(num_q("3/2"), "1 1/2").correct
    assert parse_number("1 1/2") == Fraction(3, 2)
    assert parse_number("-1 1/2") == Fraction(-3, 2)


def test_m6_choice_by_id_and_text():
    q = choice_q()
    assert check_answer(q, "b").correct
    assert check_answer(q, "תפוח").correct
    assert check_answer(q, "apple").correct
    res = check_answer(q, "a")
    assert not res.correct
    assert res.misconception == "animal_not_fruit"
    assert res.normalized == "a"
    assert check_answer(q, "כלב").misconception == "animal_not_fruit"


def test_m6_number_misconception_by_value():
    q = num_q("8", misconceptions={"12": "add_instead_of_sub"})
    res = check_answer(q, "012")
    assert res.misconception == "add_instead_of_sub"


@pytest.mark.parametrize("given", ["נכון", "true", "כן", "True", "yes"])
def test_m7_true_false(given):
    q = Question(
        item_id="t:3",
        skill_id="logic.test",
        subject="logic",
        kind="true_false",
        prompt_he="כל ריבוע הוא מלבן",
        prompt_en=None,
        answer="true",
        choices=true_false_choices(),
    )
    assert check_answer(q, given).correct
    assert not check_answer(q, "לא נכון").correct


def test_m8_text_trimming():
    assert (
        normalize_text("  \u200fש\u05b8\u05c1לו\u05b9ם   עולם. ")
        == "שלום עולם"
    )
    q = Question(
        item_id="t:4",
        skill_id="english.test",
        subject="english",
        kind="letters",
        prompt_he="אייתו את המילה",
        prompt_en=None,
        answer="Dog",
    )
    assert check_answer(q, " dog ").correct
    assert check_answer(q, "DOG!").correct


def test_m9_order():
    q = Question(
        item_id="t:5",
        skill_id="science.test",
        subject="science",
        kind="order",
        prompt_he="סדרו",
        prompt_en=None,
        answer=("c", "a", "b"),
        choices=(Choice("a", "א"), Choice("b", "ב"), Choice("c", "ג")),
    )
    assert check_answer(q, ["c", "a", "b"]).correct
    assert not check_answer(q, ["a", "b", "c"]).correct
    assert check_answer(q, ("c", "a", "b")).normalized == ("c", "a", "b")


def test_m10_garbage_number():
    res = check_answer(num_q("7"), "שבע?")
    assert not res.correct
    assert res.normalized is None
    assert not check_answer(num_q("7"), None).correct


def test_display_answer():
    assert display_answer(choice_q()) == "תפוח"
    assert display_answer(num_q("3.5")) == "3.5"
