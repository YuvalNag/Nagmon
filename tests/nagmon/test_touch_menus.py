"""
WP13: taps and mouse clicks on pygame_menu screens (quiz, profiles,
parent area, owl). docs/kids/SDD_ANDROID.md §1.2 item 1 and §2.3.
"""

from __future__ import annotations

from types import SimpleNamespace

import pygame
import pygame_menu
import pytest

from tuxemon.menu.events import playerinput_to_event
from tuxemon.menu.input_handler import PygameMenuInputHandler
from tuxemon.platform.const import buttons
from tuxemon.platform.events import PlayerInput


@pytest.fixture(scope="module", autouse=True)
def display():
    pygame.init()
    if pygame.display.get_surface() is None:
        pygame.display.set_mode((640, 480))
    yield
    # pygame_menu keeps fonts across tests; a later test may restart the
    # font module and must not get these.
    import pygame_menu.font

    pygame_menu.font._cache.clear()


def _press(pos):
    return PlayerInput(buttons.MOUSELEFT, value=pos, previous_value=0)


def _release(pos):
    return PlayerInput(buttons.MOUSELEFT, value=0, previous_value=pos)


def test_mouse_press_becomes_button_down():
    event = playerinput_to_event(_press((12, 34)))
    assert event.type == pygame.MOUSEBUTTONDOWN
    assert event.pos == (12, 34) and event.button == 1


def test_mouse_release_becomes_button_up_at_the_same_place():
    event = playerinput_to_event(_release((12, 34)))
    assert event.type == pygame.MOUSEBUTTONUP
    assert event.pos == (12, 34) and event.button == 1


def test_keys_still_convert():
    assert (
        playerinput_to_event(PlayerInput(buttons.A, 1)).key == pygame.K_RETURN
    )


def _state():
    menu = pygame_menu.Menu(
        "t", 640, 480, theme=pygame_menu.themes.THEME_DEFAULT
    )
    clicked: list[str] = []
    first = menu.add.button("one", lambda: clicked.append("one"))
    second = menu.add.button("two", lambda: clicked.append("two"))
    state = SimpleNamespace(
        menu=menu,
        open=True,
        escape_key_exits=True,
        selected_widget=None,
        state_controller=SimpleNamespace(is_interactive=lambda: True),
    )
    return state, clicked, first, second


def _tap(handler, pos):
    results = [
        handler.handle_event(_press(pos)),
        handler.handle_event(_release(pos)),
    ]
    return results


def test_tap_on_a_button_presses_it():
    state, clicked, _, second = _state()
    handler = PygameMenuInputHandler(state)
    results = _tap(handler, second.get_rect(to_real_position=True).center)
    assert clicked == ["two"]
    assert results == [None, None]
    assert state.selected_widget is second


def test_tap_outside_the_menu_passes_through():
    state, clicked, _, _ = _state()
    state.menu.resize(200, 200, position=(0, 0, False))
    handler = PygameMenuInputHandler(state)
    press = _press((600, 460))
    assert handler.handle_event(press) is press
    assert clicked == []


def test_drag_from_one_button_to_another_presses_nothing():
    state, clicked, first, second = _state()
    handler = PygameMenuInputHandler(state)
    handler.handle_event(_press(first.get_rect(to_real_position=True).center))
    handler.handle_event(
        _release(second.get_rect(to_real_position=True).center)
    )
    assert clicked == []


def test_release_on_a_classic_menu_is_ignored():
    # Classic Tuxemon menus (the on-screen keyboard, dialogs) act on the
    # press; the release used to crash the game ("Invalid mouse_pos: 0").
    from tuxemon.menu.input_handler import MenuInputHandler

    handler = MenuInputHandler.__new__(MenuInputHandler)
    handler._menu = SimpleNamespace(touch_aware=True)
    handler._menu_interactable = lambda: True
    assert handler._handle_mouse(_release((10, 10))) is False


# ----------------------------------------------- touch arrows and the mouse


def _mouse_events(handler):
    return [e for e in handler.get_events()]


def test_tap_on_a_touch_arrow_is_not_also_a_click():
    # SDL sends a finger *and* a mouse event for one tap. The arrow takes
    # the finger; the click must not also hit whatever is under it.
    from tuxemon.platform.platform_pygame.events import PygameMouseInput

    mouse = PygameMouseInput()
    mouse.ignore_at = lambda pos: pos[0] < 100
    mouse.process_event(
        pygame.event.Event(pygame.MOUSEBUTTONDOWN, pos=(50, 50), button=1)
    )
    assert not any(e.pressed for e in _mouse_events(mouse))
    mouse.process_event(
        pygame.event.Event(pygame.MOUSEBUTTONDOWN, pos=(300, 50), button=1)
    )
    assert any(
        e.pressed and e.value == (300, 50) for e in _mouse_events(mouse)
    )


def test_input_manager_links_mouse_to_touch_arrows():
    from tuxemon.platform.input_manager import InputManager

    config = SimpleNamespace(
        controller=SimpleNamespace(
            overlay=True,
            transparency=45,
            hide_mouse=False,
            type=None,
            combo_window_seconds=5.0,
        )
    )
    manager = InputManager.__new__(InputManager)
    manager.config = config
    manager.resolution = (1600, 720)
    from tuxemon.platform.input_device import CoreDevices
    from tuxemon.platform.platform_pygame.events import PygameEventQueueHandler

    manager.event_queue = PygameEventQueueHandler()
    manager.core_devices = CoreDevices()
    manager.extra_devices = {}
    from tuxemon.platform.input_device import (
        ControllerOverlaySetup,
        MouseSetup,
    )

    manager._device_setups = {
        "overlay": ControllerOverlaySetup(),
        "mouse": MouseSetup(),
    }
    manager.setup_inputs()
    overlay, mouse = manager.core_devices.overlay, manager.core_devices.mouse
    assert overlay is not None and mouse is not None
    a_center = overlay.ui.a_button.rect.center
    assert mouse.ignore_at(a_center) is True
    assert mouse.ignore_at((800, 100)) is False


def test_dialogs_advance_on_a_tap():
    from tuxemon.states.dialog_state import DialogState

    assert buttons.MOUSELEFT in DialogState.default_advance_buttons


# ---------------------------------- touch arrows only where they are needed


def _overlay():
    from tuxemon.platform.platform_pygame.events import PygameTouchOverlayInput

    return PygameTouchOverlayInput(45, (1600, 720))


def _finger(kind, pos, size=(1600, 720)):
    return pygame.event.Event(
        kind, x=pos[0] / size[0], y=pos[1] / size[1], finger_id=1, touch_id=0
    )


def test_touch_arrows_work_on_the_map():
    overlay = _overlay()
    a = overlay.ui.a_button.rect.center
    overlay.process_event(_finger(pygame.FINGERDOWN, a))
    assert any(
        e.button == buttons.A and e.pressed for e in overlay.get_events()
    )


def test_hidden_touch_arrows_ignore_fingers_and_let_taps_through():
    overlay = _overlay()
    overlay.set_active(False)
    a = overlay.ui.a_button.rect.center
    overlay.process_event(_finger(pygame.FINGERDOWN, a))
    assert not any(e.pressed for e in overlay.get_events())
    assert overlay.get_touched_button(a) is None


def test_hiding_releases_a_held_arrow():
    overlay = _overlay()
    up = overlay.ui.dpad.rect.up.center
    overlay.process_event(_finger(pygame.FINGERDOWN, up))
    list(overlay.get_events())
    overlay.set_active(False)
    assert any(
        e.button == buttons.UP and e.released for e in overlay.get_events()
    )


def test_hidden_touch_arrows_are_not_drawn():
    overlay = _overlay()
    screen = pygame.Surface((1600, 720))
    screen.fill((0, 0, 0))
    before = pygame.image.tobytes(screen, "RGB")
    overlay.set_active(False)
    overlay.draw(screen)
    assert pygame.image.tobytes(screen, "RGB") == before
    overlay.set_active(True)
    overlay.draw(screen)
    assert pygame.image.tobytes(screen, "RGB") != before


@pytest.mark.parametrize(
    ("state", "shown"),
    [
        pytest.param("WorldState", True, id="map"),
        pytest.param("QuizState", False, id="question"),
        pytest.param("InputMenu", False, id="keyboard"),
        pytest.param("DialogState", False, id="dialog"),
        pytest.param(None, False, id="nothing"),
    ],
)
def test_which_screens_show_touch_arrows(state, shown):
    from tuxemon.platform.mobile import wants_touch_arrows

    assert wants_touch_arrows(state) is shown


def test_android_back_opens_the_menu():
    from tuxemon.config import TuxemonConfig

    keymap = TuxemonConfig().input.keyboard_button_map
    assert keymap[pygame.K_AC_BACK] == buttons.BACK
    assert keymap[pygame.K_ESCAPE] == buttons.BACK


def test_buttons_are_taller_on_a_phone():
    from tuxemon.menu.theme import widget_padding
    from tuxemon.scaling import DefaultScaling

    scaling = DefaultScaling(5)
    pc = widget_padding(scaling, touch=False)
    phone = widget_padding(scaling, touch=True)
    assert pc == (10, 20)
    assert phone[0] >= 2 * pc[0] and phone[1] > pc[1]
