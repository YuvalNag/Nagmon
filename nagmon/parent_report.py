"""
The parent's report for one child (docs/kids/SDD_PROFILES_UI.md §2.4):
plain-Hebrew lines, each with an explanation of how it was computed
("every number is explained").
"""

from __future__ import annotations

from dataclasses import dataclass
from nagmon.family.dashboard import WeekSummary, conversation_prompt
from nagmon.runtime import NagmonRuntime, age_from_profile

WEEK_S = 7 * 24 * 3600
MAX_STRUGGLES = 3


@dataclass(frozen=True)
class ReportLine:
    text: str
    explanation: str = ""


def child_report(rt: NagmonRuntime, pid: str) -> list[ReportLine]:
    profile = rt.store.get(pid)
    if rt.active is not None and rt.active.id == pid:
        learner = rt.learner
    else:
        learner = rt.store.load_learner(pid)
    now = rt.now()
    age = age_from_profile(profile, rt.clock())
    target = rt.parent.settings.weekly_days_for(pid, age)
    week = rt.practice.weekly_status(
        pid, now, target_days=target, is_rest_day=rt.is_rest_day
    )
    lines = [
        ReportLine(
            week.message_he,
            f"תרגול ב-{week.practised_days} ימים השבוע מתוך יעד של "
            f"{week.target_days}. שבת וחג לא נספרים.",
        )
    ]

    mastered: list[str] = []
    struggles: list[str] = []
    practised: list[str] = []
    content = rt.content
    if content is not None and learner is not None:
        from nagmon.learning.dashboard import build_dashboard

        data = build_dashboard(learner, content, rt.clock())
        lines.append(
            ReportLine(
                f"זמן תרגול השבוע: {data.time_7d_s.value}",
                data.time_7d_s.explanation_he,
            )
        )
        for stats in data.subjects.values():
            if not stats.answered_7d.value:
                continue
            practised.append(stats.title_he)
            lines.append(
                ReportLine(
                    f"{stats.title_he}: {stats.accuracy_7d.value} הצלחה, "
                    f"{stats.mastered.value} מיומנויות נשלטו",
                    f"{stats.accuracy_7d.explanation_he} "
                    f"{stats.mastered.explanation_he}",
                )
            )
        recent = rt.clock() - WEEK_S
        mastered = [m.title_he for m in data.mastered_skills if m.ts >= recent]
        for skill in data.struggling[:MAX_STRUGGLES]:
            struggles.append(skill.title_he)
            why = "; ".join(m.text_he for m in skill.misconceptions)
            lines.append(
                ReportLine(
                    f"מתקשה ב: {skill.title_he} ({skill.accuracy.value})",
                    why or skill.accuracy.explanation_he,
                )
            )
        if data.new_english_words.value:
            lines.append(
                ReportLine(
                    f"מילים חדשות באנגלית: {data.new_english_words.value}",
                    data.new_english_words.explanation_he,
                )
            )

    summary = WeekSummary(
        mastered=tuple(mastered),
        practised=tuple(practised),
        struggles=tuple(struggles),
        days_practised=week.practised_days,
    )
    lines.append(
        ReportLine(
            conversation_prompt(profile.name, summary),
            "שאלה לשיחה עם הילד על מה שלמד השבוע.",
        )
    )
    return lines


def report_text(lines: list[ReportLine]) -> list[str]:
    return [line.text for line in lines]
