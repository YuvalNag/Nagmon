# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from __future__ import annotations

from typing import TYPE_CHECKING

from tuxemon.graphics import load_raw_image, scale_surface, smooth_resize

if TYPE_CHECKING:
    from pygame.surface import Surface

    from tuxemon.db import NpcTemplateModel


_COMBAT_SHEET_CACHE: dict[tuple[str, int, int, int | None], CombatSheet] = {}


def get_combat_sheet(template: NpcTemplateModel) -> CombatSheet:
    file = f"gfx/sprites/player/{template.combat_sheet}.png"

    key = (
        file,
        template.combat_frame_width,
        template.combat_frame_height,
        template.combat_back_frame_height,
    )

    if key not in _COMBAT_SHEET_CACHE:
        _COMBAT_SHEET_CACHE[key] = CombatSheet(
            file_path=file,
            frame_w=template.combat_frame_width,
            frame_h=template.combat_frame_height,
            back_frame_h=template.combat_back_frame_height,
        )

    return _COMBAT_SHEET_CACHE[key]


class CombatSheet:
    @classmethod
    def from_template(cls, template: NpcTemplateModel) -> CombatSheet:
        file = f"gfx/sprites/player/{template.combat_sheet}.png"
        return cls(
            file_path=file,
            frame_w=template.combat_frame_width,
            frame_h=template.combat_frame_height,
            back_frame_h=template.combat_back_frame_height,
        )

    def __init__(
        self,
        file_path: str,
        frame_w: int,
        frame_h: int,
        back_frame_h: int | None = None,
    ):
        self.file_path = file_path
        self.frame_w = frame_w
        self.frame_h = frame_h
        # When None, the back height is auto-detected from the sheet (it
        # fills the full image height). An explicit value is validated
        # against the image instead. This lets a taller back sprite be
        # dropped in by editing only the PNG, even when the combat sheet is
        # swapped at runtime (e.g. via race/appearance changes).
        self.back_frame_h = back_frame_h
        self.frames = self._slice()

    def _slice(self) -> dict[str, Surface]:
        sheet = load_raw_image(self.file_path)
        w, h = sheet.get_size()

        # An HD sheet (docs/kids/SDD_ART.md §2.6) is a whole multiple k of
        # the native layout; it is sliced at its size and scaled once.
        expected_w = self.frame_w * 2
        k = w // expected_w if w % expected_w == 0 else 1
        if k > 1 and h % k:
            k = 1
        self.k = max(k, 1)
        native_h = h // self.k

        # The sheet is laid out back|front side-by-side. The back fills the
        # full image height while the front is top-aligned within its column
        # (any extra height below the front is transparent padding).
        back_h = (
            self.back_frame_h if self.back_frame_h is not None else native_h
        )
        expected_h = max(self.frame_h, back_h)

        if w != expected_w * self.k or native_h != expected_h:
            raise ValueError(
                f"Combat sheet '{self.file_path}' must be "
                f"{expected_w}x{expected_h} (or a whole multiple), "
                f"but is {w}x{h}"
            )

        k = self.k
        self.native = {
            "back": (self.frame_w, back_h),
            "front": (self.frame_w, self.frame_h),
        }
        return {
            "back": sheet.subsurface((0, 0, self.frame_w * k, back_h * k)),
            "front": sheet.subsurface(
                (self.frame_w * k, 0, self.frame_w * k, self.frame_h * k)
            ),
        }

    def _frame(self, key: str, scale: float | None) -> Surface:
        """
        The frame at its native size times ``scale``; without ``scale``,
        at its native size, as before.
        """
        frame = self.frames[key]
        if self.k == 1:
            return frame if scale is None else scale_surface(frame, scale)
        w, h = self.native[key]
        factor = 1 if scale is None else scale
        return smooth_resize(frame, (w * factor, h * factor))

    def front(self, scale: float | None = None) -> Surface:
        return self._frame("front", scale)

    def back(self, scale: float | None = None) -> Surface:
        return self._frame("back", scale)
