# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
"""
Bidirectional (Hebrew/Arabic) text support for the text renderers.

Contract: "logical text in, visual text out, exactly once".

* Text is always *wrapped* in logical order (so line breaks fall between
  words of the sentence as it is read).
* Each wrapped line is then converted to visual (left-to-right drawing)
  order with :func:`reorder` / :func:`to_visual`, which return a
  :class:`VisualStr`.
* :func:`ensure_visual` (used by ``TextRenderer.shadow_text`` and by the
  pygame_menu hook) leaves a ``VisualStr`` untouched, so text is never
  converted twice.

The Unicode Bidirectional Algorithm comes from the pure-Python
implementation shipped with ``python-bidi`` (``bidi.algorithm``). Its stages
are run one by one so we can also recover the visual-to-logical index map,
which the typewriter effect needs. If the package cannot be imported a small
built-in subset of UAX #9 is used instead (:func:`_fallback_reorder`).
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from typing import Any

from tuxemon.ui.text_alignment import HorizontalAlignment

try:  # pragma: no cover - exercised implicitly
    from bidi import algorithm as _bidi_algorithm
except ImportError:  # pragma: no cover - platform without python-bidi
    _bidi_algorithm = None

# Soft line break: renderers start a new line, the paginator does not start
# a new page. Used by the language ladder (level 3) to keep the English and
# Hebrew lines of one message together.
BILINGUAL_LINE_BREAK = " "

_RTL_RE = re.compile("[֐-ࣿיִ-﷿ﹰ-ﻼ]")

_MIRROR = {
    "(": ")",
    ")": "(",
    "[": "]",
    "]": "[",
    "{": "}",
    "}": "{",
    "<": ">",
    ">": "<",
    "«": "»",
    "»": "«",
}


class VisualStr(str):
    """A string that is already in visual (display) order."""

    __slots__ = ()


def _locale_is_rtl() -> bool:
    from tuxemon.locale.locale import T

    return T.is_rtl()


def locale_is_rtl() -> bool:
    """True when the active UI language is written right to left."""
    return _locale_is_rtl()


def is_rtl_text(text: str) -> bool:
    """True if the text contains at least one right-to-left letter."""
    return bool(text) and _RTL_RE.search(text) is not None


def _first_strong_is_rtl(text: str) -> bool:
    for char in text:
        kind = unicodedata.bidirectional(char)
        if kind == "L":
            return False
        if kind in ("R", "AL"):
            return True
    return False


def paragraph_is_rtl(text: str) -> bool:
    """
    Base direction of one paragraph.

    A paragraph without RTL letters is always LTR. In an RTL locale any
    paragraph that contains RTL letters is RTL (so a Hebrew sentence that
    starts with an English monster name still reads right to left).
    Otherwise the first strong character decides (UAX #9, P2/P3).
    """
    if not is_rtl_text(text):
        return False
    if locale_is_rtl():
        return True
    return _first_strong_is_rtl(text)


def needs_bidi(line: str, base_rtl: bool) -> bool:
    """True if the line has to be reordered before drawing."""
    return base_rtl or is_rtl_text(line)


def start_alignment() -> HorizontalAlignment:
    """Alignment of the start of a line: RIGHT for RTL, LEFT otherwise."""
    return (
        HorizontalAlignment.RIGHT
        if locale_is_rtl()
        else HorizontalAlignment.LEFT
    )


def resolve_alignment(
    alignment: HorizontalAlignment | None,
) -> HorizontalAlignment:
    """Return the given alignment, or the locale's start alignment."""
    return alignment if alignment is not None else start_alignment()


def _python_bidi_reorder(
    line: str, base_rtl: bool
) -> tuple[str, tuple[int, ...]]:
    alg: Any = _bidi_algorithm
    storage = alg.get_empty_storage()
    base_level = 1 if base_rtl else 0
    storage["base_level"] = base_level
    storage["base_dir"] = ("L", "R")[base_level]
    alg.get_embedding_levels(line, storage)
    for index, char in enumerate(storage["chars"]):
        char["logical_index"] = index
    alg.explicit_embed_and_overrides(storage)
    alg.resolve_weak_types(storage)
    alg.resolve_neutral_types(storage, False)
    alg.resolve_implicit_levels(storage, False)
    alg.reorder_resolved_levels(storage, False)
    alg.apply_mirroring(storage, False)
    chars = storage["chars"]
    visual = "".join(char["ch"] for char in chars)
    return visual, tuple(char["logical_index"] for char in chars)


def _fallback_types(line: str) -> list[str]:
    """Bidi classes after a simplified W1-W7 pass."""
    types = []
    for char in line:
        kind = unicodedata.bidirectional(char)
        if kind == "AL":
            kind = "R"
        elif kind == "AN":
            kind = "EN"
        types.append(kind)
    size = len(types)
    # W4: a single separator between two numbers joins them
    for i in range(1, size - 1):
        if (
            types[i] in ("ES", "CS")
            and types[i - 1] == "EN"
            and types[i + 1] == "EN"
        ):
            types[i] = "EN"
    # W5: terminators next to numbers become numbers
    for i in range(size):
        if types[i] != "ET":
            continue
        j = i
        while j < size and types[j] == "ET":
            j += 1
        k = i - 1
        if (j < size and types[j] == "EN") or (k >= 0 and types[k] == "EN"):
            for m in range(i, j):
                types[m] = "EN"
    return types


def _fallback_reorder(
    line: str, base_rtl: bool
) -> tuple[str, tuple[int, ...]]:
    """
    Minimal UAX #9 subset: implicit levels, N1/N2, L1, L2 and L4.

    No explicit embeddings or isolates. Good enough for game text.
    """
    base = 1 if base_rtl else 0
    base_dir = "R" if base_rtl else "L"
    types = _fallback_types(line)
    size = len(types)

    # W7: numbers after L (or an LTR start) behave like L
    last_strong = base_dir
    for i, kind in enumerate(types):
        if kind in ("L", "R"):
            last_strong = kind
        elif kind == "EN" and last_strong == "L":
            types[i] = "L"

    # N1/N2: neutrals between equal directions take that direction
    def strong(kind: str) -> str | None:
        if kind == "L":
            return "L"
        if kind in ("R", "EN"):
            return "R"
        return None

    resolved = list(types)
    i = 0
    while i < size:
        if strong(types[i]) is not None:
            i += 1
            continue
        j = i
        while j < size and strong(types[j]) is None:
            j += 1
        before = strong(types[i - 1]) if i > 0 else base_dir
        after = strong(types[j]) if j < size else base_dir
        direction = (
            before if before is not None and before == after else base_dir
        )
        for m in range(i, j):
            resolved[m] = direction
        i = j

    # I1/I2: implicit levels
    levels = []
    for kind in resolved:
        if base == 0:
            levels.append({"L": 0, "R": 1, "EN": 2}.get(kind, 0))
        else:
            levels.append({"L": 2, "R": 1, "EN": 2}.get(kind, 1))

    # L1: trailing whitespace takes the paragraph level
    for i in range(size - 1, -1, -1):
        if unicodedata.bidirectional(line[i]) in ("WS", "S", "B", "BN"):
            levels[i] = base
        else:
            break

    # L2: reverse runs from the highest level down to the lowest odd one
    order = list(range(size))
    if levels:
        highest = max(levels)
        odd_levels = [lv for lv in levels if lv % 2]
        lowest_odd = min(odd_levels) if odd_levels else highest + 1
        for level in range(highest, lowest_odd - 1, -1):
            i = 0
            while i < size:
                if levels[order[i]] >= level:
                    j = i
                    while j < size and levels[order[j]] >= level:
                        j += 1
                    order[i:j] = reversed(order[i:j])
                    i = j
                else:
                    i += 1

    # L4: mirror brackets at odd levels
    chars = []
    for index in order:
        char = line[index]
        if levels[index] % 2:
            char = _MIRROR.get(char, char)
        chars.append(char)
    return "".join(chars), tuple(order)


def _reorder_impl(line: str, base_rtl: bool) -> tuple[str, tuple[int, ...]]:
    if _bidi_algorithm is not None:
        return _python_bidi_reorder(line, base_rtl)
    return _fallback_reorder(line, base_rtl)  # pragma: no cover


@lru_cache(maxsize=2048)
def reorder(line: str, base_rtl: bool) -> tuple[VisualStr, tuple[int, ...]]:
    """
    Convert ONE already-wrapped logical line to visual order.

    Returns:
        The visual string and a tuple mapping each visual index to the
        logical index of the character drawn there.
    """
    if not needs_bidi(line, base_rtl):
        return VisualStr(line), tuple(range(len(line)))
    visual, mapping = _reorder_impl(str(line), base_rtl)
    return VisualStr(visual), mapping


def to_visual(line: str, base_rtl: bool) -> VisualStr:
    """Apply the bidi algorithm to one already-wrapped line."""
    return reorder(line, base_rtl)[0]


def ensure_visual(text: str) -> str:
    """
    Visual form of a single-line label.

    No-op for a :class:`VisualStr` (already converted) and for text
    without RTL letters, so LTR text is never touched.
    """
    if isinstance(text, VisualStr) or not is_rtl_text(text):
        return text
    return to_visual(text, paragraph_is_rtl(text))
