# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING

from pygame.rect import Rect

from tuxemon.database.yaml_utils import load_yaml
from tuxemon.scaling import ScalingStrategy

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from tuxemon.entity.npc import NPC


def load_layout_groups(path: Path) -> dict[int, list[str]]:
    data = load_yaml(path)
    raw_groups = data.get("LAYOUT_GROUPS", {})

    layout_groups: dict[int, list[str]] = {}
    for key, layout_keys in raw_groups.items():
        try:
            num_players = int(key.split("_")[0])
            layout_groups[num_players] = layout_keys
        except (ValueError, IndexError):
            logger.warning(f"Invalid layout group key: '{key}'")

    return layout_groups


def load_layouts_from_yaml(
    path: Path,
) -> dict[str, dict[str, tuple[int, ...]]]:
    data = load_yaml(path)
    raw_layouts = data.get("LAYOUT_COORDINATES", {})

    return {
        layout_name: {key: tuple(value) for key, value in layout.items()}
        for layout_name, layout in raw_layouts.items()
    }


#: The width the layouts are written for (NATIVE_RESOLUTION).
DESIGN_WIDTH = 256
#: Positions inside a HUD image, not on the screen.
HUD_OFFSET_KEYS = frozenset({"hud_line1", "hud_line2"})
#: A layout in the middle of the screen, moved by half the extra room.
CENTERED_LAYOUTS = frozenset({"CENTER_COMBAT"})


def widen_shift(name: str, key: str, raw: tuple[int, ...], extra: int) -> int:
    """
    How far right the rect ``raw`` (layout points) moves on a screen
    ``extra`` pixels wider than the layout (SDD_ANDROID §2.8): a rect
    in the right half by all of it, one in the left half not at all, a
    centred layout by half. Offsets inside a HUD image never move.
    """
    if extra <= 0 or key in HUD_OFFSET_KEYS or len(raw) != 4:
        return 0
    if name in CENTERED_LAYOUTS:
        return extra // 2
    x, _, w, _ = raw
    return extra if x + w / 2 >= DESIGN_WIDTH / 2 else 0


class LayoutRepository:
    def __init__(
        self,
        yaml_path: Path,
        scaling: ScalingStrategy,
        screen_width: int | None = None,
    ):
        self.raw_layouts = load_layouts_from_yaml(yaml_path)
        self.groups = load_layout_groups(yaml_path)
        self.scaling = scaling
        #: The screen's width in pixels; None keeps the layout as written.
        self.screen_width = screen_width

    @property
    def extra_width(self) -> int:
        """Pixels of screen to the right of the layout (a 20:9 phone)."""
        if self.screen_width is None:
            return 0
        return max(0, self.screen_width - self.scaling.scale_int(DESIGN_WIDTH))

    def get_raw_layout(self, name: str) -> dict[str, tuple[int, ...]]:
        if name not in self.raw_layouts:
            raise KeyError(f"Layout '{name}' not found in YAML")
        return self.raw_layouts[name]

    def get_scaled_layout(self, name: str) -> dict[str, tuple[int, ...]]:
        raw = self.get_raw_layout(name)
        extra = self.extra_width
        scaled = {}
        for key, value in raw.items():
            coords = self.scaling.scale_tuple(value)
            shift = widen_shift(name, key, value, extra)
            if shift:
                coords = (coords[0] + shift, *coords[1:])
            scaled[key] = coords
        return scaled


class LayoutSelector:
    def __init__(self, repo: LayoutRepository):
        self.repo = repo

    def select(
        self, player_index: int, total_players: int
    ) -> dict[str, tuple[int, ...]]:
        if total_players not in self.repo.groups:
            raise ValueError(
                f"No layout group defined for {total_players} players"
            )

        layout_names = self.repo.groups[total_players]

        if not (0 <= player_index < len(layout_names)):
            raise IndexError(
                f"Player index {player_index} out of range for {total_players} players "
                f"(expected 0-{len(layout_names) - 1})"
            )

        layout_name = layout_names[player_index]
        return self.repo.get_scaled_layout(layout_name)


class LayoutRectFactory:
    def to_rects(
        self, layout: dict[str, tuple[int, ...]]
    ) -> dict[str, list[Rect]]:
        return {key: [Rect(coords)] for key, coords in layout.items()}


class LayoutManager:
    def __init__(
        self,
        yaml_path: Path,
        scaling: ScalingStrategy,
        screen_width: int | None = None,
    ):
        self.repo = LayoutRepository(
            yaml_path, scaling=scaling, screen_width=screen_width
        )
        self.selector = LayoutSelector(self.repo)
        self.rect_factory = LayoutRectFactory()

    def set_scaling(self, scaling: ScalingStrategy) -> None:
        self.repo.scaling = scaling

    def prepare_all(
        self, players: list[NPC]
    ) -> dict[NPC, dict[str, list[Rect]]]:
        total = len(players)
        layouts = {}

        for index, player in enumerate(players):
            coords = self.selector.select(index, total)
            rects = self.rect_factory.to_rects(coords)
            layouts[player] = rects

        return layouts
