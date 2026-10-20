# SPDX-License-Identifier: GPL-3.0
"""HD copies of the small pixel art the app ships (docs/app/SDD.md §10).

The rule: no picture is shown on the phone at more than twice its own
pixels. Tuxemon draws its art at 1x (a 16 px tile, a 64 px monster) and
the phone shows it six or seven times larger, so every such picture is
enlarged here, once, with xBRZ: the same upscaler as the map tiles
(``tools/art/pixel_upscale.py``, a port of xBRZ 1.8, and the alpha
bleed of ``tools/art/upscale_tiles.py``). The records then say the
picture's scale, and the app needs no rule of its own.

How a picture is enlarged (:func:`xbrz`):

* frame by frame: xBRZ looks two pixels past each pixel, so a frame is
  scaled on its own and never blends with the frame next to it on the
  sheet;
* each frame in a 2 px frame of its own edge pixels: a cut edge (a
  monster's back cut by the bottom of its box, a background) stays a
  straight cut instead of being rounded into the transparency; an edge
  that is transparent stays transparent;
* fully transparent pixels are (0, 0, 0, 0) before scaling, as xBRZ
  wants. xBRZ blends colours weighted by their alpha, so the soft edge
  takes the colour of the art, not black;
* after it, the alpha bleed of the tiles: a transparent pixel next to
  the art takes the art's colour and stays transparent (up to k pixels
  away), so smooth scaling on the phone blends no dark halo into edges.

A build step, not the game: it needs numpy (the test extras).
"""

from __future__ import annotations

import sys
from collections.abc import Sequence

import numpy as np
from PIL import Image

from tools.app.common import REPO

_ART = str(REPO / "tools" / "art")
if _ART not in sys.path:
    sys.path.insert(0, _ART)
import pixel_upscale  # noqa: E402
import upscale_tiles  # noqa: E402

#: How far xBRZ looks past a pixel.
PAD = upscale_tiles.PAD
#: The largest texture side mobile WebGL is sure to take.
MAX_TEXTURE = 4096

#: How many times each kind of 1x picture is enlarged.
#: Monster sheets: the scale of the 12 Nagmon HD sheets, so all 41
#: share one size (384x264).
MONSTER = 3
#: Combat sheets (portraits): the Nagmon HD scale, as the monsters.
PORTRAIT = 3
#: Map characters, props and map animations: the tiles' scale.
MAP = 4
#: Technique and capture animations.
ANIMATION = 4
#: Items and type icons (24 px).
ICON = 4
#: Battle backgrounds, HUD, trays, party icons and islands: one scale
#: for the whole environment.
BATTLE_UI = 6

Box = tuple[int, int, int, int]


def xbrz(
    image: Image.Image, k: int, frames: Sequence[Box] | None = None
) -> Image.Image:
    """
    ``image`` k times larger with xBRZ, each of ``frames`` (x, y, width,
    height; default: the whole picture) on its own. Pixels outside every
    frame are never shown: they are only repeated (nearest).
    """
    rgba = np.array(image.convert("RGBA"))
    rgba[rgba[..., 3] == 0] = 0
    height, width = rgba.shape[:2]
    boxes = list(frames) if frames else [(0, 0, width, height)]
    for x, y, w, h in boxes:
        if x < 0 or y < 0 or x + w > width or y + h > height:
            raise ValueError(f"frame {(x, y, w, h)} is outside the picture")
    out = np.repeat(np.repeat(rgba, k, 0), k, 1)
    by_size: dict[tuple[int, int], list[Box]] = {}
    for box in boxes:
        by_size.setdefault((box[2], box[3]), []).append(box)
    p = PAD
    for (w, h), group in by_size.items():
        batch = np.stack(
            [
                np.pad(
                    rgba[y : y + h, x : x + w],
                    ((p, p), (p, p), (0, 0)),
                    mode="edge",
                )
                for x, y, _, _ in group
            ]
        )
        scaled = pixel_upscale.scale(batch, k)
        inner = scaled[:, p * k : (p + h) * k, p * k : (p + w) * k]
        for (x, y, _, _), frame in zip(group, inner):
            out[y * k : (y + h) * k, x * k : (x + w) * k] = (
                upscale_tiles.bleed(frame, k)
            )
    return Image.fromarray(out, "RGBA")


def grid(width: int, height: int, fw: int, fh: int) -> list[Box]:
    """The frames of a sheet of ``fw`` x ``fh`` frames, row by row."""
    return [
        (x, y, fw, fh)
        for y in range(0, height - fh + 1, fh)
        for x in range(0, width - fw + 1, fw)
    ]


def wrap(
    image: Image.Image, fw: int, fh: int, count: int
) -> tuple[Image.Image, int]:
    """
    A strip of ``count`` frames as a grid no wider than
    :data:`MAX_TEXTURE`: (the sheet, its columns). A strip that fits
    stays one row. The sheet is exactly ``columns`` x ``rows`` frames:
    pixels past the last frame (never shown) are cut off.
    """
    columns = min(count, max(1, MAX_TEXTURE // fw))
    if columns == count:
        return image.crop((0, 0, count * fw, fh)), columns
    rows = -(-count // columns)
    sheet = Image.new("RGBA", (columns * fw, rows * fh), (0, 0, 0, 0))
    for i in range(count):
        frame = image.crop((i * fw, 0, (i + 1) * fw, fh))
        sheet.paste(frame, ((i % columns) * fw, (i // columns) * fh))
    return sheet, columns
