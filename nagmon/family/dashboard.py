"""Parent dashboard helpers: a weekly conversation prompt per child.

A pure function from a summary of the child's week to one Hebrew
sentence the parent can use to start a conversation. Priority: something
mastered (ask the child to teach it) > a struggle (gentle, try together)
> something practised > a quiet week (no guilt).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

_MASTERED = (
    "בקשו מ{name} להסביר לכם את {topic}. ללמד מישהו אחר זו הדרך הכי טובה "
    "לזכור.",
    "{name} שלט/ה השבוע ב{topic}. בקשו ממנו/ממנה להסביר לכם איך עושים את "
    "זה, ותנו לו/לה להיות המורה.",
)
_STRUGGLE = (
    "שאלו את {name} מה היה מאתגר בנושא {topic}, ונסו לפתור יחד שאלה אחת. "
    "בלי לחץ: טעויות הן חלק מהלמידה.",
    "{name} עובד/ת השבוע על {topic}. אפשר לשאול מה עזר לו/לה עד עכשיו, "
    "ולהזכיר שגם מאמץ הוא הצלחה.",
)
_PRACTISED = (
    "שאלו את {name} מה הכי מעניין בנושא {topic}.",
    "בקשו מ{name} להראות לכם שאלה אחת על {topic} מהמשחק.",
)
_QUIET = (
    "אפשר לשאול את {name} מה הכי כיף במשחק, ולשחק יחד כמה דקות.",
    "שאלו את {name} איזו מפלצת הכי אהובה עליו/עליה, ולמה.",
)


@dataclass(frozen=True)
class WeekSummary:
    mastered: tuple[str, ...] = ()
    practised: tuple[str, ...] = ()
    struggles: tuple[str, ...] = ()
    days_practised: int = 0

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WeekSummary:
        def strings(key: str) -> tuple[str, ...]:
            v = d.get(key) or ()
            return tuple(x for x in v if isinstance(x, str) and x.strip())

        days = d.get("days_practised", 0)
        return cls(
            mastered=strings("mastered"),
            practised=strings("practised"),
            struggles=strings("struggles"),
            days_practised=days if isinstance(days, int) else 0,
        )


def _from(name: str) -> str:
    """Hebrew "from" prefix: 'מנועה', but 'מ־Noam' for Latin names."""
    return name if "א" <= name[0] <= "ת" else "־" + name


def conversation_prompt(
    name: str, summary: WeekSummary, *, variant: int = 0
) -> str:
    name = (name or "").strip()
    if not name:
        raise ValueError("name is required")
    if summary.mastered:
        templates, topic = _MASTERED, summary.mastered[0]
    elif summary.struggles:
        templates, topic = _STRUGGLE, summary.struggles[0]
    elif summary.practised:
        templates, topic = _PRACTISED, summary.practised[0]
    else:
        templates, topic = _QUIET, ""
    template = templates[variant % len(templates)]
    text = template.replace("מ{name}", "מ" + _from(name))
    return text.format(name=name, topic=topic)
