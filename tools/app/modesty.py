# SPDX-License-Identifier: GPL-3.0
"""Modest clothes in the shipped character art (docs/kids/SDD_MODESTY.md).

One rule the build can check: on a back view, nothing below the neck is
skin (sleeves to the wrists, a closed back). The skin colour is the
character's own, read from its face in the front frame; the back's torso
is the middle of the figure, between the neck and the waist, away from
the arms and hands.

:func:`cover_back` repaints such skin as cloth: the teacher's map sheet
showed her upper back between the white sleeves in all three back
frames. The blouse colour keeps the skin's own shading.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

#: The torso of a back view, as shares of the figure's height and width.
TORSO_ROWS = (0.45, 0.62)
TORSO_SIDE = 0.30
#: A pixel this close (sum of channel differences) to the skin is skin.
NEAR = 36
#: A connected patch of skin on a back torso larger than this is an
#: open back (scattered warm pixels of a bag or a fold are not).
MAX_SKIN = 24
#: The rows :func:`cover_back` repaints (below the hair, above the hands).
COVER_ROWS = (0.40, 0.66)


def figure(frame: np.ndarray) -> tuple[int, int, int, int]:
    """(top, bottom, left, right) of the opaque figure."""
    alpha = frame[..., 3] >= 128
    ys, xs = np.flatnonzero(alpha.any(1)), np.flatnonzero(alpha.any(0))
    return int(ys[0]), int(ys[-1]) + 1, int(xs[0]), int(xs[-1]) + 1


def skin_colour(front: np.ndarray) -> np.ndarray | None:
    """The face's commonest warm colour in a front view (None: no skin)."""
    t, b, l, r = figure(front)
    h, w = b - t, r - l
    box = front[t + int(0.20 * h) : t + int(0.40 * h), l + w // 4 : r - w // 4]
    px = box.reshape(-1, 4).astype(int)
    warm = px[
        (px[:, 3] >= 128)
        & (px[:, 0] > px[:, 1])
        & (px[:, 1] > px[:, 2])
        & (px[:, 0] - px[:, 2] > 60)
    ][:, :3]
    if not len(warm):
        return None
    keys, index, counts = np.unique(
        warm // 8, axis=0, return_inverse=True, return_counts=True
    )
    return warm[index.ravel() == np.argmax(counts)].mean(axis=0)


def torso(
    frame: np.ndarray, side: float = TORSO_SIDE, rows: tuple = TORSO_ROWS
) -> tuple[slice, slice]:
    t, b, l, r = figure(frame)
    h, w = b - t, r - l
    ys = slice(t + int(rows[0] * h), t + int(rows[1] * h))
    xs = slice(l + int(side * w), r - int(side * w))
    return ys, xs


def skin_on_back(back: np.ndarray, skin: np.ndarray) -> np.ndarray:
    """Mask (over ``back``) of skin-coloured torso pixels."""
    rows, cols = torso(back)
    mask = np.zeros(back.shape[:2], bool)
    part = back[rows, cols]
    near = np.abs(part[..., :3].astype(int) - skin).sum(-1) < NEAR
    mask[rows, cols] = near & (part[..., 3] >= 128)
    return mask


def largest_patch(mask: np.ndarray) -> int:
    """Pixels in the largest 4-connected patch of ``mask``."""
    from tools.app.kippah import components

    return max((len(c) for c in components(mask)), default=0)


def open_back(back: np.ndarray, skin: np.ndarray) -> int:
    """The largest patch of skin on the back torso, in pixels."""
    return largest_patch(skin_on_back(back, skin))


def _luma(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def cover_back(
    sheet: Image.Image, cloth: tuple[int, int, int], skin: tuple[int, int, int]
) -> Image.Image:
    """
    A 3x4 map sheet whose back-view frames (row 3) have their torso's
    ``skin``-coloured pixels repainted ``cloth``, with the same shading
    (each pixel's brightness against the skin's).
    """
    rgba = np.array(sheet.convert("RGBA"))
    fw, fh = rgba.shape[1] // 3, rgba.shape[0] // 4
    base = np.array(skin, float)
    for col in range(3):
        frame = rgba[3 * fh : 4 * fh, col * fw : (col + 1) * fw]
        # from the neck to the waist, across the whole back (the white
        # sleeves and the strap are not warm, so they stay)
        rows, cols = torso(frame, side=0.0, rows=COVER_ROWS)
        part = frame[rows, cols]
        rgb = part[..., :3].astype(float)
        warm = (
            (rgb[..., 0] - rgb[..., 2] > 80)
            & (rgb.sum(-1) > 450)
            & (part[..., 3] >= 128)
        )
        shade = _luma(rgb) / _luma(base)
        new = np.clip(np.array(cloth, float) * shade[..., None], 0, 255)
        part[..., :3][warm] = np.round(new[warm]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


#: The teacher's blouse and the skin that showed through it.
TEACHER_BLOUSE = (252, 239, 208)
TEACHER_SKIN = (253, 213, 131)


def teacher(sheet: Image.Image) -> Image.Image:
    return cover_back(sheet, TEACHER_BLOUSE, TEACHER_SKIN)
