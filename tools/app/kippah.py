# SPDX-License-Identifier: GPL-3.0
"""A small kippah on the hero boy, in every frame (the parent's wish).

The owner's art is drawn at one picture pixel (no coarser grid), with
dark one-pixel outlines, so the kippah is drawn the same way: a hard
mask, no anti-aliasing, a navy knitted cap with a darker one-pixel
outline, a ring of lighter stitches near the rim and a short highlight
dash. It is placed from the head itself:

* the head is the top of the figure's silhouette (the hair);
* its size comes from the head's width in the standing frame of the
  sheet's front row, so it is the same size in every map frame;
* in each row the walking frames are aligned to the standing frame (the
  best overlap of the head), so the kippah moves with the head and
  does not jitter;
* front and back views: on the crown; side views: a narrower, slightly
  tilted ellipse toward the back of the head.

Checks, so a change of the art cannot go unseen: the two source sheets
are pinned by their sha256 (:func:`check_source`), the cap's centre must
be inside the head box and most pixels under it must be hair, and the
cap may not leave a new enclosed transparent hole (it gets the outline
colour). Tiny enclosed holes already in the source art (a 5 px "+" in
the front-step frame) are filled with their darkest neighbour.
"""

from __future__ import annotations

import hashlib
import math
from pathlib import Path

import numpy as np
from PIL import Image

NAVY = (36, 48, 104, 255)
NAVY_LIGHT = (62, 80, 150, 255)
OUTLINE = (14, 18, 46, 255)
HIGHLIGHT = (150, 168, 222, 255)

#: The kippah's width over the head's width, and its height over its width.
WIDTH = 0.36
ASPECT = 0.42
#: Side views: narrower, shifted toward the back of the head, tilted.
SIDE_WIDTH = 0.82
SIDE_SHIFT = 0.17
SIDE_TILT = 16.0
#: How far below the crown line (the hair's surface under the spikes)
#: the cap's centre sits, in cap heights: front views see the very top
#: of the head, back views look down on the crown.
SINK = {"front": 0.55, "side": 0.70, "back": 1.05}
#: The battle sheet's figures are larger and seen more from above.
#: (width over head width, sink); the front sits 0.2 cap heights lower
#: than at first, where it stood above the hair line.
BATTLE = {"back": (0.30, 1.9), "front": (0.36, 1.0)}
#: The art the kippah was fitted to (mod-relative path -> sha256).
SOURCE_SHA256 = {
    "sprites/nagmon_hero_boy.png": (
        "979bf81c3fb7400101f1a2fa29e2d4f784bc695b8b2ed057d667ba56627b1f22"
    ),
    "gfx/sprites/player/nagmon_hero_boy.png": (
        "5f860c8b01e3eb5ac45c5d47db27cb6b697ce39c861f520bd76468cce12fe0d8"
    ),
}
CHANGED = (
    "the hero boy's art changed: look at the kippah again, then update "
    "the hash"
)
#: At least this share of the pixels under the cap must be hair.
MIN_HAIR = 0.5
#: Enclosed transparent holes this small in the source are filled.
SMALL_HOLE = 8


def check_source(rel: str, path: Path) -> None:
    """Fail when the sheet is not the art the kippah was fitted to."""
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256[rel]:
        raise ValueError(f"{rel}: {CHANGED} ({digest})")


def _outside(clear: np.ndarray) -> np.ndarray:
    """The transparent pixels connected to the frame's border."""
    reach = np.zeros_like(clear)
    reach[0], reach[-1], reach[:, 0], reach[:, -1] = (
        clear[0],
        clear[-1],
        clear[:, 0],
        clear[:, -1],
    )
    while True:
        grow = reach.copy()
        grow[1:] |= reach[:-1]
        grow[:-1] |= reach[1:]
        grow[:, 1:] |= reach[:, :-1]
        grow[:, :-1] |= reach[:, 1:]
        grow &= clear
        if (grow == reach).all():
            return reach
        reach = grow


def holes(frame: np.ndarray) -> np.ndarray:
    """Enclosed transparent pixels: not connected to the border."""
    clear = frame[..., 3] < 128
    return clear & ~_outside(clear)


def components(mask: np.ndarray) -> list[list[tuple[int, int]]]:
    seen = np.zeros_like(mask)
    found = []
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        stack, part = [(y, x)], []
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop()
            part.append((cy, cx))
            for ny, nx in (
                (cy - 1, cx),
                (cy + 1, cx),
                (cy, cx - 1),
                (cy, cx + 1),
            ):
                if (
                    0 <= ny < mask.shape[0]
                    and 0 <= nx < mask.shape[1]
                    and mask[ny, nx]
                    and not seen[ny, nx]
                ):
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        found.append(part)
    return found


def fill_small_holes(frame: np.ndarray, limit: int = SMALL_HOLE) -> int:
    """Fill enclosed holes of up to ``limit`` px with the darkest
    neighbouring colour (the outline), in place; returns pixels filled."""
    filled = 0
    for part in components(holes(frame)):
        if len(part) > limit:
            continue
        inside = set(part)
        near = [
            frame[ny, nx]
            for y, x in part
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1))
            if (ny, nx) not in inside
            and 0 <= ny < frame.shape[0]
            and 0 <= nx < frame.shape[1]
            and frame[ny, nx, 3] >= 128
        ]
        colour = min(near, key=lambda c: int(c[:3].astype(int).sum()))
        for y, x in part:
            frame[y, x] = colour
        filled += len(part)
    return filled


def hair_share(source: np.ndarray, mask: np.ndarray, box) -> float:
    """The share of the pixels under ``mask`` that are hair (or its
    outline): opaque and near the colour of the head box's top band."""
    l, t, r, b = box
    top = source[t : t + max(2, (b - t) // 5), l:r]
    hair = np.median(top[top[..., 3] >= 128][:, :3], axis=0)
    under = source[mask]
    opaque = under[..., 3] >= 128
    near = np.abs(under[..., :3].astype(int) - hair).sum(-1) < 150
    dark = under[..., :3].astype(int).sum(-1) < 200
    return float((opaque & (near | dark)).mean()) if len(under) else 0.0


def seat(
    canvas: np.ndarray,
    source: np.ndarray,
    box,
    cx: float,
    cy: float,
    width: float,
    tilt: float = 0.0,
    squash: float = 1.0,
) -> None:
    """Check the place, draw the cap, and close any hole it makes."""
    l, t, r, b = box
    if not (l <= cx < r and t <= cy < b):
        raise ValueError(
            f"the kippah's centre {(cx, cy)} is off the head {box}"
        )
    before = holes(canvas)
    mask = draw(canvas, cx, cy, width, tilt, squash)
    share = hair_share(source, mask, box)
    if share < MIN_HAIR:
        raise ValueError(f"only {share:.0%} of the kippah sits on hair")
    new = holes(canvas) & ~before
    canvas[new] = OUTLINE


def head_box(
    frame: np.ndarray, band: float = 0.30
) -> tuple[int, int, int, int]:
    """(left, top, right, bottom) of the head: the figure's top band."""
    alpha = frame[..., 3] >= 128
    rows = np.flatnonzero(alpha.any(axis=1))
    top, bottom = int(rows[0]), int(rows[-1])
    end = top + int((bottom - top + 1) * band)
    cols = np.flatnonzero(alpha[top:end].any(axis=0))
    return int(cols[0]), top, int(cols[-1]) + 1, end


def crown(frame: np.ndarray, x0: int, x1: int) -> float:
    """The crown line under the spikes: the median top of these columns."""
    alpha = frame[..., 3] >= 128
    tops = [
        int(np.argmax(alpha[:, x])) for x in range(x0, x1) if alpha[:, x].any()
    ]
    return float(np.median(tops))


def offset(ref: np.ndarray, frame: np.ndarray, box, reach: int = 14):
    """(dx, dy) that best lays the head of ``frame`` on that of ``ref``."""
    l, t, r, b = box
    a = ref[t:b, l:r, 3] >= 128
    best, where = -1.0, (0, 0)
    h, w = frame.shape[:2]
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            if t + dy < 0 or l + dx < 0 or b + dy > h or r + dx > w:
                continue
            m = frame[t + dy : b + dy, l + dx : r + dx, 3] >= 128
            score = (a & m).sum() / max(1, (a | m).sum())
            if score > best:
                best, where = score, (dx, dy)
    return where


def draw(
    canvas: np.ndarray,
    cx: float,
    cy: float,
    width: float,
    tilt: float = 0.0,
    squash: float = 1.0,
) -> np.ndarray:
    """
    The cap: an ellipse ``width`` wide, centred at (cx, cy), drawn in
    place; returns its mask over the canvas.
    """
    a = width / 2 * squash
    b = width * ASPECT / 2
    cos, sin = math.cos(math.radians(tilt)), math.sin(math.radians(tilt))
    h, w = canvas.shape[:2]
    reach = int(max(a, b)) + 3
    ys, xs = np.mgrid[
        max(0, int(cy) - reach) : min(h, int(cy) + reach + 1),
        max(0, int(cx) - reach) : min(w, int(cx) + reach + 1),
    ]
    # pixel centres, rotated into the ellipse's own axes
    u = (xs + 0.5 - cx) * cos + (ys + 0.5 - cy) * sin
    v = -(xs + 0.5 - cx) * sin + (ys + 0.5 - cy) * cos
    r = (u / a) ** 2 + (v / b) ** 2
    inside = r <= 1.0
    if not inside.any():
        raise ValueError("an empty kippah")
    # the outline: inside pixels with a 4-neighbour outside
    pad = np.pad(inside, 1)
    edge = inside & ~(
        pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:]
    )
    # knitted: a ring of alternate lighter stitches just inside the rim,
    # and a small matte highlight up on the left
    knit = ((xs + ys) % 2) == 0
    ring = inside & ~edge & (r > 0.48) & (r <= 0.70) & knit
    # (a short horizontal dash, never a dot that could read as a plus)
    v0 = -b * 0.45
    shine = (
        inside
        & ~edge
        & (np.abs(v - v0) < 0.75)
        & (u > -a * 0.62)
        & (u < -a * 0.22)
    )
    region = canvas[ys[:, 0][0] : ys[:, 0][-1] + 1, xs[0][0] : xs[0][-1] + 1]
    region[inside] = NAVY
    region[ring] = NAVY_LIGHT
    region[shine] = HIGHLIGHT
    region[edge] = OUTLINE
    full = np.zeros(canvas.shape[:2], bool)
    full[ys[:, 0][0] : ys[:, 0][-1] + 1, xs[0][0] : xs[0][-1] + 1] = inside
    return full


def map_sheet(sheet: Image.Image) -> Image.Image:
    """The 3x4 map sheet with the kippah on every frame."""
    rgba = np.array(sheet.convert("RGBA"))
    source = rgba.copy()
    fw, fh = rgba.shape[1] // 3, rgba.shape[0] // 4
    sources = [
        [
            source[r * fh : (r + 1) * fh, c * fw : (c + 1) * fw]
            for c in range(3)
        ]
        for r in range(4)
    ]
    frames = [
        [rgba[r * fh : (r + 1) * fh, c * fw : (c + 1) * fw] for c in range(3)]
        for r in range(4)
    ]
    l, t, r, b = head_box(frames[0][1])
    width = (r - l) * WIDTH
    for row in range(4):
        ref = frames[row][1]
        box = head_box(ref)
        hl, ht, hr, hb = box
        head_w = hr - hl
        if row in (0, 3):  # front, back: the crown
            cx = (hl + hr) / 2
            tilt, squash = 0.0, 1.0
            sink = SINK["front" if row == 0 else "back"]
        else:  # 1 faces left (back of the head on the right), 2 right
            back = 1 if row == 1 else -1
            cx = (hl + hr) / 2 + back * SIDE_SHIFT * head_w
            tilt, squash = back * SIDE_TILT, SIDE_WIDTH
            sink = SINK["side"]
        span = width * squash / 2
        cy = crown(ref, int(cx - span), int(cx + span)) + sink * width * ASPECT
        for col in range(3):
            frame = frames[row][col]
            fill_small_holes(frame)
            dx, dy = (0, 0) if col == 1 else offset(ref, frame, box)
            moved = (hl + dx, ht + dy, hr + dx, hb + dy)
            seat(
                frame,
                sources[row][col],
                moved,
                cx + dx,
                cy + dy,
                width,
                tilt,
                squash,
            )
    return Image.fromarray(rgba, "RGBA")


def combat_sheet(sheet: Image.Image) -> Image.Image:
    """The combat sheet (back left, front right) with the kippah."""
    rgba = np.array(sheet.convert("RGBA"))
    source = rgba.copy()
    half = rgba.shape[1] // 2
    for x0 in (0, half):
        part = rgba[:, x0 : x0 + half]
        fill_small_holes(part)
        view = "back" if x0 == 0 else "front"
        ratio, sink = BATTLE[view]
        l, t, r, b = head_box(part, band=0.22 if x0 == 0 else 0.30)
        width = (r - l) * ratio
        cx = (l + r) / 2
        cy = crown(part, int(cx - width / 2), int(cx + width / 2))
        seat(
            part,
            source[:, x0 : x0 + half],
            (l, t, r, b),
            cx,
            cy + sink * width * ASPECT,
            width,
        )
    return Image.fromarray(rgba, "RGBA")
