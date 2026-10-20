# SPDX-License-Identifier: GPL-3.0
"""
Title menu with the playing child (docs/kids/SDD_PROFILES_UI.md §2.5).

Imported as a module, not by class name, so the state loader does not
register Tuxemon's StartState a second time from this file.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, ClassVar

import tuxemon.states.start as core_start
from nagmon.family.screentime import Action
from nagmon.runtime import get_runtime
from nagmon.screen_watch import ScreenTimeWatcher
from tuxemon.locale.locale import T
from tuxemon.menu.phone import height_of, pack_in_columns
from tuxemon.menu.theme import selection_gap
from tuxemon.tools import open_dialog
from tuxemon.ui import bidi

if TYPE_CHECKING:
    from pygame_menu.menu import Menu

    from tuxemon.base_client import BaseClient

logger = logging.getLogger(__name__)


def _owl_on(rt: Any) -> bool:
    from nagmon.owl_service import load_ai_settings

    return load_ai_settings(rt.root).owl_enabled


class StartState(core_start.StartState):
    """Tuxemon's title menu, opened for the child who is playing."""

    name: ClassVar[str] = "StartState"

    def __init__(self, client: BaseClient, **kwargs: Any) -> None:
        self._shown_for: str | None = None
        self._watcher: Any = None
        self._pending_note: str | None = None
        self._stop_message: str | None = None
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
        if rt is not None and rt.active is not None and _owl_on(rt):
            menu.add.button(
                T.translate("nagmon_owl_title"),
                lambda: self.client.push_state("OwlState"),
                font_size=self.font_type.medium,
                button_id="nagmon_owl",
            )
        if rt is not None:
            menu.add.button(
                T.translate("nagmon_switch_player"),
                self.switch_player,
                font_size=self.font_type.medium,
                button_id="nagmon_switch_player",
            )
        # A phone: the buttons in columns when they are taller than the
        # screen (SDD_ANDROID §2.3).
        scaling = self.client.context.scaling
        labels = [w for w in menu.get_widgets() if not w.is_selectable]
        pack_in_columns(
            menu,
            [w for w in menu.get_widgets() if w.is_selectable],
            self.client.context.resolution[1]
            - height_of(labels)
            - scaling.scale_int(8),
            rtl=bidi.locale_is_rtl(),
            gap=selection_gap(scaling),
        )

    def update(self, dt: float) -> None:
        super().update(dt)
        self._watch_screen_time(dt)

    def _watch_screen_time(self, dt: float) -> None:
        """
        The title menu's minigame, the owl and the menu itself are screen
        time too (the world watches its own time while it is open).
        """
        rt = get_runtime()
        if rt is None or rt.active is None:
            self._watcher = None
            return
        if "WorldState" in self.client.active_state_names:
            return
        if self._watcher is None:
            self._watcher = ScreenTimeWatcher(rt)
        at_break = self.client.current_state is self
        decision = self._watcher.update(dt, at_natural_break=at_break)
        if decision is not None:
            if decision.action is Action.MUST_STOP:
                self._watcher = None
                message = decision.message_he
                # Not while the state stack is being updated.
                self.client.queue_command(lambda: self._time_up(rt, message))
                return
            if decision.message_he:
                self._pending_note = decision.message_he
        if self._pending_note and at_break:
            note, self._pending_note = self._pending_note, None
            open_dialog(self.client, [note])

    def _time_up(self, rt: Any, message: str) -> None:
        rt.stop_play()
        self._stop_message = message
        above = []
        for state in self.client.active_states:
            if state is self:
                break
            above.append(state)
        for state in above:
            self.client.pop_state(state)
        if not above:
            self._show_who_plays()
        # Otherwise resume() shows it, once the screens above are closed.

    def _show_who_plays(self) -> None:
        """'Who is playing?', with the reason play stopped on top."""
        self.client.push_state("ProfileSelectState")
        if self._stop_message:
            open_dialog(self.client, [self._stop_message])
            self._stop_message = None

    def _on_afk_threshold(self, level: str) -> None:
        # Tuxemon's idle timer replaced the title with its "press a key"
        # screen. Nagmon plays its own intro over the title instead, once,
        # and only when the title itself is on top: "who is playing?" or
        # the parent area above it must stay (SDD_ANDROID §2.8).
        if level != "IntroState" or self.client.current_state is not self:
            return
        from nagmon.ui import intro

        try:
            intro.start_intro(self.client)
        except Exception:  # the intro must never stop the game
            logger.exception("Could not play the intro")

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
            self._show_who_plays()
        elif rt.active.id != self._shown_for:
            # A child was chosen: their saves and greeting differ.
            from nagmon.ui.game_helpers import rebuild_menu

            rebuild_menu(self)
