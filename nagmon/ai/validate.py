# SPDX-License-Identifier: GPL-3.0
"""Treat model output as untrusted: extract JSON and validate/repair it
into SDD_CONTENT formats (SDD_AI §5).

Repairs are mechanical only (niqqud, control characters, types,
aliases). Anything that would change meaning — a too-long text, an
answer out of range, duplicate choices — is rejected, not "fixed".
"""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any

from nagmon.ai.safety import Safety
from nagmon.ai.text import (
    URL_RE,
    clean_text,
    has_hebrew,
    hebrew_ratio,
    normalize_for_compare,
)

BANK_ITEM_KEYS = (
    "id",
    "skill",
    "kind",
    "grade",
    "difficulty",
    "prompt_he",
    "prompt_en",
    "choices",
    "answer",
    "explanation_he",
    "explanation_en",
    "tags",
)
KINDS = ("choice", "true_false", "order")
KIND_ALIASES = {
    "multiple_choice": "choice",
    "multiple-choice": "choice",
    "multiplechoice": "choice",
    "mcq": "choice",
    "single_choice": "choice",
    "truefalse": "true_false",
    "true-false": "true_false",
    "true/false": "true_false",
    "boolean": "true_false",
    "tf": "true_false",
    "ordering": "order",
    "sequence": "order",
    "sort": "order",
}
LIMITS = {
    "prompt_he": 140,
    "prompt_en": 200,
    "explanation_he": 200,
    "explanation_en": 300,
    "choice_he": 40,
    "choice_en": 60,
}
CHOICE_COUNT = {"choice": (2, 4), "order": (3, 5)}
EMOJI_RE = re.compile(r"^[0-9a-f]{4,6}(?:-[0-9a-f]{4,6})*$")
TAG_RE = re.compile(r"^[a-z0-9_]{1,32}$")
TRUE_WORDS = {"true", "נכון", "yes", "כן", "t", "1"}
FALSE_WORDS = {"false", "לא נכון", "no", "לא", "f", "0"}

VOCAB_POS = (
    "noun",
    "verb",
    "adj",
    "adv",
    "prep",
    "pron",
    "num",
    "phrase",
    "other",
)
LEVELS = ("preA1", "A1", "A2", "B1")
WORD_RE = re.compile(r"^[A-Za-z][A-Za-z' -]{0,39}$")
SLUG_RE = re.compile(r"^[a-z][a-z0-9_]{0,31}$")
VOCAB_KEYS = (
    "word",
    "he",
    "pos",
    "topic",
    "level",
    "grade",
    "emoji",
    "example_en",
    "example_he",
)
STORY_LIMITS = {"title": 60, "text_en": 1200, "text_he": 1500}
QUEST_FIELDS = {
    "title_he": 40,
    "npc_name_he": 20,
    "intro_he": 200,
    "task_he": 200,
    "success_he": 140,
}

_DEFAULT_SAFETY = Safety()


class ValidationError(ValueError):
    pass


@dataclass
class Rejected:
    raw: Any
    errors: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {"raw": self.raw, "errors": list(self.errors)}


@dataclass
class ValidationResult:
    valid: list[dict[str, Any]] = field(default_factory=list)
    rejected: list[Rejected] = field(default_factory=list)
    repairs: list[list[str]] = field(default_factory=list)


def new_id() -> str:
    return "ai." + uuid.uuid4().hex[:8]


# -- JSON extraction --------------------------------------------------------
_FENCE_RE = re.compile(r"```[a-zA-Z]*")


def _balanced_end(text: str, start: int) -> int | None:
    pairs = {"{": "}", "[": "]"}
    stack: list[str] = []
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch in pairs:
            stack.append(pairs[ch])
        elif ch in "}]":
            if not stack or stack.pop() != ch:
                return None
            if not stack:
                return i
    return None


def _drop_trailing_commas(text: str) -> str:
    out = []
    in_string = False
    escape = False
    for i, ch in enumerate(text):
        if in_string:
            out.append(ch)
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == ",":
            rest = text[i + 1 :].lstrip()
            if rest[:1] in ("}", "]"):
                continue
        out.append(ch)
    return "".join(out)


def extract_json(text: Any) -> Any:
    """The first balanced JSON object/array in ``text`` that parses."""
    if not isinstance(text, str):
        raise ValidationError("output is not text")
    cleaned = _FENCE_RE.sub("", text)
    for start, ch in enumerate(cleaned):
        if ch not in "{[":
            continue
        end = _balanced_end(cleaned, start)
        if end is None:
            continue
        candidate = cleaned[start : end + 1]
        for attempt in (candidate, _drop_trailing_commas(candidate)):
            try:
                return json.loads(attempt)
            except ValueError:
                continue
    raise ValidationError("no JSON object or array found")


# -- helpers ------------------------------------------------------------------
def _as_list(raw: Any, *keys: str) -> list[Any]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        for key in keys:
            if isinstance(raw.get(key), list):
                return raw[key]
        return [raw]
    return [raw]


def _text(raw: Mapping[str, Any], key: str, repairs: list[str]) -> str:
    value = raw.get(key)
    cleaned = clean_text(value)
    if isinstance(value, str) and cleaned != value.strip():
        repairs.append(f"{key}: ניקוי ניקוד/תווים")
    return cleaned


def _grade(value: Any, default: int, errors: list[str]) -> int:
    if value is None or value == "":
        return default
    try:
        if isinstance(value, bool):
            raise ValueError
        grade = int(value)
    except (TypeError, ValueError):
        errors.append("grade אינו מספר")
        return default
    if not 0 <= grade <= 9:
        errors.append("grade מחוץ לטווח 0–9")
    return grade


def _norm_choice(text: str) -> str:
    return normalize_for_compare(text).casefold()


def _safety_errors(
    texts: Iterable[str], safety: Safety, errors: list[str]
) -> None:
    for text in texts:
        if not text:
            continue
        if URL_RE.search(text):
            errors.append("יש קישור בטקסט")
        hit = safety.find_banned(text)
        if hit:
            errors.append(f"מילה לא מתאימה: {hit[1]}")


def _tags(raw: Any) -> list[str]:
    tags: list[str] = []
    for tag in raw if isinstance(raw, list) else []:
        slug = re.sub(r"[\s-]+", "_", str(tag).strip().lower())
        if TAG_RE.match(slug) and slug not in tags:
            tags.append(slug)
    tags = tags[:6]
    if "ai" not in tags:
        tags.append("ai")
    return tags


def _check_len(
    key: str, text: str, limit: int, errors: list[str], label: str = ""
) -> None:
    if len(text) > limit:
        errors.append(f"{label or key} ארוך מ־{limit} תווים")


# -- bank items (SDD_CONTENT §3) -----------------------------------------------
def _choices(
    raw: Any, kind: str, errors: list[str], repairs: list[str]
) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        errors.append("חסרות בחירות")
        return []
    choices = []
    for entry in raw:
        if isinstance(entry, str):
            repairs.append("בחירה כמחרוזת")
            entry = {"he": entry}
        if not isinstance(entry, dict):
            errors.append("בחירה לא תקינה")
            continue
        he = clean_text(
            entry.get("he") or entry.get("text_he") or entry.get("text")
        )
        en = clean_text(entry.get("en") or entry.get("text_en"))
        emoji = str(entry.get("emoji") or "").strip().lower()
        choice = {"he": he}
        if en:
            choice["en"] = en
        if EMOJI_RE.match(emoji):
            choice["emoji"] = emoji
        if not he:
            errors.append("בחירה ריקה")
        _check_len("he", he, LIMITS["choice_he"], errors, "בחירה")
        _check_len("en", en, LIMITS["choice_en"], errors, "בחירה באנגלית")
        choices.append(choice)
    low, high = CHOICE_COUNT[kind]
    if not low <= len(choices) <= high:
        errors.append(f"צריך {low}–{high} בחירות, יש {len(choices)}")
    normalized = [_norm_choice(c["he"]) for c in choices]
    if len(set(normalized)) != len(normalized):
        errors.append("בחירות כפולות")
    return choices


def _choice_answer(
    raw: Any,
    choices: list[dict[str, str]],
    errors: list[str],
    repairs: list[str],
) -> int | None:
    answer = raw
    if isinstance(answer, bool) or answer is None:
        errors.append("חסרה תשובה נכונה (answer)")
        return None
    if isinstance(answer, str):
        stripped = answer.strip()
        if stripped.isdigit():
            answer = int(stripped)
            repairs.append("answer ממחרוזת למספר")
        else:
            wanted = _norm_choice(stripped)
            matches = [
                i
                for i, c in enumerate(choices)
                if wanted
                in (_norm_choice(c["he"]), _norm_choice(c.get("en", "")))
            ]
            if len(matches) != 1:
                errors.append("answer לא מתאים לאף בחירה")
                return None
            answer = matches[0]
            repairs.append("answer מטקסט לאינדקס")
    if isinstance(answer, float) and answer.is_integer():
        answer = int(answer)
    if not isinstance(answer, int) or not 0 <= answer < len(choices):
        errors.append("answer מחוץ לטווח")
        return None
    return answer


def _order_answer(raw: Any, n: int, errors: list[str]) -> list[int] | None:
    if not isinstance(raw, list):
        errors.append("ב־order התשובה היא רשימת אינדקסים")
        return None
    try:
        answer = [int(x) for x in raw if not isinstance(x, bool)]
    except (TypeError, ValueError):
        errors.append("ב־order התשובה היא רשימת אינדקסים")
        return None
    if sorted(answer) != list(range(n)):
        errors.append("ב־order התשובה חייבת להיות סידור של כל הבחירות")
        return None
    return answer


def _bool_answer(
    raw: Any, errors: list[str], repairs: list[str]
) -> bool | None:
    if isinstance(raw, bool):
        return raw
    word = str(raw).strip().lower() if raw is not None else ""
    if word in TRUE_WORDS:
        repairs.append("answer לבוליאני")
        return True
    if word in FALSE_WORDS:
        repairs.append("answer לבוליאני")
        return False
    errors.append("ב־true_false התשובה היא true או false")
    return None


def validate_bank_item(
    raw: Any,
    *,
    skill_id: str,
    grade: int,
    language: str = "he",
    item_id: str | None = None,
    id_factory: Callable[[], str] | None = None,
    safety: Safety | None = None,
) -> tuple[dict[str, Any] | None, list[str], list[str]]:
    """Return (item or None, errors, repairs) for one bank item."""
    errors: list[str] = []
    repairs: list[str] = []
    if not isinstance(raw, dict):
        return None, ["הפריט אינו אובייקט"], repairs
    safety = safety or _DEFAULT_SAFETY
    raw_kind = str(raw.get("kind") or "choice").strip().lower()
    kind = KIND_ALIASES.get(raw_kind, raw_kind)
    if kind != raw_kind:
        repairs.append(f"kind {raw_kind} → {kind}")
    if kind not in KINDS:
        errors.append(f"kind לא מוכר: {raw_kind}")
        return None, errors, repairs
    if raw.get("skill") not in (None, skill_id):
        repairs.append("skill נכפה למיומנות שביקשו")
    item: dict[str, Any] = {
        "id": item_id or (id_factory or new_id)(),
        "skill": skill_id,
        "kind": kind,
        "grade": _grade(raw.get("grade"), grade, errors),
    }
    try:
        difficulty = float(raw.get("difficulty") or 0.0)
    except (TypeError, ValueError):
        difficulty = 0.0
        repairs.append("difficulty לא מספר → 0")
    if not -2.0 <= difficulty <= 2.0:
        repairs.append("difficulty נחתך לטווח")
    item["difficulty"] = max(-2.0, min(2.0, difficulty))

    texts = {k: _text(raw, k, repairs) for k in ("prompt_he", "prompt_en")}
    item["prompt_he"] = texts["prompt_he"]
    if texts["prompt_en"]:
        item["prompt_en"] = texts["prompt_en"]
    if not texts["prompt_he"]:
        errors.append("חסר prompt_he")
    elif not has_hebrew(texts["prompt_he"]):
        errors.append("prompt_he בלי עברית")
    if language == "en" and not texts["prompt_en"]:
        errors.append("חסר prompt_en")
    _check_len("prompt_he", texts["prompt_he"], LIMITS["prompt_he"], errors)
    _check_len("prompt_en", texts["prompt_en"], LIMITS["prompt_en"], errors)

    choices: list[dict[str, str]] = []
    if kind in ("choice", "order"):
        choices = _choices(raw.get("choices"), kind, errors, repairs)
        item["choices"] = choices
        if kind == "choice":
            item["answer"] = _choice_answer(
                raw.get("answer"), choices, errors, repairs
            )
        else:
            item["answer"] = _order_answer(
                raw.get("answer"), len(choices), errors
            )
    else:
        if raw.get("choices"):
            repairs.append("true_false: הבחירות נמחקו (המנוע מוסיף)")
        item["answer"] = _bool_answer(raw.get("answer"), errors, repairs)

    for key in ("explanation_he", "explanation_en"):
        value = _text(raw, key, repairs)
        if value:
            item[key] = value
        _check_len(key, value, LIMITS[key], errors)
    explanation = item.get("explanation_he", "")
    if not explanation:
        errors.append("חסר explanation_he")
    elif not has_hebrew(explanation):
        errors.append("explanation_he בלי עברית")
    item["tags"] = _tags(raw.get("tags"))

    _safety_errors(
        [
            item["prompt_he"],
            item.get("prompt_en", ""),
            item.get("explanation_he", ""),
            item.get("explanation_en", ""),
            *(c["he"] for c in choices),
            *(c.get("en", "") for c in choices),
        ],
        safety,
        errors,
    )
    if errors:
        return None, errors, repairs
    return {k: item[k] for k in BANK_ITEM_KEYS if k in item}, errors, repairs


def validate_items(
    raw: Any,
    *,
    skill_id: str,
    grade: int,
    subject: str,
    language: str = "he",
    id_factory: Callable[[], str] | None = None,
    safety: Safety | None = None,
) -> ValidationResult:
    """Validate generated bank items (SDD_CONTENT §3)."""
    del subject  # kept in the signature: callers pass it for clarity
    result = ValidationResult()
    for entry in _as_list(raw, "items", "questions"):
        item, errors, repairs = validate_bank_item(
            entry,
            skill_id=skill_id,
            grade=grade,
            language=language,
            id_factory=id_factory,
            safety=safety,
        )
        if item is None:
            result.rejected.append(Rejected(entry, errors))
        else:
            result.valid.append(item)
            result.repairs.append(repairs)
    return result


# -- vocabulary (SDD_CONTENT §4) ------------------------------------------------
def validate_vocab(
    raw: Any, *, safety: Safety | None = None
) -> ValidationResult:
    safety = safety or _DEFAULT_SAFETY
    result = ValidationResult()
    seen: set[str] = set()
    for entry in _as_list(raw, "words", "items"):
        errors: list[str] = []
        repairs: list[str] = []
        if not isinstance(entry, dict):
            result.rejected.append(Rejected(entry, ["הפריט אינו אובייקט"]))
            continue
        word = clean_text(entry.get("word"))
        he = _text(entry, "he", repairs)
        pos = clean_text(entry.get("pos")).lower()
        topic = clean_text(entry.get("topic")).lower().replace(" ", "_")
        level = clean_text(entry.get("level"))
        example_en = clean_text(entry.get("example_en"))
        example_he = _text(entry, "example_he", repairs)
        grade = _grade(entry.get("grade"), 1, errors)
        emoji = str(entry.get("emoji") or "").strip().lower()
        if not WORD_RE.match(word):
            errors.append("word חייב להיות באותיות לטיניות")
        if not he or not has_hebrew(he) or len(he) > 40:
            errors.append("he חייב להיות בעברית, עד 40 תווים")
        if pos not in VOCAB_POS:
            errors.append(f"pos לא חוקי: {pos}")
        if not SLUG_RE.match(topic):
            errors.append("topic לא חוקי")
        if level not in LEVELS:
            errors.append(f"level לא חוקי: {level}")
        stem = word.lower()[: max(3, len(word) - 2)]
        if not example_en or stem not in example_en.lower():
            errors.append("example_en חייב לכלול את המילה")
        if len(example_en) > 120 or len(example_he) > 120:
            errors.append("דוגמה ארוכה מ־120 תווים")
        if not example_he or not has_hebrew(example_he):
            errors.append("example_he חייב להיות בעברית")
        if word.lower() in seen:
            errors.append("מילה כפולה")
        _safety_errors([word, he, example_en, example_he], safety, errors)
        if errors:
            result.rejected.append(Rejected(entry, errors))
            continue
        seen.add(word.lower())
        item = {
            "word": word,
            "he": he,
            "pos": pos,
            "topic": topic,
            "level": level,
            "grade": grade,
            "emoji": emoji if EMOJI_RE.match(emoji) else None,
            "example_en": example_en,
            "example_he": example_he,
        }
        result.valid.append(item)
        result.repairs.append(repairs)
    return result


# -- reading passages (SDD_CONTENT §5) --------------------------------------------
def validate_story(
    raw: Any,
    *,
    grade: int,
    level: str,
    skill_id: str = "english.reading",
    id_factory: Callable[[], str] | None = None,
    safety: Safety | None = None,
) -> ValidationResult:
    safety = safety or _DEFAULT_SAFETY
    make_id = id_factory or new_id
    result = ValidationResult()
    for entry in _as_list(raw, "stories", "passages"):
        errors: list[str] = []
        repairs: list[str] = []
        if not isinstance(entry, dict):
            result.rejected.append(Rejected(entry, ["הפריט אינו אובייקט"]))
            continue
        story_id = make_id()
        title = clean_text(entry.get("title") or entry.get("title_en"))
        text_en = clean_text(entry.get("text_en"))
        text_he = _text(entry, "text_he", repairs)
        story_level = clean_text(entry.get("level")) or level
        if story_level not in LEVELS:
            repairs.append(f"level {story_level} → {level}")
            story_level = level
        story_grade = _grade(entry.get("grade"), grade, errors)
        if not title:
            errors.append("חסרה כותרת")
        if not text_en or hebrew_ratio(text_en) > 0.1:
            errors.append("text_en חייב להיות באנגלית")
        if not text_he or not has_hebrew(text_he):
            errors.append("text_he חייב להיות בעברית")
        for key, value in (
            ("title", title),
            ("text_en", text_en),
            ("text_he", text_he),
        ):
            _check_len(key, value, STORY_LIMITS[key], errors)
        _safety_errors([title, text_en, text_he], safety, errors)
        questions = []
        raw_questions = entry.get("questions")
        for raw_q in raw_questions if isinstance(raw_questions, list) else []:
            q, q_errors, _ = validate_bank_item(
                raw_q,
                skill_id=skill_id,
                grade=story_grade,
                language="en",
                item_id=f"{story_id}.q{len(questions) + 1}",
                safety=safety,
            )
            if q is None:
                repairs.append("שאלה לא תקינה הושמטה: " + "; ".join(q_errors))
            else:
                questions.append(q)
        questions = questions[:5]
        if not questions:
            errors.append("אין שאלות תקינות לסיפור")
        if errors:
            result.rejected.append(Rejected(entry, errors))
            continue
        result.valid.append(
            {
                "id": story_id,
                "grade": story_grade,
                "level": story_level,
                "title": title,
                "text_en": text_en,
                "text_he": text_he,
                "questions": questions,
            }
        )
        result.repairs.append(repairs)
    return result


# -- NPC mini-quests ---------------------------------------------------------------
def validate_quest(
    raw: Any,
    *,
    grade: int,
    skill_id: str,
    id_factory: Callable[[], str] | None = None,
    safety: Safety | None = None,
) -> ValidationResult:
    safety = safety or _DEFAULT_SAFETY
    make_id = id_factory or new_id
    result = ValidationResult()
    for entry in _as_list(raw, "quests"):
        errors: list[str] = []
        repairs: list[str] = []
        if not isinstance(entry, dict):
            result.rejected.append(Rejected(entry, ["הפריט אינו אובייקט"]))
            continue
        quest: dict[str, Any] = {"id": make_id(), "skill": skill_id}
        quest["grade"] = _grade(entry.get("grade"), grade, errors)
        for key, limit in QUEST_FIELDS.items():
            value = _text(entry, key, repairs)
            if not value or not has_hebrew(value):
                errors.append(f"חסר {key} בעברית")
            _check_len(key, value, limit, errors)
            quest[key] = value
        quest["tags"] = _tags(entry.get("tags"))
        _safety_errors([quest[k] for k in QUEST_FIELDS], safety, errors)
        if errors:
            result.rejected.append(Rejected(entry, errors))
            continue
        result.valid.append(quest)
        result.repairs.append(repairs)
    return result
