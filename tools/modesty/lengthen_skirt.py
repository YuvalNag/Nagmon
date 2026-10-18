"""
Lengthens the skirt of the heroine portraits down to the ankle.

The heroine sheets (mods/tuxemon/gfx/sprites/player/heroine*.png) show a
short skirt and bare legs. This tool paints an A-line skirt over the legs,
using each sheet's own skirt colours, and writes the result to
mods/nagmon/gfx/sprites/player/ where it overrides the original by name.

Usage: python tools/modesty/lengthen_skirt.py
"""

from __future__ import annotations

import os
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
import pygame  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "mods" / "tuxemon" / "gfx" / "sprites" / "player"
DST = REPO / "mods" / "nagmon" / "gfx" / "sprites" / "player"

Color = tuple[int, int, int]


@dataclass(frozen=True)
class Figure:
    """Where the skirt and the legs of one figure sit on the sheet."""

    x_range: tuple[int, int]  # columns that belong to this figure
    main_row: int  # a row inside the skirt, mostly the main colour
    shade_row: int  # a row near the hem, mostly the shade colour
    band: tuple[int, int]  # skirt rows (inclusive) to find the outline
    hem_row: int  # last skirt row in the original
    stop_row: int  # first row that must stay untouched (boots/edge)


FRONT = Figure((64, 127), 36, 40, (35, 40), 41, 54)
BACK = Figure((0, 63), 85, 99, (82, 99), 101, 128)


def _luma(c: Color) -> float:
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def _row_colors(
    img: pygame.Surface, y: int, x_range: tuple[int, int]
) -> Counter[Color]:
    counts: Counter[Color] = Counter()
    for x in range(x_range[0], x_range[1] + 1):
        c = img.get_at((x, y))
        if c.a:
            counts[(c.r, c.g, c.b)] += 1
    return counts


def _opaque_span(
    img: pygame.Surface, y: int, x_range: tuple[int, int]
) -> tuple[int, int] | None:
    xs = [x for x in range(x_range[0], x_range[1] + 1) if img.get_at((x, y)).a]
    return (min(xs), max(xs)) if xs else None


def lengthen(img: pygame.Surface, fig: Figure) -> None:
    main = _row_colors(img, fig.main_row, fig.x_range).most_common(1)[0][0]
    shade = _row_colors(img, fig.shade_row, fig.x_range).most_common(1)[0][0]
    band_colors: Counter[Color] = Counter()
    for y in range(fig.band[0], fig.band[1] + 1):
        band_colors.update(_row_colors(img, y, fig.x_range))
    outline = min(band_colors, key=_luma)

    span = _opaque_span(img, fig.hem_row, fig.x_range)
    assert span is not None, "no skirt found at the hem row"
    left, right = span
    last = fig.stop_row - 1
    for i, y in enumerate(range(fig.hem_row + 1, fig.stop_row)):
        legs = _opaque_span(img, y, fig.x_range)
        if i % 3 == 2:  # widen slowly into an A-line
            left -= 1
            right += 1
        if legs:
            left = min(left, legs[0])
            right = max(right, legs[1])
        left = max(left, fig.x_range[0])
        right = min(right, fig.x_range[1])
        shade_from = right - max(2, (right - left) // 3)
        for x in range(left, right + 1):
            if x in (left, right) or y == last:
                color = outline
            elif x >= shade_from:
                color = shade
            else:
                color = main
            img.set_at((x, y), (*color, 255))


def process(name: str) -> Path:
    pygame.display.init()
    img = pygame.image.load(SRC / name)
    img = img.convert_alpha(pygame.display.set_mode((1, 1)))
    lengthen(img, FRONT)
    if img.get_height() >= 128:
        lengthen(img, BACK)
    DST.mkdir(parents=True, exist_ok=True)
    out = DST / name
    pygame.image.save(img, out)
    return out


def main() -> None:
    for path in sorted(SRC.glob("heroine*.png")):
        print("wrote", process(path.name).relative_to(REPO))


if __name__ == "__main__":
    main()
