# SPDX-License-Identifier: GPL-3.0
"""
The letter board on a phone (docs/kids/SDD_ANDROID.md §2.3, "מקלדת
האותיות בטלפון"): square keys as big as the screen allows, and a row of
its own for "done", "space" and "delete", with delete far from the
letters. ``keyboard_layout`` is pure geometry; ``InputMenu`` draws the
keys and ``PlacedSpriteList`` puts them in place.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import ceil
from typing import TYPE_CHECKING, Any, TypeVar

from pygame.rect import Rect

from tuxemon.sprite import VisualSpriteList

if TYPE_CHECKING:
    from tuxemon.menu.interface import MenuItem

_Item = TypeVar("_Item", bound="MenuItem[Any]")

#: The action row's widths, as parts of the board's width. What is left
#: (a quarter) is the two empty cells between the three keys.
DONE_PART = 0.25
SPACE_PART = 0.3
DELETE_PART = 0.2
#: Extra room above the action row, as a part of a key.
ACTION_GAP_PART = 1 / 3
MAX_ROWS = 8


@dataclass(frozen=True)
class KeyboardLayout:
    """Where every key goes, in screen pixels."""

    #: One rect per character, in reading order.
    chars: list[Rect]
    done: Rect
    space: Rect
    delete: Rect
    columns: int
    rows: int
    key: int

    @property
    def board(self) -> Rect:
        """The rect around every key."""
        return self.chars[0].unionall(
            [*self.chars, self.done, self.space, self.delete]
        )


def _key_size(area: Rect, chars: int, rows: int, gap: int) -> int:
    columns = ceil(chars / rows)
    width = (area.width - (columns - 1) * gap) / columns
    # rows of characters, the action row and the extra room above it
    height = (area.height - rows * gap) / (rows + 1 + ACTION_GAP_PART)
    return int(min(width, height))


def keyboard_layout(
    area: Rect, chars: int, *, gap: int, rtl: bool
) -> KeyboardLayout:
    """
    Square keys for ``chars`` characters inside ``area``, as big as they
    can be: tries every number of rows and keeps the biggest key (fewer
    rows on a tie). The board sits at the bottom of ``area``, centred.
    In right-to-left text the first key is on the right, and so is
    "done"; delete is at the other end of the action row.
    """
    chars = max(1, chars)
    rows = max(
        range(1, min(MAX_ROWS, chars) + 1),
        key=lambda r: (_key_size(area, chars, r, gap), -r),
    )
    key = max(1, _key_size(area, chars, rows, gap))
    columns = ceil(chars / rows)
    width = columns * key + (columns - 1) * gap
    extra = int(key * ACTION_GAP_PART)
    height = (rows + 1) * key + rows * gap + extra
    left = area.left + (area.width - width) // 2
    top = area.bottom - height

    def x_of(column: int) -> int:
        offset = column * (key + gap)
        return left + width - offset - key if rtl else left + offset

    rects = []
    for index in range(chars):
        row, column = divmod(index, columns)
        rects.append(Rect(x_of(column), top + row * (key + gap), key, key))

    action_top = top + rows * (key + gap) + extra
    done_w = int(width * DONE_PART)
    space_w = int(width * SPACE_PART)
    delete_w = int(width * DELETE_PART)
    blank = (width - done_w - space_w - delete_w) // 2

    def action(start: int, span: int) -> Rect:
        x = left + width - start - span if rtl else left + start
        return Rect(x, action_top, span, key)

    return KeyboardLayout(
        chars=rects,
        done=action(0, done_w),
        space=action(done_w + blank, space_w),
        delete=action(width - delete_w, delete_w),
        columns=columns,
        rows=rows,
        key=key,
    )


class PlacedSpriteList(VisualSpriteList[_Item]):
    """
    Menu items at fixed places (the phone's letter board) instead of a
    grid. ``places`` holds one screen rect per item, in item order; the
    grid's columns still drive the arrow keys.
    """

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.places: list[Rect] = []

    def arrange_menu_items(self) -> None:
        self.update_rect_from_parent()
        left, top = self.rect.topleft
        for item, place in zip(self.sprites(), self.places):
            item.rect.topleft = (place.left - left, place.top - top)
        self._arranged_size = self.rect.size
        self._needs_arrange = False
