"""Weekly practice goal with slack, instead of daily streaks.

Each child aims to practise on K days of the week (Sunday..Saturday).
Shabbat and Yom Tov are not counted as available days, so they are never
"missed". There is deliberately no streak anywhere in this module.

The family cooperative goal is met when *every* child meets their own
weekly goal (a sum of stars would favour the oldest child).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, timedelta, tzinfo
from pathlib import Path

from nagmon.family._jsonio import atomic_write_json, load_json

SCHEMA_VERSION = 1
RestDay = Callable[[date], bool]


def week_start(d: date) -> date:
    """The Sunday that starts ``d``'s week."""
    return d - timedelta(days=(d.weekday() + 1) % 7)


def age_on(
    today: date, birth_year: int | None, grade: int | None
) -> int | None:
    if birth_year is not None:
        return today.year - birth_year
    if grade is not None:
        return grade + 6 if grade >= 1 else 5
    return None


def default_weekly_days(age: int | None) -> int:
    """3 days for ages 5-7 (or unknown), 4 for older children."""
    if age is None or age <= 7:
        return 3
    return 4


def _message(practised: int, target: int, met: bool) -> str:
    days = "יום אחד" if practised == 1 else f"{practised} ימים"
    if met:
        return f"כל הכבוד! עמדת ביעד השבועי: תרגלת השבוע ב־{days}."
    if practised == 0:
        return f"היעד השבועי: {target} ימי תרגול. אפשר להתחיל מתי שרוצים."
    return f"תרגלת השבוע ב־{days} מתוך {target}. יש עוד זמן."


@dataclass(frozen=True)
class WeeklyStatus:
    week_start: date
    practised_days: int
    target_days: int
    available_days: int
    met: bool

    @property
    def message_he(self) -> str:
        return _message(self.practised_days, self.target_days, self.met)


@dataclass(frozen=True)
class FamilyWeekStatus:
    week_start: date | None
    met: bool
    children_met: tuple[str, ...]
    children_total: int


def family_week_status(
    statuses: Mapping[str, WeeklyStatus],
) -> FamilyWeekStatus:
    met = tuple(pid for pid, st in statuses.items() if st.met)
    starts = {st.week_start for st in statuses.values()}
    return FamilyWeekStatus(
        week_start=min(starts) if starts else None,
        met=bool(statuses) and len(met) == len(statuses),
        children_met=met,
        children_total=len(statuses),
    )


def _require_aware(now: datetime) -> None:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be a timezone-aware datetime")


class PracticeLog:
    """Which local days each child practised on (``root/practice.json``)."""

    def __init__(self, root: Path, *, tz: tzinfo) -> None:
        self.path = Path(root) / "practice.json"
        self.tz = tz
        res = load_json(self.path)
        self.recovered = res.recovered
        self._days: dict[str, set[date]] = {}
        raw = (res.data or {}).get("days", {})
        if isinstance(raw, dict):
            for pid, items in raw.items():
                if isinstance(items, list):
                    self._days[pid] = {
                        d for d in map(_parse_date, items) if d is not None
                    }

    def _local(self, now: datetime) -> date:
        _require_aware(now)
        return now.astimezone(self.tz).date()

    def record(self, pid: str, now: datetime) -> bool:
        """Mark today as practised. Returns True if it is a new day."""
        d = self._local(now)
        days = self._days.setdefault(pid, set())
        if d in days:
            return False
        days.add(d)
        self._save()
        return True

    def practised_on(self, pid: str, d: date) -> bool:
        return d in self._days.get(pid, set())

    def total_days(self, pid: str) -> int:
        return len(self._days.get(pid, set()))

    def _status_for_week(
        self,
        pid: str,
        start: date,
        target_days: int,
        is_rest_day: RestDay | None,
    ) -> WeeklyStatus:
        if not 1 <= target_days <= 7:
            raise ValueError("target_days must be 1..7")
        week = [start + timedelta(days=i) for i in range(7)]
        available = sum(
            1 for d in week if not (is_rest_day and is_rest_day(d))
        )
        practised = sum(1 for d in week if self.practised_on(pid, d))
        target = min(target_days, available)
        return WeeklyStatus(
            week_start=start,
            practised_days=practised,
            target_days=target,
            available_days=available,
            met=practised >= target,
        )

    def weekly_status(
        self,
        pid: str,
        now: datetime,
        *,
        target_days: int,
        is_rest_day: RestDay | None = None,
    ) -> WeeklyStatus:
        start = week_start(self._local(now))
        return self._status_for_week(pid, start, target_days, is_rest_day)

    def weeks_met(
        self,
        pid: str,
        now: datetime,
        *,
        target_days: int,
        is_rest_day: RestDay | None = None,
    ) -> int:
        """Completed weeks (before the current one) where the goal was met."""
        days = self._days.get(pid)
        if not days:
            return 0
        current = week_start(self._local(now))
        start = week_start(min(days))
        count = 0
        while start < current:
            st = self._status_for_week(pid, start, target_days, is_rest_day)
            if st.met and st.practised_days:
                count += 1
            start += timedelta(days=7)
        return count

    def _save(self) -> None:
        atomic_write_json(
            self.path,
            {
                "schema_version": SCHEMA_VERSION,
                "days": {
                    pid: sorted(d.isoformat() for d in days)
                    for pid, days in self._days.items()
                },
            },
        )


def _parse_date(text: object) -> date | None:
    try:
        return date.fromisoformat(text)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
