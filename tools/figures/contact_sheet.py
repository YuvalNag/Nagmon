# SPDX-License-Identifier: GPL-3.0
"""Render every figure kind into one PNG (headless).

Usage: python tools/figures/contact_sheet.py [out.png]
Default output: docs/kids/img/figures_contact_sheet.png
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pygame  # noqa: E402

from nagmon.ui.emoji import EmojiLoader, default_root  # noqa: E402
from nagmon.ui.figures import render_figure  # noqa: E402

CELL = (280, 210)
COLS = 5
FONTS = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)

SAMPLES: list[tuple[str, dict]] = [
    ("objects", {"emoji": "1f34e", "count": 7}),
    ("objects", {"emoji": "1f388", "groups": [3, 4]}),
    ("objects", {"coins": [10, 5, 2, 1, 1], "currency": "ILS"}),
    ("clock", {"hour": 3, "minute": 0}),
    ("clock", {"hour": 7, "minute": 40}),
    ("pie", {"parts": 8, "shaded": 3}),
    ("bar_model", {"parts": 5, "shaded": 2}),
    ("number_line", {"min": 0, "max": 10, "point": 7}),
    (
        "number_line",
        {
            "min": 0,
            "max": 1,
            "marks": [0, "1/4", "1/2", "3/4", 1],
            "point": 0.75,
            "point_label": "?",
        },
    ),
    (
        "polygon",
        {
            "points": [[0, 0], [4, 0], [4, 3]],
            "labels": {"side_0": "4", "side_1": "3", "side_2": "?"},
            "grid": True,
        },
    ),
    ("polygon", {"name": "hexagon", "labels": {"angle_0": "120°"}}),
    ("circle", {"r": 5, "show": "radius", "label": "5 ס״מ"}),
    ("angle", {"degrees": 60, "rotation": 10}),
    ("angle", {"degrees": 90, "rotation": 0, "label": "?"}),
    ("grid_area", {"width": 6, "height": 4, "cells": [
        [0, 0], [1, 0], [2, 0], [1, 1], [2, 1], [2, 2], [3, 1]]}),
    ("solid", {"name": "cuboid", "dims": {"l": 5, "w": 3, "h": 2}}),
    ("solid", {"name": "cube", "dims": {"a": 3}}),
    ("solid", {"name": "pyramid"}),
    ("solid", {"name": "prism", "dims": [3, 2.5, 4]}),
    ("solid", {"name": "cylinder", "dims": {"r": 2, "h": 5}}),
    ("solid", {"name": "cone", "dims": {"r": 2, "h": 4}}),
    ("solid", {"name": "sphere", "dims": {"r": 3}}),
    (
        "coordinate",
        {
            "range": 6,
            "points": [
                {"x": 2, "y": 3, "label": "A"},
                {"x": 5, "y": 1, "label": "B"},
            ],
        },
    ),
    (
        "coordinate",
        {"range": [-4, 4], "points": [{"x": -3, "y": 2, "label": "C"}]},
    ),
    (
        "grid_path",
        {
            "width": 6,
            "height": 4,
            "start": [0, 0],
            "moves": ["R", "R", "U"],
            "repeat": 2,
            "marks": {"1f3e0": [5, 3]},
        },
    ),
    (
        "grid_path",
        {
            "width": 5,
            "height": 4,
            "start": [0, 3],
            "moves": ["R2", "D", "R", "D2"],
            "show_path": True,
            "marks": {"1f381": [3, 0]},
        },
    ),
    ("pattern", {"items": ["1f34e", "1f34c", "1f34e", "1f34c", "?"]}),
    ("grid_numbers", {
        "grid": [[1, 2, 3, 4], [5, 6, None, 8], [9, 10, 11, 12]],
        "target": [1, 2]}),
    ("symmetry", {"shape": "butterfly"}),
    ("symmetry", {"shape": "house", "axis": "both"}),
    ("no_such_kind", {}),
]  # fmt: skip


def _hebrew_visual(text: str) -> str:
    """Tiny stand-in for the game's bidi: reverse runs with Hebrew."""
    if any("֐" <= ch <= "׿" for ch in text):
        return text[::-1]
    return text


def build_contact_sheet(out: Path) -> Path:
    pygame.init()
    font_path = next((f for f in FONTS if Path(f).is_file()), None)
    loader = EmojiLoader(default_root())
    rows = -(-len(SAMPLES) // COLS)
    cap = 26
    sheet = pygame.Surface((COLS * CELL[0], rows * (CELL[1] + cap)))
    sheet.fill((246, 244, 238))
    caption = pygame.font.Font(font_path, 15)
    for i, (kind, data) in enumerate(SAMPLES):
        r, c = divmod(i, COLS)
        x, y = c * CELL[0], r * (CELL[1] + cap)
        card = pygame.Rect(x + 6, y + 6, CELL[0] - 12, CELL[1] + cap - 12)
        pygame.draw.rect(sheet, (255, 255, 255), card, border_radius=12)
        img = render_figure(
            kind,
            data,
            (CELL[0] - 20, CELL[1] - 16),
            font_path=font_path,
            emoji_loader=loader,
            text_transform=_hebrew_visual,
        )
        sheet.blit(img, (x + 10, y + 10))
        label = caption.render(kind, True, (90, 96, 116))
        sheet.blit(label, label.get_rect(midbottom=card.midbottom).move(0, -4))
    out.parent.mkdir(parents=True, exist_ok=True)
    pygame.image.save(sheet, str(out))
    return out


if __name__ == "__main__":
    target = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else ROOT / "docs/kids/img/figures_contact_sheet.png"
    )
    print(build_contact_sheet(target))
