# SPDX-License-Identifier: GPL-3.0
""" "Ask the wise owl": kid-facing Q&A with a local safety layer, a
parent-visible log and offline canned answers (SDD_AI §8)."""

from __future__ import annotations

import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from nagmon.ai.canned import CannedAnswers
from nagmon.ai.router import AllProvidersFailed, BudgetExceeded
from nagmon.ai.safety import MSG_TOPIC, Safety
from nagmon.ai.text import clean_text, has_hebrew
from nagmon.ai.validate import ValidationError, extract_json

OWL_NOTICE_HE = "ההורים יכולים לקרוא את השיחות עם הינשוף"
PII_REDACTED_HE = "[הוסר: פרטים אישיים]"
TRY_TOMORROW_HE = "אפשר לשאול שוב מחר."

OWL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "refusal": {"type": "boolean"},
        "needs_parent": {"type": "boolean"},
    },
    "required": ["answer", "refusal", "needs_parent"],
    "additionalProperties": False,
}

Source = Literal["ai", "canned", "blocked"]


class LogStore(Protocol):
    def append(self, entry: dict[str, Any]) -> Any: ...


@dataclass(frozen=True)
class OwlAnswer:
    text_he: str
    source: Source
    reason: str | None = None
    alert: bool = False


def owl_system_prompt(age: int) -> str:
    return f"""אתה "הינשוף החכם", דמות חביבה במשחק לימודי לילדים בישראל.
אתה מדבר עם ילד או ילדה בגיל {age}.
כללים:
- ענה בעברית פשוטה וברורה שמתאימה לגיל {age}, בלי ניקוד.
- לכל היותר 3 משפטים קצרים, עד 50 מילים.
- דייק מדעית. עדיף הסבר פשוט ונכון על הסבר מסובך. אם אינך בטוח, אמור "אני לא בטוח" והצע לבדוק יחד עם מבוגר.
- פנה בלשון ניטרלית, למשל "בואו נגלה" או "אפשר לנסות".
- אל תכתוב קישורים, אל תמליץ על אתרים או אפליקציות, ואל תשתמש בסימני עיצוב.
- לעולם אל תשאל שאלות אישיות (שם, גיל, כתובת, בית ספר, טלפון) ואל תבקש פרטים.
- אל תעמיד פנים שאתה אדם.
- שמור על ערכים צנועים ומשפחתיים: בלי אלימות, בלי פחד, בלי רומנטיקה ובלי נושאים למבוגרים.
- נושאים מותרים: מדע, טבע, בעלי חיים, חלל, גוף האדם, מתמטיקה, שפה, אנגלית, גאוגרפיה וידע כללי ברמת בית ספר יסודי.
- אם השאלה לא מתאימה לילדים, או שהיא על דת, פוליטיקה, מלחמה, מוות, בריאות אישית או רפואה: אל תענה על התוכן, והחזר refusal=true.
- החזר JSON בלבד: {{"answer": "...", "refusal": false, "needs_parent": false}}"""


def parse_model_answer(text: str) -> tuple[str, bool]:
    """(answer text, refused). Plain text (no JSON) is taken as-is."""
    try:
        data = extract_json(text)
    except ValidationError:
        return text, False
    if not isinstance(data, dict):
        return "", False
    refused = bool(data.get("refusal")) or bool(data.get("needs_parent"))
    answer = data.get("answer")
    return (answer if isinstance(answer, str) else ""), refused


class Owl:
    def __init__(
        self,
        router: Any,
        safety: Safety,
        log_store: LogStore | None,
        canned: CannedAnswers,
        *,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.router = router
        self.safety = safety
        self.log_store = log_store
        self.canned = canned
        self.clock = clock

    notice_he = OWL_NOTICE_HE

    def menu(self, profile_age: int) -> list[str]:
        """Ready questions for young kids (ages 5-7 pick from a menu)."""
        return self.canned.menu(profile_age)

    def ask(
        self,
        profile_age: int,
        question_he: str,
        *,
        profile_id: str | None = None,
    ) -> OwlAnswer:
        start = self.clock()
        question = clean_text(question_he)
        context = {"profile_id": profile_id, "age": profile_age}

        verdict = self.safety.check_input(question)
        if not verdict.ok:
            logged = PII_REDACTED_HE if verdict.category == "pii" else question
            answer = OwlAnswer(
                verdict.message_he, "blocked", verdict.category, verdict.alert
            )
            return self._finish(answer, logged, context, start)

        faq = self.canned.exact(question)
        if faq is not None:
            return self._finish(
                OwlAnswer(faq.a_he, "canned", "faq"), question, context, start
            )
        if self.router is None:
            return self._canned(question, "disabled", context, start)

        messages = [
            {"role": "system", "content": owl_system_prompt(profile_age)},
            {"role": "user", "content": question},
        ]
        try:
            result = self.router.chat(
                messages,
                purpose="kid",
                budget_key=profile_id or "anon",
                json_schema=OWL_SCHEMA,
                temperature=0.3,
                max_tokens=600,
                timeout=15.0,
                deadline=30.0,
            )
        except BudgetExceeded:
            return self._canned(question, "budget", context, start)
        except AllProvidersFailed:
            return self._canned(question, "offline", context, start)
        except Exception:  # noqa: BLE001 - a kid screen must never crash
            return self._canned(question, "error", context, start)

        context.update(provider=result.provider, model=result.model)
        text, refused = parse_model_answer(result.text)
        if refused:
            answer = OwlAnswer(MSG_TOPIC, "blocked", "model_refusal")
            return self._finish(answer, question, context, start)
        out = self.safety.check_output(
            text, question_is_hebrew=has_hebrew(question)
        )
        if not out.ok:
            context["model_output"] = result.text[:500]
            context["filter"] = out.reason
            return self._canned(question, "output_filter", context, start)
        return self._finish(
            OwlAnswer(out.text, "ai"), question, context, start
        )

    # -- helpers -----------------------------------------------------------
    def _canned(
        self,
        question: str,
        reason: str,
        context: dict[str, Any],
        start: float,
    ) -> OwlAnswer:
        item = self.canned.match(question)
        text = item.a_he if item else self.canned.fallback_he
        if reason == "budget":
            tail = item.a_he if item else TRY_TOMORROW_HE
            text = f"{self.canned.sleepy_he} {tail}"
        return self._finish(
            OwlAnswer(text, "canned", reason), question, context, start
        )

    def _finish(
        self,
        answer: OwlAnswer,
        logged_question: str,
        context: Mapping[str, Any],
        start: float,
    ) -> OwlAnswer:
        entry = {
            "ts": start,
            "kind": "owl",
            "profile_id": context.get("profile_id"),
            "age": context.get("age"),
            "question": logged_question,
            "answer": answer.text_he,
            "source": answer.source,
            "reason": answer.reason,
            "alert": answer.alert,
            "provider": context.get("provider"),
            "model": context.get("model"),
            "latency_ms": int(round((self.clock() - start) * 1000)),
        }
        for key in ("model_output", "filter"):
            if key in context:
                entry[key] = context[key]
        if self.log_store is not None:
            try:
                self.log_store.append(entry)
            except Exception:  # noqa: BLE001 - logging must not break play
                pass
        return answer


class OwlLogAdapter:
    """Adapts ``log_store.append(dict)`` to WP8's
    ``OwlLog.append(pid, role, text, *, meta=None)``."""

    def __init__(self, owl_log: Any, pid: str) -> None:
        self.owl_log = owl_log
        self.pid = pid

    def append(self, entry: Mapping[str, Any]) -> None:
        meta = {
            k: v for k, v in entry.items() if k not in ("question", "answer")
        }
        self.owl_log.append(
            self.pid,
            "child",
            str(entry.get("question", "")),
            meta={"age": entry.get("age"), "kind": entry.get("kind", "owl")},
        )
        self.owl_log.append(
            self.pid, "owl", str(entry.get("answer", "")), meta=meta
        )
