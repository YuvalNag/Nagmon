# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
"""
Phones and tablets: python-for-android detection, the drawing size and
touch-friendly defaults (docs/kids/SDD_ANDROID.md §2.3).

Detection reads the variables python-for-android's launcher sets, so it
works before ``platform.init()`` and before any path is computed.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable, Mapping
from typing import Any

logger = logging.getLogger(__name__)

#: Set by python-for-android's launcher before Python starts.
P4A_VARIABLES = ("ANDROID_ARGUMENT", "ANDROID_PRIVATE", "ANDROID_APP_PATH")

BASE_HEIGHT = 720
MIN_WIDTH = 1280


def is_android(env: Mapping[str, str] | None = None) -> bool:
    """Whether the game runs inside a python-for-android app."""
    env = os.environ if env is None else env
    return any(env.get(name) for name in P4A_VARIABLES)


def _even(value: float) -> int:
    return int(round(value / 2)) * 2


def logical_resolution(
    screen_w: int,
    screen_h: int,
    *,
    height: int = BASE_HEIGHT,
    min_width: int = MIN_WIDTH,
) -> tuple[int, int]:
    """
    A landscape drawing surface with the screen's shape, 720 pixels high,
    which SDL scales up to the whole screen. Screens squarer than 16:9
    keep a width of 1280 and grow taller instead, so no menu is squeezed.
    """
    long_side, short_side = max(screen_w, screen_h), min(screen_w, screen_h)
    if short_side <= 0:
        return min_width, height
    aspect = long_side / short_side
    width = _even(height * aspect)
    if width >= min_width:
        return width, height
    return min_width, _even(min_width / aspect)


#: Screens where a child walks around and needs the on-screen arrows.
#: Everywhere else the arrows would cover buttons that are tapped directly.
TOUCH_ARROW_STATES = frozenset({"WorldState"})
#: Opacity of the arrows (0-255); Tuxemon's 45 is hard to see on a phone.
TOUCH_ARROW_ALPHA = 150


def wants_touch_arrows(state_name: str | None) -> bool:
    return state_name in TOUCH_ARROW_STATES


def touch_defaults(config: dict[str, Any]) -> None:
    """
    Defaults for a phone, applied before the player's own settings file:
    on-screen arrows a child can see, taps on menus and the whole screen.
    """
    config["controller"]["overlay"] = True
    config["controller"]["transparency"] = TOUCH_ARROW_ALPHA
    config["controller"]["hide_mouse"] = False
    config["display"]["fullscreen"] = True


# ------------------------------------------------------------ app switching

Listener = Callable[[], None]
_switch_listeners: list[tuple[Listener, Listener]] = []


def on_app_switch(
    background: Listener, foreground: Listener
) -> Callable[[], None]:
    """
    Calls ``background`` when the phone switches to another app and
    ``foreground`` when it comes back. Returns a function that unsubscribes.
    """
    pair = (background, foreground)
    _switch_listeners.append(pair)
    return lambda: _switch_listeners.remove(pair)


def app_switched(to_background: bool) -> None:
    """Tells every listener; one that fails does not stop the others."""
    for background, foreground in list(_switch_listeners):
        try:
            (background if to_background else foreground)()
        except Exception:
            logger.exception("App switch listener failed")
