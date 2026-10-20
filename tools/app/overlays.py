# SPDX-License-Identifier: GPL-3.0
"""Repaints of single HD tiles, applied while the atlases are built.

Family rule: no crosses in the game. Tuxemon's healing center
(``core_buildings`` tile 351, the round sign over the door) shows a red
cross in a white disc. The atlas gets the same disc with a red heart
instead ("a heart for the healing center", as the old game's world
prompt says). The HD sheets in ``mods/nagmon/gfx/tilesets`` are left as
they are: the repaint is code, so every build gives the same pixels.

Each overlay takes the 64 px HD tile and returns the new one.
"""

from __future__ import annotations

from collections.abc import Callable

from PIL import Image, ImageDraw

#: The two blues of the sign's disc, above and below source row 4 (y 16).
DISC_TOP = (216, 223, 232, 255)
DISC_LOW = (185, 200, 226, 255)
HEART = (195, 1, 12)
HEART_LIGHT = (229, 55, 44)
#: Where the cross was, in HD pixels (source pixels x4), with a margin
#: for xBRZ's soft edges: the upright and the bar.
CROSS_BOXES = ((25, 1, 39, 39), (13, 13, 51, 27))
#: The heart: centre x, the y of the lobes' meeting point, px per unit.
HEART_CX, HEART_CY, HEART_UNIT = 32.0, 22.75, 11.0
SUPERSAMPLE = 4


def _inside_heart(x: float, y: float) -> bool:
    """(u² + v² - 1)³ - u²v³ <= 0: the classic heart curve."""
    u = (x - HEART_CX) / HEART_UNIT
    v = (HEART_CY - y) / HEART_UNIT
    return (u * u + v * v - 1) ** 3 - u * u * v**3 <= 0


def heart_sign(tile: Image.Image) -> Image.Image:
    """The healing center's round sign, with a heart and no cross."""
    out = tile.convert("RGBA").copy()
    draw = ImageDraw.Draw(out)
    for x0, y0, x1, y1 in CROSS_BOXES:
        draw.rectangle((x0, y0, x1 - 1, min(y1, 16) - 1), fill=DISC_TOP)
        if y1 > 16:
            draw.rectangle((x0, max(y0, 16), x1 - 1, y1 - 1), fill=DISC_LOW)
    n = SUPERSAMPLE
    for y in range(out.height):
        for x in range(out.width):
            hits = sum(
                _inside_heart(x + (i + 0.5) / n, y + (j + 0.5) / n)
                for i in range(n)
                for j in range(n)
            )
            if not hits:
                continue
            # Light upper half, as the cross's top edge was.
            colour = HEART_LIGHT if y < HEART_CY - 4 else HEART
            alpha = hits / (n * n)
            base = out.getpixel((x, y))
            mixed = tuple(
                round(c * alpha + b * (1 - alpha))
                for c, b in zip(colour, base[:3])
            )
            out.putpixel((x, y), (*mixed, 255))
    return out


#: (tileset name, local tile id) -> repaint
OVERLAYS: dict[tuple[str, int], Callable[[Image.Image], Image.Image]] = {
    ("core_buildings", 351): heart_sign,
}
NOTE = (
    "The healing center's cross is repainted as a red heart "
    "(tools/app/overlays.py)."
)


def apply(tileset: str, local: int, tile: Image.Image) -> Image.Image:
    repaint = OVERLAYS.get((tileset, local))
    return repaint(tile) if repaint else tile
