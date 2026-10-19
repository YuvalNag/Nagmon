# SPDX-License-Identifier: GPL-3.0
"""
The intro movie at every launch (docs/kids/SDD_ART.md §2.4). The
playing itself is in ``nagmon/ui/intro.py``; ``NagmonStartupRule``
decides whether it runs (never headless).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, ClassVar

from nagmon.ui.intro import STATE_NAME, IntroMovie, IntroPlayer, frame_paths
from tuxemon.state.state import State
from tuxemon.user_config import CONFIG

if TYPE_CHECKING:
    from pygame.surface import Surface

    from tuxemon.base_client import BaseClient
    from tuxemon.platform.events import PlayerInput


class NagmonIntroState(State):
    """The owl clears the fog; any key, click or tap skips it."""

    name: ClassVar[str] = STATE_NAME

    def __init__(self, client: BaseClient, **kwargs: Any) -> None:
        super().__init__(client=client, **kwargs)
        self.player = IntroPlayer(
            client,
            IntroMovie(frame_paths()),
            volume=CONFIG.music_volume,
            owner=self,
        )

    def update(self, dt: float) -> None:
        super().update(dt)
        self.player.update(dt)

    def process_event(self, event: PlayerInput) -> PlayerInput | None:
        if event.pressed:
            self.player.press()
        return None

    def draw(self, surface: Surface) -> None:
        self.player.draw(surface)
