# SPDX-License-Identifier: GPL-3.0
"""
The world, watched for screen time (docs/kids/SDD_PROFILES_UI.md §2.6).

Imported as a module so the state loader does not register Tuxemon's
WorldState a second time from this file.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, ClassVar

import tuxemon.states.world_state as core_world
from nagmon.family.screentime import Action
from nagmon.runtime import get_runtime
from nagmon.screen_watch import ScreenTimeWatcher
from tuxemon.tools import open_dialog

if TYPE_CHECKING:
    from tuxemon.base_client import BaseClient
    from tuxemon.session import Session

logger = logging.getLogger(__name__)


class WorldState(core_world.WorldState):
    """Tuxemon's world plus gentle screen-time reminders and stops."""

    name: ClassVar[str] = "WorldState"

    def __init__(
        self,
        client: BaseClient,
        session: Session,
        map_name: str | None = None,
        yaml_name: str | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(client, session, map_name, yaml_name, **kwargs)
        rt = get_runtime()
        self.watcher = ScreenTimeWatcher(rt) if rt is not None else None

    def update(self, dt: float) -> None:
        super().update(dt)
        if self.watcher is None:
            return
        # A pause is natural when nothing (dialog, menu, battle) is open.
        at_break = self.client.current_state is self
        decision = self.watcher.update(dt, at_natural_break=at_break)
        if decision is None:
            return
        if decision.action is Action.MUST_STOP:
            self._stop(decision.message_he)
        elif decision.message_he:
            open_dialog(self.client, [decision.message_he])

    def _stop(self, message: str) -> None:
        engine = self.client.event_engine
        try:
            engine.execute_action("autosave")
        except Exception:
            logger.exception("Autosave before stopping failed")
        rt = get_runtime()

        def leave() -> None:
            if rt is not None:
                rt.stop_play()
            engine.execute_action("quit_world")

        self.watcher = None
        open_dialog(
            self.client,
            [message],
            on_complete=lambda: self.client.queue_command(leave),
        )
