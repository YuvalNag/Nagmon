# SPDX-License-Identifier: GPL-3.0
"""Map-script conditions on the playing child's learning progress."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, ClassVar

from nagmon.runtime import get_runtime
from tuxemon.event.eventcondition import EventCondition
from tuxemon.session import Session


def _learner() -> Any:
    rt = get_runtime()
    return rt.learner if rt is not None else None


@dataclass
class StarsAtLeastCondition(EventCondition):
    """
    Whether the child has at least N knowledge stars in a subject
    ("all" counts every subject).

    Script usage:
        .. code-block::

            is stars_at_least <subject>,<count>
    """

    name: ClassVar[str] = "stars_at_least"
    subject: str
    count: int

    def test(self, session: Session) -> bool:
        learner = _learner()
        if learner is None:
            return False
        stars = getattr(learner, "stars", {}) or {}
        have = (
            sum(stars.values())
            if self.subject == "all"
            else stars.get(self.subject, 0)
        )
        return have >= self.count


@dataclass
class SkillMasteredCondition(EventCondition):
    """
    Whether the child mastered a skill.

    Script usage:
        .. code-block::

            is skill_mastered <skill_id>
    """

    name: ClassVar[str] = "skill_mastered"
    skill_id: str

    def test(self, session: Session) -> bool:
        learner = _learner()
        return learner is not None and self.skill_id in (
            getattr(learner, "mastered", {}) or {}
        )


@dataclass
class LanguageLevelAtLeastCondition(EventCondition):
    """
    Whether the child's language-ladder level is at least N (0-5).

    Script usage:
        .. code-block::

            is language_level_at_least <level>
    """

    name: ClassVar[str] = "language_level_at_least"
    level: int

    def test(self, session: Session) -> bool:
        rt = get_runtime()
        return rt is not None and rt.ladder()[0] >= self.level


@dataclass
class ProfileGradeAtLeastCondition(EventCondition):
    """
    Whether the playing child is at least in grade N (0 = kindergarten).

    Script usage:
        .. code-block::

            is profile_grade_at_least <grade>
    """

    name: ClassVar[str] = "profile_grade_at_least"
    grade: int

    def test(self, session: Session) -> bool:
        rt = get_runtime()
        return (
            rt is not None
            and rt.active is not None
            and rt.active.grade >= self.grade
        )


@dataclass
class NagmonPlayingCondition(EventCondition):
    """
    Whether a child profile is playing (Nagmon mode, not plain Tuxemon).

    Script usage:
        .. code-block::

            is nagmon_playing
    """

    name: ClassVar[str] = "nagmon_playing"

    def test(self, session: Session) -> bool:
        rt = get_runtime()
        return rt is not None and rt.active is not None
