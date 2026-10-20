"""English vocabulary generator ``english.vocab`` (SDD_LEARNING section 16).

Driven by ``english/words.yaml`` (SDD_CONTENT section 4). A skill names
``{topics, level, modes}``; the content library hands the generator a
:class:`VocabPool` with the words of that level and those topics in
``params["_pool"]``.

The generator first picks the *word* and then the *mode*, and the item id
is ``english.vocab:<slug>.<pos>.<mode>``, so Elo offsets and Leitner cards
follow each (word, mode) pair.
"""

from __future__ import annotations

import random
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from nagmon.learning.generators.common import (
    GenContext,
    Opt,
    _base,
    emoji,
    generator,
    n_options,
    options_question,
)
from nagmon.learning.model import Choice, Figure, Question

LEVELS: tuple[str, ...] = ("preA1", "A1", "A2", "B1")
LEVEL_FIRST_GRADE = {"preA1": 0, "A1": 3, "A2": 5, "B1": 7}
VOCAB_MODES: tuple[str, ...] = (
    "picture_to_word",
    "word_to_translation",
    "listen_to_picture",
    "spelling",
    "sentence_cloze",
)
PICTURE_MODES = frozenset({"picture_to_word", "listen_to_picture"})
# word_to_translation covers both directions; each has its own item id.
_VARIANTS = {
    "word_to_translation": ("word_to_translation", "translation_to_word")
}
_DIFFICULTY = {
    "listen_to_picture": -0.8,
    "picture_to_word": -0.5,
    "word_to_translation": -0.2,
    "translation_to_word": 0.2,
    "sentence_cloze": 0.4,
    "spelling": 0.6,
}
_SPELLING = re.compile(r"[A-Za-z]{2,10}")
_ALPHABET = "abcdefghijklmnopqrstuvwxyz"
_SLUG = re.compile(r"[^a-z0-9]+")
EXPLANATION_LIMIT = 200
PROMPT_LIMIT = 140

__all__ = [
    "LEVELS",
    "VOCAB_MODES",
    "VocabPool",
    "VocabWord",
    "parse_words",
    "validate_vocab_params",
    "vocab",
]


@dataclass(frozen=True)
class VocabWord:
    word: str
    he: str
    pos: str
    topic: str
    level: str
    grade: int = 0
    emoji: str | None = None
    example_en: str = ""
    example_he: str = ""

    @property
    def slug(self) -> str:
        return _SLUG.sub("_", self.word.lower()).strip("_") or "word"


# --------------------------------------------------------------------------
# Loading and validation
# --------------------------------------------------------------------------


def parse_word(raw: Any) -> tuple[VocabWord | None, list[str]]:
    """One SDD_CONTENT section 4 entry, or the reasons it is invalid."""
    if not isinstance(raw, Mapping):
        return None, ["word entry must be a mapping"]
    errors = []
    word = raw.get("word")
    if not isinstance(word, str) or not word.strip():
        return None, ["word is missing"]
    for key in ("he", "topic", "pos"):
        if not isinstance(raw.get(key), str) or not raw[key].strip():
            errors.append(f"{word}: {key} is missing")
    if raw.get("level") not in LEVELS:
        errors.append(f"{word}: level must be one of {', '.join(LEVELS)}")
    code = raw.get("emoji")
    if code is not None and not isinstance(code, str):
        errors.append(f"{word}: emoji must be a code or null")
    grade = raw.get("grade", 0)
    if not isinstance(grade, int) or isinstance(grade, bool):
        errors.append(f"{word}: grade must be an integer")
    if errors:
        return None, errors
    return (
        VocabWord(
            word=word.strip(),
            he=str(raw["he"]).strip(),
            pos=str(raw["pos"]).strip(),
            topic=str(raw["topic"]).strip(),
            level=str(raw["level"]),
            grade=int(grade),
            emoji=code or None,
            example_en=str(raw.get("example_en") or "").strip(),
            example_he=str(raw.get("example_he") or "").strip(),
        ),
        [],
    )


def parse_words(doc: Any) -> tuple[list[VocabWord], list[str]]:
    """All entries of a words file; duplicates of (word, pos) are errors."""
    if doc is None:
        return [], []
    if not isinstance(doc, list):
        return [], ["top level must be a list of words"]
    out: list[VocabWord] = []
    errors: list[str] = []
    seen: set[tuple[str, str]] = set()
    for raw in doc:
        w, errs = parse_word(raw)
        errors.extend(errs)
        if w is None:
            continue
        key = (w.word.lower(), w.pos)
        if key in seen:
            errors.append(f"{w.word}: duplicate (word, pos)")
            continue
        seen.add(key)
        out.append(w)
    return out, errors


def skill_words(
    params: Mapping[str, Any], words: Iterable[VocabWord]
) -> tuple[VocabWord, ...]:
    topics = set(params.get("topics") or ())
    level = params.get("level")
    return tuple(w for w in words if w.level == level and w.topic in topics)


def validate_vocab_params(
    params: Mapping[str, Any], words: Sequence[VocabWord]
) -> list[str]:
    errors = []
    level = params.get("level")
    topics = params.get("topics")
    modes = params.get("modes") or list(VOCAB_MODES)
    if level not in LEVELS:
        errors.append(f"level must be one of {', '.join(LEVELS)}")
    if not isinstance(topics, list) or not topics:
        errors.append("topics must be a non-empty list")
        topics = []
    for m in modes:
        if m not in VOCAB_MODES:
            errors.append(f"unknown vocab mode {m!r}")
    for t in topics:
        if not any(w.level == level and w.topic == t for w in words):
            errors.append(f"no {level} words for topic {t!r}")
    if len(skill_words(params, words)) < 2:
        errors.append("needs at least 2 words")
    return errors


# --------------------------------------------------------------------------
# Pool: candidates and which modes fit a word
# --------------------------------------------------------------------------


def _blank(w: VocabWord) -> str | None:
    """``example_en`` with the word replaced by ___ (whole word, once)."""
    core = w.word.rstrip("?!.")
    if not core or not w.example_en:
        return None
    pattern = re.compile(
        rf"(?<![A-Za-z]){re.escape(core)}(?![A-Za-z])", re.IGNORECASE
    )
    found = list(pattern.finditer(w.example_en))
    if len(found) != 1:
        return None
    m = found[0]
    return w.example_en[: m.start()] + "___" + w.example_en[m.end() :]


class VocabPool:
    """The words of one skill, with memoized mode eligibility."""

    def __init__(self, words: Iterable[VocabWord]) -> None:
        self.words: tuple[VocabWord, ...] = tuple(words)
        self._modes: dict[VocabWord, frozenset[str]] = {}

    def candidates(
        self, w: VocabWord, *, need_emoji: bool = False
    ) -> list[VocabWord]:
        """Words that can stand next to ``w`` without a second answer."""
        out = []
        for d in self.words:
            if d is w or d.word.lower() == w.word.lower() or d.he == w.he:
                continue
            if w.emoji and d.emoji == w.emoji:
                continue
            if need_emoji and not d.emoji:
                continue
            out.append(d)
        return out

    @staticmethod
    def _unique(
        cands: Iterable[VocabWord], k: int, *, need_emoji: bool
    ) -> list[VocabWord]:
        picked: list[VocabWord] = []
        words: set[str] = set()
        hes: set[str] = set()
        codes: set[str] = set()
        for d in cands:
            if len(picked) >= k:
                break
            if d.word.lower() in words or d.he in hes:
                continue
            if need_emoji and d.emoji in codes:
                continue
            picked.append(d)
            words.add(d.word.lower())
            hes.add(d.he)
            if d.emoji:
                codes.add(d.emoji)
        return picked

    def modes_for(self, w: VocabWord) -> frozenset[str]:
        """Concrete modes (both translation directions) that fit ``w``."""
        cached = self._modes.get(w)
        if cached is not None:
            return cached
        text = len(self._unique(self.candidates(w), 2, need_emoji=False))
        modes = set()
        if text >= 1:
            modes.update(("word_to_translation", "translation_to_word"))
            if _blank(w) is not None:
                modes.add("sentence_cloze")
        if w.emoji and text >= 2:
            modes.add("picture_to_word")
        if w.emoji:
            pics = self._unique(
                self.candidates(w, need_emoji=True), 2, need_emoji=True
            )
            if len(pics) >= 2:
                modes.add("listen_to_picture")
        if _SPELLING.fullmatch(w.word):
            modes.add("spelling")
        result = frozenset(modes)
        self._modes[w] = result
        return result

    def distractors(
        self,
        rng: random.Random,
        w: VocabWord,
        k: int,
        *,
        need_emoji: bool = False,
        prefer_pos: bool = False,
    ) -> list[VocabWord]:
        """Same topic first (same part of speech first when asked)."""
        cands = self.candidates(w, need_emoji=need_emoji)

        def tier(d: VocabWord) -> int:
            t = 0 if d.topic == w.topic else 2
            if prefer_pos and d.pos != w.pos:
                t += 1
            return t

        tiers: dict[int, list[VocabWord]] = {}
        for d in cands:
            tiers.setdefault(tier(d), []).append(d)
        ordered: list[VocabWord] = []
        for t in sorted(tiers):
            group = tiers[t]
            rng.shuffle(group)
            ordered.extend(group)
        return self._unique(ordered, k, need_emoji=need_emoji)


# --------------------------------------------------------------------------
# Builders
# --------------------------------------------------------------------------


def _young(ctx: GenContext) -> bool:
    return ctx.age <= 7 if ctx.age is not None else ctx.grade <= 1


def _expand(modes: Iterable[str]) -> list[str]:
    out: list[str] = []
    for m in modes:
        for v in _VARIANTS.get(m, (m,)):
            if v not in out:
                out.append(v)
    return out


def _explanations(w: VocabWord) -> tuple[str, str]:
    base = f"{w.word} = {w.he}."
    he = base
    for cand in (
        f"{base} {w.example_en} ({w.example_he})",
        f"{base} {w.example_en}",
    ):
        if w.example_en and len(cand) <= EXPLANATION_LIMIT:
            he = cand
            break
    en = f'"{w.word}" means {w.he}.'
    if w.example_en:
        en += f" Example: {w.example_en}"
    return he, en


def _difficulty(w: VocabWord, mode: str) -> float:
    d = _DIFFICULTY[mode]
    d += 0.25 * (w.grade - LEVEL_FIRST_GRADE.get(w.level, 0))
    if mode == "spelling":
        d += 0.1 * (len(w.word) - 5)
    return d


def _picture(w: VocabWord) -> Figure | None:
    return (
        Figure("objects", {"emoji": w.emoji, "count": 1}) if w.emoji else None
    )


def _word_opt(w: VocabWord) -> Opt:
    return Opt(w.word, w.word)


def _build_choice(
    rng: random.Random,
    ctx: GenContext,
    w: VocabWord,
    mode: str,
    pool: VocabPool,
) -> Question:
    k = n_options(ctx) - 1
    explanation_he, explanation_en = _explanations(w)
    common: dict[str, Any] = {
        "item_id": f"english.vocab:{w.slug}.{w.pos}.{mode}",
        "explanation_he": explanation_he,
        "explanation_en": explanation_en,
        "difficulty": _difficulty(w, mode),
        "meta": _meta(w, mode),
    }
    if mode == "picture_to_word":
        prompt_he = "איזו מילה באנגלית מתאימה לתמונה?"
        return options_question(
            rng,
            ctx,
            prompt_he=prompt_he,
            prompt_en="Which word matches the picture?",
            correct=_word_opt(w),
            distractors=[_word_opt(d) for d in pool.distractors(rng, w, k)],
            figure=_picture(w),
            speak={"he": prompt_he},
            n=k + 1,
            **common,
        )
    if mode == "listen_to_picture":
        prompt_he = "הקשיבו למילה ובחרו את התמונה המתאימה"
        ds = pool.distractors(rng, w, k, need_emoji=True)
        return options_question(
            rng,
            ctx,
            prompt_he=prompt_he,
            prompt_en="Listen and choose the picture.",
            correct=Opt(w.he, None, emoji(str(w.emoji))),
            distractors=[Opt(d.he, None, emoji(str(d.emoji))) for d in ds],
            speak={"he": prompt_he, "en": w.word},
            n=k + 1,
            **common,
        )
    if mode == "word_to_translation":
        return options_question(
            rng,
            ctx,
            prompt_he=f"מה פירוש המילה {w.word}?",
            prompt_en=f'What does "{w.word}" mean?',
            correct=Opt(w.he),
            distractors=[Opt(d.he) for d in pool.distractors(rng, w, k)],
            speak={"he": "מה פירוש המילה?", "en": w.word},
            n=k + 1,
            **common,
        )
    if mode == "translation_to_word":
        prompt_he = f"איך אומרים באנגלית: {w.he}?"
        return options_question(
            rng,
            ctx,
            prompt_he=prompt_he,
            prompt_en="How do you say it in English?",
            correct=_word_opt(w),
            distractors=[_word_opt(d) for d in pool.distractors(rng, w, k)],
            speak={"he": prompt_he},
            n=k + 1,
            **common,
        )
    # sentence_cloze
    instruction = "בחרו את המילה החסרה במשפט"
    prompt_he = instruction
    with_hint = f"{instruction} ({w.example_he})"
    if w.example_he and len(with_hint) <= PROMPT_LIMIT:
        prompt_he = with_hint
    ds = pool.distractors(rng, w, k, prefer_pos=True)
    return options_question(
        rng,
        ctx,
        prompt_he=prompt_he,
        prompt_en=_blank(w),
        correct=_word_opt(w),
        distractors=[_word_opt(d) for d in ds],
        speak={"he": instruction},
        n=k + 1,
        **common,
    )


def _build_spelling(
    rng: random.Random, ctx: GenContext, w: VocabWord
) -> Question:
    word = w.word
    used = set(word.lower())
    spare = [c for c in _ALPHABET if c not in used]
    extra = rng.sample(spare, 1 if len(word) <= 4 else 2)
    tiles = list(word) + extra
    rng.shuffle(tiles)
    prompt_he = f"סדרו את האותיות וכתבו באנגלית: {w.he}"
    explanation_he, explanation_en = _explanations(w)
    base = _base(
        ctx,
        f"english.vocab:{w.slug}.{w.pos}.spelling",
        prompt_he,
        explanation_he,
        _difficulty(w, "spelling"),
        "Spell the word.",
        explanation_en,
        _picture(w),
        {"he": prompt_he, "en": word},
        _meta(w, "spelling"),
    )
    choices = tuple(Choice(f"t{i}", t, t) for i, t in enumerate(tiles))
    return Question(kind="letters", answer=word, choices=choices, **base)


def _meta(w: VocabWord, mode: str) -> dict[str, Any]:
    return {
        "word": w.word,
        "mode": mode,
        "topic": w.topic,
        "level": w.level,
        "pos": w.pos,
    }


@generator("english.vocab")
def vocab(
    rng: random.Random, params: Mapping[str, Any], ctx: GenContext
) -> Question:
    pool: VocabPool | None = params.get("_pool")
    if pool is None:
        pool = VocabPool(params.get("_words") or ())
    if not pool.words:
        raise ValueError(f"{ctx.skill_id}: no vocabulary words")
    allowed = _expand(
        m for m in params.get("modes") or VOCAB_MODES if m in VOCAB_MODES
    )
    if _young(ctx):
        # pre-readers: pictures and listening only (when the skill has them)
        pictures = [m for m in allowed if m in PICTURE_MODES]
        if pictures and any(
            pool.modes_for(w) & set(pictures) for w in pool.words if w.emoji
        ):
            allowed = pictures
    words = [w for w in pool.words if pool.modes_for(w) & set(allowed)]
    if not words:  # nothing fits: plain translation of any word
        words = list(pool.words)
        allowed = ["word_to_translation", "translation_to_word"]
    w = rng.choice(words)
    fitting = [m for m in allowed if m in pool.modes_for(w)] or [
        "word_to_translation"
    ]
    mode = rng.choice(fitting)
    if mode == "spelling":
        return _build_spelling(rng, ctx, w)
    return _build_choice(rng, ctx, w, mode, pool)
