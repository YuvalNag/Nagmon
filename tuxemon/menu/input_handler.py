# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Protocol, TypeVar

import pygame

from tuxemon.menu.events import playerinput_to_event
from tuxemon.platform.const import buttons, intentions

if TYPE_CHECKING:
    from pygame.event import Event

    from tuxemon.menu.menu import Menu, PygameMenuState
    from tuxemon.platform.events import PlayerInput

logger = logging.getLogger(__name__)

T = TypeVar("T", covariant=True)


class PressLogicMixin:
    def _is_press(self, event: PlayerInput, delay: float) -> bool:
        if event.pressed:
            return True
        if event.held and event.hold_duration > delay:
            return True
        return False


class InputHandler(Protocol):
    def handle_event(self, event: PlayerInput) -> PlayerInput | None: ...


class MenuInputHandler(InputHandler, PressLogicMixin):
    """
    Handles input events for a Menu instance.

    Returns:
        None if the event was handled and should not propagate further.
        The original event otherwise.
    """

    REPEAT_DELAY = 0.50  # seconds before repeat starts
    REPEAT_INTERVAL = 0.08  # seconds between repeats

    def __init__(self, menu: Menu[T]) -> None:
        self._menu = menu
        self._repeat_timers: dict[int, float] = {}

    def handle_event(self, event: PlayerInput) -> PlayerInput | None:
        if (
            self._handle_escape(event)
            or self._handle_confirm(event)
            or self._handle_cursor(event)
            or self._handle_mouse(event)
        ):
            return None
        return event

    def _menu_interactable(self) -> bool:
        items = self._menu.menu_items
        return (
            self._menu.state_controller.is_enabled()
            and len(items) > 0
            and any(item.enabled for item in items)
        )

    def _repeat_due(self, button: int, event: PlayerInput) -> bool:
        if not event.is_held(self.REPEAT_DELAY):
            return False

        now = time.time()
        last = self._repeat_timers.get(button, 0.0)

        if now - last >= self.REPEAT_INTERVAL:
            self._repeat_timers[button] = now
            return True

        return False

    def _fake_press(self, event: PlayerInput) -> PlayerInput:
        fake = event.clone()
        fake.value = 1
        fake.previous_value = 0
        fake.hold_time = 1
        fake.hold_duration = 0.0
        fake.triggered = True
        return fake

    def _valid_press(self, event: PlayerInput) -> bool:
        if not self._menu_interactable():
            return False
        return self._is_press(event, self.REPEAT_DELAY)

    def _handle_escape(self, event: PlayerInput) -> bool:
        if event.button not in (
            buttons.B,
            buttons.BACK,
            intentions.MENU_CANCEL,
        ):
            return False

        if event.pressed and self._menu.escape_key_exits:
            self._menu.close()

        return True

    def _handle_confirm(self, event: PlayerInput) -> bool:
        if event.button not in (buttons.A, intentions.SELECT):
            return False

        if self._valid_press(event):
            self._menu.menu_select_sound.play()
            selected = self._menu.get_selected_item()
            if selected:
                self._menu.on_menu_selection(selected)

        return True

    def _handle_cursor(self, event: PlayerInput) -> bool:

        if event.button not in (
            buttons.UP,
            buttons.DOWN,
            buttons.LEFT,
            buttons.RIGHT,
        ):
            return False

        # If the menu cannot be interacted with, do not consume the event
        if not self._menu_interactable():
            return False

        if event.pressed:
            return self._cursor_move(event)

        if event.held and self._repeat_due(event.button, event):
            return self._cursor_move(self._fake_press(event))

        if event.released:
            self._repeat_timers[event.button] = 0.0
            return True

        # No action taken → do not consume the event
        return False

    def _cursor_move(self, event: PlayerInput) -> bool:
        new_index = self._menu.menu_items.determine_cursor_movement(
            self._menu.selected_index,
            event,
        )
        if new_index != self._menu.selected_index:
            self._menu.change_selection(new_index)
        return True

    def _handle_mouse(self, event: PlayerInput) -> bool:
        if event.button != buttons.MOUSELEFT:
            return False

        if not self._menu.touch_aware:
            return False

        if not self._menu_interactable():
            return False

        mouse_pos = event.value
        if not isinstance(mouse_pos, (tuple, list)) or len(mouse_pos) != 2:
            # The release of a click or tap carries no position; the menu
            # acted on the press.
            return False
        index = self._item_at((mouse_pos[0], mouse_pos[1]))
        if index is None:
            return False  # allow propagation
        if not event.pressed:
            # Held down: one tap is one choice, not one per frame.
            return True

        self._menu.change_selection(index)
        selected = self._menu.get_selected_item()
        if not selected:
            raise RuntimeError(
                "Menu selection was None despite enabled item being clicked"
            )
        self._menu.on_menu_selection(selected)
        return True

    def _item_at(self, pos: tuple[int, int]) -> int | None:
        """
        The enabled item under ``pos``. Items are hit-tested one by one:
        the group's own rect can miss the last row (the on-screen
        keyboard's END key).
        """
        items = self._menu.menu_items
        if hasattr(items, "update_rect_from_parent"):
            items.update_rect_from_parent()
        local_pos = (pos[0] - items.rect.left, pos[1] - items.rect.top)
        for index, item in enumerate(items):
            if item.enabled and item.rect.collidepoint(local_pos):
                return index
        return None


class PygameMenuInputHandler(InputHandler, PressLogicMixin):
    """
    Handles PlayerInput events for a PygameMenuState.

    Returns:
        None if the event was handled and should not propagate further.
        The original event otherwise.
    """

    REPEAT_DELAY = 0.50  # seconds before repeat starts

    def __init__(self, state: PygameMenuState) -> None:
        self._state = state
        #: A press landed on this menu and its release has not come yet.
        self._pressed_here = False

    def handle_event(self, event: PlayerInput) -> PlayerInput | None:
        if not self._state.state_controller.is_interactive():
            return event

        if not self._state.menu.is_enabled():
            return event

        if self._escape_consumes(event):
            logger.debug("Escape consumed by PygameMenuInputHandler")
            return None

        try:
            pygame_event = self._convert_event(event)
        except Exception as e:
            logger.error(f"Error converting PlayerInput to pygame event: {e}")
            return event

        if pygame_event is None:
            return event

        # Directional buttons: allow held repeat
        if event.button in (
            buttons.UP,
            buttons.DOWN,
            buttons.LEFT,
            buttons.RIGHT,
        ):
            if self._state.open and self._is_press(event, self.REPEAT_DELAY):
                try:
                    self._state.menu.update([pygame_event])
                    self._state.selected_widget = (
                        self._state.menu.get_selected_widget()
                    )
                except Exception as e:
                    logger.error(
                        f"Unexpected error in menu event processing: {e}"
                    )
            return None

        # Clicks and taps: both the press and the release go to the menu
        # (a button fires when both land on it). Outside the menu they
        # pass on, e.g. to the touch arrows.
        if event.button == buttons.MOUSELEFT:
            return self._handle_pointer(event, pygame_event)

        # All other buttons: pressed only (A, B, BACK, HOME, etc.)
        if self._state.open and event.pressed:
            try:
                self._state.menu.update([pygame_event])
                self._state.selected_widget = (
                    self._state.menu.get_selected_widget()
                )
            except Exception as e:
                logger.error(f"Unexpected error in menu event processing: {e}")

        return None

    def _handle_pointer(
        self, event: PlayerInput, pygame_event: Event
    ) -> PlayerInput | None:
        menu = self._state.menu
        inside = menu.get_rect().collidepoint(pygame_event.pos)
        if pygame_event.type == pygame.MOUSEBUTTONDOWN:
            if not inside:
                return event
            if event.pressed:
                self._pressed_here = True
            elif not self._pressed_here:
                # A held finger is sent again every frame. Only a real
                # press arms the release: a finger that went down on a
                # dialog on top must not press the button under it.
                return None
        elif not self._pressed_here:
            # The release of a tap that pressed something else, e.g. the
            # tap that closed a dialog on top: pygame_menu would press the
            # selected button under the finger.
            return None
        else:
            self._pressed_here = False
        if self._state.open:
            try:
                menu.update([pygame_event])
                self._state.selected_widget = menu.get_selected_widget()
            except Exception as e:
                logger.error(f"Unexpected error in menu event processing: {e}")
        return None

    def _escape_consumes(self, event: PlayerInput) -> bool:
        """
        Escape buttons consume the event only when escape_key_exits is False.
        """
        if event.button not in (
            buttons.B,
            buttons.BACK,
            intentions.MENU_CANCEL,
        ):
            return False

        # If escape_key_exits is True, PygameMenuState handles closing itself.
        # If escape_key_exits is False, we consume the event here.
        return not self._state.escape_key_exits

    def _convert_event(self, event: PlayerInput) -> Event | None:
        """
        Converts PlayerInput → pygame.Event using the adapter.
        Returns None when the event cannot be mapped. Exceptions are caught by the caller.
        """
        try:
            return playerinput_to_event(event)
        except Exception as e:
            logger.error(f"Error converting PlayerInput to pygame event: {e}")
            return None
