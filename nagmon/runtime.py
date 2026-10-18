"""
Who is playing right now: connects the active child's profile and
learning state to the game (docs/kids/SDD_PROFILES_UI.md §2.1).

Game-specific wiring (the save folder, the language ladder) is passed in
as ``on_activate``/``on_deactivate`` hooks so this module stays free of
pygame and tuxemon imports and can be tested on its own.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any

from nagmon.family.calendar import ShabbatCalendar
from nagmon.family.goals import PracticeLog
from nagmon.family.parent import ParentStore
from nagmon.family.profiles import Profile, ProfileStore
from nagmon.family.rewards import ProgressStats, RewardsBoard, Suggestion
from nagmon.family.screentime import (
    Action,
    Decision,
    ScreenTimePolicy,
    SessionTracker,
)

logger = logging.getLogger(__name__)

Hook = Callable[["NagmonRuntime"], None]

#: Age assumed for a child in grade N when no birth year is known.
SCHOOL_START_AGE = 6
KINDERGARTEN_AGE = 5


def age_from_profile(profile: Profile, now: float | None = None) -> int:
    """Age in years, from the birth year or else from the grade."""
    year = datetime.fromtimestamp(now if now is not None else time.time()).year
    if profile.birth_year:
        return max(3, year - profile.birth_year)
    if profile.grade <= 0:
        return KINDERGARTEN_AGE
    return profile.grade + SCHOOL_START_AGE


class NagmonRuntime:
    """
    Holds the family's stores and, once a child is chosen, their learner
    state and learning engine.

    Parameters:
        root: Nagmon's data folder (profiles, parent settings, usage).
        content_loader: Builds the learning content library (called once).
        learner_from_dict: Restores a learner from its saved dict.
        learner_new: Creates an empty learner.
        engine_factory: Builds an engine from (content, learner).
        on_activate: Called after a child becomes active.
        on_deactivate: Called after the active child is put away.
        avatars: Allowed avatar names (the modest list), or a predicate.
        clock: Seconds since the epoch.
        words_he: English word to Hebrew translation, for the ladder.
    """

    def __init__(
        self,
        root: Path,
        *,
        content_loader: Callable[[], Any] | None = None,
        learner_from_dict: Callable[[dict[str, Any]], Any] | None = None,
        learner_new: Callable[[], Any] | None = None,
        engine_factory: Callable[[Any, Any], Any] | None = None,
        on_activate: Hook | None = None,
        on_deactivate: Hook | None = None,
        avatars: Any = None,
        clock: Callable[[], float] = time.time,
        words_he: dict[str, str] | None = None,
    ) -> None:
        self.root = Path(root)
        self.clock = clock
        self.store = ProfileStore(
            self.root,
            avatars=avatars,
            learner_from_dict=learner_from_dict,
            learner_new=learner_new,
            clock=clock,
        )
        self.parent = ParentStore(self.root, clock=clock)
        self._content_loader = content_loader
        self._content: Any = None
        self._engine_factory = engine_factory
        self._on_activate = on_activate
        self._on_deactivate = on_deactivate
        # Kept by reference: the loader fills it once content is loaded.
        self._words_he = words_he if words_he is not None else {}
        self.active: Profile | None = None
        self.learner: Any = None
        self.engine: Any = None
        self.tracker = SessionTracker(self.root, self.policy_for, tz=self.zone)
        self.practice = PracticeLog(self.root, tz=self.zone)
        self.rewards = RewardsBoard(self.root, clock=clock)

    # ------------------------------------------------------------ time

    @property
    def zone(self) -> Any:
        return self.parent.settings.location.zone

    def now(self) -> datetime:
        return datetime.fromtimestamp(self.clock(), tz=self.zone)

    def policy_for(self, pid: str) -> ScreenTimePolicy:
        s = self.parent.settings
        return ScreenTimePolicy(
            s.limits_for(pid),
            calendar=ShabbatCalendar(s.location),
            shabbat=s.shabbat_mode,
            holidays=s.holiday_mode,
            stop_before_minutes=s.shabbat_stop_before_minutes,
            tz=self.zone,
        )

    def can_play(self, pid: str) -> Decision:
        """Whether ``pid`` may start playing now (no session is started)."""
        tracker = SessionTracker(self.root, self.policy_for, tz=self.zone)
        decision = tracker.start(pid, self.now())
        tracker.stop(self.now())
        return decision

    def start_play(self, pid: str) -> Decision:
        """
        Starts a play session for ``pid`` if screen time allows it, and
        makes them the active child. Returns the screen-time decision.
        """
        decision = self.can_play(pid)
        if decision.action is Action.MUST_STOP:
            return decision
        self.activate(pid)
        return self.tracker.start(pid, self.now())

    def tick(self, *, at_natural_break: bool = False) -> Decision | None:
        """Counts play time; call about once a minute while playing."""
        if self.active is None or self.tracker.active_profile is None:
            return None
        return self.tracker.tick(self.now(), at_natural_break=at_natural_break)

    def stop_play(self) -> None:
        """Ends the session and puts the child away."""
        if self.tracker.active_profile is not None:
            self.tracker.stop(self.now())
        self.deactivate()

    @property
    def content(self) -> Any:
        if self._content is None and self._content_loader is not None:
            self._content = self._content_loader()
        return self._content

    def activate(self, pid: str) -> None:
        """Makes ``pid`` the playing child (putting away the current one)."""
        if self.active is not None:
            self.deactivate()
        profile = self.store.get(pid)
        learner = self.store.load_learner(pid)
        learner.grade = profile.grade
        learner.age = age_from_profile(profile, self.clock())
        if hasattr(learner, "name"):
            learner.name = profile.name
        if hasattr(learner, "learner_id"):
            learner.learner_id = profile.id
        learner.settings.update(profile.settings.get("learning", {}))
        self.active = profile
        self.learner = learner
        if self._engine_factory is not None:
            self.engine = self._engine_factory(self.content, learner)
        logger.info("Active child: %s", profile.id)
        if self._on_activate is not None:
            self._on_activate(self)

    def deactivate(self) -> None:
        """Saves and puts away the playing child."""
        if self.active is None:
            return
        self.persist()
        self.active = None
        self.learner = None
        self.engine = None
        if self._on_deactivate is not None:
            self._on_deactivate(self)

    def persist(self) -> None:
        """Writes the playing child's profile and learning state."""
        if self.active is None or self.learner is None:
            return
        # Called after every answer: a full disk or a profile the store
        # will not accept (e.g. one recovered from a corrupt file) must
        # never crash the game. The learner is written first and alone.
        try:
            self.store.save_learner(self.active.id, self.learner)
        except (OSError, ValueError, KeyError):
            logger.exception("Could not save learning of %s", self.active.id)
        try:
            self.store.save(self.active)
        except (OSError, ValueError, KeyError):
            logger.exception("Could not save profile %s", self.active.id)

    def on_answer(self) -> list[Suggestion]:
        """
        After every answer: save, count today as a practice day, and see
        whether a celebration is due (the parent is told, not the child).
        """
        if self.active is None:
            return []
        self.persist()
        self.practice.record(self.active.id, self.now())
        return self.rewards.evaluate(
            self.active.id, self.progress_stats(self.active.id)
        )

    def progress_stats(self, pid: str) -> ProgressStats:
        """A child's effort so far, for celebrations."""
        if self.active is not None and self.active.id == pid:
            learner = self.learner
        else:
            learner = self.store.load_learner(pid)
        profile = self.store.get(pid)
        target = self.parent.settings.weekly_days_for(
            pid, age_from_profile(profile, self.clock())
        )
        mastered = getattr(learner, "mastered", {}) or {}
        stars = getattr(learner, "stars", {}) or {}
        return ProgressStats(
            practice_days=self.practice.total_days(pid),
            skills_mastered=frozenset(mastered),
            weekly_goals_met=self.practice.weeks_met(
                pid,
                self.now(),
                target_days=target,
                is_rest_day=self.is_rest_day,
            ),
            stars=sum(stars.values()),
        )

    def is_rest_day(self, d: Any) -> bool:
        """Shabbat and Yom Tov never count as days a child had to practise."""
        s = self.parent.settings
        return ShabbatCalendar(s.location).is_restricted_day(d)

    def ladder(self) -> tuple[int, dict[str, str]]:
        """
        The language-ladder level and the words the child already knows,
        as Hebrew word -> English word.
        """
        if self.active is None or self.learner is None:
            return 0, {}
        learned = getattr(self.learner, "words", {}) or {}
        known = {self._words_he[w]: w for w in learned if w in self._words_he}
        return self.active.language_level, known


_runtime: NagmonRuntime | None = None


def get_runtime() -> NagmonRuntime | None:
    return _runtime


def set_runtime(rt: NagmonRuntime | None) -> None:
    global _runtime
    _runtime = rt


def active_engine() -> Any:
    """The playing child's learning engine, or None (plain Tuxemon)."""
    rt = _runtime
    return rt.engine if rt is not None else None
