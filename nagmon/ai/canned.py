# SPDX-License-Identifier: GPL-3.0
"""Offline, parent-approved owl answers (``owl_faq.yaml``, SDD_AI §8)."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import yaml

from nagmon import mod_dir
from nagmon.ai.safety import find_term, word_matches
from nagmon.ai.text import normalize_for_compare, tokens, variants

MIN_COVERAGE = 0.6
STOPWORDS = frozenset(
    """למה מה מי איך איפה מאיפה לאן מתי כמה האם זה זו זאת יש אין של את
    על עם הוא היא הם הן אני אתה אנחנו לנו לי לך כל כך אז בעצם היום
    עכשיו הכי גם רק עוד אבל או כי באמת ממש קצת the a an is are why
    what how do does""".split()
)


def content_tokens(text: str) -> list[str]:
    """Words of ``text`` without question words and fillers."""
    return [t for t in tokens(text) if not _is_stopword(t)]


def _is_stopword(token: str) -> bool:
    if token in STOPWORDS:
        return True
    # "ולמה", "שאיך"... but not "ברק" -> "רק"
    return any(len(v) >= 3 and v in STOPWORDS for v in variants(token))


def _same_word(a: str, b: str) -> bool:
    return bool(set(variants(a)) & set(variants(b)))


DEFAULT_FALLBACK_HE = (
    "הממ... על זה אני צריך לחשוב. אפשר לשאול את ההורים, או לנסות שאלה אחרת."
)
DEFAULT_SLEEPY_HE = "הינשוף נח קצת עכשיו."
DEFAULT_FAQ_PATH = mod_dir() / "learning" / "owl_faq.yaml"


@dataclass(frozen=True)
class CannedItem:
    id: str
    q_he: str
    a_he: str
    keywords: tuple[str, ...]
    min_age: int = 5
    topic: str = ""


class CannedAnswers:
    def __init__(
        self,
        items: Sequence[CannedItem] = (),
        *,
        fallback_he: str = DEFAULT_FALLBACK_HE,
        sleepy_he: str = DEFAULT_SLEEPY_HE,
    ) -> None:
        self.items = list(items)
        self.fallback_he = fallback_he
        self.sleepy_he = sleepy_he
        self._exact = {normalize_for_compare(i.q_he): i for i in self.items}

    @classmethod
    def load(cls, path: Path | str | None = None) -> CannedAnswers:
        """Load the FAQ file; a missing or broken file gives no items."""
        try:
            text = Path(path or DEFAULT_FAQ_PATH).read_text(encoding="utf-8")
            data = yaml.safe_load(text) or {}
        except (OSError, yaml.YAMLError):
            return cls()
        items = []
        for raw in data.get("items") or []:
            if not isinstance(raw, dict) or not raw.get("q_he"):
                continue
            items.append(
                CannedItem(
                    id=str(raw.get("id", "")),
                    q_he=str(raw["q_he"]),
                    a_he=str(raw.get("a_he", "")),
                    keywords=tuple(str(k) for k in raw.get("keywords") or ()),
                    min_age=int(raw.get("min_age", 5)),
                    topic=str(raw.get("topic", "")),
                )
            )
        return cls(
            items,
            fallback_he=str(data.get("fallback_he") or DEFAULT_FALLBACK_HE),
            sleepy_he=str(data.get("sleepy_he") or DEFAULT_SLEEPY_HE),
        )

    def exact(self, question: str) -> CannedItem | None:
        return self._exact.get(normalize_for_compare(question))

    def match(self, question: str) -> CannedItem | None:
        """Best item by word overlap, or None.

        An item matches when the question hits at least one of its
        keywords and at least 60% of the question's content words (not
        "למה", "איך"...) appear in the item's keywords or question.
        """
        content = content_tokens(question)
        if not content:
            return None
        best: tuple[float, int, int] | None = None
        best_item = None
        for index, item in enumerate(self.items):
            hits = sum(1 for k in item.keywords if find_term(question, [k]))
            if not hits:
                continue
            own = content_tokens(item.q_he)
            matched = sum(
                1
                for token in content
                if any(word_matches(k, token) for k in item.keywords)
                or any(_same_word(token, o) for o in own)
            )
            ratio = matched / len(content)
            if ratio < MIN_COVERAGE:
                continue
            score = (ratio, hits, -index)
            if best is None or score > best:
                best, best_item = score, item
        return best_item

    def menu(self, age: int) -> list[str]:
        return [item.q_he for item in self.items if item.min_age <= age]
