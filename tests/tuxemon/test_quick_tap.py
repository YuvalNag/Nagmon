"""
A quick tap (press and release in one frame) presses the button it is
on. On the emulator most quick taps did nothing: the handlers saw only
the release (docs/kids/SDD_ANDROID.md, the emulator check).
"""

from __future__ import annotations

import pygame
import pytest

from tuxemon.platform.const import buttons
from tuxemon.platform.events import PlayerInput
from tuxemon.platform.platform_pygame.events import (
    PygameEventQueueHandler,
    PygameMouseInput,
)


def _mouse() -> PygameMouseInput:
    mouse = PygameMouseInput()
    mouse.buttons[buttons.MOUSELEFT] = PlayerInput(buttons.MOUSELEFT)
    return mouse


@pytest.fixture
def queue():
    pygame.display.init()
    pygame.event.clear()
    handler = PygameEventQueueHandler()
    yield handler
    pygame.event.clear()


def _post(kind, pos=(100, 100)):
    pygame.event.post(pygame.event.Event(kind, pos=pos, button=1))


def _frame(queue):
    return [
        (e.button, e.pressed, bool(e.value))
        for e in queue.process_events()
        if e.button == buttons.MOUSELEFT
    ]


def test_a_press_and_its_release_in_one_frame_reach_the_game_as_two(queue):
    queue.set_input(0, 0, _mouse())
    _post(pygame.MOUSEBUTTONDOWN)
    _post(pygame.MOUSEBUTTONUP)
    first = _frame(queue)
    second = _frame(queue)
    assert (buttons.MOUSELEFT, True, True) in first
    assert all(held for _, _, held in first)
    assert (buttons.MOUSELEFT, False, False) in second


def test_a_slow_tap_is_unchanged(queue):
    queue.set_input(0, 0, _mouse())
    _post(pygame.MOUSEBUTTONDOWN)
    first = _frame(queue)
    _post(pygame.MOUSEBUTTONUP)
    second = _frame(queue)
    assert (buttons.MOUSELEFT, True, True) in first
    assert (buttons.MOUSELEFT, False, False) in second


def test_events_after_a_held_back_release_keep_their_order(queue):
    _post(pygame.MOUSEBUTTONDOWN)
    _post(pygame.MOUSEBUTTONUP)
    pygame.event.post(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_a))
    assert [e.type for e in queue._this_frame()] == [pygame.MOUSEBUTTONDOWN]
    assert [e.type for e in queue._this_frame()] == [
        pygame.MOUSEBUTTONUP,
        pygame.KEYDOWN,
    ]
    assert queue._this_frame() == []
