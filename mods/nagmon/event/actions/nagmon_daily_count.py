# SPDX-License-Identifier: GPL-3.0
from __future__ import annotations

from dataclasses import dataclass
from typing import final

from mods.nagmon.event.conditions.nagmon_daily import count_today, stamp
from tuxemon.event.eventaction import EventAction
from tuxemon.session import Session


@final
@dataclass
class NagmonDailyCountAction(EventAction):
    """
    Count one more use of a daily-limited reward (docs/kids/SDD_WORLD.md
    §2.7). The counter starts again on a new day.

    Script usage:
        .. code-block::

            nagmon_daily_count <key>

    Script parameters:
        key: Short name of the counter (e.g. "cashier").
    """

    name = "nagmon_daily_count"
    key: str

    def start(self, session: Session) -> None:
        variables = session.player.game_variables
        used = count_today(variables, self.key)
        variables.set(f"nagmon_daily_{self.key}", stamp(used + 1))
