"""Question model and answer checking (SDD_ARCHITECTURE section 3)."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Any, Literal

Subject = Literal[
    "math", "geometry", "english", "science", "logic", "hebrew", "family"
]
QuestionKind = Literal[
    "choice", "number", "true_false", "order", "tap_figure", "letters"
]
SUBJECTS: tuple[str, ...] = (
    "math",
    "geometry",
    "english",
    "science",
    "logic",
    "hebrew",
    "family",
)
CHOICE_KINDS = frozenset({"choice", "true_false", "tap_figure"})

TRUE_ID = "true"
FALSE_ID = "false"


@dataclass(frozen=True)
class Choice:
    id: str
    text_he: str
    text_en: str | None = None
    image: str | None = None


@dataclass(frozen=True)
class Figure:
    """Drawing spec. The UI draws it; the engine only describes it."""

    kind: str
    data: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Question:
    item_id: str
    skill_id: str
    subject: str
    kind: str
    prompt_he: str
    prompt_en: str | None
    answer: str | tuple[str, ...]
    choices: tuple[Choice, ...] = ()
    figure: Figure | None = None
    speak: Mapping[str, str] = field(default_factory=dict)
    explanation_he: str = ""
    explanation_en: str | None = None
    difficulty: float = 0.0
    misconceptions: Mapping[str, str] = field(default_factory=dict)
    source: str = "generator"
    # Extension: seed, calc, fraction_form, word, worked_example, bucket...
    meta: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CheckResult:
    correct: bool
    normalized: str | tuple[str, ...] | None
    misconception: str | None = None


def true_false_choices() -> tuple[Choice, Choice]:
    return (
        Choice(TRUE_ID, "נכון", "True"),
        Choice(FALSE_ID, "לא נכון", "False"),
    )


# --------------------------------------------------------------------------
# Normalization
# --------------------------------------------------------------------------

_BIDI = re.compile("[\u200e\u200f\u202a-\u202e\u2066-\u2069\u061c]")
_NIQQUD = re.compile("[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]")
_SPACES = re.compile(r"\s+")
_EDGE_PUNCT = ".,!?;:\"'`()[]{}״׳-\u2013\u2014…"
_MINUSES = "\u2212\u2013\u2014\u2012\u05be"
_NUM_STRIP = "₪%°$"
_INT = r"\d+"
_DEC = r"(?:\d+(?:\.\d*)?|\.\d+)"
_RE_DEC = re.compile(rf"^([+-]?)({_DEC})$")
_RE_FRAC = re.compile(rf"^([+-]?)({_INT})\s*/\s*({_INT})$")
_RE_MIXED = re.compile(rf"^([+-]?)({_INT})\s+({_INT})\s*/\s*({_INT})$")
_RE_THOUSANDS = re.compile(r"^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$")


def normalize_text(text: str) -> str:
    """NFKC, no bidi marks, no niqqud, collapsed spaces, trimmed punctuation.

    Hebrew is left as is; Latin text is casefolded separately by callers
    that compare (see ``_text_key``).
    """
    s = unicodedata.normalize("NFKC", str(text))
    s = _BIDI.sub("", s)
    s = _NIQQUD.sub("", s)
    s = _SPACES.sub(" ", s).strip()
    s = s.strip(_EDGE_PUNCT).strip()
    return s


def _text_key(text: str) -> str:
    return normalize_text(text).casefold()


def _clean_number_text(text: str) -> str:
    s = unicodedata.normalize("NFKC", str(text))
    s = _BIDI.sub("", s)
    for m in _MINUSES:
        s = s.replace(m, "-")
    s = _SPACES.sub(" ", s).strip()
    s = s.strip(_NUM_STRIP).strip()
    s = s.replace("שקלים", "").replace('ש"ח', "").strip()
    if _RE_THOUSANDS.match(s):
        s = s.replace(",", "")
    elif s.count(",") == 1 and "." not in s:
        s = s.replace(",", ".")
    return s


def parse_number(text: Any) -> Fraction | None:
    """Parse an integer, decimal, fraction or mixed number exactly."""
    if text is None:
        return None
    if isinstance(text, bool):
        return None
    if isinstance(text, int):
        return Fraction(text)
    if isinstance(text, Fraction):
        return text
    s = _clean_number_text(str(text))
    m = _RE_DEC.match(s)
    if m:
        sign, body = m.groups()
        value = Fraction(body)
        return -value if sign == "-" else value
    m = _RE_FRAC.match(s)
    if m:
        sign, num, den = m.groups()
        if int(den) == 0:
            return None
        value = Fraction(int(num), int(den))
        return -value if sign == "-" else value
    m = _RE_MIXED.match(s)
    if m:
        sign, whole, num, den = m.groups()
        if int(den) == 0:
            return None
        value = int(whole) + Fraction(int(num), int(den))
        return -value if sign == "-" else value
    return None


def _is_terminating(value: Fraction) -> bool:
    d = value.denominator
    for p in (2, 5):
        while d % p == 0:
            d //= p
    return d == 1


def format_number(value: Fraction | int, *, style: str = "auto") -> str:
    """Canonical text for a number.

    ``style``: "auto" (int, else terminating decimal, else p/q),
    "decimal" or "fraction".
    """
    v = Fraction(value)
    if v.denominator == 1:
        return str(v.numerator)
    if style == "fraction" or (style == "auto" and not _is_terminating(v)):
        return f"{v.numerator}/{v.denominator}"
    sign = "-" if v < 0 else ""
    v = abs(v)
    whole = v.numerator // v.denominator
    rest = v - whole
    digits = ""
    while rest and len(digits) < 12:
        rest *= 10
        d = rest.numerator // rest.denominator
        digits += str(d)
        rest -= d
    return f"{sign}{whole}.{digits}" if digits else f"{sign}{whole}"


def normalize_number(text: Any) -> str | None:
    """Clean number text while keeping its form.

    "07" -> "7", "3.50" -> "3.5", "1,000" -> "1000", "2/4" -> "2/4"
    (not reduced), "1 1/2" -> "3/2" (mixed becomes improper).
    """
    if text is None:
        return None
    s = _clean_number_text(str(text))
    value = parse_number(s)
    if value is None:
        return None
    m = _RE_FRAC.match(s)
    if m:
        sign, num, den = m.groups()
        num_i, den_i = int(num), int(den)
        neg = sign == "-" and num_i != 0
        return f"{'-' if neg else ''}{num_i}/{den_i}"
    if _RE_MIXED.match(s):
        return f"{value.numerator}/{value.denominator}"
    return format_number(value, style="decimal")


# --------------------------------------------------------------------------
# Checking
# --------------------------------------------------------------------------

_TRUE_WORDS = {"true", "נכון", "כן", "yes", "t", "1", "אמת"}
_FALSE_WORDS = {"false", "לא נכון", "לא", "no", "f", "0", "שקר"}


def _match_choice(q: Question, given: Any) -> str | None:
    if given is None:
        return None
    raw = str(given)
    ids = {c.id for c in q.choices}
    if raw in ids:
        return raw
    key = _text_key(raw)
    if q.kind == "true_false":
        if key in _TRUE_WORDS:
            return TRUE_ID
        if key in _FALSE_WORDS:
            return FALSE_ID
    for c in q.choices:
        if key == _text_key(c.id):
            return c.id
    for c in q.choices:
        if key == _text_key(c.text_he):
            return c.id
        if c.text_en and key == _text_key(c.text_en):
            return c.id
    return None


def _number_misconception(q: Question, value: Fraction) -> str | None:
    for wrong, tag in q.misconceptions.items():
        if parse_number(wrong) == value:
            return tag
    return None


def check_answer(
    q: Question, given: str | Sequence[str] | None
) -> CheckResult:
    """Compare ``given`` with ``q.answer`` (see SDD_LEARNING section 3)."""
    if given is None:
        return CheckResult(False, None, None)
    if q.kind == "order":
        if isinstance(given, str):
            seq = tuple(p.strip() for p in given.split(",") if p.strip())
        else:
            seq = tuple(str(x) for x in given)
        expected = tuple(q.answer)
        ok = seq == expected
        return CheckResult(
            ok, seq, None if ok else q.misconceptions.get(",".join(seq))
        )
    if q.kind in CHOICE_KINDS or (q.choices and q.kind != "letters"):
        cid = _match_choice(q, given)
        ok = cid is not None and cid == q.answer
        mis = None if ok or cid is None else q.misconceptions.get(cid)
        return CheckResult(ok, cid, mis)
    if q.kind == "number":
        norm = normalize_number(given)
        value = parse_number(norm) if norm is not None else None
        expected_value = parse_number(q.answer)
        if value is None or expected_value is None:
            return CheckResult(False, norm, None)
        ok = value == expected_value
        if ok and q.meta.get("fraction_form") == "simplest" and norm:
            m = _RE_FRAC.match(norm.lstrip("-"))
            if m:
                _, num, den = m.groups()
                frac = Fraction(int(num), int(den))
                if frac.denominator != int(den):
                    return CheckResult(False, norm, "not_simplified")
        mis = None if ok else _number_misconception(q, value)
        return CheckResult(ok, norm, mis)
    # letters / free text
    if isinstance(given, (list, tuple)):
        given = "".join(str(x) for x in given)
    norm = _text_key(str(given))
    answer = q.answer if isinstance(q.answer, str) else "".join(q.answer)
    ok = norm == _text_key(answer)
    mis = None
    if not ok:
        for wrong, tag in q.misconceptions.items():
            if _text_key(wrong) == norm:
                mis = tag
                break
    return CheckResult(ok, norm, mis)


def display_answer(q: Question) -> str:
    """The correct answer in display form (choice text, number, sequence)."""
    texts = {c.id: c.text_he for c in q.choices}
    if q.kind == "order":
        return ", ".join(texts.get(i, i) for i in q.answer)
    if isinstance(q.answer, str) and q.answer in texts:
        return texts[q.answer]
    if isinstance(q.answer, str):
        return q.answer
    return ", ".join(q.answer)
