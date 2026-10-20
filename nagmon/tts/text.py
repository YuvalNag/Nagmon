# SPDX-License-Identifier: GPL-3.0
"""Prepare game text for speech (SDD_TTS §2.4).

``clean_for_speech`` removes what a voice should not read (placeholders,
markup, emoji) and spells out math and money. ``split_by_language`` cuts
mixed Hebrew/English text so every part is read by a voice of its language.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from nagmon.tts.settings import Lang

HEBREW_CHARS = "֐-׿יִ-ﭏ"
LATIN_CHARS = "A-Za-zÀ-ɏ"
_BLANK = ""  # private-use marker for an unknown in a math question

_WORDS: dict[str, dict[str, str]] = {
    "he": {
        "plus": "ועוד",
        "minus": "פחות",
        "negative": "מינוס",
        "times": "כפול",
        "divided": "חלקי",
        "over": "חלקי",
        "equals": "שווה",
        "percent": "אחוז",
        "less": r"\1 קטן מ-\2",
        "greater": r"\1 גדול מ-\2",
        "blank": "כמה",
        "squared": "בריבוע",
        "cubed": "בשלישית",
        "half": "חצי",
        "and_half": "וחצי",
        "quarter": "רבע",
        "and_quarter": "ורבע",
        "three_quarters": "שלושה רבעים",
        "and_three_quarters": "ושלושה רבעים",
        "one_shekel": "שקל אחד",
        "shekels": "שקלים",
    },
    "en": {
        "plus": "plus",
        "minus": "minus",
        "negative": "minus",
        "times": "times",
        "divided": "divided by",
        "over": "over",
        "equals": "equals",
        "percent": "percent",
        "less": r"\1 is less than \2",
        "greater": r"\1 is greater than \2",
        "blank": "what",
        "squared": "squared",
        "cubed": "cubed",
        "half": "one half",
        "and_half": "and a half",
        "quarter": "one quarter",
        "and_quarter": "and a quarter",
        "three_quarters": "three quarters",
        "and_three_quarters": "and three quarters",
        "one_shekel": "1 shekel",
        "shekels": "shekels",
    },
}

_PLACEHOLDER_RE = re.compile(r"\$\{\{.*?\}\}|\{[^{}]*\}")
_LESS_RE = re.compile(r"(\d)\s*<\s*(\d)")
_GREATER_RE = re.compile(r"(\d)\s*>\s*(\d)")
_TAG_RE = re.compile(r"<[^<>]*>")
_MARKDOWN_RE = re.compile(r"\*\*|`")
_EMOJI_RE = re.compile(
    "["
    "\U0001f000-\U0001faff"  # emoji, symbols, flags
    "⌀-⏿"  # technical (⏩ ⌛)
    "☀-➿"  # misc symbols, dingbats (✓ ☀)
    "⬀-⯿"  # arrows and stars (⭐)
    "︀-️‍⃣"  # variation selectors, joiners
    "\U000e0020-\U000e007f"
    "]"
)
_SEPARATOR_RE = re.compile("[←-⇿·•]")
_BLANK_RE = re.compile("_{2,}|[□▢☐]")
_BLANK_AFTER_OP_RE = re.compile(r"([=+×÷−*\-])\s*\?")
_BLANK_BEFORE_OP_RE = re.compile(r"(?:^|(?<=\s))\?(?=\s*[=+×÷−*\-])")
_NUMBER = r"(\d+(?:[.,]\d+)?)"
_SHEKEL_AFTER_RE = re.compile(_NUMBER + r"\s*₪")
_SHEKEL_BEFORE_RE = re.compile(r"₪\s*" + _NUMBER)
_OPERAND_BEFORE = rf"(?<=[\d){_BLANK}])"
_OPERAND_AFTER = rf"(?=[\d({_BLANK}])"
_FRACTION_RE = re.compile(r"(?<=\d)\s*/\s*(?=\d)")
_TIMES_RE = re.compile(rf"{_OPERAND_BEFORE}\s*[xX*]\s*{_OPERAND_AFTER}")
_COLON_DIVIDE_RE = re.compile(rf"{_OPERAND_BEFORE}\s+:\s+{_OPERAND_AFTER}")
_REPEAT_PUNCT_RE = re.compile(r"([!?,;:])\1+")
_ELLIPSIS_RE = re.compile(r"\.{3,}|…+")
_SPACE_BEFORE_PUNCT_RE = re.compile(r"\s+([,.!?…;])")
_COMMAS_RE = re.compile(r",(?:\s*,)+")
_EDGE_JUNK_RE = re.compile(r"^[\s,;]+|[\s,;]+$")
_PAREN_SPACE_RE = re.compile(r"(?<=\()\s+|\s+(?=\))")


def clean_for_speech(text: str, lang: Lang) -> str:
    """Return ``text`` as a voice in ``lang`` should read it."""
    if not text:
        return ""
    w = _WORDS.get(lang, _WORDS["he"])
    text = _PLACEHOLDER_RE.sub(" ", text)
    text = _LESS_RE.sub(w["less"], text)
    text = _GREATER_RE.sub(w["greater"], text)
    text = _TAG_RE.sub(" ", text)
    text = _MARKDOWN_RE.sub("", text)
    text = _EMOJI_RE.sub(" ", text)
    text = _SEPARATOR_RE.sub(", ", text)
    text = _BLANK_RE.sub(_BLANK, text)
    text = _BLANK_AFTER_OP_RE.sub(rf"\1 {_BLANK}?", text)
    text = _BLANK_BEFORE_OP_RE.sub(_BLANK, text)
    text = _speak_money(text, w)
    text = _speak_vulgar_fractions(text, w)
    text = text.replace("%", f" {w['percent']} ")
    text = _FRACTION_RE.sub(f" {w['over']} ", text)
    text = text.replace("×", f" {w['times']} ")
    text = _TIMES_RE.sub(f" {w['times']} ", text)
    text = text.replace("÷", f" {w['divided']} ")
    text = _COLON_DIVIDE_RE.sub(f" {w['divided']} ", text)
    text = text.replace("+", f" {w['plus']} ")
    text = _speak_minus(text, w)
    text = text.replace("=", f" {w['equals']} ")
    text = text.replace(_BLANK, f" {w['blank']} ")
    text = text.replace("*", " ")
    text = _REPEAT_PUNCT_RE.sub(r"\1", text)
    text = _ELLIPSIS_RE.sub("…", text)
    text = " ".join(text.split())
    text = _SPACE_BEFORE_PUNCT_RE.sub(r"\1", text)
    text = _COMMAS_RE.sub(",", text)
    text = _PAREN_SPACE_RE.sub("", text)
    text = _EDGE_JUNK_RE.sub("", text)
    if not any(ch.isalnum() for ch in text):
        return ""
    return text


def _speak_money(text: str, w: dict[str, str]) -> str:
    def amount(match: re.Match[str]) -> str:
        number = match.group(1)
        if number == "1":
            return f" {w['one_shekel']} "
        return f" {number} {w['shekels']} "

    text = _SHEKEL_AFTER_RE.sub(amount, text)
    text = _SHEKEL_BEFORE_RE.sub(amount, text)
    return text.replace("₪", f" {w['shekels']} ")


def _speak_vulgar_fractions(text: str, w: dict[str, str]) -> str:
    for char, alone, joined in (
        ("½", "half", "and_half"),
        ("¼", "quarter", "and_quarter"),
        ("¾", "three_quarters", "and_three_quarters"),
    ):
        text = re.sub(rf"(\d)\s*{char}", rf"\1 {w[joined]} ", text)
        text = text.replace(char, f" {w[alone]} ")
    text = text.replace("²", f" {w['squared']} ")
    return text.replace("³", f" {w['cubed']} ")


def _is_operand(ch: str, *, before: bool) -> bool:
    if not ch:
        return False
    return ch.isdigit() or ch == _BLANK or ch == (")" if before else "(")


def _speak_minus(text: str, w: dict[str, str]) -> str:
    """Read ``-``/``−`` as minus only where it is math, not a word hyphen."""
    out: list[str] = []
    for i, ch in enumerate(text):
        if ch not in "-−":
            out.append(ch)
            continue
        prev_operand = _is_operand(text[:i].rstrip()[-1:], before=True)
        next_operand = _is_operand(text[i + 1 :].lstrip()[:1], before=False)
        just_before = text[i - 1] if i else ""
        just_after = text[i + 1 : i + 2]
        if prev_operand and next_operand:
            out.append(f" {w['minus']} ")
        elif (
            just_after.isdigit()
            and not prev_operand
            and not just_before.isalpha()
        ):
            out.append(f" {w['negative']} ")
        elif ch == "−":
            out.append(f" {w['minus']} ")
        else:
            out.append(ch)
    return "".join(out)


# --- language segments -------------------------------------------------------


@dataclass(frozen=True)
class Segment:
    lang: Lang
    text: str


_WORD_RE = re.compile(
    rf"(?P<he>[{HEBREW_CHARS}]+(?:['\"][{HEBREW_CHARS}]+)*)"
    rf"|(?P<en>[{LATIN_CHARS}]+(?:['’\-][{LATIN_CHARS}]+)*)"
)


def _has_content(text: str) -> bool:
    return any(ch.isalnum() for ch in text)


def split_by_language(text: str, base_lang: Lang) -> list[Segment]:
    """Cut ``text`` into runs of Hebrew and English words.

    Numbers and punctuation join the words around them; between a Hebrew and
    an English word they stay with ``base_lang`` ("קיבלת 3 potions" reads
    the number in Hebrew).
    """
    tokens: list[tuple[Lang | None, str]] = []
    pos = 0
    for match in _WORD_RE.finditer(text):
        if match.start() > pos:
            tokens.append((None, text[pos : match.start()]))
        tokens.append(("he" if match.group("he") else "en", match.group()))
        pos = match.end()
    if pos < len(text):
        tokens.append((None, text[pos:]))

    if not any(lang for lang, _ in tokens):
        stripped = text.strip()
        return [Segment(base_lang, stripped)] if _has_content(text) else []

    merged: list[list] = []
    for i, (lang, part) in enumerate(tokens):
        if lang is None:
            prev = next((t[0] for t in reversed(tokens[:i]) if t[0]), None)
            nxt = next((t[0] for t in tokens[i + 1 :] if t[0]), None)
            if prev is None or nxt is None:
                lang = prev or nxt
            else:
                lang = prev if prev == nxt else base_lang
        if merged and merged[-1][0] == lang:
            merged[-1][1] += part
        else:
            merged.append([lang, part])
    return [
        Segment(lang, part.strip())
        for lang, part in merged
        if _has_content(part)
    ]


# --- chunking ------------------------------------------------------------------

_SENTENCE_END_RE = re.compile(r"(?<=[.!?…])\s+")


def chunk_text(text: str, max_len: int = 200) -> list[str]:
    """Split long text at sentence ends so speech can start sooner."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= max_len:
        return [text]
    pieces: list[str] = []
    for sentence in _SENTENCE_END_RE.split(text):
        if len(sentence) <= max_len:
            pieces.append(sentence)
        else:
            pieces.extend(_split_words(sentence, max_len))
    return _pack(pieces, max_len)


def _split_words(sentence: str, max_len: int) -> list[str]:
    words: list[str] = []
    for word in sentence.split():
        while len(word) > max_len:
            words.append(word[:max_len])
            word = word[max_len:]
        words.append(word)
    return _pack(words, max_len)


def _pack(pieces: list[str], max_len: int) -> list[str]:
    chunks: list[str] = []
    current = ""
    for piece in pieces:
        if not current:
            current = piece
        elif len(current) + 1 + len(piece) <= max_len:
            current = f"{current} {piece}"
        else:
            chunks.append(current)
            current = piece
    if current:
        chunks.append(current)
    return chunks
