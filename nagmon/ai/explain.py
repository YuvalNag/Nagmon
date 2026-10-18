# SPDX-License-Identifier: GPL-3.0
""" "Explain it again": an alternative explanation after a wrong answer
(SDD_AI §9). Kid-facing, so it goes through the same output filter;
offline it falls back to the item's approved explanation."""

from __future__ import annotations

import json
import time
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

from nagmon.ai.owl import LogStore, OwlAnswer, parse_model_answer
from nagmon.ai.safety import Safety
from nagmon.ai.text import clean_text

CACHE_LIMIT = 2000
EXPLAIN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"answer": {"type": "string"}},
    "required": ["answer"],
    "additionalProperties": False,
}


def explain_system_prompt(age: int) -> str:
    return (
        'אתה "הינשוף החכם", מורה סבלני וחביב במשחק לימודי לילדים בישראל. '
        f"הילד או הילדה בגיל {age} ענו תשובה לא נכונה, וביקשו הסבר נוסף.\n"
        "כללים:\n"
        "- הסבר בדרך אחרת מההסבר הקיים: דוגמה מהחיים, ציור במילים, או צעד אחר צעד.\n"
        "- הסבר למה התשובה הנכונה נכונה, ובעדינות מה הטעות בתשובה שנבחרה.\n"
        '- בלי האשמה ובלי "טעית". עודד: טעויות הן חלק מהלמידה.\n'
        f"- עברית פשוטה לגיל {age}, בלי ניקוד, לכל היותר 3 משפטים קצרים.\n"
        "- דייק מדעית. בלי קישורים, בלי סימני עיצוב ובלי שאלות אישיות.\n"
        '- החזר JSON בלבד: {"answer": "..."}'
    )


def _choice_text(choice: Any) -> str:
    if isinstance(choice, Mapping):
        return clean_text(
            choice.get("he") or choice.get("text_he") or choice.get("text")
        )
    return clean_text(str(choice))


def _choice_texts(question: Mapping[str, Any]) -> list[str]:
    choices = question.get("choices") or []
    return [_choice_text(c) for c in choices]


def _resolve(question: Mapping[str, Any], value: Any) -> str:
    """Human text for an answer value: an index, a choice id, a bool, a
    sequence (order) or a free value."""
    choices = question.get("choices") or []
    texts = _choice_texts(question)
    if isinstance(value, bool):
        return "נכון" if value else "לא נכון"
    if isinstance(value, int) and 0 <= value < len(texts):
        return texts[value]
    if isinstance(value, str):
        for choice, text in zip(choices, texts):
            if isinstance(choice, Mapping) and choice.get("id") == value:
                return text
    if isinstance(value, Sequence) and not isinstance(value, str):
        return ", ".join(_resolve(question, v) for v in value)
    return clean_text(str(value))[:40]


class Explainer:
    def __init__(
        self,
        router: Any,
        safety: Safety,
        cache_path: Path | str | None = None,
        *,
        log_store: LogStore | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.router = router
        self.safety = safety
        self.cache_path = Path(cache_path) if cache_path else None
        self.log_store = log_store
        self.clock = clock
        self.cache = self._load_cache()

    # -- cache -------------------------------------------------------------
    def _load_cache(self) -> dict[str, str]:
        if self.cache_path is None:
            return {}
        try:
            data = json.loads(self.cache_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        entries = data.get("entries") if isinstance(data, dict) else None
        if not isinstance(entries, dict):
            return {}
        return {str(k): str(v) for k, v in entries.items()}

    def _save_cache(self) -> None:
        if self.cache_path is None:
            return
        while len(self.cache) > CACHE_LIMIT:
            self.cache.pop(next(iter(self.cache)))
        try:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.cache_path.with_name(self.cache_path.name + ".tmp")
            tmp.write_text(
                json.dumps(
                    {"schema_version": 1, "entries": self.cache},
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            tmp.replace(self.cache_path)
        except OSError:
            pass

    # -- main ----------------------------------------------------------------
    def explain_again(
        self,
        question_dict: Mapping[str, Any],
        given_answer: Any,
        age: int,
        *,
        profile_id: str | None = None,
    ) -> OwlAnswer:
        item_id = str(
            question_dict.get("id")
            or question_dict.get("item_id")
            or clean_text(question_dict.get("prompt_he"))
        )
        key = f"{item_id}|{json.dumps(given_answer, ensure_ascii=False)}"
        if key in self.cache:
            return self._done(
                OwlAnswer(self.cache[key], "ai", "cache"), item_id
            )

        fallback = clean_text(question_dict.get("explanation_he"))
        correct = _resolve(question_dict, question_dict.get("answer"))
        if not fallback:
            fallback = f"התשובה הנכונה היא: {correct}."
        if self.router is None:
            return self._done(
                OwlAnswer(fallback, "canned", "disabled"), item_id
            )

        given = _resolve(question_dict, given_answer)
        lines = [
            f"השאלה: {clean_text(question_dict.get('prompt_he'))}",
        ]
        texts = _choice_texts(question_dict)
        if texts:
            lines.append("האפשרויות: " + " | ".join(texts))
        lines += [
            f"התשובה הנכונה: {correct}",
            f"התשובה שנבחרה: {given}",
            f"ההסבר הקיים: {fallback}",
            f"כתוב הסבר אחר, קצר וברור, לילד או ילדה בגיל {age}.",
        ]
        messages = [
            {"role": "system", "content": explain_system_prompt(age)},
            {"role": "user", "content": "\n".join(lines)},
        ]
        try:
            result = self.router.chat(
                messages,
                purpose="kid",
                budget_key=profile_id or "explain",
                json_schema=EXPLAIN_SCHEMA,
                temperature=0.4,
                max_tokens=600,
                timeout=15.0,
                deadline=30.0,
            )
        except Exception:  # noqa: BLE001 - offline, budget, anything
            return self._done(
                OwlAnswer(fallback, "canned", "offline"), item_id
            )
        text, _ = parse_model_answer(result.text)
        verdict = self.safety.check_output(text, question_is_hebrew=True)
        if not verdict.ok:
            return self._done(
                OwlAnswer(fallback, "canned", "output_filter"), item_id
            )
        self.cache[key] = verdict.text
        self._save_cache()
        return self._done(OwlAnswer(verdict.text, "ai"), item_id)

    def _done(self, answer: OwlAnswer, item_id: str) -> OwlAnswer:
        if self.log_store is not None:
            try:
                self.log_store.append(
                    {
                        "ts": self.clock(),
                        "kind": "explain",
                        "item_id": item_id,
                        "answer": answer.text_he,
                        "source": answer.source,
                        "reason": answer.reason,
                    }
                )
            except Exception:  # noqa: BLE001
                pass
        return answer
