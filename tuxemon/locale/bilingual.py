# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
"""
The language ladder: Hebrew that slowly makes room for English.

========  ==============================================================
level     what ``compose`` returns
========  ==============================================================
0         Hebrew only
1         Hebrew; ``Term`` parameters show both names: "שיקוי · Potion"
2         Hebrew; first occurrence of each known word is annotated:
          "שיקוי (potion)"
3         English line, ``BILINGUAL_LINE_BREAK``, Hebrew line
4         ``Bilingual``: English with a hint marker; Hebrew on demand
5         English only
========  ==============================================================

Fallbacks: missing Hebrew -> English, missing English -> Hebrew,
missing both -> the msgid.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from typing import Any

from tuxemon.locale.locale import T
from tuxemon.ui.bidi import BILINGUAL_LINE_BREAK

HEBREW = "he_IL"
ENGLISH = "en_US"
MIN_LEVEL = 0
MAX_LEVEL = 5
TERM_SEPARATOR = " · "
HINT_MARKER = " [?]"
# Hebrew prefix letters that attach to a noun: ve-, ha-, be-, ke-, le-,
# mi-, she-. Up to two may stack ("וה", "שב").
_HEBREW_PREFIXES = "והבכלמש"

LadderSettings = tuple[int, Mapping[str, str]]
LadderProvider = Callable[[], "LadderSettings | None"]


class Term(str):
    """
    A proper name or item name that exists in both languages.

    ``str(term)`` is the Hebrew form, so a Term can be used anywhere a
    string is expected.
    """

    he: str
    en: str

    def __new__(cls, he: str, en: str) -> Term:
        obj = super().__new__(cls, he or en)
        obj.he = he or en
        obj.en = en or he
        return obj

    def both(self) -> str:
        """``"שיקוי · Potion"``, or just the name when both are equal."""
        if self.he == self.en:
            return self.he
        return f"{self.he}{TERM_SEPARATOR}{self.en}"


def term(he: str, en: str) -> Term:
    """Build a two-language term, e.g. ``term("שיקוי", "Potion")``."""
    return Term(he, en)


def term_msgid(msgid: str) -> Term:
    """A term whose two forms come from the catalogues."""
    he = T.lookup_in(msgid, HEBREW)
    en = T.lookup_in(msgid, ENGLISH)
    return Term(he or en or msgid, en or he or msgid)


class Bilingual(str):
    """
    English text with a Hebrew translation available on demand (level 4).

    ``str()`` is ``primary`` plus ``HINT_MARKER``; the UI can detect the
    type (or the marker) and show ``secondary`` when the child asks.
    """

    primary: str
    secondary: str

    def __new__(cls, primary: str, secondary: str) -> Bilingual:
        obj = super().__new__(cls, f"{primary}{HINT_MARKER}")
        obj.primary = primary
        obj.secondary = secondary
        return obj


def _default_provider() -> LadderSettings | None:
    return (0, {}) if T.is_rtl() else None


_provider: LadderProvider = _default_provider


def set_ladder_provider(provider: LadderProvider | None) -> None:
    """
    Install the callback that returns ``(level, known_words)`` for the
    active profile, or None to disable the ladder. ``None`` restores the
    default (level 0 when the UI language is RTL, otherwise disabled).
    """
    global _provider
    _provider = provider or _default_provider


def ladder_settings() -> LadderSettings | None:
    """Current ``(level, known_words)``, or None when the ladder is off."""
    return _provider()


def _params_for(
    params: Mapping[str, Any] | None, language: str, level: int
) -> dict[str, Any] | None:
    if not params:
        return None
    result: dict[str, Any] = {}
    for key, value in params.items():
        if isinstance(value, Term):
            if language == ENGLISH:
                value = value.en
            elif level == 1:
                value = value.both()
            else:
                value = value.he
        result[key] = value
    return result


def _render(
    msgid: str,
    language: str,
    params: Mapping[str, Any] | None,
    level: int,
) -> str | None:
    """Translated and formatted text, or None if missing in language."""
    template = T.lookup_in(msgid, language)
    if template is None:
        return None
    template = template.replace(r"\n", "\n")
    values = _params_for(params, language, level)
    if not values:
        return template
    try:
        return template.format_map(_SafeParams(values))
    except (ValueError, IndexError):
        return template


class _SafeParams(dict[str, Any]):
    def __missing__(self, key: str) -> str:
        return f"<{key}>"


def annotate_known_words(text: str, known_words: Mapping[str, str]) -> str:
    """
    Add the English word after the first occurrence of each known Hebrew
    word: "קיבלת שיקוי" -> "קיבלת שיקוי (potion)". Prefix letters
    ("השיקוי") are kept.
    """
    for hebrew in sorted(known_words, key=len, reverse=True):
        english = known_words[hebrew]
        pattern = re.compile(
            rf"(?<!\w)([{_HEBREW_PREFIXES}]{{0,2}}{re.escape(hebrew)})(?!\w)"
        )
        text = pattern.sub(
            lambda m, en=english: f"{m.group(1)} ({en})", text, count=1
        )
    return text


def _pair_lines(english: str, hebrew: str) -> str:
    en_pages = english.split("\n")
    he_pages = hebrew.split("\n")
    if len(en_pages) != len(he_pages):
        en_pages = [" ".join(en_pages)]
        he_pages = [" ".join(he_pages)]
    return "\n".join(
        f"{en}{BILINGUAL_LINE_BREAK}{he}" for en, he in zip(en_pages, he_pages)
    )


def compose(
    msgid: str,
    params: Mapping[str, Any] | None = None,
    level: int = 0,
    known_words: Mapping[str, str] | None = None,
) -> str:
    """
    Text of ``msgid`` for display at the given ladder level.

    Parameters:
        msgid: Catalogue message id.
        params: Format parameters; ``Term`` values are rendered per level.
        level: Ladder level 0-5 (clamped).
        known_words: Hebrew word -> English word the child already knows
            (used at level 2).

    Returns:
        A string. Level 4 returns a :class:`Bilingual` (a ``str``).
    """
    level = max(MIN_LEVEL, min(MAX_LEVEL, level))
    hebrew = _render(msgid, HEBREW, params, level)
    english = _render(msgid, ENGLISH, params, level)

    if hebrew is None and english is None:
        return msgid
    if hebrew is None:
        assert english is not None
        return english
    if english is None:
        if level == 2 and known_words:
            return annotate_known_words(hebrew, known_words)
        return hebrew

    if level <= 1:
        return hebrew
    if level == 2:
        return annotate_known_words(hebrew, known_words or {})
    if level == 3:
        return _pair_lines(english, hebrew)
    if level == 4:
        return Bilingual(english, hebrew)
    return english


def menu_label(msgid: str, level: int, max_chars: int | None = None) -> str:
    """
    Label for a menu entry.

    Menus stay single-language Hebrew at levels 0-2. At levels 3-4 the
    label is "עברית · English" when it fits in ``max_chars`` (no limit when
    None), otherwise Hebrew. Level 5 is English.
    """
    hebrew = T.lookup_in(msgid, HEBREW)
    english = T.lookup_in(msgid, ENGLISH)
    if hebrew is None or english is None:
        return hebrew or english or msgid
    if level >= MAX_LEVEL:
        return english
    if level >= 3:
        both = Term(hebrew, english).both()
        if max_chars is None or len(both) <= max_chars:
            return both
    return hebrew
