"""Parent dashboard: every number comes with a Hebrew explanation."""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from nagmon.learning.generators.misconceptions import MISCONCEPTIONS
from nagmon.learning.learner import LearnerState, LogEntry
from nagmon.learning.srs import DAY

if TYPE_CHECKING:
    from nagmon.learning.content import ContentLibrary

SUBJECT_HE = {
    "math": "חשבון",
    "geometry": "גאומטריה",
    "english": "אנגלית",
    "science": "מדעים",
    "logic": "חשיבה",
    "hebrew": "עברית",
    "family": "משפחה",
}
STRUGGLE_MIN_N = 6
STRUGGLE_ACC = 0.6


@dataclass(frozen=True)
class Stat:
    value: Any
    explanation_he: str


@dataclass(frozen=True)
class SubjectStats:
    subject: str
    title_he: str
    accuracy_7d: Stat
    accuracy_30d: Stat
    answered_7d: Stat
    time_7d_s: Stat
    mastered: Stat
    stars: Stat


@dataclass(frozen=True)
class MisconceptionStat:
    tag: str
    count: int
    text_he: str


@dataclass(frozen=True)
class StrugglingSkill:
    skill_id: str
    title_he: str
    accuracy: Stat
    misconceptions: tuple[MisconceptionStat, ...]


@dataclass(frozen=True)
class MasteredSkill:
    skill_id: str
    title_he: str
    ts: float


@dataclass(frozen=True)
class DashboardData:
    generated_at: float
    learner_name: str
    subjects: dict[str, SubjectStats]
    time_7d_s: Stat
    time_30d_s: Stat
    answered_total: Stat
    mastered_skills: tuple[MasteredSkill, ...]
    struggling: tuple[StrugglingSkill, ...]
    new_english_words: Stat


def _minutes(seconds: float) -> str:
    m = round(seconds / 60)
    if seconds and m == 0:
        return "פחות מדקה"
    return "דקה אחת" if m == 1 else f"{m} דקות"


def _accuracy(entries: list[LogEntry], days: int) -> Stat:
    n = len(entries)
    if n == 0:
        return Stat(None, f"אין עדיין תשובות ב־{days} הימים האחרונים.")
    c = sum(1 for e in entries if e.correct)
    pct = round(100 * c / n)
    return Stat(
        c / n, f"{pct}% הצלחה = {c} נכונות מתוך {n} ב־{days} הימים האחרונים."
    )


def _time(entries: list[LogEntry], days: int, what: str = "") -> Stat:
    total = sum(e.elapsed for e in entries)
    return Stat(
        total,
        f"{_minutes(total)} של מענה על {len(entries)} שאלות"
        f"{what} ב־{days} הימים האחרונים (סכום זמני המענה).",
    )


def _since(log: Iterable[LogEntry], now: float, days: int) -> list[LogEntry]:
    start = now - days * DAY
    return [e for e in log if e.ts >= start]


def build_dashboard(
    learner: LearnerState, content: ContentLibrary, now: float
) -> DashboardData:
    log = list(learner.log)
    last7 = _since(log, now, 7)
    last30 = _since(log, now, 30)
    subjects = list(learner.enabled_subjects or content.subjects())
    for e in log:
        if e.subject not in subjects:
            subjects.append(e.subject)
    per: dict[str, SubjectStats] = {}
    for subj in subjects:
        s7 = [e for e in last7 if e.subject == subj]
        s30 = [e for e in last30 if e.subject == subj]
        title = SUBJECT_HE.get(subj, subj)
        n_mastered = sum(
            1 for sid in learner.mastered if sid.split(".")[0] == subj
        )
        stars = learner.stars.get(subj, 0)
        per[subj] = SubjectStats(
            subject=subj,
            title_he=title,
            accuracy_7d=_accuracy(s7, 7),
            accuracy_30d=_accuracy(s30, 30),
            answered_7d=Stat(
                len(s7), f"{len(s7)} שאלות ב{title} נענו ב־7 הימים האחרונים."
            ),
            time_7d_s=_time(s7, 7, f" ב{title}"),
            mastered=Stat(
                n_mastered,
                f"{n_mastered} מיומנויות ב{title} "
                "נשלטו: דירוג גבוה, מספיק ניסיונות "
                "ודיוק של 80% לפחות לאחרונה.",
            ),
            stars=Stat(
                stars,
                f"{stars} כוכבי ידע ב{title}: כוכב אחד על כל מיומנות שנשלטה.",
            ),
        )
    mastered = tuple(
        MasteredSkill(
            sid,
            content.skills[sid].title_he if sid in content.skills else sid,
            ts,
        )
        for sid, ts in sorted(learner.mastered.items(), key=lambda kv: kv[1])
    )
    struggling = []
    by_skill: dict[str, list[LogEntry]] = {}
    for e in last30:
        by_skill.setdefault(e.skill, []).append(e)
    for sid, entries in by_skill.items():
        n = len(entries)
        c = sum(1 for e in entries if e.correct)
        if n < STRUGGLE_MIN_N or c / n >= STRUGGLE_ACC:
            continue
        tags = Counter(e.mis for e in entries if e.mis)
        mis = tuple(
            MisconceptionStat(
                t, k, MISCONCEPTIONS[t].parent_he if t in MISCONCEPTIONS else t
            )
            for t, k in tags.most_common(3)
        )
        title = content.skills[sid].title_he if sid in content.skills else sid
        expl = (
            f"{c} נכונות מתוך {n} ב־30 הימים האחרונים ({round(100 * c / n)}%)."
        )
        if mis:
            expl += (
                f' טעות חוזרת: "{mis[0].text_he}" ({mis[0].count} '
                "פעמים). מומלץ תרגול ממוקד."
            )
        struggling.append(StrugglingSkill(sid, title, Stat(c / n, expl), mis))
    struggling.sort(key=lambda s: s.accuracy.value)
    words = tuple(
        w
        for w, ts in sorted(learner.words.items(), key=lambda kv: kv[1])
        if ts >= now - 7 * DAY
    )
    return DashboardData(
        generated_at=now,
        learner_name=learner.name,
        subjects=per,
        time_7d_s=_time(last7, 7),
        time_30d_s=_time(last30, 30),
        answered_total=Stat(
            learner.answers_total,
            f"{learner.answers_total} שאלות מאז ההתחלה, "
            f"{learner.correct_total} מהן נכונות.",
        ),
        mastered_skills=mastered,
        struggling=tuple(struggling),
        new_english_words=Stat(
            words,
            f"{len(words)} מילים באנגלית שנענו נכון לראשונה ב־7 "
            "הימים האחרונים.",
        ),
    )
