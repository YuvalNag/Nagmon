# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

from pygame.rect import Rect

if TYPE_CHECKING:
    from tuxemon.base_client import BaseClient


class LayoutContext(Protocol):
    """
    Minimal interface the layout engine needs from Menu.
    """

    rect: Rect
    shrink_to_items: bool
    _anchors: list[tuple[str, int | tuple[int, int]]]

    def arrange_items(self) -> None: ...
    def update_cursor_visibility(self) -> None: ...
    def calc_internal_rect(self) -> Rect: ...
    def position_rect(self) -> None: ...

    @property
    def menu_items(self) -> Any: ...
    @property
    def menu_sprites(self) -> Any: ...
    @property
    def client(self) -> BaseClient: ...


class MenuLayoutEngine:
    """
    Pure layout engine for Menu.

    Computes the final rect and performs all layout steps without mutating
    the caller unless explicitly requested.
    """

    def compute(self, menu: LayoutContext, *, mutate: bool = False) -> Rect:
        """
        Compute the layout rect for the menu.

        If mutate=True, modifies menu.rect and related state.
        If mutate=False, returns the computed rect without side effects.
        """
        if mutate:
            return self._compute_mutating(menu)

        return self._compute_pure(menu)

    def _compute_mutating(self, menu: LayoutContext) -> Rect:
        """
        Perform layout exactly as Menu.refresh_layout() does today.
        This is the mutating path.
        """
        menu.arrange_items()
        menu.update_cursor_visibility()
        self._update_border(menu)
        return menu.rect

    def _compute_pure(self, menu: LayoutContext) -> Rect:
        """
        Pure version: compute final rect without mutating menu.
        """
        original_rect = menu.rect.copy()
        original_anchors = list(menu._anchors)

        # Perform layout
        menu.arrange_items()
        menu.update_cursor_visibility()
        self._update_border(menu)

        result = menu.rect.copy()

        # Restore state
        menu.rect = original_rect
        menu._anchors = original_anchors

        return result

    def _update_border(self, menu: LayoutContext) -> None:
        if not menu.shrink_to_items:
            return

        center = menu.rect.center

        rect1 = menu.menu_items.calc_bounding_rect()
        rect2 = menu.menu_sprites.calc_bounding_rect()
        rect1 = rect1.union(rect2)

        # TODO: remove hardcoded padding
        rect1.width += menu.client.context.scaling.scale_int(18)
        rect1.height += menu.client.context.scaling.scale_int(19)
        rect1.topleft = (0, 0)

        menu.rect = rect1
        self._make_room_for_cursor(menu)
        menu.rect.center = center
        menu.position_rect()

    @staticmethod
    def _make_room_for_cursor(menu: LayoutContext) -> None:
        """
        The items' area is the inside of the border less the cursor's
        margin. When the fixed padding is smaller than that margin (big
        text on a phone), the longest item crossed the border.
        """
        controller = getattr(menu, "cursor_controller", None)
        if controller is None:
            return
        margin_x, margin_y = controller.get_margin()
        items = menu.menu_items.calc_bounding_rect()
        inner = menu.calc_internal_rect()
        menu.rect.width += max(0, items.width + abs(margin_x) - inner.width)
        menu.rect.height += max(0, items.height + abs(margin_y) - inner.height)
