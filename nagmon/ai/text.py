# SPDX-License-Identifier: GPL-3.0
"""Small Hebrew/English text helpers shared by validation and safety."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterator

# Niqqud and cantillation, keeping maqaf (U+05BE), paseq (U+05C0),
# sof pasuq (U+05C3) and nun hafukha (U+05C6).
NIQQUD_RE = re.compile("[֑-ׇֽֿׁׂׅׄ]")
HEBREW_LETTER_RE = re.compile("[א-ת]")
URL_RE = re.compile(
    r"(?:https?://|www\.)\S+"
    r"|\b[\w.-]+\.(?:com|net|org|il|io|ai|info|biz|co|me|app|ly|gov|edu)"
    r"(?:/\S*)?\b",
    re.IGNORECASE,
)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
TOKEN_RE = re.compile(r"[a-z]+(?:'[a-z]+)?|[א-ת]+(?:[\"׳״'][א-ת]*)?|\d+")
HEBREW_PREFIXES = "והבכלמש"


def strip_niqqud(text: str) -> str:
    return NIQQUD_RE.sub("", text)


def clean_text(value: object) -> str:
    """Remove niqqud, control and bidi/format characters; collapse
    whitespace. Non-strings become ``""``."""
    if not isinstance(value, str):
        return ""
    text = strip_niqqud(unicodedata.normalize("NFC", value))
    out = []
    for ch in text:
        cat = unicodedata.category(ch)
        if ch in "\t\n\r\v\f":
            out.append(" ")
        elif cat in ("Cc", "Cf", "Cs", "Co", "Cn"):
            continue
        else:
            out.append(ch)
    return re.sub(r"\s+", " ", "".join(out)).strip()


def has_hebrew(text: str) -> bool:
    return bool(HEBREW_LETTER_RE.search(text))


def hebrew_ratio(text: str) -> float:
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return 0.0
    heb = sum(1 for ch in letters if "א" <= ch <= "ת")
    return heb / len(letters)


def tokens(text: str) -> list[str]:
    text = strip_niqqud(text).lower().replace("׳", "'").replace("״", '"')
    return TOKEN_RE.findall(text)


def variants(token: str) -> Iterator[str]:
    """The token, and the token without up to three Hebrew prefix
    letters (ו, ה, ב, כ, ל, מ, ש), keeping at least two letters."""
    yield token
    rest = token
    for _ in range(3):
        if len(rest) > 2 and rest[0] in HEBREW_PREFIXES:
            rest = rest[1:]
            yield rest
        else:
            break


def normalize_for_compare(text: str) -> str:
    return " ".join(tokens(text))
