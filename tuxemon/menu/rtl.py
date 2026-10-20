# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
"""
Right-to-left support for pygame_menu based states.

``install_pygame_menu_bidi`` wraps ``Widget._font_render_string``: every
pygame_menu widget (titles, labels, buttons, later ``set_title`` updates)
renders its text through that one method, so it is the single choke point
where logical text becomes visual. ``TextInput`` is skipped because its
cursor works on the logical string.
"""

from __future__ import annotations

from typing import Any

from pygame_menu.locals import ALIGN_LEFT, ALIGN_RIGHT

from tuxemon.ui import bidi

_installed = False


def start_menu_alignment() -> str:
    """pygame_menu alignment for the start of a line in this language."""
    return ALIGN_RIGHT if bidi.locale_is_rtl() else ALIGN_LEFT


def install_pygame_menu_bidi() -> None:
    """Make pygame_menu widgets draw RTL text in visual order (idempotent)."""
    global _installed
    if _installed:
        return

    from pygame_menu.widgets.core.widget import Widget
    from pygame_menu.widgets.widget.textinput import TextInput

    original = Widget._font_render_string

    def _font_render_string(
        self: Widget,
        text: str,
        color: Any = (0, 0, 0),
        use_background_color: bool = True,
    ) -> Any:
        if not isinstance(self, TextInput):
            text = bidi.ensure_visual(text)
        return original(self, text, color, use_background_color)

    _font_render_string.__doc__ = original.__doc__
    Widget._font_render_string = _font_render_string  # type: ignore[method-assign]
    _installed = True
