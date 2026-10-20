"""Celebrations: real-world rewards designed around motivation research.

Tangible rewards promised in advance and tied to performance tend to
undermine children's intrinsic motivation (Deci, Koestner & Ryan, 1999);
unexpected rewards and informational feedback do much less harm. So:

* Default mode is SURPRISE: the parent defines celebrations privately.
  When a child reaches an effort milestone (days practised, a skill
  mastered, an academy finished, weekly goals met) the board *suggests* a
  celebration to the parent. The child never sees a price list.
* The child-facing message is informational ("you worked hard on
  fractions!") and never names the prize.
* Nothing is ever revoked or deducted. Screen time is never a reward.
* VISIBLE_GOALS is an opt-in mode (with :data:`VISIBLE_GOALS_WARNING_HE`)
  in which children see goals and progress and can ask to redeem; every
  redemption still needs a parent.
* The family goal is suggested once per week in which every child met
  their own weekly goal.
"""

from __future__ import annotations

import secrets
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field, fields
from enum import Enum
from pathlib import Path
from typing import Any, Literal

from nagmon.family._jsonio import atomic_write_json, load_json
from nagmon.family.goals import FamilyWeekStatus

SCHEMA_VERSION = 1

VISIBLE_GOALS_WARNING_HE = (
    "שימו לב: מחקרים מראים שפרס מוחשי שמובטח מראש תמורת ביצוע עלול להחליש "
    "את המוטיבציה הפנימית של ילדים ללמוד (Deci, Koestner & Ryan, 1999). "
    "ילדים מתחילים ללמוד בשביל הפרס, ופחות בשביל ההנאה וההצלחה. "
    "חגיגת הפתעה אחרי מאמץ פוגעת הרבה פחות. אם תפעילו יעדים גלויים, "
    "מומלץ לשמור אותם מעטים, ולדבר עם הילד על המאמץ ולא על הפרס."
)


class RewardsError(ValueError):
    pass


class RewardsMode(str, Enum):
    SURPRISE = "surprise"
    VISIBLE_GOALS = "visible_goals"


class MilestoneKind(str, Enum):
    """Effort milestones only. There is no screen-time milestone."""

    PRACTICE_DAYS = "practice_days"
    SKILLS_MASTERED = "skills_mastered"
    SKILL = "skill"
    ACADEMY = "academy"
    WEEKLY_GOALS = "weekly_goals"
    STARS = "stars"


_NEEDS_TARGET = (MilestoneKind.SKILL, MilestoneKind.ACADEMY)


@dataclass
class Celebration:
    id: str
    title_he: str
    milestone: MilestoneKind
    threshold: int = 1
    target_id: str | None = None
    profile_id: str | None = None
    repeatable: bool = False
    secret: bool = False
    active: bool = True

    def to_dict(self) -> dict[str, Any]:
        d = {f.name: getattr(self, f.name) for f in fields(self)}
        d["milestone"] = self.milestone.value
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Celebration:
        names = {f.name for f in fields(cls)}
        kwargs = {k: v for k, v in d.items() if k in names}
        kwargs["milestone"] = MilestoneKind(kwargs["milestone"])
        return cls(**kwargs)


@dataclass(frozen=True)
class ProgressStats:
    """A child's effort so far, assembled by the runtime from the practice
    log and the learner state."""

    practice_days: int = 0
    skills_mastered: frozenset[str] = frozenset()
    academies: frozenset[str] = frozenset()
    weekly_goals_met: int = 0
    stars: int = 0
    titles: Mapping[str, str] = field(default_factory=dict)


SuggestionStatus = Literal["pending", "celebrated", "dismissed"]
SuggestionSource = Literal["milestone", "kid_request", "family_goal"]


@dataclass
class Suggestion:
    id: str
    profile_id: str | None
    celebration_id: str | None
    level: int
    source: SuggestionSource
    message_he: str
    created_at: float
    status: SuggestionStatus = "pending"
    decided_at: float | None = None
    week_start: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {f.name: getattr(self, f.name) for f in fields(self)}

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Suggestion:
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in names})


@dataclass(frozen=True)
class GoalView:
    """What a child sees in VISIBLE_GOALS mode."""

    celebration_id: str
    title_he: str
    progress: int
    target: int
    reached: bool


@dataclass
class FamilyGoal:
    title_he: str


def _value(c: Celebration, s: ProgressStats) -> int:
    k = c.milestone
    if k is MilestoneKind.PRACTICE_DAYS:
        return s.practice_days
    if k is MilestoneKind.SKILLS_MASTERED:
        return len(s.skills_mastered)
    if k is MilestoneKind.SKILL:
        return int(c.target_id in s.skills_mastered)
    if k is MilestoneKind.ACADEMY:
        return int(c.target_id in s.academies)
    if k is MilestoneKind.WEEKLY_GOALS:
        return s.weekly_goals_met
    return s.stars


def _level(c: Celebration, s: ProgressStats) -> int:
    value = _value(c, s)
    if value < c.threshold:
        return 0
    return value // c.threshold if c.repeatable else 1


def _message(c: Celebration, s: ProgressStats) -> str:
    k = c.milestone
    n = _value(c, s)
    title = s.titles.get(c.target_id or "", c.target_id or "")
    if k is MilestoneKind.PRACTICE_DAYS:
        return f"תרגלת כבר ב־{n} ימים שונים. ההתמדה שלך מרשימה!"
    if k is MilestoneKind.SKILLS_MASTERED:
        return f"שלטת כבר ב־{n} מיומנויות. עבדת קשה, וזה רואים!"
    if k is MilestoneKind.SKILL:
        return f"עבדת קשה על {title} והצלחת!"
    if k is MilestoneKind.ACADEMY:
        return f"סיימת את {title}! כל הכבוד על המאמץ."
    if k is MilestoneKind.WEEKLY_GOALS:
        return f"עמדת ביעד השבועי כבר {n} פעמים. איזו התמדה!"
    return f"אספת {n} כוכבים של ידע. כל כוכב הוא משהו שלמדת!"


FAMILY_MESSAGE_HE = "כל המשפחה עמדה ביעדים השבוע. עבדנו יחד!"


class RewardsBoard:
    def __init__(
        self, root: Path, *, clock: Callable[[], float] = time.time
    ) -> None:
        self.path = Path(root) / "rewards.json"
        self._clock = clock
        self.mode = RewardsMode.SURPRISE
        self.family_goal: FamilyGoal | None = None
        self._celebrations: dict[str, Celebration] = {}
        self._suggestions: list[Suggestion] = []
        # "<celebration_id>:<profile_id>" -> highest level already handled
        self._levels: dict[str, int] = {}
        self._family_weeks: set[str] = set()
        res = load_json(self.path)
        self.recovered = res.recovered
        if res.data:
            self._load(res.data)

    # ------------------------------------------------------------ settings

    def set_mode(self, mode: RewardsMode | str) -> None:
        self.mode = RewardsMode(mode)
        self._save()

    def set_family_goal(self, title_he: str | None) -> None:
        if title_he is not None and not title_he.strip():
            raise RewardsError("family goal needs a title")
        self.family_goal = FamilyGoal(title_he.strip()) if title_he else None
        self._save()

    # -------------------------------------------------------- celebrations

    def add_celebration(
        self,
        *,
        title_he: str,
        milestone: MilestoneKind | str,
        threshold: int = 1,
        target_id: str | None = None,
        profile_id: str | None = None,
        repeatable: bool = False,
        secret: bool = False,
    ) -> Celebration:
        c = Celebration(
            id="c" + secrets.token_hex(4),
            title_he=title_he,
            milestone=self._kind(milestone),
            threshold=threshold,
            target_id=target_id,
            profile_id=profile_id,
            repeatable=repeatable,
            secret=secret,
        )
        self._validate(c)
        self._celebrations[c.id] = c
        self._save()
        return c

    def update_celebration(self, c: Celebration) -> None:
        if c.id not in self._celebrations:
            raise KeyError(c.id)
        self._validate(c)
        self._celebrations[c.id] = c
        self._save()

    def remove_celebration(self, cid: str) -> None:
        """Deactivate (kept for history)."""
        self._celebrations[cid].active = False
        self._save()

    def celebrations(
        self, profile_id: str | None = None, *, include_inactive: bool = False
    ) -> list[Celebration]:
        return [
            c
            for c in self._celebrations.values()
            if (include_inactive or c.active)
            and (profile_id is None or c.profile_id in (None, profile_id))
        ]

    # ---------------------------------------------------------- milestones

    def evaluate(self, pid: str, stats: ProgressStats) -> list[Suggestion]:
        """Suggest celebrations for milestones newly reached by ``pid``."""
        new = []
        for c in self.celebrations(pid):
            key = f"{c.id}:{pid}"
            level = _level(c, stats)
            if level > self._levels.get(key, 0):
                self._levels[key] = level
                new.append(self._add(pid, c.id, level, "milestone", c, stats))
        if new:
            self._save()
        return new

    def evaluate_family(self, status: FamilyWeekStatus) -> Suggestion | None:
        if self.family_goal is None or not status.met:
            return None
        week = status.week_start.isoformat() if status.week_start else ""
        if week in self._family_weeks:
            return None
        self._family_weeks.add(week)
        s = Suggestion(
            id=self._new_id(),
            profile_id=None,
            celebration_id=None,
            level=1,
            source="family_goal",
            message_he=FAMILY_MESSAGE_HE,
            created_at=self._clock(),
            week_start=week,
        )
        self._suggestions.append(s)
        self._save()
        return s

    # -------------------------------------------------------------- parent

    def pending(self) -> list[Suggestion]:
        return [s for s in self._suggestions if s.status == "pending"]

    def history(self, pid: str) -> list[Suggestion]:
        return [s for s in self._suggestions if s.profile_id == pid]

    def mark_celebrated(self, sid: str) -> Suggestion:
        return self._decide(sid, "celebrated")

    def dismiss(self, sid: str) -> Suggestion:
        return self._decide(sid, "dismissed")

    # ---------------------------------------------------------------- kids

    def kid_view(self, pid: str, stats: ProgressStats) -> list[GoalView]:
        if self.mode is not RewardsMode.VISIBLE_GOALS:
            return []
        out = []
        for c in self.celebrations(pid):
            if c.secret:
                continue
            value = _value(c, stats)
            done = self._levels.get(f"{c.id}:{pid}", 0)
            target = c.threshold * (done + 1) if c.repeatable else c.threshold
            out.append(
                GoalView(c.id, c.title_he, value, target, _level(c, stats) > 0)
            )
        return out

    def request(self, pid: str, cid: str, stats: ProgressStats) -> Suggestion:
        if self.mode is not RewardsMode.VISIBLE_GOALS:
            raise RewardsError("requests are only possible in visible mode")
        c = self._celebrations.get(cid)
        if c is None or not c.active or c.profile_id not in (None, pid):
            raise KeyError(cid)
        existing = self._pending_for(pid, cid)
        if existing is not None:
            return existing
        level = _level(c, stats)
        if level <= self._levels.get(f"{cid}:{pid}", 0):
            raise RewardsError("this goal has not been reached yet")
        self._levels[f"{cid}:{pid}"] = level
        s = self._add(pid, cid, level, "kid_request", c, stats)
        self._save()
        return s

    # ------------------------------------------------------------- helpers

    @staticmethod
    def _kind(milestone: MilestoneKind | str) -> MilestoneKind:
        try:
            return MilestoneKind(milestone)
        except ValueError as e:
            raise RewardsError(f"unknown milestone {milestone!r}") from e

    @staticmethod
    def _validate(c: Celebration) -> None:
        if not isinstance(c.title_he, str) or not c.title_he.strip():
            raise RewardsError("celebration needs a title")
        if not isinstance(c.threshold, int) or c.threshold < 1:
            raise RewardsError("threshold must be >= 1")
        if c.milestone in _NEEDS_TARGET and not c.target_id:
            raise RewardsError(f"{c.milestone.value} needs a target_id")

    def _new_id(self) -> str:
        return "s" + secrets.token_hex(4)

    def _pending_for(self, pid: str, cid: str) -> Suggestion | None:
        for s in self._suggestions:
            if (
                s.status == "pending"
                and s.profile_id == pid
                and s.celebration_id == cid
            ):
                return s
        return None

    def _add(
        self,
        pid: str,
        cid: str,
        level: int,
        source: SuggestionSource,
        c: Celebration,
        stats: ProgressStats,
    ) -> Suggestion:
        s = Suggestion(
            id=self._new_id(),
            profile_id=pid,
            celebration_id=cid,
            level=level,
            source=source,
            message_he=_message(c, stats),
            created_at=self._clock(),
        )
        self._suggestions.append(s)
        return s

    def _decide(self, sid: str, status: SuggestionStatus) -> Suggestion:
        for s in self._suggestions:
            if s.id == sid:
                if s.status != "pending":
                    raise RewardsError("this suggestion was already decided")
                s.status = status
                s.decided_at = self._clock()
                self._save()
                return s
        raise KeyError(sid)

    def _load(self, d: dict[str, Any]) -> None:
        try:
            self.mode = RewardsMode(d.get("mode", "surprise"))
        except ValueError:
            self.mode = RewardsMode.SURPRISE
        goal = d.get("family_goal")
        if isinstance(goal, dict) and isinstance(goal.get("title_he"), str):
            self.family_goal = FamilyGoal(goal["title_he"])
        for raw in d.get("celebrations", []):
            try:
                c = Celebration.from_dict(raw)
                self._validate(c)
                self._celebrations[c.id] = c
            except (TypeError, ValueError, KeyError):
                continue
        for raw in d.get("suggestions", []):
            try:
                self._suggestions.append(Suggestion.from_dict(raw))
            except TypeError:
                continue
        levels = d.get("levels", {})
        if isinstance(levels, dict):
            self._levels = {
                k: v for k, v in levels.items() if isinstance(v, int)
            }
        weeks = d.get("family_weeks", [])
        if isinstance(weeks, list):
            self._family_weeks = {w for w in weeks if isinstance(w, str)}

    def _save(self) -> None:
        atomic_write_json(
            self.path,
            {
                "schema_version": SCHEMA_VERSION,
                "mode": self.mode.value,
                "family_goal": (
                    {"title_he": self.family_goal.title_he}
                    if self.family_goal
                    else None
                ),
                "celebrations": [
                    c.to_dict() for c in self._celebrations.values()
                ],
                "suggestions": [s.to_dict() for s in self._suggestions],
                "levels": self._levels,
                "family_weeks": sorted(self._family_weeks),
            },
        )


__all__ = [
    "VISIBLE_GOALS_WARNING_HE",
    "Celebration",
    "FamilyGoal",
    "GoalView",
    "MilestoneKind",
    "ProgressStats",
    "RewardsBoard",
    "RewardsError",
    "RewardsMode",
    "Suggestion",
]
