# SPDX-License-Identifier: GPL-3.0
"""
A gentle daily limit for small world rewards (docs/kids/SDD_WORLD.md
§2.7). Unlike ``cooldown_days``, testing it never writes anything, so it
is safe in conditions that are checked every frame.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any, ClassVar

from tuxemon.event.eventcondition import EventCondition
from tuxemon.session import Session


def today() -> str:
    """The local date (replaced in tests)."""
    return date.today().isoformat()


def stamp(count: int) -> str:
    return f"{today()}:{count}"


def count_today(variables: Any, key: str) -> int:
    """How many times the counter ``key`` was used today."""
    raw = variables.get(f"nagmon_daily_{key}")
    if not raw or ":" not in str(raw):
        return 0
    day, _, count = str(raw).rpartition(":")
    if day != today():
        return 0
    try:
        return int(count)
    except ValueError:
        return 0


@dataclass
class NagmonDailyBelowCondition(EventCondition):
    """
    Whether the counter ``key`` was used fewer than ``limit`` times today.

    Script usage:
        .. code-block::

            is nagmon_daily_below <key>,<limit>
    """

    name: ClassVar[str] = "nagmon_daily_below"
    key: str
    limit: int

    def test(self, session: Session) -> bool:
        used = count_today(session.player.game_variables, self.key)
        return used < int(self.limit)
