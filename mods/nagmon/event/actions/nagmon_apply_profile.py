# SPDX-License-Identifier: GPL-3.0
from __future__ import annotations

from dataclasses import dataclass
from typing import final

from nagmon.game_flow import avatar_by_key
from nagmon.runtime import get_runtime
from tuxemon.event.eventaction import EventAction
from tuxemon.session import Session


@final
@dataclass
class NagmonApplyProfileAction(EventAction):
    """
    Give the player the playing child's name, character and gender.

    Script usage:
        .. code-block::

            nagmon_apply_profile
    """

    name = "nagmon_apply_profile"

    def start(self, session: Session) -> None:
        rt = get_runtime()
        if rt is None or rt.active is None:
            return
        avatar = avatar_by_key(rt.active.avatar)
        player = session.player
        player.name = rt.active.name
        engine = session.client.event_engine
        engine.execute_action(
            "set_template", ["player", avatar.sprite, avatar.combat_sheet]
        )
        engine.execute_action(
            "set_char_attribute", ["player", "gender", avatar.gender]
        )
