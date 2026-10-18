# SPDX-License-Identifier: GPL-3.0
"""WP12: text preparation for speech (SDD_TTS §2.4, T1-T13)."""

from __future__ import annotations

import pytest

from nagmon.tts.text import (
    Segment,
    chunk_text,
    clean_for_speech,
    split_by_language,
)

HE_CASES = [
    pytest.param("7 × 8 = ?", "7 כפול 8 שווה כמה?", id="T1-times-blank"),
    pytest.param("12 + 5", "12 ועוד 5", id="T2-plus"),
    pytest.param("12+5", "12 ועוד 5", id="T2-plus-tight"),
    pytest.param("12 − 5", "12 פחות 5", id="T2-minus-sign"),
    pytest.param("12 - 5", "12 פחות 5", id="T2-hyphen-minus"),
    pytest.param("20 ÷ 4", "20 חלקי 4", id="T2-divide"),
    pytest.param("12 : 3", "12 חלקי 3", id="T2-colon-divide"),
    pytest.param("50%", "50 אחוז", id="T2-percent"),
    pytest.param("3/4", "3 חלקי 4", id="T2-fraction"),
    pytest.param("כמה זה 3 / 4?", "כמה זה 3 חלקי 4?", id="T2-fraction-sp"),
    pytest.param("? + 3 = 7", "כמה ועוד 3 שווה 7", id="T2-blank-first"),
    pytest.param("10 - __ = 4", "10 פחות כמה שווה 4", id="T2-underscore"),
    pytest.param("3 < 5", "3 קטן מ-5", id="T2-less"),
    pytest.param("9 > 2", "9 גדול מ-2", id="T2-greater"),
    pytest.param("½", "חצי", id="T2-half"),
    pytest.param("1½", "1 וחצי", id="T2-one-and-half"),
    pytest.param("5²", "5 בריבוע", id="T2-squared"),
    pytest.param("7x8", "7 כפול 8", id="T4-x"),
    pytest.param("7 X 8", "7 כפול 8", id="T4-X"),
    pytest.param("7 * 8", "7 כפול 8", id="T4-star"),
    pytest.param("מכת-על!", "מכת-על!", id="T5-hyphen-word"),
    pytest.param("בשעה 10:30", "בשעה 10:30", id="T5-time"),
    pytest.param("-5 ועוד 3", "מינוס 5 ועוד 3", id="T6-negative"),
    pytest.param("(−4) + 1", "(מינוס 4) ועוד 1", id="T6-negative-paren"),
    pytest.param("5₪", "5 שקלים", id="T7-shekel-after"),
    pytest.param("₪ 12", "12 שקלים", id="T7-shekel-before"),
    pytest.param("1₪", "שקל אחד", id="T7-one-shekel"),
    pytest.param("עולה 3 ₪.", "עולה 3 שקלים.", id="T7-in-sentence"),
    pytest.param("שלום ${{name}}!!! ⭐🎉", "שלום!", id="T8-placeholder"),
    pytest.param("{count} מטבעות", "מטבעות", id="T8-braces"),
    pytest.param("<b>כל הכבוד</b>", "כל הכבוד", id="T8-tags"),
    pytest.param("**חזק**", "חזק", id="T8-markdown"),
    pytest.param("שורה\nשנייה", "שורה שנייה", id="T8-newline"),
    pytest.param("מה???", "מה?", id="T8-question-marks"),
    pytest.param("רגע...", "רגע…", id="T8-ellipsis"),
    pytest.param("התקפה רגילה ⏩", "התקפה רגילה", id="T8-emoji-arrow"),
    pytest.param("שיקוי · Potion", "שיקוי, Potion", id="T8-middle-dot"),
    pytest.param("", "", id="T8-empty"),
    pytest.param("⭐⭐", "", id="T8-only-emoji"),
]

EN_CASES = [
    pytest.param("7 × 8 = ?", "7 times 8 equals what?", id="T3-times-blank"),
    pytest.param(
        "12 + 5 - 3 = 14", "12 plus 5 minus 3 equals 14", id="T3-plus-minus"
    ),
    pytest.param("20 ÷ 4", "20 divided by 4", id="T3-divide"),
    pytest.param("50%", "50 percent", id="T3-percent"),
    pytest.param("3/4", "3 over 4", id="T3-fraction"),
    pytest.param("6 * 7", "6 times 7", id="T3-star"),
    pytest.param("3 < 5", "3 is less than 5", id="T3-less"),
    pytest.param("1½", "1 and a half", id="T3-and-half"),
    pytest.param("5²", "5 squared", id="T3-squared"),
    pytest.param("box", "box", id="T4-box-untouched"),
    pytest.param("x-ray", "x-ray", id="T5-x-ray"),
    pytest.param("-5 + 3", "minus 5 plus 3", id="T6-negative"),
    pytest.param("5₪", "5 shekels", id="T7-shekels"),
    pytest.param("1₪", "1 shekel", id="T7-shekel"),
    pytest.param("Great job!!! 🎉", "Great job!", id="T8-emoji"),
]


@pytest.mark.parametrize(("raw", "expected"), HE_CASES)
def test_clean_for_speech_hebrew(raw, expected):
    assert clean_for_speech(raw, "he") == expected


@pytest.mark.parametrize(("raw", "expected"), EN_CASES)
def test_clean_for_speech_english(raw, expected):
    assert clean_for_speech(raw, "en") == expected


def _pairs(segments):
    return [(s.lang, s.text) for s in segments]


SPLIT_CASES = [
    pytest.param(
        "קיבלת 3 potions!",
        "he",
        [("he", "קיבלת 3"), ("en", "potions!")],
        id="T9-number-stays-hebrew",
    ),
    pytest.param(
        "המפלצת Fire Ball חזקה",
        "he",
        [("he", "המפלצת"), ("en", "Fire Ball"), ("he", "חזקה")],
        id="T10-multiword-english",
    ),
    pytest.param(
        "The word שלום means peace",
        "en",
        [("en", "The word"), ("he", "שלום"), ("en", "means peace")],
        id="T11-hebrew-inside-english",
    ),
    pytest.param(
        "שלום לכולם, מה נשמע?",
        "he",
        [("he", "שלום לכולם, מה נשמע?")],
        id="T12-hebrew-only",
    ),
    pytest.param("123", "he", [("he", "123")], id="T12-digits-only"),
    pytest.param("", "he", [], id="T12-empty"),
    pytest.param("   !! ", "he", [], id="T12-punct-only"),
    pytest.param(
        "Hello world", "he", [("en", "Hello world")], id="T12-english-only"
    ),
    pytest.param(
        "צה״ל ו-don't",
        "he",
        [("he", "צה״ל ו-"), ("en", "don't")],
        id="T12-apostrophes",
    ),
]


@pytest.mark.parametrize(("text", "base", "expected"), SPLIT_CASES)
def test_split_by_language(text, base, expected):
    assert _pairs(split_by_language(text, base)) == expected


def test_split_middle_dot_has_no_punctuation_only_segment():
    segments = split_by_language("שיקוי · Potion", "he")
    assert [s.lang for s in segments] == ["he", "en"]
    assert segments[1].text == "Potion"


def test_segment_is_value_object():
    assert Segment("he", "שלום") == Segment("he", "שלום")


def test_chunk_text_splits_long_text_at_sentence_end():
    sentence = "זה משפט די ארוך שחוזר על עצמו. "
    text = sentence * 20
    chunks = chunk_text(text, max_len=100)
    assert len(chunks) > 1
    assert all(len(c) <= 100 for c in chunks)
    assert " ".join(chunks) == text.strip()


def test_chunk_text_keeps_short_text_whole():
    assert chunk_text("קצר.", max_len=100) == ["קצר."]


def test_chunk_text_hard_splits_sentence_without_punctuation():
    text = "מילה " * 60
    chunks = chunk_text(text, max_len=50)
    assert all(len(c) <= 50 for c in chunks)
    assert " ".join(chunks) == text.strip()
