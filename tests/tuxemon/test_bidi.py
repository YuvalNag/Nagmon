# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
import pytest

from tuxemon.ui import bidi
from tuxemon.ui.bidi import (
    VisualStr,
    ensure_visual,
    is_rtl_text,
    needs_bidi,
    paragraph_is_rtl,
    reorder,
    to_visual,
)
from tuxemon.ui.text_alignment import HorizontalAlignment


@pytest.fixture
def rtl_locale(monkeypatch):
    monkeypatch.setattr(bidi, "_locale_is_rtl", lambda: True)


@pytest.fixture
def ltr_locale(monkeypatch):
    monkeypatch.setattr(bidi, "_locale_is_rtl", lambda: False)


@pytest.mark.parametrize(
    "text, expected",
    [
        pytest.param("שלום", True, id="hebrew"),
        pytest.param("Hello", False, id="latin"),
        pytest.param("123 !?", False, id="neutral"),
        pytest.param("Lv. 5 רמה", True, id="mixed"),
        pytest.param("", False, id="empty"),
    ],
)
def test_is_rtl_text(text, expected):
    assert is_rtl_text(text) is expected


@pytest.mark.parametrize(
    "line, base_rtl, expected",
    [
        pytest.param("שלום", True, "םולש", id="pure_hebrew"),
        pytest.param(
            "יש לך 3 Potions!",
            True,
            "!Potions 3 ךל שי",
            id="hebrew_number_english_punct",
        ),
        pytest.param(
            "שיקוי (potion)", True, "(potion) יוקיש", id="paren_mirroring"
        ),
        pytest.param("קיבלת 120 נקודות.", True, ".תודוקנ 120 תלביק", id="num"),
        pytest.param("מחיר: 3.50 ₪", True, "₪ 3.50 :ריחמ", id="currency"),
        pytest.param("Hello (world)!", False, "Hello (world)!", id="ltr"),
        pytest.param("Hi שלום!", False, "Hi םולש!", id="ltr_base_hebrew"),
        pytest.param("Lv. 5", True, "Lv. 5", id="rtl_base_no_rtl_chars"),
    ],
)
def test_to_visual(line, base_rtl, expected):
    assert to_visual(line, base_rtl) == expected


def test_to_visual_returns_marker():
    assert isinstance(to_visual("שלום", True), VisualStr)
    assert isinstance(to_visual("abc", False), VisualStr)


@pytest.mark.parametrize(
    "line, base_rtl",
    [
        pytest.param("שלום עולם", True, id="hebrew"),
        pytest.param("יש לך 3 Potions!", True, id="mixed"),
        pytest.param("(א) [b] {ג}", True, id="brackets"),
        pytest.param("plain text", False, id="ltr"),
    ],
)
def test_reorder_mapping_is_permutation(line, base_rtl):
    visual, v2l = reorder(line, base_rtl)
    assert sorted(v2l) == list(range(len(line)))
    mirrored = {"(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{"}
    for vis_index, log_index in enumerate(v2l):
        logical_char = line[log_index]
        assert visual[vis_index] in (
            logical_char,
            mirrored.get(logical_char),
        )


def test_reorder_mapping_hebrew_is_reversed():
    _, v2l = reorder("אבג", True)
    assert v2l == (2, 1, 0)


def test_ensure_visual_no_double_conversion(rtl_locale):
    once = ensure_visual("שלום")
    assert once == "םולש"
    assert ensure_visual(once) == "םולש"
    assert ensure_visual(once) is once


def test_ensure_visual_ltr_noop(rtl_locale):
    text = "Hello (world)!"
    assert ensure_visual(text) == text


def test_ensure_visual_ltr_locale_with_hebrew(ltr_locale):
    assert ensure_visual("עברית") == "תירבע"


def test_paragraph_direction(rtl_locale):
    assert paragraph_is_rtl("Rockitten קיבל 3 נקודות") is True
    assert paragraph_is_rtl("You got 3 potions!") is False


def test_paragraph_direction_ltr_locale(ltr_locale):
    assert paragraph_is_rtl("Rockitten קיבל") is False
    assert paragraph_is_rtl("קיבל Rockitten") is True


def test_needs_bidi():
    assert needs_bidi("abc", False) is False
    assert needs_bidi("אבג", False) is True
    assert needs_bidi("abc!", True) is True


def test_start_alignment(rtl_locale):
    assert bidi.start_alignment() is HorizontalAlignment.RIGHT


def test_start_alignment_ltr(ltr_locale):
    assert bidi.start_alignment() is HorizontalAlignment.LEFT


@pytest.mark.parametrize(
    "line, base_rtl",
    [
        pytest.param("שלום", True, id="pure"),
        pytest.param("יש לך 3 Potions!", True, id="mixed"),
        pytest.param("שיקוי (potion)", True, id="paren"),
        pytest.param("Hi שלום!", False, id="ltr_base"),
    ],
)
def test_fallback_matches_python_bidi(line, base_rtl):
    visual, v2l = bidi._fallback_reorder(line, base_rtl)
    assert visual == to_visual(line, base_rtl)
    assert sorted(v2l) == list(range(len(line)))
