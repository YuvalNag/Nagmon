# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from unittest.mock import MagicMock

import pytest

from tuxemon.locale import bilingual
from tuxemon.locale.bilingual import (
    HINT_MARKER,
    Bilingual,
    Term,
    compose,
    ladder_settings,
    menu_label,
    set_ladder_provider,
    term,
)
from tuxemon.ui.bidi import BILINGUAL_LINE_BREAK
from tuxemon.ui.text_paginator import TextPaginator

BR = BILINGUAL_LINE_BREAK

# A fake two-language catalogue so the tests do not depend on how much of
# the real he_IL file has been translated.
CATALOG = {
    "he_IL": {
        "got_item": "קיבלת {item}!",
        "potion_msg": "השיקוי שלך מוכן. שיקוי נוסף בדרך.",
        "two_pages": "עמוד א\nעמוד ב",
        "hebrew_only": "רק עברית",
        "greet": "שלום",
    },
    "en_US": {
        "got_item": "You got {item}!",
        "potion_msg": "Your potion is ready. Another potion is coming.",
        "two_pages": "Page A\nPage B",
        "english_only": "Only English",
        "greet": "Hello",
    },
}


@pytest.fixture(autouse=True)
def fake_catalog(monkeypatch):
    def lookup_in(msgid, locale_name, domain=None):
        return CATALOG.get(locale_name, {}).get(msgid)

    monkeypatch.setattr(bilingual.T, "lookup_in", lookup_in)
    yield
    set_ladder_provider(None)


POTION = term("שיקוי", "Potion")


def test_term_is_str_and_carries_both():
    assert isinstance(POTION, Term)
    assert isinstance(POTION, str)
    assert str(POTION) == "שיקוי"
    assert POTION.he == "שיקוי"
    assert POTION.en == "Potion"
    assert POTION.both() == "שיקוי · Potion"


def test_term_same_name_not_duplicated():
    name = term("Rockitten", "Rockitten")
    assert name.both() == "Rockitten"


def test_level0_hebrew_only():
    assert compose("got_item", {"item": POTION}, 0) == "קיבלת שיקוי!"


def test_level1_terms_bilingual():
    assert compose("got_item", {"item": POTION}, 1) == "קיבלת שיקוי · Potion!"


def test_level1_plain_params_untouched():
    assert compose("got_item", {"item": "3"}, 1) == "קיבלת 3!"


def test_level2_annotates_first_occurrence_only():
    text = compose("potion_msg", None, 2, {"שיקוי": "potion"})
    assert text == "השיקוי (potion) שלך מוכן. שיקוי נוסף בדרך."


def test_level2_term_param_hebrew_and_annotated():
    text = compose("got_item", {"item": POTION}, 2, {"שיקוי": "potion"})
    assert text == "קיבלת שיקוי (potion)!"


def test_level2_without_known_words_is_hebrew():
    assert compose("greet", None, 2, None) == "שלום"


def test_level3_english_then_hebrew():
    text = compose("got_item", {"item": POTION}, 3)
    assert text == f"You got Potion!{BR}קיבלת שיקוי!"


def test_level3_pairs_pages():
    text = compose("two_pages", None, 3)
    assert text == f"Page A{BR}עמוד א\nPage B{BR}עמוד ב"


def test_level3_paginator_keeps_lines_together():
    pages = TextPaginator().paginate_text(compose("two_pages", None, 3))
    assert pages == [f"Page A{BR}עמוד א", f"Page B{BR}עמוד ב"]


def test_level4_bilingual_object():
    result = compose("greet", None, 4)
    assert isinstance(result, Bilingual)
    assert result.primary == "Hello"
    assert result.secondary == "שלום"
    assert str(result) == "Hello" + HINT_MARKER


def test_level5_english_only():
    assert compose("got_item", {"item": POTION}, 5) == "You got Potion!"


@pytest.mark.parametrize(
    "level",
    [pytest.param(level, id=f"level{level}") for level in range(6)],
)
def test_missing_hebrew_falls_back_to_english(level):
    assert str(compose("english_only", None, level)) == "Only English"


@pytest.mark.parametrize(
    "level",
    [pytest.param(level, id=f"level{level}") for level in range(6)],
)
def test_missing_english_falls_back_to_hebrew(level):
    assert str(compose("hebrew_only", None, level)) == "רק עברית"


def test_missing_both_returns_msgid():
    assert compose("nothing_here", None, 3) == "nothing_here"


def test_level_is_clamped():
    assert compose("greet", None, 9) == "Hello"
    assert compose("greet", None, -1) == "שלום"


def test_default_provider(monkeypatch):
    set_ladder_provider(None)
    monkeypatch.setattr(bilingual.T, "is_rtl", lambda: False)
    assert ladder_settings() is None
    monkeypatch.setattr(bilingual.T, "is_rtl", lambda: True)
    assert ladder_settings() == (0, {})


def test_custom_provider():
    set_ladder_provider(lambda: (3, {"שיקוי": "potion"}))
    assert ladder_settings() == (3, {"שיקוי": "potion"})


def test_menu_label():
    assert menu_label("greet", 0) == "שלום"
    assert menu_label("greet", 2) == "שלום"
    assert menu_label("greet", 3, max_chars=20) == "שלום · Hello"
    assert menu_label("greet", 3, max_chars=5) == "שלום"
    assert menu_label("greet", 5) == "Hello"


def _formatter(translator):
    from tuxemon.ui.text_formatter import TextFormatter

    session = MagicMock()
    session.player.monsters = []
    session.player.game_variables = {}
    session.client.config.unit_measure = "metric"
    return TextFormatter(session, translator)


def test_paginate_translation_default_path_unchanged():
    translator = MagicMock()
    translator.format.return_value = "Hello there"
    set_ladder_provider(lambda: None)
    pages = _formatter(translator).paginate_translation("greet")
    assert pages == ["Hello there"]
    translator.format.assert_called_once()


def test_paginate_translation_uses_ladder():
    translator = MagicMock()
    set_ladder_provider(lambda: (3, {}))
    pages = _formatter(translator).paginate_translation("two_pages")
    assert pages == [f"Page A{BR}עמוד א", f"Page B{BR}עמוד ב"]
    translator.format.assert_not_called()
