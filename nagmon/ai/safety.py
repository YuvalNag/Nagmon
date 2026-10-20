# SPDX-License-Identifier: GPL-3.0
"""Local safety layer for kid-facing AI (SDD_AI §7).

Input is checked *before* anything leaves the computer; output is
checked before a child sees it. Matching is by words (after removing
Hebrew prefix letters), so "להרוג" is caught but "מתמטיקה" is not.
A trailing ``*`` in a term means "word starts with".
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from nagmon.ai.text import (
    EMAIL_RE,
    URL_RE,
    clean_text,
    hebrew_ratio,
    tokens,
    variants,
)

MAX_INPUT_CHARS = 120
MAX_OUTPUT_SENTENCES = 3
MAX_OUTPUT_WORDS = 60
MAX_OUTPUT_CHARS = 300
MIN_HEBREW_RATIO = 0.7

MSG_PII = (
    "אסור לספר לינשוף פרטים אישיים, כמו שם, כתובת או טלפון. "
    "אפשר לשאול שאלה אחרת!"
)
MSG_DISTRESS = (
    "זה נשמע חשוב. כדאי לספר עכשיו לאמא, לאבא או למבוגר אחר שסומכים עליו."
)
MSG_TOPIC = "זו שאלה טובה לשאול את ההורים."
MSG_TOO_LONG = "השאלה ארוכה מדי. אפשר לשאול אותה בקצרה?"
MSG_EMPTY = "לא שמעתי שאלה. אפשר לנסות שוב?"

BANNED_TOPICS: dict[str, tuple[str, ...]] = {
    "violence": (
        "להרוג",
        "הורג",
        "הרג",
        "נהרג*",
        "רצח*",
        "לרצוח",
        "נרצח*",
        "פצצה",
        "פצצות",
        "נשק",
        "אקדח*",
        "לירות",
        "מלחמה",
        "מלחמות",
        "טרור*",
        "מחבל*",
        "לדקור",
        "kill*",
        "murder*",
        "gun",
        "guns",
        "weapon*",
        "bomb*",
        "war",
        "wars",
        "terror*",
        "shoot*",
        "stab*",
        "rifle*",
        "pistol*",
    ),
    "romance": (
        "מאוהב*",
        "להתנשק",
        "התנשק*",
        "נשיקה",
        "נשיקות",
        "רומנטי*",
        "kiss*",
        "boyfriend*",
        "girlfriend*",
        "romance",
        "romantic",
        "crush",
        "dating",
    ),
    "adult": (
        "סקס*",
        "יחסי מין",
        "פורנו*",
        "עירום",
        "עירומה",
        "ערום",
        "sex",
        "sexy",
        "sexual*",
        "porn*",
        "naked",
        "nude*",
    ),
    "scary": (
        "רפאים",
        "שד",
        "שדים",
        "זומבי*",
        "מוות",
        "למות",
        "מתים",
        "קבר",
        "קברים",
        "קברות",
        "סיוט*",
        "ghost*",
        "zombie*",
        "demon*",
        "death",
        "dead",
        "die",
        "dies",
        "dying",
        "horror",
        "corpse*",
        "haunted",
    ),
    "drugs": (
        "סמים",
        "סם",
        "אלכוהול",
        "שיכור*",
        "סיגרי*",
        "לעשן",
        "עישון",
        "drug*",
        "alcohol*",
        "drunk",
        "cigarette*",
        "vape*",
        "beer",
        "vodka",
        "weed",
    ),
    "controversial": (
        "אלוהים",
        "אלוקים",
        "דת",
        "דתות",
        "נצרות",
        "אסלאם",
        "מוסלמים",
        "ישו",
        "אתאיסט*",
        "פוליטיקה",
        "god",
        "gods",
        "religion*",
        "jesus",
        "allah",
        "atheis*",
        "politic*",
    ),
}

DISTRESS_TERMS = (
    "מרביצים לי",
    "מרביץ לי",
    "מרביצה לי",
    "מציקים לי",
    "מציק לי",
    "מציקה לי",
    "פוגעים בי",
    "לפגוע בעצמי",
    "להתאבד",
    "התאבד*",
    "רוצה למות",
    "אף אחד לא אוהב אותי",
    "hurt myself",
    "kill myself",
    "suicide",
    "bullied",
    "bully me",
    "hits me",
)

PII_TERMS = (
    "רחוב",
    "רח'",
    "שדרות",
    "כתובת",
    "אני גר",
    "אני גרה",
    "אנחנו גרים",
    "קוראים לי",
    "השם שלי",
    "שמי",
    "טלפון שלי",
    "street",
    "avenue",
    "address",
    "i live",
    "my name",
    "my phone",
)

PERSONAL_QUESTION_TERMS = (
    "איך קוראים לך",
    "מה שמך",
    "מה השם שלך",
    "איפה אתה גר",
    "איפה את גרה",
    "איפה אתם גרים",
    "בן כמה אתה",
    "בת כמה את",
    "באיזה בית ספר",
    "מה הכתובת",
    "מספר הטלפון",
    "what is your name",
    "what's your name",
    "where do you live",
    "how old are you",
)

LONG_NUMBER_RE = re.compile(r"\d[\d\-\s.]{5,}\d")
MARKDOWN_LINK_RE = re.compile(r"\[([^\]]*)\]\([^)]*\)")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def _compile(term: str) -> tuple[str, ...]:
    return tuple(term.lower().split())


# Ordinary words that look like a banned word once a prefix letter is
# removed ("שלמות" -> "למות", "שירי" -> "ירי", "שמת" -> "מת").
ALLOWED_WORDS = frozenset({"שלמות", "השלמות", "בשלמות", "שירי", "שמת", "ששמת"})


def word_matches(pattern: str, token: str) -> bool:
    if token in ALLOWED_WORDS:
        return False
    for form in variants(token):
        if pattern.endswith("*"):
            if form.startswith(pattern[:-1]):
                return True
        elif form == pattern:
            return True
    return False


def find_term(text: str, terms: Iterable[str]) -> str | None:
    """The first term found in ``text`` (word-based), or None."""
    toks = tokens(text)
    for term in terms:
        words = _compile(term)
        if not words:
            continue
        for i in range(len(toks) - len(words) + 1):
            if word_matches(words[0], toks[i]) and all(
                word_matches(w, toks[i + j]) or w == toks[i + j]
                for j, w in enumerate(words[1:], start=1)
            ):
                return term
    return None


def contains_long_number(text: str) -> bool:
    for match in LONG_NUMBER_RE.finditer(text):
        if sum(ch.isdigit() for ch in match.group()) >= 7:
            return True
    return False


@dataclass(frozen=True)
class SafetyVerdict:
    ok: bool
    category: str | None = None  # pii | distress | topic | too_long | empty
    message_he: str = ""
    alert: bool = False
    topic: str | None = None


@dataclass(frozen=True)
class OutputVerdict:
    ok: bool
    text: str
    reason: str | None = None


class Safety:
    def __init__(
        self,
        extra_banned: Sequence[str] = (),
        *,
        max_input_chars: int = MAX_INPUT_CHARS,
    ) -> None:
        self.topics = {k: tuple(v) for k, v in BANNED_TOPICS.items()}
        if extra_banned:
            self.topics["parent"] = tuple(extra_banned)
        self.max_input_chars = max_input_chars

    # -- shared lexicon -------------------------------------------------
    def find_banned(self, text: str) -> tuple[str, str] | None:
        """(category, term) of the first banned word in ``text``."""
        for category, terms in self.topics.items():
            term = find_term(text, terms)
            if term:
                return category, term
        term = find_term(text, DISTRESS_TERMS)
        if term:
            return "distress", term
        return None

    # -- input ------------------------------------------------------------
    def check_input(self, text: str) -> SafetyVerdict:
        cleaned = clean_text(text)
        if not cleaned:
            return SafetyVerdict(False, "empty", MSG_EMPTY)
        if len(cleaned) > self.max_input_chars:
            return SafetyVerdict(False, "too_long", MSG_TOO_LONG)
        if (
            EMAIL_RE.search(cleaned)
            or URL_RE.search(cleaned)
            or contains_long_number(cleaned)
            or find_term(cleaned, PII_TERMS)
        ):
            return SafetyVerdict(False, "pii", MSG_PII)
        if find_term(cleaned, DISTRESS_TERMS):
            return SafetyVerdict(False, "distress", MSG_DISTRESS, alert=True)
        for category, terms in self.topics.items():
            if find_term(cleaned, terms):
                return SafetyVerdict(False, "topic", MSG_TOPIC, topic=category)
        return SafetyVerdict(True)

    # -- output -----------------------------------------------------------
    def clean_output(self, text: str) -> str:
        text = MARKDOWN_LINK_RE.sub(r"\1", text or "")
        text = URL_RE.sub("", text)
        text = re.sub(r"[*#`>|~]+", "", text)
        text = "".join(
            ch for ch in text if unicodedata.category(ch) not in ("So", "Sk")
        )
        text = clean_text(text)
        text = re.sub(r"\(\s*\)", "", text)
        text = re.sub(r"\s+([.,!?:;])", r"\1", text)
        return re.sub(r"\s+", " ", text).strip(" -–:")

    def check_output(
        self, text: str, *, question_is_hebrew: bool = True
    ) -> OutputVerdict:
        cleaned = self.clean_output(text)
        if not cleaned:
            return OutputVerdict(False, "", "empty")
        if find_term(cleaned, PERSONAL_QUESTION_TERMS):
            return OutputVerdict(False, cleaned, "personal_question")
        if self.find_banned(cleaned):
            return OutputVerdict(False, cleaned, "banned")
        if EMAIL_RE.search(cleaned):
            return OutputVerdict(False, cleaned, "banned")
        if question_is_hebrew and hebrew_ratio(cleaned) < MIN_HEBREW_RATIO:
            return OutputVerdict(False, cleaned, "not_hebrew")
        sentences = [s for s in SENTENCE_SPLIT_RE.split(cleaned) if s]
        trimmed = " ".join(sentences[:MAX_OUTPUT_SENTENCES])
        if (
            len(trimmed.split()) > MAX_OUTPUT_WORDS
            or len(trimmed) > MAX_OUTPUT_CHARS
        ):
            return OutputVerdict(False, trimmed, "too_long")
        return OutputVerdict(True, trimmed)
