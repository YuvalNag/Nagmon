# SPDX-License-Identifier: GPL-3.0
"""
Title menu with the playing child (docs/kids/SDD_PROFILES_UI.md §2.5).

Imported as a module, not by class name, so the state loader does not
register Tuxemon's StartState a second time from this file.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, ClassVar

import tuxemon.states.start as core_start
from nagmon.runtime import get_runtime
from tuxemon.locale.locale import T

if TYPE_CHECKING:
    from pygame_menu.menu import Menu

    from tuxemon.base_client import BaseClient


class StartState(core_start.StartState):
    """Tuxemon's title menu, opened for the child who is playing."""

    name: ClassVar[str] = "StartState"

    def __init__(self, client: BaseClient, **kwargs: Any) -> None:
        self._shown_for: str | None = None
        super().__init__(client, **kwargs)

    def add_menu_items(self, menu: Menu) -> None:
        rt = get_runtime()
        if rt is not None and rt.active is not None:
            menu.add.label(
                T.format("nagmon_hello", {"name": rt.active.name}),
                font_size=self.font_type.big,
                label_id="nagmon_hello",
            )
            self._shown_for = rt.active.id
        super().add_menu_items(menu)
        if rt is not None:
            menu.add.button(
                T.translate("nagmon_switch_player"),
                self.switch_player,
                font_size=self.font_type.medium,
                button_id="nagmon_switch_player",
            )

    def switch_player(self) -> None:
        rt = get_runtime()
        if rt is not None:
            rt.stop_play()
        self.client.push_state("ProfileSelectState")

    def resume(self) -> None:
        super().resume()
        rt = get_runtime()
        if rt is None:
            return
        if rt.active is None:
            self.client.push_state("ProfileSelectState")
        elif rt.active.id != self._shown_for:
            # A child was chosen: their saves and greeting differ.
            self.menu.clear()
            self.add_menu_items(self.menu)
