"""Screen time: per-child limits, play windows, bedtime, breaks, and
Shabbat / Yom Tov closing.

:class:`ScreenTimePolicy` is a pure function of ``now`` and the usage so
far. :class:`SessionTracker` measures play time (with an injected ``now``)
and persists daily usage in ``root/usage.json``.

Durations are always computed from ``timestamp()`` values: subtracting two
local datetimes that share a ``ZoneInfo`` ignores DST changes.
"""

from __future__ import annotations

import dataclasses
import math
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, tzinfo
from enum import Enum
from pathlib import Path
from typing import Any, Protocol

from nagmon.family._jsonio import as_int, atomic_write_json, load_json

USAGE_SCHEMA_VERSION = 1
WEEKDAYS_HE = ("שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "ראשון")


class Action(str, Enum):
    ALLOW = "allow"
    WARN_SOON = "warn_soon"
    BREAK_SUGGESTED = "break_suggested"
    MUST_STOP = "must_stop"


class Reason(str, Enum):
    DAILY_LIMIT = "daily_limit"
    OUTSIDE_WINDOW = "outside_window"
    SHABBAT = "shabbat"
    HOLIDAY = "holiday"
    BEDTIME = "bedtime"


# ------------------------------------------------------------------- limits


def _parse_hhmm(text: str) -> time:
    try:
        h, m = text.strip().split(":")
        return time(int(h), int(m))
    except (ValueError, AttributeError) as e:
        raise ValueError(f"bad time {text!r}") from e


def _fmt(t: time) -> str:
    return f"{t.hour:02d}:{t.minute:02d}"


@dataclass(frozen=True)
class TimeWindow:
    start: time
    end: time

    def __post_init__(self) -> None:
        if not self.start < self.end:
            raise ValueError("window must end after it starts")

    @classmethod
    def parse(cls, text: str) -> TimeWindow:
        if not isinstance(text, str) or text.count("-") != 1:
            raise ValueError(f"bad window {text!r}")
        a, b = text.split("-")
        return cls(_parse_hhmm(a), _parse_hhmm(b))

    def contains(self, t: time) -> bool:
        return self.start <= t < self.end

    def __str__(self) -> str:
        return f"{_fmt(self.start)}-{_fmt(self.end)}"


Windows = tuple[str, ...] | None


@dataclass(frozen=True)
class ScreenLimits:
    """Per-child limits. ``None`` windows = no window restriction; an
    empty tuple = no play on those days."""

    daily_max_minutes: int | None = 60
    weekday_windows: Windows = ("16:00-19:30",)
    weekend_windows: Windows = ("08:00-12:00", "16:00-19:30")
    weekend_days: tuple[int, ...] = (4, 5)  # Friday, Saturday
    bedtime: time | None = time(20, 0)
    wake_time: time = time(6, 0)
    break_every_minutes: int | None = 20
    break_minutes: int = 5
    warn_minutes: int = 5
    grace_minutes: int = 3

    def __post_init__(self) -> None:
        for name in ("weekday_windows", "weekend_windows"):
            value = getattr(self, name)
            if value is not None:
                value = tuple(str(TimeWindow.parse(w)) for w in value)
                object.__setattr__(self, name, value)
        object.__setattr__(self, "weekend_days", tuple(self.weekend_days))
        if self.daily_max_minutes is not None and self.daily_max_minutes < 0:
            raise ValueError("daily_max_minutes must be >= 0")
        for name in ("break_minutes", "warn_minutes", "grace_minutes"):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} must be >= 0")
        if self.break_every_minutes is not None and (
            self.break_every_minutes <= 0
        ):
            raise ValueError("break_every_minutes must be > 0")
        if self.bedtime is not None and not self.wake_time < self.bedtime:
            raise ValueError("bedtime must be after wake_time")

    def windows_for(self, d: date) -> tuple[TimeWindow, ...] | None:
        raw = (
            self.weekend_windows
            if d.weekday() in self.weekend_days
            else self.weekday_windows
        )
        if raw is None:
            return None
        return tuple(TimeWindow.parse(w) for w in raw)

    def to_dict(self) -> dict[str, Any]:
        d = dataclasses.asdict(self)
        for name in ("weekday_windows", "weekend_windows", "weekend_days"):
            if d[name] is not None:
                d[name] = list(d[name])
        d["bedtime"] = None if self.bedtime is None else _fmt(self.bedtime)
        d["wake_time"] = _fmt(self.wake_time)
        return d

    @classmethod
    def from_dict(cls, d: Any) -> ScreenLimits:
        """Lenient: each bad field falls back to its default."""
        default = cls()
        if not isinstance(d, dict):
            return default
        kwargs: dict[str, Any] = {}
        for name in (
            "daily_max_minutes",
            "break_every_minutes",
        ):
            if name in d:
                v = d[name]
                if v is None or as_int(v, -1) >= 0:
                    kwargs[name] = v
        for name in ("break_minutes", "warn_minutes", "grace_minutes"):
            if as_int(d.get(name), -1) >= 0:
                kwargs[name] = d[name]
        for name in ("weekday_windows", "weekend_windows"):
            if name in d:
                v = d[name]
                if v is None:
                    kwargs[name] = None
                elif isinstance(v, list):
                    try:
                        kwargs[name] = tuple(
                            str(TimeWindow.parse(w)) for w in v
                        )
                    except ValueError:
                        pass
        days = d.get("weekend_days")
        if isinstance(days, list) and all(
            as_int(x, -1) in range(7) for x in days
        ):
            kwargs["weekend_days"] = tuple(days)
        for name in ("bedtime", "wake_time"):
            if name in d:
                v = d[name]
                if v is None and name == "bedtime":
                    kwargs[name] = None
                elif isinstance(v, str):
                    try:
                        kwargs[name] = _parse_hhmm(v)
                    except ValueError:
                        pass
        try:
            return cls(**kwargs)
        except (ValueError, TypeError):
            return default


# --------------------------------------------------------------- decisions


@dataclass(frozen=True)
class Decision:
    action: Action
    reason: Reason | None = None
    minutes_left: int | None = None
    message_he: str = ""
    grace_seconds: int = 0
    resume_at: datetime | None = None


class RestrictionLike(Protocol):
    start: datetime
    end: datetime
    kind: str
    name_he: str


class RestrictionSource(Protocol):
    def next_restriction(
        self, now: datetime, *, shabbat: bool = True, yom_tov: bool = True
    ) -> RestrictionLike | None: ...


def _require_aware(now: datetime) -> None:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be a timezone-aware datetime")


def _at(d: date, t: time, tz: tzinfo | None) -> datetime:
    return datetime.combine(d, t, tzinfo=tz)


def _secs(a: datetime, b: datetime) -> float:
    return a.timestamp() - b.timestamp()


def _when_he(when: datetime, now: datetime) -> str:
    hhmm = _fmt(when.time())
    if when.date() == now.date():
        return f"ב־{hhmm}"
    if when.date() == now.date() + timedelta(days=1):
        return f"מחר ב־{hhmm}"
    return f"ביום {WEEKDAYS_HE[when.weekday()]} ב־{hhmm}"


def _minutes_he(n: int) -> str:
    return "דקה אחת" if n == 1 else f"{n} דקות"


def message_for(
    action: Action,
    reason: Reason | None = None,
    *,
    minutes_left: int | None = None,
    limits: ScreenLimits | None = None,
    resume_at: datetime | None = None,
    now: datetime | None = None,
    name_he: str = "",
) -> str:
    """Gentle, gender-neutral Hebrew message for a decision."""
    if action is Action.ALLOW:
        return ""
    if action is Action.WARN_SOON:
        return (
            f"עוד {_minutes_he(minutes_left or 0)} המפלצות הולכות לנוח. "
            "כדאי לסיים את מה שהתחלנו ולשמור."
        )
    if action is Action.BREAK_SUGGESTED:
        lim = limits or ScreenLimits()
        return (
            f"שיחקנו {lim.break_every_minutes} דקות. זה זמן טוב להפסקה של "
            f"{_minutes_he(lim.break_minutes)}: לשתות מים, להתמתח "
            "ולהסתכל רחוק."
        )
    if reason is Reason.SHABBAT:
        return "שבת שלום! המשחק נח בשבת. נתראה במוצאי שבת."
    if reason is Reason.HOLIDAY:
        greeting = "גמר חתימה טובה!" if name_he == "יום כיפור" else "חג שמח!"
        return f"{greeting} המשחק נח ב{name_he or 'חג'}. נתראה בצאת החג."
    if reason is Reason.BEDTIME:
        return "לילה טוב! המפלצות כבר הולכות לישון. נתראה מחר."
    if reason is Reason.OUTSIDE_WINDOW:
        when = (
            f" נתראה {_when_he(resume_at, now)}!"
            if resume_at is not None and now is not None
            else ""
        )
        return "עכשיו זה לא זמן משחק." + when
    return "זמן המשחק של היום נגמר. המפלצות הולכות לישון, ונתראה מחר!"


class ScreenTimePolicy:
    """Pure screen-time rules for one child."""

    def __init__(
        self,
        limits: ScreenLimits,
        *,
        calendar: RestrictionSource | None = None,
        shabbat: bool = True,
        holidays: bool = True,
        stop_before_minutes: int = 0,
        tz: tzinfo | None = None,
    ) -> None:
        self.limits = limits
        self.calendar = calendar
        self.shabbat = shabbat
        self.holidays = holidays
        self.stop_before = timedelta(minutes=stop_before_minutes)
        self.tz = tz

    def _stop(
        self,
        reason: Reason,
        now: datetime,
        resume_at: datetime | None,
        name_he: str = "",
    ) -> Decision:
        return Decision(
            Action.MUST_STOP,
            reason,
            0,
            message_for(
                Action.MUST_STOP,
                reason,
                resume_at=resume_at,
                now=now,
                name_he=name_he,
            ),
            resume_at=resume_at,
        )

    def _next_window_start(self, now: datetime) -> datetime | None:
        lim = self.limits
        for i in range(8):
            d = now.date() + timedelta(days=i)
            wins = lim.windows_for(d)
            starts = (
                [_at(d, lim.wake_time, now.tzinfo)]
                if wins is None
                else [_at(d, w.start, now.tzinfo) for w in wins]
            )
            for s in sorted(starts):
                if s > now:
                    return s
        return None

    def _next_day_start(self, now: datetime) -> datetime | None:
        tomorrow = now.date() + timedelta(days=1)
        return self._next_window_start(_at(tomorrow, time(0), now.tzinfo))

    def evaluate(
        self,
        now: datetime,
        used_today_s: float,
        since_break_s: float = 0.0,
    ) -> Decision:
        _require_aware(now)
        if self.tz is not None:
            now = now.astimezone(self.tz)
        lim = self.limits
        left: list[float] = []  # seconds until something stops play

        # 1. Shabbat and Yom Tov
        if self.calendar is not None and (self.shabbat or self.holidays):
            r = self.calendar.next_restriction(
                now, shabbat=self.shabbat, yom_tov=self.holidays
            )
            if r is not None:
                stop_at = r.start - self.stop_before
                if _secs(stop_at, now) <= 0 < _secs(r.end, now):
                    reason = (
                        Reason.HOLIDAY
                        if r.kind == "holiday"
                        else Reason.SHABBAT
                    )
                    end = r.end.astimezone(now.tzinfo)
                    return self._stop(reason, now, end, r.name_he)
                left.append(_secs(stop_at, now))

        # 2. Bedtime
        t = now.time()
        if lim.bedtime is not None:
            if t >= lim.bedtime or t < lim.wake_time:
                wake_day = now.date() + timedelta(
                    days=1 if t >= lim.bedtime else 0
                )
                wake = _at(wake_day, lim.wake_time, now.tzinfo)
                return self._stop(Reason.BEDTIME, now, wake)
            left.append(_secs(_at(now.date(), lim.bedtime, now.tzinfo), now))

        # 3. Play windows
        wins = lim.windows_for(now.date())
        if wins is not None:
            current = next((w for w in wins if w.contains(t)), None)
            if current is None:
                return self._stop(
                    Reason.OUTSIDE_WINDOW, now, self._next_window_start(now)
                )
            left.append(_secs(_at(now.date(), current.end, now.tzinfo), now))

        # 4. Daily limit
        if lim.daily_max_minutes is not None:
            remaining = lim.daily_max_minutes * 60 - used_today_s
            if remaining <= 0:
                return self._stop(
                    Reason.DAILY_LIMIT, now, self._next_day_start(now)
                )
            left.append(remaining)

        minutes_left = (
            max(0, math.ceil(min(left) / 60 - 1e-9)) if left else None
        )
        if minutes_left is not None and minutes_left <= lim.warn_minutes:
            return Decision(
                Action.WARN_SOON,
                None,
                minutes_left,
                message_for(Action.WARN_SOON, minutes_left=minutes_left),
            )
        if (
            lim.break_every_minutes is not None
            and since_break_s >= lim.break_every_minutes * 60
        ):
            return Decision(
                Action.BREAK_SUGGESTED,
                None,
                minutes_left,
                message_for(Action.BREAK_SUGGESTED, limits=lim),
            )
        return Decision(Action.ALLOW, None, minutes_left, "")


# ----------------------------------------------------------------- tracker


def _is_iso_date(text: Any) -> bool:
    try:
        date.fromisoformat(text)
    except (TypeError, ValueError):
        return False
    return True


class SessionTracker:
    """Measures play sessions and applies the policy on every tick."""

    def __init__(
        self,
        root: Path,
        policy_for: Callable[[str], ScreenTimePolicy],
        *,
        tz: tzinfo,
        max_tick_gap_s: float = 120.0,
        retention_days: int = 35,
    ) -> None:
        self.path = Path(root) / "usage.json"
        self._policy_for = policy_for
        self.tz = tz
        self.max_tick_gap_s = max_tick_gap_s
        self.retention_days = retention_days
        res = load_json(self.path)
        self.recovered = res.recovered
        self._days: dict[str, dict[str, float]] = {}
        days = (res.data or {}).get("days", {})
        if isinstance(days, dict):
            for day, per in days.items():
                if isinstance(per, dict) and _is_iso_date(day):
                    self._days[day] = {
                        pid: float(v)
                        for pid, v in per.items()
                        if isinstance(v, (int, float))
                        and not isinstance(v, bool)
                    }
        self._pid: str | None = None
        self._last: float = 0.0
        self._since_break: float = 0.0
        self._deadline: float | None = None
        self._paused: dict[str, tuple[float, float]] = {}

    # ------------------------------------------------------------ queries

    @property
    def active_profile(self) -> str | None:
        return self._pid

    def used_seconds(self, pid: str, day: date) -> float:
        return self._days.get(day.isoformat(), {}).get(pid, 0.0)

    def week_minutes(self, pid: str, now: datetime) -> int:
        """Minutes played this week (Sunday .. today)."""
        _require_aware(now)
        today = now.astimezone(self.tz).date()
        start = today - timedelta(days=(today.weekday() + 1) % 7)
        total = sum(
            self.used_seconds(pid, start + timedelta(days=i))
            for i in range((today - start).days + 1)
        )
        return int(total // 60)

    # ----------------------------------------------------------- sessions

    def start(self, pid: str, now: datetime) -> Decision:
        _require_aware(now)
        if self._pid is not None:
            self.stop(now)
        ts = now.timestamp()
        policy = self._policy_for(pid)
        self._since_break = 0.0
        if pid in self._paused:
            stopped_at, carried = self._paused.pop(pid)
            if 0 <= ts - stopped_at < policy.limits.break_minutes * 60:
                self._since_break = carried
        self._pid = pid
        self._last = ts
        self._deadline = None
        d = policy.evaluate(now, self._used_today(pid, now), self._since_break)
        if d.action is Action.MUST_STOP:
            self._deadline = ts
            d = dataclasses.replace(d, grace_seconds=0)
        return d

    def tick(
        self, now: datetime, *, at_natural_break: bool = False
    ) -> Decision:
        _require_aware(now)
        if self._pid is None:
            raise RuntimeError("no active session")
        pid = self._pid
        ts = self._count(pid, now)
        policy = self._policy_for(pid)
        d = policy.evaluate(now, self._used_today(pid, now), self._since_break)
        if d.action is Action.MUST_STOP:
            if self._deadline is None:
                self._deadline = ts + policy.limits.grace_minutes * 60
            if at_natural_break:
                self._deadline = min(self._deadline, ts)
            grace = max(0, math.ceil(self._deadline - ts))
            d = dataclasses.replace(d, grace_seconds=grace)
        else:
            self._deadline = None
            if d.action is Action.BREAK_SUGGESTED:
                self._since_break = 0.0
        self._save()
        return d

    def stop(self, now: datetime) -> None:
        _require_aware(now)
        if self._pid is None:
            return
        pid = self._pid
        ts = self._count(pid, now)
        self._paused[pid] = (ts, self._since_break)
        self._pid = None
        self._deadline = None
        self._save()

    def ack_break(self, now: datetime) -> None:
        self._since_break = 0.0

    # ------------------------------------------------------------ helpers

    def _used_today(self, pid: str, now: datetime) -> float:
        return self.used_seconds(pid, now.astimezone(self.tz).date())

    def _count(self, pid: str, now: datetime) -> float:
        """Add the time since the last tick; return now's timestamp."""
        ts = now.timestamp()
        delta = ts - self._last
        if delta < 0:  # clock moved back
            delta = 0.0
        delta = min(delta, self.max_tick_gap_s)
        self._add_usage(pid, ts - delta, ts)
        self._since_break += delta
        self._last = ts
        return ts

    def _add_usage(self, pid: str, start_ts: float, end_ts: float) -> None:
        while end_ts > start_ts:
            day = datetime.fromtimestamp(start_ts, self.tz).date()
            next_midnight = _at(
                day + timedelta(days=1), time(0), self.tz
            ).timestamp()
            chunk_end = min(end_ts, next_midnight)
            per = self._days.setdefault(day.isoformat(), {})
            per[pid] = per.get(pid, 0.0) + (chunk_end - start_ts)
            start_ts = chunk_end

    def _save(self) -> None:
        if self._days:
            newest = max(date.fromisoformat(d) for d in self._days)
            cutoff = newest - timedelta(days=self.retention_days)
            self._days = {
                d: v
                for d, v in self._days.items()
                if date.fromisoformat(d) > cutoff
            }
        atomic_write_json(
            self.path,
            {"schema_version": USAGE_SCHEMA_VERSION, "days": self._days},
        )
