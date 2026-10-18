# SPDX-License-Identifier: GPL-3.0
"""Parent content studio (SDD_AI §6).

The parent (an adult) asks a remote model for questions, reading
passages, NPC mini-quests or English words. Output is validated in code
and written to ``<data_root>/ai_pending/``. Nothing reaches the children
until the parent approves it; approved items move to
``<data_root>/ai_bank/`` which the learning engine loads as an extra
bank. Only skill, grade, subject and interests are sent — never a name.

CLI: ``python -m nagmon.ai.studio --help``
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

from nagmon.ai.config import (
    build_studio_router,
    default_data_root,
    load_keys,
)
from nagmon.ai.router import AllProvidersFailed, BudgetExceeded, zone
from nagmon.ai.safety import Safety
from nagmon.ai.text import normalize_for_compare
from nagmon.ai.validate import (
    BANK_ITEM_KEYS,
    LEVELS,
    Rejected,
    ValidationError,
    ValidationResult,
    extract_json,
    new_id,
    validate_bank_item,
    validate_items,
    validate_quest,
    validate_story,
    validate_vocab,
)

SCHEMA_VERSION = 1
DEFAULT_CONTENT_ROOT = (
    Path(__file__).resolve().parents[2] / "mods" / "nagmon" / "learning"
)
SUBJECTS_HE = {
    "math": "חשבון",
    "geometry": "גאומטריה",
    "science": "מדעים",
    "english": "אנגלית",
    "logic": "חשיבה",
    "hebrew": "עברית",
    "family": "משפחה וערכים",
}
GRADES_HE = ["גן", "א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'", "ח'", "ט'"]
BANK_FILES = {
    "story": "reading.yaml",
    "vocab": "vocab.yaml",
    "quest": "quests.yaml",
}

REPAIR_HE = (
    "הפלט הקודם לא היה JSON תקין. החזירו רק JSON תקין לפי הסכמה, "
    "בלי שום טקסט לפני או אחרי."
)

STUDIO_SYSTEM_HE = """את/ה כותב/ת תוכן לימודי מנוסה לילדים בישראל, ומכיר/ה היטב את תוכנית הלימודים של משרד החינוך.
הורה יקרא ויאשר כל פריט לפני שהילדים יראו אותו.
דרישות מכל פריט:
1. מתאים לגיל ולכיתה: אוצר מילים, אורך משפטים ורמת חשיבה.
2. מדויק לגמרי. עדיף פשוט ונכון על מדויק ומבלבל. אם אינך בטוח בעובדה, אל תשתמש בה.
3. הסבר שמלמד: explanation_he מסביר למה התשובה נכונה (רעיון, כלל או צעד פתרון), ולא רק חוזר עליה.
4. מסיחים סבירים: כל תשובה שגויה מבוססת על טעות נפוצה או תפיסה שגויה אמיתית של ילדים בגיל הזה, ולא על משהו מגוחך.
5. ערכי משפחה וצניעות: בלי אלימות, בלי פחד, בלי רומנטיקה, בלי נושאים רגישים או שנויים במחלוקת, ובלי מותגים.
6. עברית תקינה וטבעית, בלי ניקוד בכלל.
7. פנייה ניטרלית מגדרית: לשון רבים ("בחרו", "סדרו", "חשבו") או ניסוח סתמי. כשיש דמויות בשאלות, גם בנים וגם בנות.
8. בלי קישורים, בלי סימני עיצוב (markdown) ובלי אימוג'י בתוך הטקסט.
9. החזירו JSON תקין בלבד, בדיוק לפי הסכמה, בלי טקסט לפני או אחרי."""

ITEM_FORMAT_HE = """פורמט כל פריט:
- kind: "choice" או "true_false" או "order".
- choice: ‏2–4 בחירות (בדרך כלל 3). answer = אינדקס הבחירה הנכונה, מתחיל ב־0. לפזר את מיקום התשובה הנכונה בין הפריטים.
- true_false: בלי choices. answer = true או false.
- order: ‏3–5 בחירות. answer = רשימת האינדקסים בסדר הנכון.
- grade: מספר הכיתה (0 = גן). difficulty: בין ‎-2 (קל) ל־2 (קשה) יחסית לכיתה.
- אורכים: prompt_he עד 140 תווים, כל בחירה עד 40 תווים, explanation_he עד 200 תווים.
- choices: [{"he": "...", "en": "...", "emoji": "1f408"}]. emoji רק כשיש קוד Twemoji חד־משמעי, אחרת להשמיט.
- prompt_en ו־explanation_en: תרגום לאנגלית פשוטה.
- tags: מילים קצרות באנגלית, באותיות קטנות."""

BUILT_IN_EXAMPLE = {
    "kind": "choice",
    "grade": 1,
    "difficulty": 0.0,
    "prompt_he": "מה מהבאים הוא יצור חי?",
    "prompt_en": "Which of these is a living thing?",
    "choices": [
        {"he": "כיסא", "en": "chair", "emoji": "1fa91"},
        {"he": "אבן", "en": "stone", "emoji": "1faa8"},
        {"he": "חתול", "en": "cat", "emoji": "1f408"},
    ],
    "answer": 2,
    "explanation_he": "חתול נושם, אוכל, גדל ומתרבה. אבן וכיסא לא עושים אף אחד מאלה.",
    "explanation_en": "A cat breathes, eats, grows and reproduces.",
    "tags": ["living"],
}

_CHOICE_SCHEMA = {
    "type": "object",
    "properties": {
        "he": {"type": "string"},
        "en": {"type": "string"},
        "emoji": {"type": "string"},
    },
    "required": ["he"],
}
ITEM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["choice", "true_false", "order"]},
        "grade": {"type": "integer"},
        "difficulty": {"type": "number"},
        "prompt_he": {"type": "string"},
        "prompt_en": {"type": "string"},
        "choices": {"type": "array", "items": _CHOICE_SCHEMA},
        "answer": {
            "anyOf": [
                {"type": "integer"},
                {"type": "boolean"},
                {"type": "array", "items": {"type": "integer"}},
            ]
        },
        "explanation_he": {"type": "string"},
        "explanation_en": {"type": "string"},
        "tags": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["kind", "prompt_he", "answer", "explanation_he"],
}
QUESTIONS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"items": {"type": "array", "items": ITEM_SCHEMA}},
    "required": ["items"],
}
STORY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "level": {"type": "string"},
        "grade": {"type": "integer"},
        "text_en": {"type": "string"},
        "text_he": {"type": "string"},
        "questions": {"type": "array", "items": ITEM_SCHEMA},
    },
    "required": ["title", "text_en", "text_he", "questions"],
}
QUEST_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        k: {"type": "string"}
        for k in (
            "title_he",
            "npc_name_he",
            "intro_he",
            "task_he",
            "success_he",
        )
    },
    "required": [
        "title_he",
        "npc_name_he",
        "intro_he",
        "task_he",
        "success_he",
    ],
}
VOCAB_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "words": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "word": {"type": "string"},
                    "he": {"type": "string"},
                    "pos": {"type": "string"},
                    "topic": {"type": "string"},
                    "level": {"type": "string"},
                    "grade": {"type": "integer"},
                    "emoji": {"type": "string"},
                    "example_en": {"type": "string"},
                    "example_he": {"type": "string"},
                },
                "required": ["word", "he", "pos", "example_en", "example_he"],
            },
        }
    },
    "required": ["words"],
}


@dataclass
class PendingEntry:
    item_id: str
    type: str  # question | story | quest | vocab
    subject: str
    item: dict[str, Any]
    path: Path
    provenance: dict[str, Any] = field(default_factory=dict)
    request: dict[str, Any] = field(default_factory=dict)
    repairs: list[str] = field(default_factory=list)


@dataclass
class PendingBatch:
    path: Path | None
    entries: list[PendingEntry]
    rejected: list[dict[str, Any]]
    provenance: dict[str, Any]


def _grade_text(grade: int) -> str:
    name = GRADES_HE[grade] if 0 <= grade < len(GRADES_HE) else str(grade)
    age = "5–6" if grade <= 0 else str(grade + 6)
    return (
        f"כיתה {name} (גיל {age} בערך)" if grade > 0 else f"{name} (גיל {age})"
    )


def _interests_text(interests: Iterable[str]) -> str:
    cleaned = [str(i).strip() for i in interests if str(i).strip()]
    if not cleaned:
        return ""
    return (
        "- תחומי עניין של הילדים (לשלב רק כשזה טבעי ולא פוגע בדיוק): "
        + ", ".join(cleaned[:6])
    )


def _dump_yaml(data: Any) -> str:
    return yaml.safe_dump(
        data, allow_unicode=True, sort_keys=False, width=1000
    )


def _write_yaml(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(_dump_yaml(data), encoding="utf-8")
    tmp.replace(path)


def _read_yaml(path: Path, default: Any) -> Any:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return default
    return default if data is None else data


class Studio:
    def __init__(
        self,
        router: Any,
        data_root: Path | str,
        *,
        content_root: Path | str | None = None,
        clock: Callable[[], float] = time.time,
        id_factory: Callable[[], str] | None = None,
        safety: Safety | None = None,
        tz: str = "Asia/Jerusalem",
    ) -> None:
        self.router = router
        self.data_root = Path(data_root)
        self.content_root = Path(content_root or DEFAULT_CONTENT_ROOT)
        self.clock = clock
        self.id_factory = id_factory or new_id
        self.safety = safety or Safety()
        self.tz = tz
        self.pending_dir = self.data_root / "ai_pending"
        self.bank_dir = self.data_root / "ai_bank"
        self._bank_cache: list[dict[str, Any]] | None = None

    # -- existing content ------------------------------------------------
    def _content_items(self) -> list[dict[str, Any]]:
        """Bank items from ``content_root`` (for few-shot and dedupe)."""
        if self._bank_cache is not None:
            return self._bank_cache
        items: list[dict[str, Any]] = []
        if self.content_root.is_dir():
            for path in sorted(self.content_root.rglob("*.yaml")):
                if path.name == "owl_faq.yaml" or "skills" in path.parts:
                    continue
                data = _read_yaml(path, None)
                items.extend(self._items_from(data))
        self._bank_cache = items
        return items

    @staticmethod
    def _items_from(data: Any) -> list[dict[str, Any]]:
        found: list[dict[str, Any]] = []
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            default_skill = data.get("skill")
            for item in data["items"]:
                if isinstance(item, dict) and item.get("prompt_he"):
                    found.append({"skill": default_skill, **item})
        elif isinstance(data, list):
            for entry in data:
                if isinstance(entry, dict):
                    for q in entry.get("questions") or []:
                        if isinstance(q, dict) and q.get("prompt_he"):
                            found.append(q)
        return found

    def _examples(self, skill_id: str, subject: str, n: int = 2) -> list[dict]:
        items = self._content_items()
        same = [i for i in items if i.get("skill") == skill_id]
        if not same:
            same = [
                i
                for i in items
                if str(i.get("skill") or "").startswith(subject + ".")
            ]
        chosen = same[:n] or [BUILT_IN_EXAMPLE]
        keep = [k for k in BANK_ITEM_KEYS if k not in ("id", "skill")]
        return [{k: i[k] for k in keep if k in i} for i in chosen]

    def _known_prompts(self) -> set[str]:
        prompts = {
            normalize_for_compare(str(i.get("prompt_he", "")))
            for i in self._content_items()
        }
        for path in self.bank_dir.glob("*.yaml"):
            prompts |= {
                normalize_for_compare(str(i.get("prompt_he", "")))
                for i in self._items_from(_read_yaml(path, None))
            }
        for entry in self.pending():
            if entry.type == "question":
                prompts.add(normalize_for_compare(entry.item["prompt_he"]))
        prompts.discard("")
        return prompts

    def _known_words(self) -> set[str]:
        words: set[str] = set()
        sources = [self.content_root / "english" / "words.yaml"]
        sources.append(self.bank_dir / BANK_FILES["vocab"])
        for path in sources:
            data = _read_yaml(path, [])
            entries = data.get("words", []) if isinstance(data, dict) else data
            for entry in entries if isinstance(entries, list) else []:
                if isinstance(entry, dict) and entry.get("word"):
                    words.add(str(entry["word"]).lower())
        for entry in self.pending():
            if entry.type == "vocab":
                words.add(str(entry.item.get("word", "")).lower())
        return words

    # -- model call ---------------------------------------------------------
    def _call(
        self, messages: list[dict[str, str]], schema: Mapping[str, Any]
    ) -> tuple[Any, dict[str, Any], str]:
        result = self.router.chat(
            messages,
            purpose="studio",
            json_schema=schema,
            temperature=0.7,
            max_tokens=4096,
        )
        provenance = {"provider": result.provider, "model": result.model}
        try:
            return extract_json(result.text), provenance, result.text
        except ValidationError:
            pass
        repair = [
            *messages,
            {"role": "assistant", "content": result.text[:4000]},
            {"role": "user", "content": REPAIR_HE},
        ]
        result = self.router.chat(
            repair,
            purpose="studio",
            json_schema=schema,
            temperature=0.2,
            max_tokens=4096,
        )
        provenance = {"provider": result.provider, "model": result.model}
        try:
            return extract_json(result.text), provenance, result.text
        except ValidationError:
            return None, provenance, result.text

    # -- generation -----------------------------------------------------------
    def generate_questions(
        self,
        skill_id: str,
        grade: int,
        subject: str,
        n: int = 5,
        interests: Sequence[str] = (),
        language: str = "he",
    ) -> PendingBatch:
        n = max(1, min(10, int(n)))
        if language == "en":
            language_line = (
                "- השאלות ללימוד אנגלית: prompt_en חובה, באנגלית פשוטה "
                "שמתאימה לרמה. prompt_he הוא הנחיה או תרגום בעברית."
            )
        else:
            language_line = (
                "- השאלות בעברית: prompt_he חובה. prompt_en הוא תרגום."
            )
        lines = [
            f"כתבו {n} שאלות חדשות למאגר.",
            f"- מיומנות: {skill_id}",
            f"- מקצוע: {SUBJECTS_HE.get(subject, subject)} ({subject})",
            f"- {_grade_text(int(grade))}",
            language_line,
            _interests_text(interests),
            "- גיוון: רמות קושי שונות, ואם מתאים גם סוגי שאלות שונים.",
            "",
            ITEM_FORMAT_HE,
            "",
            "דוגמאות מהמאגר הקיים (לסגנון ולרמה בלבד, לא להעתיק):",
            json.dumps(
                self._examples(skill_id, subject),
                ensure_ascii=False,
                indent=1,
            ),
            "",
            'החזירו: {"items": [ ... ]}',
        ]
        messages = [
            {"role": "system", "content": STUDIO_SYSTEM_HE},
            {
                "role": "user",
                "content": "\n".join(x for x in lines if x is not None),
            },
        ]
        data, provenance, raw = self._call(messages, QUESTIONS_SCHEMA)
        request = {
            "kind": "questions",
            "skill": skill_id,
            "grade": int(grade),
            "subject": subject,
            "n": n,
            "interests": list(interests),
            "language": language,
        }
        if data is None:
            return self._no_json(request, provenance, raw)
        result = validate_items(
            data,
            skill_id=skill_id,
            grade=int(grade),
            subject=subject,
            language=language,
            id_factory=self.id_factory,
            safety=self.safety,
        )
        self._drop_duplicates(result)
        result.valid = result.valid[:n]
        return self._write_pending(
            "question", subject, result, request, provenance
        )

    def generate_story(
        self, grade: int, level: str, interests: Sequence[str] = ()
    ) -> PendingBatch:
        if level not in LEVELS:
            raise ValueError(f"level must be one of {LEVELS}")
        sentences = {"preA1": "3–5", "A1": "5–8", "A2": "8–12", "B1": "10–15"}
        lines = [
            "כתבו קטע קריאה קצר באנגלית לילדים דוברי עברית שלומדים אנגלית.",
            f"- רמה: CEFR {level}. {_grade_text(int(grade))}.",
            f"- אורך: {sentences[level]} משפטים קצרים. "
            "אוצר מילים ודקדוק שמתאימים לרמה (ב־preA1 ו־A1: הווה פשוט).",
            "- title: כותרת באנגלית, עד 60 תווים.",
            "- text_en: הקטע באנגלית, עד 1200 תווים.",
            "- text_he: תרגום נאמן וטבעי לעברית, בלי ניקוד.",
            "- questions: ‏3 שאלות הבנה על הקטע (choice או true_false). "
            "prompt_en באנגלית פשוטה, prompt_he תרגום, explanation_he "
            "מפנה למשפט בקטע שמראה את התשובה.",
            _interests_text(interests),
            "- תוכן חיובי ומשפחתי: חברות, סקרנות, טבע, משפחה.",
            "",
            ITEM_FORMAT_HE,
            "",
            'החזירו: {"title": "...", "level": "'
            + level
            + '", "grade": '
            + str(int(grade))
            + ', "text_en": "...", "text_he": "...", "questions": [ ... ]}',
        ]
        messages = [
            {"role": "system", "content": STUDIO_SYSTEM_HE},
            {"role": "user", "content": "\n".join(x for x in lines if x)},
        ]
        data, provenance, raw = self._call(messages, STORY_SCHEMA)
        request = {
            "kind": "story",
            "grade": int(grade),
            "level": level,
            "interests": list(interests),
        }
        if data is None:
            return self._no_json(request, provenance, raw)
        result = validate_story(
            data,
            grade=int(grade),
            level=level,
            id_factory=self.id_factory,
            safety=self.safety,
        )
        return self._write_pending(
            "story", "english", result, request, provenance
        )

    def generate_quest(
        self,
        grade: int,
        skill_id: str,
        subject: str,
        interests: Sequence[str] = (),
    ) -> PendingBatch:
        lines = [
            "כתבו משימה קצרה לדמות (NPC) במשחק הרפתקאות לימודי.",
            f"- המשימה מתרגלת את המיומנות {skill_id} "
            f"({SUBJECTS_HE.get(subject, subject)}). {_grade_text(int(grade))}.",
            "- title_he: שם המשימה, עד 40 תווים.",
            "- npc_name_he: שם הדמות בעברית, עד 20 תווים (לגוון בין דמויות "
            "של גברים ונשים, ילדים ומבוגרים).",
            "- intro_he: מה הדמות מספרת, עד 200 תווים.",
            "- task_he: מה השחקנים צריכים לעשות (לענות על שאלות במיומנות), "
            "עד 200 תווים.",
            "- success_he: מה הדמות אומרת בסוף, עד 140 תווים.",
            "- ערכים: עזרה לאחרים, חברות, סקרנות, כבוד למשפחה ולטבע. "
            "בלי קרבות ובלי פחד.",
            _interests_text(interests),
            "",
            'החזירו: {"title_he": "...", "npc_name_he": "...", '
            '"intro_he": "...", "task_he": "...", "success_he": "..."}',
        ]
        messages = [
            {"role": "system", "content": STUDIO_SYSTEM_HE},
            {"role": "user", "content": "\n".join(x for x in lines if x)},
        ]
        data, provenance, raw = self._call(messages, QUEST_SCHEMA)
        request = {
            "kind": "quest",
            "grade": int(grade),
            "skill": skill_id,
            "subject": subject,
            "interests": list(interests),
        }
        if data is None:
            return self._no_json(request, provenance, raw)
        result = validate_quest(
            data,
            grade=int(grade),
            skill_id=skill_id,
            id_factory=self.id_factory,
            safety=self.safety,
        )
        return self._write_pending(
            "quest", subject, result, request, provenance
        )

    def generate_vocab(
        self, topic: str, level: str, grade: int, n: int = 8
    ) -> PendingBatch:
        n = max(1, min(20, int(n)))
        known = sorted(self._known_words())
        lines = [
            f"כתבו {n} מילים באנגלית לאוצר המילים של ילדים דוברי עברית.",
            f"- נושא: {topic}. רמה: {level}. {_grade_text(int(grade))}.",
            "- לכל מילה: word (באנגלית), he (תרגום בלי ניקוד), pos "
            "(noun/verb/adj/adv/prep/pron/num/phrase/other), topic, level, "
            "grade, emoji (קוד Twemoji רק אם יש תמונה חד־משמעית, אחרת null), "
            "example_en (משפט קצר שמכיל את המילה), example_he (תרגום).",
            "- מילים שימושיות ומוחשיות, שמתאימות לרמה.",
        ]
        if known:
            lines.append("- לא לחזור על המילים: " + ", ".join(known[:200]))
        lines.append('החזירו: {"words": [ ... ]}')
        messages = [
            {"role": "system", "content": STUDIO_SYSTEM_HE},
            {"role": "user", "content": "\n".join(lines)},
        ]
        data, provenance, raw = self._call(messages, VOCAB_SCHEMA)
        request = {
            "kind": "vocab",
            "topic": topic,
            "level": level,
            "grade": int(grade),
            "n": n,
        }
        if data is None:
            return self._no_json(request, provenance, raw)
        result = validate_vocab(data, safety=self.safety)
        kept = []
        for word in result.valid:
            if word["word"].lower() in known:
                result.rejected.append(Rejected(word, ["מילה כפולה"]))
            else:
                kept.append(word)
        result.valid = kept[:n]
        return self._write_pending(
            "vocab", "english", result, request, provenance
        )

    # -- pending files ----------------------------------------------------------
    def _drop_duplicates(self, result: ValidationResult) -> None:
        known = self._known_prompts()
        kept, repairs = [], []
        for item, rep in zip(result.valid, result.repairs):
            norm = normalize_for_compare(item["prompt_he"])
            if norm in known:
                result.rejected.append(
                    Rejected(item, ["שאלה כפולה: כבר קיימת במאגר"])
                )
                continue
            known.add(norm)
            kept.append(item)
            repairs.append(rep)
        result.valid, result.repairs = kept, repairs

    def _no_json(
        self, request: dict, provenance: dict, raw: str
    ) -> PendingBatch:
        rejected = [
            {"raw": raw[:500], "errors": ["הפלט של המודל לא היה JSON תקין"]}
        ]
        return PendingBatch(None, [], rejected, provenance)

    def _stamp(self) -> str:
        return datetime.fromtimestamp(self.clock(), zone(self.tz)).strftime(
            "%Y%m%d-%H%M%S"
        )

    def _write_pending(
        self,
        entry_type: str,
        subject: str,
        result: ValidationResult,
        request: dict[str, Any],
        provenance: dict[str, Any],
    ) -> PendingBatch:
        rejected = [r.to_dict() for r in result.rejected]
        if not result.valid:
            return PendingBatch(None, [], rejected, provenance)
        entries_data = []
        repairs = result.repairs + [[]] * (
            len(result.valid) - len(result.repairs)
        )
        for item, rep in zip(result.valid, repairs):
            item_id = item.get("id") or self.id_factory()
            entries_data.append(
                {
                    "id": item_id,
                    "type": entry_type,
                    "subject": subject,
                    "item": item,
                    "repairs": list(rep),
                }
            )
        stamp = self._stamp()
        path = self.pending_dir / f"{stamp}.yaml"
        counter = 2
        while path.exists():
            path = self.pending_dir / f"{stamp}-{counter}.yaml"
            counter += 1
        data = {
            "schema_version": SCHEMA_VERSION,
            "created": datetime.fromtimestamp(
                self.clock(), zone(self.tz)
            ).isoformat(timespec="seconds"),
            "request": request,
            "provenance": provenance,
            "entries": entries_data,
            "rejected_by_validator": rejected,
        }
        _write_yaml(path, data)
        entries = [self._entry(e, path, data) for e in entries_data]
        return PendingBatch(path, entries, rejected, provenance)

    @staticmethod
    def _entry(
        raw: Mapping[str, Any], path: Path, data: Mapping
    ) -> PendingEntry:
        return PendingEntry(
            item_id=str(raw.get("id")),
            type=str(raw.get("type", "question")),
            subject=str(raw.get("subject", "")),
            item=dict(raw.get("item") or {}),
            path=path,
            provenance=dict(data.get("provenance") or {}),
            request=dict(data.get("request") or {}),
            repairs=list(raw.get("repairs") or []),
        )

    def _pending_files(self) -> list[tuple[Path, dict[str, Any]]]:
        files = []
        if not self.pending_dir.is_dir():
            return files
        for path in sorted(self.pending_dir.glob("*.yaml")):
            data = _read_yaml(path, None)
            if isinstance(data, dict) and isinstance(
                data.get("entries"), list
            ):
                files.append((path, data))
        return files

    def pending(self) -> list[PendingEntry]:
        return [
            self._entry(raw, path, data)
            for path, data in self._pending_files()
            for raw in data["entries"]
            if isinstance(raw, dict)
        ]

    def revalidate(self, entry: PendingEntry) -> tuple[dict | None, list[str]]:
        """Validate a pending entry again (the file may have been edited)."""
        item = entry.item
        if entry.type == "question":
            valid, errors, _ = validate_bank_item(
                item,
                skill_id=str(item.get("skill") or entry.request.get("skill")),
                grade=int(item.get("grade") or 0),
                item_id=entry.item_id,
                safety=self.safety,
            )
            return valid, errors
        if entry.type == "story":
            result = validate_story(
                item,
                grade=int(item.get("grade") or 0),
                level=str(item.get("level") or "A1"),
                id_factory=lambda: entry.item_id,
                safety=self.safety,
            )
        elif entry.type == "quest":
            result = validate_quest(
                item,
                grade=int(item.get("grade") or 0),
                skill_id=str(item.get("skill") or ""),
                id_factory=lambda: entry.item_id,
                safety=self.safety,
            )
        elif entry.type == "vocab":
            result = validate_vocab([item], safety=self.safety)
        else:
            return None, [f"סוג לא מוכר: {entry.type}"]
        if result.valid:
            return result.valid[0], []
        return None, result.rejected[0].errors if result.rejected else []

    def _take(
        self, ids: Iterable[str]
    ) -> list[tuple[Path, dict[str, Any], list[dict[str, Any]]]]:
        """Remove the given ids from the pending files (rewriting or
        deleting each file) and return what was taken."""
        wanted = set(ids)
        taken = []
        for path, data in self._pending_files():
            chosen = [e for e in data["entries"] if e.get("id") in wanted]
            if not chosen:
                continue
            data["entries"] = [
                e for e in data["entries"] if e.get("id") not in wanted
            ]
            taken.append((path, data, chosen))
        return taken

    def _store_pending(self, path: Path, data: dict[str, Any]) -> None:
        if data["entries"]:
            _write_yaml(path, data)
        else:
            path.unlink(missing_ok=True)

    def approve(self, ids: Iterable[str]) -> list[str]:
        approved: list[str] = []
        provenance_path = self.bank_dir / "provenance.yaml"
        provenance = None
        for path, data, chosen in self._take(ids):
            keep_back = []
            for raw in chosen:
                entry = self._entry(raw, path, data)
                item, _errors = self.revalidate(entry)
                if item is None:
                    keep_back.append(raw)
                    continue
                self._append_to_bank(entry, item)
                if provenance is None:
                    provenance = _read_yaml(provenance_path, {})
                    if not isinstance(provenance, dict):
                        provenance = {}
                provenance[entry.item_id] = {
                    **entry.provenance,
                    "type": entry.type,
                    "subject": entry.subject,
                    "created": data.get("created"),
                    "approved": datetime.fromtimestamp(
                        self.clock(), zone(self.tz)
                    ).isoformat(timespec="seconds"),
                    "request": entry.request,
                }
                approved.append(entry.item_id)
            data["entries"].extend(keep_back)
            self._store_pending(path, data)
        if provenance is not None:
            _write_yaml(provenance_path, provenance)
        return approved

    def _append_to_bank(
        self, entry: PendingEntry, item: dict[str, Any]
    ) -> None:
        if entry.type == "question":
            path = self.bank_dir / f"{entry.subject}.yaml"
            bank = _read_yaml(path, {})
            if not isinstance(bank, dict) or not isinstance(
                bank.get("items"), list
            ):
                bank = {"items": []}
            bank["items"].append(item)
        else:
            path = self.bank_dir / BANK_FILES[entry.type]
            bank = _read_yaml(path, [])
            if not isinstance(bank, list):
                bank = []
            bank.append(item)
        _write_yaml(path, bank)

    def reject(self, ids: Iterable[str]) -> list[str]:
        rejected: list[str] = []
        log_lines = []
        for path, data, chosen in self._take(ids):
            for raw in chosen:
                rejected.append(str(raw.get("id")))
                log_lines.append(
                    json.dumps(
                        {
                            "ts": self.clock(),
                            "id": raw.get("id"),
                            "type": raw.get("type"),
                            "subject": raw.get("subject"),
                            "item": raw.get("item"),
                            "provenance": data.get("provenance"),
                        },
                        ensure_ascii=False,
                    )
                )
            self._store_pending(path, data)
        if log_lines:
            self.pending_dir.mkdir(parents=True, exist_ok=True)
            with open(
                self.pending_dir / "rejected.jsonl", "a", encoding="utf-8"
            ) as fh:
                fh.write("\n".join(log_lines) + "\n")
        return rejected

    def edit(self, item_id: str, new_item: Mapping[str, Any]) -> PendingEntry:
        """Replace a pending item after validating it again."""
        for path, data in self._pending_files():
            for raw in data["entries"]:
                if raw.get("id") != item_id:
                    continue
                candidate = self._entry(raw, path, data)
                candidate.item = dict(new_item)
                item, errors = self.revalidate(candidate)
                if item is None:
                    raise ValueError("; ".join(errors) or "פריט לא תקין")
                raw["item"] = item
                _write_yaml(path, data)
                return self._entry(raw, path, data)
        raise KeyError(item_id)


# -- CLI ----------------------------------------------------------------------
def format_entry(entry: PendingEntry) -> str:
    item = entry.item
    lines = [f"[{entry.item_id}] {entry.type} · {entry.subject}"]
    if entry.type == "question":
        lines.append(f"  שאלה: {item.get('prompt_he', '')}")
        if item.get("prompt_en"):
            lines.append(f"  (en) {item['prompt_en']}")
        answer = item.get("answer")
        for i, choice in enumerate(item.get("choices") or []):
            mark = "*" if answer == i else " "
            if isinstance(answer, list):
                mark = str(answer.index(i) + 1) if i in answer else " "
            lines.append(f"   {mark} {i}. {choice.get('he', '')}")
        if item.get("kind") == "true_false":
            lines.append(f"  תשובה: {'נכון' if answer else 'לא נכון'}")
        lines.append(f"  הסבר: {item.get('explanation_he', '')}")
        lines.append(
            f"  כיתה {item.get('grade')} · קושי {item.get('difficulty')}"
            f" · {item.get('skill')}"
        )
    elif entry.type == "story":
        lines.append(f"  {item.get('title')} ({item.get('level')})")
        lines.append(f"  {item.get('text_en')}")
        lines.append(f"  {item.get('text_he')}")
        for q in item.get("questions") or []:
            lines.append(f"   ? {q.get('prompt_en')} / {q.get('prompt_he')}")
    else:
        for key, value in item.items():
            if key != "id":
                lines.append(f"  {key}: {value}")
    if entry.repairs:
        lines.append("  תיקונים אוטומטיים: " + "; ".join(entry.repairs))
    if entry.provenance:
        lines.append(
            f'  נוצר ע"י {entry.provenance.get("provider")}'
            f" / {entry.provenance.get('model')}"
        )
    return "\n".join(lines)


def _parse_value(text: str) -> Any:
    try:
        return json.loads(text)
    except ValueError:
        return text


def _apply_edit(item: dict[str, Any], field_name: str, value: str) -> dict:
    new = json.loads(json.dumps(item, ensure_ascii=False))
    field_name = field_name.strip()
    if field_name.startswith(("choice:", "choices.")):
        index = int(field_name.replace("choice:", "").replace("choices.", ""))
        new["choices"][index]["he"] = value
    elif field_name in ("answer", "grade", "difficulty", "choices", "tags"):
        new[field_name] = _parse_value(value)
    else:
        new[field_name] = value
    return new


def _review(
    studio: Studio,
    input_fn: Callable[[str], str],
    print_fn: Callable[..., None],
) -> int:
    entries = studio.pending()
    if not entries:
        print_fn("אין פריטים שמחכים לאישור.")
        return 0
    for entry in entries:
        print_fn("")
        print_fn(format_entry(entry))
        while True:
            answer = (
                input_fn("לאשר? y=כן  n=לא  e=עריכה  s=דילוג  q=יציאה: ")
                .strip()
                .lower()
            )
            if answer == "y":
                ok = studio.approve([entry.item_id])
                print_fn("אושר." if ok else "לא אושר: הפריט לא עבר בדיקה.")
                break
            if answer == "n":
                studio.reject([entry.item_id])
                print_fn("נדחה.")
                break
            if answer == "s":
                break
            if answer == "q":
                return 0
            if answer == "e":
                field_name = input_fn(
                    "איזה שדה? (prompt_he, explanation_he, choice:0, answer...): "
                )
                value = input_fn("ערך חדש: ")
                try:
                    entry = studio.edit(
                        entry.item_id,
                        _apply_edit(entry.item, field_name, value),
                    )
                except (ValueError, KeyError, IndexError, TypeError) as err:
                    print_fn(f"העריכה לא נשמרה: {err}")
                    continue
                print_fn(format_entry(entry))
    return 0


def _auto_validate(studio: Studio, print_fn: Callable[..., None]) -> int:
    entries = studio.pending()
    problems = 0
    for entry in entries:
        item, errors = studio.revalidate(entry)
        if item is None:
            problems += 1
            print_fn(f"[{entry.item_id}] בעיה: {'; '.join(errors)}")
    print_fn(
        f"נבדקו {len(entries)} פריטים: {len(entries) - problems} תקינים, "
        f"{problems} עם בעיות. שום דבר לא אושר."
    )
    return 0 if problems == 0 else 1


def _print_batch(batch: PendingBatch, print_fn: Callable[..., None]) -> None:
    for entry in batch.entries:
        print_fn(format_entry(entry))
        print_fn("")
    for rejected in batch.rejected:
        print_fn("נדחה בבדיקה: " + "; ".join(rejected.get("errors", [])))
    if batch.path:
        print_fn(f"נשמר לאישור: {batch.path}")
        print_fn("לאישור: python -m nagmon.ai.studio review")
    else:
        print_fn("לא נוצרו פריטים תקינים.")


def _split(text: str | None) -> list[str]:
    return [p.strip() for p in (text or "").split(",") if p.strip()]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m nagmon.ai.studio",
        description="Nagmon parent content studio: generate, review, approve.",
    )
    parser.add_argument("--data-root", type=Path, default=None)
    sub = parser.add_subparsers(dest="command", required=True)

    q = sub.add_parser("questions", help="generate bank questions")
    q.add_argument("--skill", required=True)
    q.add_argument("--grade", type=int, required=True)
    q.add_argument("--subject", required=True)
    q.add_argument("-n", type=int, default=5)
    q.add_argument("--interests", default="")
    q.add_argument("--language", choices=("he", "en"), default="he")

    s = sub.add_parser("story", help="generate an English reading passage")
    s.add_argument("--grade", type=int, required=True)
    s.add_argument("--level", choices=LEVELS, required=True)
    s.add_argument("--interests", default="")

    m = sub.add_parser("quest", help="generate an NPC mini-quest")
    m.add_argument("--grade", type=int, required=True)
    m.add_argument("--skill", required=True)
    m.add_argument("--subject", required=True)
    m.add_argument("--interests", default="")

    v = sub.add_parser("vocab", help="generate English words")
    v.add_argument("--topic", required=True)
    v.add_argument("--level", choices=LEVELS, required=True)
    v.add_argument("--grade", type=int, required=True)
    v.add_argument("-n", type=int, default=8)

    for p in (q, s, m, v):
        p.add_argument("--content-root", type=Path, default=None)

    r = sub.add_parser("review", help="approve/reject pending items")
    r.add_argument("--auto-validate-only", action="store_true")
    sub.add_parser("list", help="list pending items")
    a = sub.add_parser("approve", help="approve pending items by id")
    a.add_argument("ids", nargs="+")
    j = sub.add_parser("reject", help="reject pending items by id")
    j.add_argument("ids", nargs="+")
    sub.add_parser("status", help="show provider status")
    return parser


def main(
    argv: Sequence[str] | None = None,
    *,
    router_factory: Callable[[dict[str, str], Path], Any] | None = None,
    input_fn: Callable[[str], str] = input,
    print_fn: Callable[..., None] = print,
) -> int:
    if print_fn is print:
        try:
            sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass
    args = build_parser().parse_args(argv)
    data_root = args.data_root or default_data_root()
    factory = router_factory or (
        lambda keys, root: build_studio_router(keys, root)
    )

    def make_studio(router: Any = None) -> Studio:
        return Studio(
            router,
            data_root,
            content_root=getattr(args, "content_root", None),
        )

    if args.command == "review":
        studio = make_studio()
        if args.auto_validate_only:
            return _auto_validate(studio, print_fn)
        return _review(studio, input_fn, print_fn)
    if args.command == "list":
        entries = make_studio().pending()
        for entry in entries:
            print_fn(format_entry(entry))
            print_fn("")
        print_fn(f"{len(entries)} פריטים מחכים לאישור.")
        return 0
    if args.command == "approve":
        done = make_studio().approve(args.ids)
        print_fn(f"אושרו {len(done)}: {' '.join(done)}")
        return 0 if done else 1
    if args.command == "reject":
        done = make_studio().reject(args.ids)
        print_fn(f"נדחו {len(done)}: {' '.join(done)}")
        return 0 if done else 1

    router = factory(load_keys(data_root), data_root)
    if args.command == "status":
        for status in router.status_report():
            print_fn(f"{status.label_he}: {status.message_he}")
        return 0
    studio = make_studio(router)
    try:
        if args.command == "questions":
            batch = studio.generate_questions(
                args.skill,
                args.grade,
                args.subject,
                n=args.n,
                interests=_split(args.interests),
                language=args.language,
            )
        elif args.command == "story":
            batch = studio.generate_story(
                args.grade, args.level, interests=_split(args.interests)
            )
        elif args.command == "quest":
            batch = studio.generate_quest(
                args.grade,
                args.skill,
                args.subject,
                interests=_split(args.interests),
            )
        else:
            batch = studio.generate_vocab(
                args.topic, args.level, args.grade, n=args.n
            )
    except (AllProvidersFailed, BudgetExceeded) as err:
        print_fn(err.message_he)
        return 2
    _print_batch(batch, print_fn)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
