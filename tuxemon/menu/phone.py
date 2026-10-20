# SPDX-License-Identifier: GPL-3.0
"""
Lists that are too tall for a phone screen (docs/kids/SDD_ANDROID.md
§2.3, "מה שלא נכנס בגובה").

On a phone the buttons are 1.6 times bigger (``mobile.PHONE_UI_FACTOR``),
so a list of nine grades no longer fits one column. These helpers put such
a list in columns, side by side, the first column at the start of the line
(on the right in Hebrew). On a computer they do nothing.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from math import ceil
from typing import TYPE_CHECKING

from pygame_menu.locals import ALIGN_CENTER
from pygame_menu.widgets import Label

from tuxemon.platform import mobile

logger = logging.getLogger(__name__)

#: Pixels added around packed buttons, so none touches the menu's edge.
EDGE = 4

if TYPE_CHECKING:
    from pygame_menu import Menu
    from pygame_menu.widgets import Frame
    from pygame_menu.widgets.core.widget import Widget


def column_rows(count: int, row_height: int, available: int) -> list[int]:
    """
    How many of ``count`` rows go in each column so the columns fit in
    ``available`` pixels; one column when they already fit. The columns
    are as even as possible, the longer ones first.
    """
    if count <= 0:
        return []
    per_column = max(1, available // max(1, row_height))
    if count <= per_column:
        return [count]
    columns = ceil(count / per_column)
    base, extra = divmod(count, columns)
    return [base + 1 if i < extra else base for i in range(columns)]


def _frame(menu: Menu, horizontal: bool, width: int, height: int) -> Frame:
    add = menu.add.frame_h if horizontal else menu.add.frame_v
    frame = add(max(1, width), max(1, height), padding=0)
    # pygame_menu checks sizes to the pixel; the columns are measured from
    # the buttons themselves, so a rounding pixel must not raise.
    frame._relax = True
    return frame


def _place(menu: Menu, frame: Frame, index: int) -> None:
    """Moves ``frame`` (with what it holds) to ``index`` in the menu."""
    if menu.get_widgets().index(frame) != index:
        menu.move_widget_index(frame, index)


def pack_in_columns(
    menu: Menu,
    widgets: Sequence[Widget],
    available_height: int,
    *,
    rtl: bool,
    gap: int = 0,
) -> Frame | None:
    """
    On a phone, puts ``widgets`` in columns when they are taller than
    ``available_height``. Returns the frame that holds the columns, or
    None when nothing was changed (a computer, or the list fits).
    """
    if not mobile.is_android() or not widgets:
        return None
    first = widgets[0]
    index = menu.get_widgets().index(first)
    row_height = max(w.get_height() for w in widgets)
    rows = column_rows(len(widgets), row_height, available_height)
    if len(rows) <= 1:
        return None
    groups = []
    start = 0
    for count in rows:
        groups.append(list(widgets[start : start + count]))
        start += count
    widths = [max(w.get_width() for w in group) + gap for group in groups]
    if sum(widths) > menu.get_window_size()[0] - gap:
        # Too wide as well: the menu keeps one column and scrolls.
        logger.warning("%d buttons do not fit the screen", len(widgets))
        return None
    # a few pixels more: pygame_menu cuts a button that touches the edge
    height = max(rows) * row_height + EDGE
    outer = _frame(menu, True, sum(widths), height)
    columns = []
    for group, width in zip(groups, widths):
        column = _frame(menu, False, width, height)
        for widget in group:
            column.pack(widget, align=ALIGN_CENTER)
        columns.append(column)
    for column in reversed(columns) if rtl else columns:
        outer.pack(column)
    _place(menu, outer, index)
    menu.select_widget(first)
    return outer


def pack_in_row(
    menu: Menu,
    widgets: Sequence[Widget],
    *,
    rtl: bool,
    gap: int = 0,
) -> Frame | None:
    """On a phone, puts ``widgets`` side by side, the first one first."""
    if not mobile.is_android() or len(widgets) < 2:
        return None
    index = menu.get_widgets().index(widgets[0])
    width = sum(w.get_width() + gap for w in widgets)
    height = max(w.get_height() for w in widgets) + EDGE
    row = _frame(menu, True, width, height)
    for widget in reversed(widgets) if rtl else widgets:
        row.pack(widget, align=ALIGN_CENTER)
    _place(menu, row, index)
    return row


def height_of(widgets: Sequence[Widget]) -> int:
    """The height of widgets one under the other."""
    return sum(w.get_height() + w.get_margin()[1] for w in widgets)


def tighten_labels(menu: Menu, padding: tuple[int, int]) -> None:
    """On a phone, texts that are not buttons get less room around them."""
    if not mobile.is_android():
        return
    for widget in menu.get_widgets():
        if type(widget) is Label:
            widget.set_padding(padding)
