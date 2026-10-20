# SPDX-License-Identifier: GPL-3.0
"""
The intro movie at every launch (docs/kids/SDD_ART.md §2.4). The
playing itself is in ``nagmon/ui/intro.py``; ``NagmonStartupRule``
decides whether it runs (never headless).

Also Nagmon's ``IntroState``, in place of Tuxemon's "press a key" screen
(docs/kids/SDD_ANDROID.md §2.7).
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


class IntroState(State):
    """
    Tuxemon's "press a key" screen, replaced: it is pixel art for a 16:9
    screen and its girl wears a short skirt. Whatever asks for it (the
    launch, an idle timer) gets Nagmon's title instead, once this state
    is on top: under the intro movie it waits for the movie to close.
    """

    name: ClassVar[str] = "IntroState"

    def __init__(self, client: BaseClient, **kwargs: Any) -> None:
        super().__init__(client=client, **kwargs)
        self._leaving = False

    def update(self, dt: float) -> None:
        super().update(dt)
        if not self._leaving and self.client.current_state is self:
            self._leaving = True
            # Not while the state stack is being updated.
            self.client.queue_command(
                lambda: self.client.replace_state("StartState")
            )

    def process_event(self, event: PlayerInput) -> PlayerInput | None:
        return None

    def draw(self, surface: Surface) -> None:
        """Nothing of Tuxemon's: the title comes on the next frame."""
